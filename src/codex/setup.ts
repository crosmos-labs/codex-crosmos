import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parse, stringify } from "smol-toml";
import { loadConfig, removeConfig, saveConfig } from "../config/config.js";
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

function configTomlPath() {
    return join(codexHome(), "config.toml");
}
function hooksJsonPath() {
    return join(codexHome(), "hooks.json");
}
export function bundlePath() {
    return join(pluginDir(), "cli.mjs");
}
function skillFile() {
    return join(skillsDir(), "crosmos-save", "SKILL.md");
}

// --- config.toml feature flag ---

function readToml(): Record<string, unknown> {
    if (!existsSync(configTomlPath())) return {};
    try {
        return parse(readFileSync(configTomlPath(), "utf8"));
    } catch {
        throw new Error(`${configTomlPath()} is not valid TOML — refusing to modify it.`);
    }
}

function hooksEnabled(cfg: Record<string, unknown>): boolean {
    const features = cfg.features as Record<string, unknown> | undefined;
    return features?.hooks === true || features?.codex_hooks === true;
}

// Returns true only if it actually had to enable the flag.
function ensureHooksEnabled(): boolean {
    const cfg = readToml();
    if (hooksEnabled(cfg)) return false;
    const features = (cfg.features as Record<string, unknown>) ?? {};
    features.hooks = true;
    cfg.features = features;
    mkdirSync(codexHome(), { recursive: true });
    backup(configTomlPath());
    writeFileAtomic(configTomlPath(), stringify(cfg));
    return true;
}

function disableHooksFlag(): boolean {
    const cfg = readToml();
    const features = cfg.features as Record<string, unknown> | undefined;
    if (features?.hooks !== true) return false;
    delete features.hooks;
    if (Object.keys(features).length === 0) delete cfg.features;
    backup(configTomlPath());
    writeFileAtomic(configTomlPath(), stringify(cfg));
    return true;
}

// --- hooks.json ---

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

function installHooks(marker: string): void {
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

// --- skill ---

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

// --- public API ---

// Throws (writing nothing) if config.toml or hooks.json is present-but-corrupt.
export function assertWritable(): void {
    readToml();
    readHooks();
}

export function runInstall(bundleSource: string): Action[] {
    const actions: Action[] = [];
    const target = bundlePath();

    if (ensureHooksEnabled()) {
        saveConfig({ setHooksFlag: true });
        actions.push({ path: configTomlPath(), action: "enabled [features] hooks" });
    } else {
        actions.push({ path: configTomlPath(), action: "hooks already enabled" });
    }

    mkdirSync(pluginDir(), { recursive: true });
    copyFileSync(bundleSource, target);
    actions.push({ path: target, action: "copied bundle" });

    installHooks(target);
    actions.push({ path: hooksJsonPath(), action: "registered 3 hooks" });

    writeSkill(target);
    actions.push({ path: skillFile(), action: "wrote skill" });

    return actions;
}

export function runUninstall(): Action[] {
    const actions: Action[] = [];
    const target = bundlePath();

    try {
        if (uninstallHooks(target) > 0)
            actions.push({ path: hooksJsonPath(), action: "removed hooks" });
    } catch (err) {
        actions.push({ path: hooksJsonPath(), action: `left untouched — ${String(err)}` });
    }

    if (existsSync(skillFile())) {
        rmSync(join(skillsDir(), "crosmos-save"), { recursive: true, force: true });
        actions.push({ path: skillFile(), action: "removed skill" });
    }
    if (existsSync(pluginDir())) {
        rmSync(pluginDir(), { recursive: true, force: true });
        actions.push({ path: pluginDir(), action: "removed bundle" });
    }
    if (loadConfig().setHooksFlag && disableHooksFlag()) {
        actions.push({ path: configTomlPath(), action: "disabled [features] hooks" });
    }
    if (removeConfig())
        actions.push({ path: join(codexHome(), "crosmos.json"), action: "removed config" });

    return actions;
}

export interface Inspection {
    hooksFlag: boolean;
    hooksRegistered: boolean;
    bundlePresent: boolean;
    skillPresent: boolean;
}

export function inspect(): Inspection {
    let hooksFlag = false;
    try {
        hooksFlag = hooksEnabled(readToml());
    } catch {}
    let hooksRegistered = false;
    try {
        hooksRegistered = readFileSync(hooksJsonPath(), "utf8").includes(bundlePath());
    } catch {}
    return {
        hooksFlag,
        hooksRegistered,
        bundlePresent: existsSync(bundlePath()),
        skillPresent: existsSync(skillFile()),
    };
}
