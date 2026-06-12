import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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

function read(): HooksFile {
    try {
        return JSON.parse(readFileSync(file(), "utf8")) as HooksFile;
    } catch {
        return {};
    }
}

function write(data: HooksFile): void {
    mkdirSync(codexHome(), { recursive: true });
    writeFileSync(file(), `${JSON.stringify(data, null, 2)}\n`);
}

function withoutMarker(groups: HookGroup[], marker: string): HookGroup[] {
    return groups
        .map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h) => !h.command?.includes(marker)) }))
        .filter((g) => g.hooks.length > 0);
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

export function uninstallHooks(marker: string): void {
    const data = read();
    if (!data.hooks) return;
    for (const event of Object.keys(data.hooks)) {
        const kept = withoutMarker(data.hooks[event] ?? [], marker);
        if (kept.length > 0) data.hooks[event] = kept;
        else delete data.hooks[event];
    }
    write(data);
}
