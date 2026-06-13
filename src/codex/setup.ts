import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { removeConfig } from "../config/config.js";
import { backup, writeFileAtomic } from "../lib/fsx.js";
import { codexHome, pluginDir, skillsDir } from "../lib/paths.js";
import { EVENTS } from "./events.js";

export interface Action {
    path: string;
    action: string;
}

const TIMEOUTS: Record<string, number> = {
    [EVENTS.userPromptSubmit]: 8,
    [EVENTS.stop]: 15,
    [EVENTS.preCompact]: 15,
};

function hooksJsonPath() {
    return join(codexHome(), "hooks.json");
}
export function bundlePath() {
    return join(pluginDir(), "cli.mjs");
}
function skillFile() {
    return join(skillsDir(), "crosmos-save", "SKILL.md");
}

// Codex enables the `hooks` feature by default, so we never touch config.toml.

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

function readHooks(): HooksFile {
    if (!existsSync(hooksJsonPath())) return {};
    try {
        return JSON.parse(readFileSync(hooksJsonPath(), "utf8")) as HooksFile;
    } catch {
        throw new Error(`${hooksJsonPath()} is not valid JSON — refusing to modify it.`);
    }
}

function writeHooks(data: HooksFile): void {
    mkdirSync(codexHome(), { recursive: true });
    backup(hooksJsonPath());
    writeFileAtomic(hooksJsonPath(), `${JSON.stringify(data, null, 2)}\n`);
}

function withoutMarker(groups: HookGroup[], marker: string): HookGroup[] {
    return groups
        .map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h) => !h.command?.includes(marker)) }))
        .filter((g) => g.hooks.length > 0);
}

function installHooks(marker: string): number {
    const data = readHooks();
    data.hooks ??= {};
    for (const event of Object.values(EVENTS)) {
        const kept = withoutMarker(data.hooks[event] ?? [], marker);
        const command = `"${process.execPath}" "${marker}" hook ${event}`;
        kept.push({
            hooks: [
                {
                    type: "command",
                    command,
                    commandWindows: command,
                    timeout: TIMEOUTS[event],
                    statusMessage:
                        event === EVENTS.userPromptSubmit
                            ? "recalling crosmos memory"
                            : "saving to crosmos",
                },
            ],
        });
        data.hooks[event] = kept;
    }
    writeHooks(data);
    return Object.values(EVENTS).length;
}

function uninstallHooks(marker: string): number {
    const data = readHooks();
    if (!data.hooks) return 0;
    let removed = 0;
    for (const event of Object.keys(data.hooks)) {
        const before = (data.hooks[event] ?? []).reduce((n, g) => n + (g.hooks?.length ?? 0), 0);
        const kept = withoutMarker(data.hooks[event] ?? [], marker);
        removed += before - kept.reduce((n, g) => n + g.hooks.length, 0);
        if (kept.length > 0) data.hooks[event] = kept;
        else delete data.hooks[event];
    }
    writeHooks(data);
    return removed;
}

function writeSkill(cliPath: string): void {
    mkdirSync(join(skillsDir(), "crosmos-save"), { recursive: true });
    writeFileAtomic(
        skillFile(),
        `---
name: crosmos-save
description: Save an important note or decision to crosmos memory.
---

When the user explicitly asks to remember or save something specific, run:

\`node "${cliPath}" save --text "<concise note>"\`

Pass a clear, self-contained summary. crosmos handles storage and recall automatically.
`
    );
}

// Throws (writing nothing) if hooks.json is present-but-corrupt.
export function assertWritable(): void {
    readHooks();
}

export function runInstall(bundleSource: string): Action[] {
    const actions: Action[] = [];
    const target = bundlePath();

    mkdirSync(pluginDir(), { recursive: true });
    copyFileSync(bundleSource, target);
    actions.push({ path: target, action: "copied bundle to" });

    const added = installHooks(target);
    actions.push({
        path: hooksJsonPath(),
        action: `added ${added} hook ${added === 1 ? "entry" : "entries"} to`,
    });

    writeSkill(target);
    actions.push({ path: skillFile(), action: "wrote skill to" });

    return actions;
}

export function runUninstall(): Action[] {
    const actions: Action[] = [];
    const target = bundlePath();

    try {
        const n = uninstallHooks(target);
        if (n > 0)
            actions.push({
                path: hooksJsonPath(),
                action: `removed ${n} hook ${n === 1 ? "entry" : "entries"} from`,
            });
    } catch (err) {
        actions.push({ path: hooksJsonPath(), action: `left untouched (${String(err)}):` });
    }

    const skillDir = join(skillsDir(), "crosmos-save");
    if (existsSync(skillDir)) {
        rmSync(skillDir, { recursive: true, force: true });
        actions.push({ path: skillDir, action: "deleted skill dir" });
    }
    if (existsSync(pluginDir())) {
        rmSync(pluginDir(), { recursive: true, force: true });
        actions.push({ path: pluginDir(), action: "deleted bundle dir" });
    }
    if (removeConfig())
        actions.push({ path: join(codexHome(), "crosmos.json"), action: "deleted" });

    return actions;
}

export interface Inspection {
    hooksRegistered: boolean;
    bundlePresent: boolean;
    skillPresent: boolean;
    hooksDisabled: boolean;
}

export function inspect(): Inspection {
    let hooksRegistered = false;
    try {
        hooksRegistered = readFileSync(hooksJsonPath(), "utf8").includes(bundlePath());
    } catch {}
    // Cheap, parser-free check: warn only if hooks were explicitly turned off.
    let hooksDisabled = false;
    try {
        hooksDisabled = /hooks\s*=\s*false/.test(
            readFileSync(join(codexHome(), "config.toml"), "utf8")
        );
    } catch {}
    return {
        hooksRegistered,
        bundlePresent: existsSync(bundlePath()),
        skillPresent: existsSync(skillFile()),
        hooksDisabled,
    };
}
