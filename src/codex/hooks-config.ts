import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { backup, writeFileAtomic } from "../lib/fsx.js";
import { codexHome } from "../lib/paths.js";

interface HookCommand {
    type: "command";
    command: string;
    commandWindows?: string;
    timeout?: number;
    statusMessage?: string;
}

interface HookGroup {
    matcher?: string;
    hooks: HookCommand[];
}

interface HooksFile {
    hooks?: Record<string, HookGroup[]>;
    [key: string]: unknown;
}

export interface HookSpec {
    event: string;
    command: string;
    commandWindows?: string;
    timeout: number;
    statusMessage?: string;
}

function file(): string {
    return join(codexHome(), "hooks.json");
}

export function hooksPath(): string {
    return file();
}

// Missing file is fine; a present-but-corrupt file throws so we never clobber it.
function read(): HooksFile {
    if (!existsSync(file())) return {};
    try {
        return JSON.parse(readFileSync(file(), "utf8")) as HooksFile;
    } catch {
        throw new Error(
            `${file()} exists but is not valid JSON — refusing to modify it. Fix or remove it, then retry.`
        );
    }
}

function write(data: HooksFile): void {
    mkdirSync(codexHome(), { recursive: true });
    backup(file());
    writeFileAtomic(file(), `${JSON.stringify(data, null, 2)}\n`);
}

function withoutMarker(groups: HookGroup[], marker: string): HookGroup[] {
    return groups
        .map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h) => !h.command?.includes(marker)) }))
        .filter((g) => g.hooks.length > 0);
}

// Throws (without writing) if hooks.json is present but unparseable.
export function assertWritable(): void {
    read();
}

// Idempotent: replaces our own entries (matched by marker), preserves any foreign hooks.
export function installHooks(specs: HookSpec[], marker: string): void {
    const data = read();
    data.hooks ??= {};
    for (const spec of specs) {
        const kept = withoutMarker(data.hooks[spec.event] ?? [], marker);
        kept.push({
            hooks: [
                {
                    type: "command",
                    command: spec.command,
                    commandWindows: spec.commandWindows,
                    timeout: spec.timeout,
                    statusMessage: spec.statusMessage,
                },
            ],
        });
        data.hooks[spec.event] = kept;
    }
    write(data);
}

// Returns how many of our hook entries were removed.
export function uninstallHooks(marker: string): number {
    const data = read();
    if (!data.hooks) return 0;
    let removed = 0;
    for (const event of Object.keys(data.hooks)) {
        const before = (data.hooks[event] ?? []).reduce((n, g) => n + (g.hooks?.length ?? 0), 0);
        const kept = withoutMarker(data.hooks[event] ?? [], marker);
        removed += before - kept.reduce((n, g) => n + g.hooks.length, 0);
        if (kept.length > 0) data.hooks[event] = kept;
        else delete data.hooks[event];
    }
    write(data);
    return removed;
}
