#!/usr/bin/env node

import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    rmdirSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
    type ConnectionStatus,
    checkConnection,
    createCrosmosClient,
    ensureAuthForInstall,
    ensureSpaceForInstall,
    resolveAuth,
} from "./auth";

type JsonObject = Record<string, unknown>;
type HookEvent = "SessionStart" | "UserPromptSubmit" | "Stop" | "PreCompact";

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
const PACKAGE_HOOKS_DIR = join(__dirname, "hooks");

const HOOK_DEFINITIONS: HookDefinition[] = [
    {
        event: "SessionStart",
        file: "session-start.js",
        timeout: 90,
        statusMessage: "recalling crosmos memory",
    },
    {
        event: "UserPromptSubmit",
        file: "user-prompt-submit.js",
        timeout: 90,
        statusMessage: "recalling crosmos memory",
    },
    {
        event: "Stop",
        file: "stop.js",
        timeout: 60,
        statusMessage: "saving crosmos memory",
    },
    {
        event: "PreCompact",
        file: "pre-compact.js",
        timeout: 60,
        statusMessage: "flushing crosmos memory",
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
    writeFileSync(filePath, `${JSON.stringify(document, null, 2)}\n`);
}

// Copies the four bundled hook files into the crosmos runtime folder.
export function installHookFiles(
    runtimeDir = HOOK_RUNTIME_DIR,
    sourceDir = PACKAGE_HOOKS_DIR,
): void {
    mkdirSync(runtimeDir, { recursive: true });

    for (const definition of HOOK_DEFINITIONS) {
        copyFileSync(
            join(sourceDir, definition.file),
            join(runtimeDir, definition.file),
        );
    }
}

// Removes the four crosmos hook files and keeps the folder if other files remain.
export function uninstallHookFiles(runtimeDir = HOOK_RUNTIME_DIR): void {
    for (const definition of HOOK_DEFINITIONS) {
        rmSync(join(runtimeDir, definition.file), { force: true });
    }

    try {
        rmdirSync(runtimeDir);
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

// Checks that all four crosmos commands are registered.
export function hooksRegistered(
    document: HooksDocument,
    runtimeDir = HOOK_RUNTIME_DIR,
): boolean {
    const hooks = document.hooks;
    if (!hooks) {
        return false;
    }

    return HOOK_DEFINITIONS.every((definition) => {
        const command = commandFor(runtimeDir, definition.file);
        return eventGroups(hooks, definition.event).some((group) =>
            (group.hooks ?? []).some((hook) => hook.command === command),
        );
    });
}

function ensureCodexDir(): void {
    mkdirSync(CODEX_HOME, { recursive: true });
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

    const hooks = reconcileHooks(readHooksJson());
    const auth = await ensureAuthForInstall();
    const space = await ensureSpaceForInstall(auth, spaceId);
    ensureCodexDir();
    installHookFiles();
    writeHooksJson(hooks);

    console.log("✓ crosmos authentication ready");
    console.log(`✓ crosmos space: ${space.name}`);
    console.log(`✓ hook runtime installed: ${HOOK_RUNTIME_DIR}`);
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

    console.log(
        removed > 0
            ? "✓ crosmos hooks removed"
            : "✓ crosmos hooks were not registered",
    );
    console.log("✓ managed hook runtime removed");
    console.log("\nUninstallation complete.");
}

async function status(): Promise<number> {
    let connection: ConnectionStatus | "missing";
    let space = "✗ not selected";

    try {
        const auth = resolveAuth();
        const client = auth ? createCrosmosClient(auth) : null;
        connection =
            !auth || !client ? "missing" : await checkConnection(client);

        if (auth?.spaceId && connection === "authenticated" && client) {
            try {
                space = `✓ ${(await client.spaces.get(auth.spaceId)).name}`;
            } catch {
                space = "✗ unavailable";
            }
        } else if (auth?.spaceId && connection !== "authenticated") {
            space = "✗ unavailable";
        }
    } catch {
        connection = "unavailable";
        space = "✗ unavailable";
    }

    const hookRuntimeReady = HOOK_DEFINITIONS.every(({ file }) =>
        existsSync(join(HOOK_RUNTIME_DIR, file)),
    );
    let hookRegistration = "✗ not registered";
    try {
        hookRegistration = hooksRegistered(readHooksJson())
            ? "✓ registered"
            : "✗ not registered";
    } catch {
        hookRegistration = "✗ invalid";
    }

    // biome-ignore format: keep status rows aligned
    // biome-ignore lint/complexity/noUselessLoneBlockStatements: keep status rows under one format suppression
    {
        console.log("\n@crosmos/codex status:\n");
        console.log(`  CODEX_HOME:   ${CODEX_HOME}`);
        console.log(`  hook runtime: ${hookRuntimeReady ? "✓ installed" : "✗ not installed"}`);
        console.log(`  hooks.json:   ${hookRegistration}`);
        console.log(`  api key:      ${connection === "authenticated" ? "✓ authenticated" : `✗ ${connection}`}`);
        console.log(`  space:        ${space}`);
    }

    return connection === "authenticated" && space.startsWith("✓") ? 0 : 1;
}

async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
    switch (argv[0]) {
        case "install":
            await install(parseInstallArgs(argv.slice(1)));
            return 0;
        case "uninstall":
            uninstall();
            return 0;
        case "status":
            return status();
        default:
            console.error(
                "\nusage: crosmos-codex <install [--space <space-id>]|uninstall|status>",
            );
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
