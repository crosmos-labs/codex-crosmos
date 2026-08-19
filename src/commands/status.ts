import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
    type ConnectionStatus,
    checkConnection,
    createCrosmosClient,
    resolveAuth,
} from "../auth";

type JsonObject = Record<string, unknown>;
type HookEvent = "UserPromptSubmit" | "Stop";
type HookEntry = { command?: string; [key: string]: unknown };
type MatcherGroup = { hooks?: HookEntry[]; [key: string]: unknown };
type HooksDocument = JsonObject & { hooks?: Record<string, unknown> };

const CODEX_HOME = resolve(process.env.CODEX_HOME || join(homedir(), ".codex"));
const HOOKS_JSON = join(CODEX_HOME, "hooks.json");
const RUNTIME_DIR = join(CODEX_HOME, "crosmos");
const SKILLS_DIR = join(homedir(), ".agents", "skills");
const HOOK_DEFINITIONS = [
    ["UserPromptSubmit", "hooks/user-prompt-submit.js"],
    ["Stop", "hooks/stop.js"],
] as const satisfies ReadonlyArray<readonly [HookEvent, string]>;
const SHARED_FILES = ["auth.js", "memory.js"] as const;
const COMMAND_FILES = [
    "commands/recall.js",
    "commands/save.js",
    "commands/status.js",
] as const;
const SKILL_NAMES = [
    "crosmos-status",
    "crosmos-recall",
    "crosmos-save",
] as const;

function eventGroups(
    hooks: Record<string, unknown>,
    event: HookEvent,
): MatcherGroup[] {
    const groups = hooks[event];
    if (groups === undefined) return [];
    if (!Array.isArray(groups))
        throw new Error(`invalid hooks configuration for ${event}`);
    return groups as MatcherGroup[];
}

function hooksRegistered(document: HooksDocument): boolean {
    if (!document.hooks) return false;

    return HOOK_DEFINITIONS.every(([event, file]) => {
        const command = `node "${resolve(RUNTIME_DIR, file)}"`;
        return eventGroups(
            document.hooks as Record<string, unknown>,
            event,
        ).some((group) =>
            (group.hooks ?? []).some((hook) => hook.command === command),
        );
    });
}

function runtimeReady(): boolean {
    return [
        ...HOOK_DEFINITIONS.map(([, file]) => file),
        ...SHARED_FILES,
        ...COMMAND_FILES,
        "node_modules/crosmos/index.js",
    ].every((file) => existsSync(join(RUNTIME_DIR, file)));
}

function skillsReady(): boolean {
    return SKILL_NAMES.every((name) =>
        existsSync(join(SKILLS_DIR, name, "SKILL.md")),
    );
}

/** Reports connection, space, hook, runtime, and skill readiness. */
export async function runStatus(): Promise<number> {
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

    const installed = runtimeReady();
    const skillsInstalled = skillsReady();
    let hookRegistration = "✗ not registered";
    try {
        const document: HooksDocument = existsSync(HOOKS_JSON)
            ? JSON.parse(readFileSync(HOOKS_JSON, "utf8"))
            : {};
        hookRegistration = hooksRegistered(document)
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
        console.log(`  hook runtime: ${installed ? "✓ installed" : "✗ not installed"}`);
        console.log(`  skills:       ${skillsInstalled ? "✓ installed" : "✗ not installed"}`);
        console.log(`  hooks.json:   ${hookRegistration}`);
        console.log(`  api key:      ${connection === "authenticated" ? "✓ authenticated" : `✗ ${connection}`}`);
        console.log(`  space:        ${space}`);
    }

    return connection === "authenticated" && space.startsWith("✓") ? 0 : 1;
}

if (require.main === module) {
    runStatus().then(
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
