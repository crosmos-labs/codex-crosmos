#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
    checkConnection,
    createCrosmosClient,
    ensureAuthForInstall,
    resolveAuth,
    type ConnectionStatus,
} from "./auth";

type JsonObject = Record<string, unknown>;

const CODEX_HOME = process.env.CODEX_HOME || join(homedir(), ".codex");
const HOOKS_JSON = join(CODEX_HOME, "hooks.json");

/** Reads a JSON object from disk or returns the supplied value when absent. */
function readJsonFile<T extends JsonObject>(
    filePath: string,
    emptyValue: T,
): T {
    if (!existsSync(filePath)) {
        return emptyValue;
    }

    try {
        const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));

        return parsed as T;
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Unable to read ${filePath}: ${detail}`);
    }
}

function readHooksJson(): JsonObject {
    return readJsonFile<JsonObject>(HOOKS_JSON, {});
}

function ensureCodexDir(): void {
    mkdirSync(CODEX_HOME, { recursive: true });
}

async function install(): Promise<void> {
    console.log("\nInstalling @crosmos/codex...\n");

    await ensureAuthForInstall();
    ensureCodexDir();

    console.log("✓ crosmos authentication ready");
    console.log(`✓ codex directory ready: ${CODEX_HOME}`);
    console.log(
        existsSync(HOOKS_JSON)
            ? "✓ hooks.json found"
            : "✗ hooks.json not found",
    );
    console.log("\nPlugin installation has finished.");
}

function uninstall(): void {
    console.log("\nUninstalling @crosmos/codex...\n");

    console.log("No files removed; uninstall behavior is deferred.");
}

async function status(): Promise<number> {

    let connection: ConnectionStatus | "missing";

    try {
        const auth = resolveAuth();
        const client = auth ? createCrosmosClient(auth) : null;
        connection =
            !auth || !client ? "missing" : await checkConnection(client);
    } catch {
        connection = "unavailable";
    }

	console.log("\n@crosmos/codex status:\n");
	console.log(`  CODEX_HOME: ${existsSync(CODEX_HOME) ? `✓ ${CODEX_HOME}` : `✗ not found (${CODEX_HOME})`}`);
	console.log(`  hooks.json: ${existsSync(HOOKS_JSON) ? "✓ found" : "✗ not found"}`);
    console.log(`  API Key:    ${connection === "authenticated" ? "✓" : "✗"} ${connection}`);

    return connection === "authenticated" ? 0 : 1;
}

async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
    switch (argv[0]) {
        case "install":
            await install();
            return 0;
        case "uninstall":
            uninstall();
            return 0;
        case "status":
            return status();
        default:
            console.error("\nusage: crosmos-codex <install|uninstall|status>");
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
