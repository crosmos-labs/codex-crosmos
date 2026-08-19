#!/usr/bin/env node

import {
    copyFileSync,
    cpSync,
    existsSync,
    mkdirSync,
    readFileSync,
    rmdirSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { ensureAuthForInstall, ensureSpaceForInstall } from "./auth";
import { runRecall } from "./commands/recall";
import { runSave } from "./commands/save";
import { runStatus } from "./commands/status";

type JsonObject = Record<string, unknown>;
type HookEvent = "UserPromptSubmit" | "Stop";

type HookEntry = {
    command?: string;
    [key: string]: unknown;
};

type MatcherGroup = {
    hooks?: HookEntry[];
    [key: string]: unknown;
};

type HooksDocument = JsonObject & {
    hooks?: Record<string, unknown>;
};

type HookDefinition = {
    event: HookEvent;
    file: string;
    timeout: number;
    statusMessage: string;
};

const CODEX_HOME = resolve(process.env.CODEX_HOME || join(homedir(), ".codex"));
const HOOKS_JSON = join(CODEX_HOME, "hooks.json");
const HOOK_RUNTIME_DIR = join(CODEX_HOME, "crosmos");
const CODEX_SKILLS_DIR = join(homedir(), ".agents", "skills");
const PACKAGE_SKILLS_DIR = resolve(__dirname, "..", "skills");
const PACKAGE_VERSION = require("../package.json").version as string;
const SHARED_FILES = ["auth.js", "memory.js"] as const;
const COMMAND_FILES = [
    "commands/recall.js",
    "commands/save.js",
    "commands/status.js",
] as const;
const SHARED_SDK_DIR = join("node_modules", "crosmos");
const PACKAGE_SDK_DIR = dirname(require.resolve("crosmos"));

const SKILL_NAMES = [
    "crosmos-status",
    "crosmos-recall",
    "crosmos-save",
] as const;

const HOOK_DEFINITIONS: HookDefinition[] = [
    {
        event: "UserPromptSubmit",
        file: "hooks/user-prompt-submit.js",
        timeout: 25,
        statusMessage: "Recalling crosmos memory...",
    },
    {
        event: "Stop",
        file: "hooks/stop.js",
        timeout: 60,
        statusMessage: "Saving crosmos memory...",
    },
];

// Reads hooks.json or returns an empty document when it is missing.
export function readHooksJson(filePath = HOOKS_JSON): HooksDocument {
    if (!existsSync(filePath)) {
        return {};
    }

    try {
        const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));

        if (
            parsed === null ||
            typeof parsed !== "object" ||
            Array.isArray(parsed)
        ) {
            throw new Error("expected a JSON object");
        }

        const document = parsed as HooksDocument;
        if (
            document.hooks !== undefined &&
            (document.hooks === null ||
                typeof document.hooks !== "object" ||
                Array.isArray(document.hooks))
        ) {
            throw new Error("invalid hooks object");
        }

        return document;
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Unable to read ${filePath}: ${detail}`);
    }
}

// Returns one event's matcher groups and rejects non-array event values.
function eventGroups(
    hooks: Record<string, unknown>,
    event: HookEvent,
): MatcherGroup[] {
    const groups = hooks[event];
    if (groups === undefined) {
        return [];
    }

    if (!Array.isArray(groups)) {
        throw new Error(`invalid hooks configuration for ${event}`);
    }

    if (
        groups.some(
            (group) =>
                group === null ||
                typeof group !== "object" ||
                Array.isArray(group),
        )
    ) {
        throw new Error(`invalid hooks configuration for ${event}`);
    }

    return groups as MatcherGroup[];
}

function commandFor(runtimeDir: string, file: string): string {
    return `node "${resolve(runtimeDir, file)}"`;
}

// Adds one crosmos command for each event without changing other hooks.
export function reconcileHooks(
    document: HooksDocument,
    runtimeDir = HOOK_RUNTIME_DIR,
): HooksDocument {
    const hooks = document.hooks ?? {};
    document.hooks = hooks;

    for (const definition of HOOK_DEFINITIONS) {
        const groups = eventGroups(hooks, definition.event);
        const command = commandFor(runtimeDir, definition.file);
        const filteredGroups: MatcherGroup[] = groups.map(
            (group): MatcherGroup => ({
                ...group,
                hooks: (group.hooks ?? []).filter(
                    (hook) => hook.command !== command,
                ),
            }),
        );

        const target = filteredGroups.find(
            (group) => group.matcher === undefined,
        );
        const entry = {
            type: "command",
            command,
            timeout: definition.timeout,
            statusMessage: definition.statusMessage,
        };

        if (target) {
            target.hooks = [...(target.hooks ?? []), entry];
        } else {
            filteredGroups.push({ hooks: [entry] });
        }

        hooks[definition.event] = filteredGroups;
    }

    return document;
}

// Removes only crosmos commands from the hook document.
export function removeManagedHooks(
    document: HooksDocument,
    runtimeDir = HOOK_RUNTIME_DIR,
): number {
    const hooks = document.hooks;
    if (!hooks) {
        return 0;
    }

    let removed = 0;
    for (const definition of HOOK_DEFINITIONS) {
        if (hooks[definition.event] === undefined) {
            continue;
        }

        const command = commandFor(runtimeDir, definition.file);
        const groups = eventGroups(hooks, definition.event);
        const filteredGroups: MatcherGroup[] = groups
            .map(
                (group): MatcherGroup => ({
                    ...group,
                    hooks: (group.hooks ?? []).filter((hook) => {
                        if (hook.command === command) {
                            removed += 1;
                            return false;
                        }
                        return true;
                    }),
                }),
            )
            .filter(
                (group) =>
                    Boolean(group.hooks?.length) ||
                    Object.keys(group).some((key) => key !== "hooks"),
            );

        if (filteredGroups.length) {
            hooks[definition.event] = filteredGroups;
        } else {
            delete hooks[definition.event];
        }
    }

    return removed;
}

function writeHooksJson(document: HooksDocument, filePath = HOOKS_JSON): void {
    writeFileSync(filePath, `${JSON.stringify(document, null, 4)}\n`);
}

// Copies the hook entrypoints and their local runtime dependencies.
export function installHookFiles(
    runtimeDir = HOOK_RUNTIME_DIR,
    sourceDir = __dirname,
    sdkDir = PACKAGE_SDK_DIR,
): void {
    mkdirSync(runtimeDir, { recursive: true });

    for (const file of [
        ...HOOK_DEFINITIONS.map(({ file }) => file),
        ...SHARED_FILES,
        ...COMMAND_FILES,
    ]) {
        const target = join(runtimeDir, file);
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(join(sourceDir, file), target);
    }

    rmSync(join(runtimeDir, SHARED_SDK_DIR), {
        force: true,
        recursive: true,
    });
    cpSync(sdkDir, join(runtimeDir, SHARED_SDK_DIR), { recursive: true });
}

/** Copies the managed skills into Codex's global skill directory. */
export function installSkills(
    skillsDir = CODEX_SKILLS_DIR,
    sourceDir = PACKAGE_SKILLS_DIR,
    runtimeDir = HOOK_RUNTIME_DIR,
): void {
    mkdirSync(skillsDir, { recursive: true });

    for (const name of SKILL_NAMES) {
        const targetDir = join(skillsDir, name);
        mkdirSync(targetDir, { recursive: true });
        const skill = readFileSync(
            join(sourceDir, name, "SKILL.md"),
            "utf8",
        ).replaceAll("{{CROSMOS_RUNTIME_DIR}}", runtimeDir);
        writeFileSync(join(targetDir, "SKILL.md"), skill);
    }
}

// Removes managed hook files and keeps unrelated files in the runtime folder.
export function uninstallHookFiles(runtimeDir = HOOK_RUNTIME_DIR): void {
    for (const definition of HOOK_DEFINITIONS) {
        rmSync(join(runtimeDir, definition.file), { force: true });
    }

    for (const file of [...SHARED_FILES, ...COMMAND_FILES]) {
        rmSync(join(runtimeDir, file), { force: true });
    }
    rmSync(join(runtimeDir, SHARED_SDK_DIR), {
        force: true,
        recursive: true,
    });

    removeEmptyDirectory(join(runtimeDir, "hooks"));
    removeEmptyDirectory(join(runtimeDir, "commands"));
    removeEmptyDirectory(join(runtimeDir, "node_modules"));
    removeEmptyDirectory(runtimeDir);
}

/** Removes only Crosmos-managed skills. */
export function uninstallSkills(skillsDir = CODEX_SKILLS_DIR): void {
    for (const name of SKILL_NAMES) {
        const skillDir = join(skillsDir, name);
        rmSync(join(skillDir, "SKILL.md"), { force: true });
        removeEmptyDirectory(join(skillsDir, name));
    }

    removeEmptyDirectory(skillsDir);
}

// Removes a directory only when no unrelated files remain inside it.
function removeEmptyDirectory(directory: string): void {
    try {
        rmdirSync(directory);
    } catch (error) {
        if (
            !(error instanceof Error) ||
            !("code" in error) ||
            ((error as NodeJS.ErrnoException).code !== "ENOENT" &&
                (error as NodeJS.ErrnoException).code !== "ENOTEMPTY")
        ) {
            throw error;
        }
    }
}

function ensureCodexDir(): void {
    mkdirSync(CODEX_HOME, { recursive: true });
}

/** Asks whether the managed Crosmos skills should be installed. */
async function confirmSkillInstall(): Promise<boolean> {
    const { default: prompts } = await import("prompts");
    const response = await prompts(
        {
            type: "confirm",
            name: "installSkills",
            message: `install skills (${SKILL_NAMES.join(", ")})?`,
            initial: true,
        },
        { onCancel: () => true },
    );
    return response.installSkills === true;
}

/** Reads the optional global space ID from install arguments. */
export function parseInstallArgs(args: string[]): string | undefined {
    if (args.length === 0) {
        return undefined;
    }

    if (args.length === 2 && args[0] === "--space" && args[1].trim()) {
        return args[1].trim();
    }

    throw new Error("usage: crosmos-codex install [--space <space-id>]");
}

async function install(spaceId?: string): Promise<void> {
    console.log("\nInstalling @crosmos/codex...\n");

    const hooks = readHooksJson();
    removeManagedHooks(hooks);
    reconcileHooks(hooks);
    const auth = await ensureAuthForInstall();
    const space = await ensureSpaceForInstall(auth, spaceId);
    ensureCodexDir();
    installHookFiles();
    const skillsInstalled = await confirmSkillInstall();
    if (skillsInstalled) {
        installSkills();
    }
    writeHooksJson(hooks);

    console.log("✓ crosmos authentication ready");
    console.log(`✓ crosmos space: ${space.name}`);
    console.log(`✓ hook runtime installed: ${HOOK_RUNTIME_DIR}`);
    console.log(
        skillsInstalled
            ? `✓ skills installed: ${CODEX_SKILLS_DIR}`
            : "✓ skills skipped",
    );
    console.log("✓ hooks.json registered");
    console.log("\nInstallation complete.");
}

function uninstall(): void {
    console.log("\nUninstalling @crosmos/codex...\n");

    const hooks = readHooksJson();
    const removed = removeManagedHooks(hooks);
    if (removed > 0) {
        writeHooksJson(hooks);
    }
    uninstallHookFiles();
    uninstallSkills();

    console.log(
        removed > 0
            ? "✓ crosmos hooks removed"
            : "✓ crosmos hooks were not registered",
    );
    console.log("✓ managed hook runtime removed");
    console.log("✓ managed skills removed");
    console.log("\nUninstallation complete.");
}

async function login(): Promise<void> {
    await ensureAuthForInstall();
    console.log("✓ crosmos authentication ready");
}

function help(): void {
    console.log(`
usage: crosmos-codex <command>

commands:
  install [--space <space-id>]  install hooks and skills
  uninstall                      remove managed hooks and skills
  login                          authenticate with crosmos
  status                         check crosmos configuration
  recall "<query>"                search crosmos memory
  save "<text>"                   save a private crosmos memory
  --help                         show this help
  --version                      show the installed version
`);
}

async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
    switch (argv[0]) {
        case "help":
        case "--help":
        case "-h":
            help();
            return 0;
        case "version":
        case "--version":
        case "-v":
            console.log(PACKAGE_VERSION);
            return 0;
        case "install":
            await install(parseInstallArgs(argv.slice(1)));
            return 0;
        case "uninstall":
            uninstall();
            return 0;
        case "status":
            return runStatus();
        case "login":
            await login();
            return 0;
        case "recall":
            await runRecall(argv.slice(1));
            return 0;
        case "save":
            await runSave(argv.slice(1));
            return 0;
        default:
            help();
            return 1;
    }
}

if (require.main === module) {
    main().then(
        (code) => {
            process.exitCode = code;
        },
        (error: unknown) => {
            console.error(
                error instanceof Error ? error.message : String(error),
            );
            process.exitCode = 1;
        },
    );
}
