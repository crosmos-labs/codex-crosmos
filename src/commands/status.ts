import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { getApiKey, getBaseUrl } from "../client/credentials.js";
import { createClient } from "../client/crosmos.js";
import { hooksPath } from "../codex/hooks-config.js";
import { loadConfig } from "../config/config.js";
import { pluginDir } from "../lib/paths.js";
import { resolveSpaceId } from "../memory/space.js";

export async function status(): Promise<void> {
    p.intro("crosmos · codex");

    const key = getApiKey();
    const lines = [
        `api key: ${key ? `found (${key.slice(0, 8)}…)` : "missing"}`,
        `base url: ${getBaseUrl()}`,
        `space (config): ${loadConfig().spaceId ?? "unresolved"}`,
        `installed bundle: ${existsSync(join(pluginDir(), "cli.mjs")) ? "yes" : "no"}`,
        `hooks registered: ${hooksRegistered() ? "yes" : "no"}`,
    ];

    if (key) {
        const client = createClient(10000);
        if (client) {
            try {
                lines.push(`space (live): ${(await resolveSpaceId(client)) ?? "none"}`);
            } catch (err) {
                lines.push(`space (live): error — ${String(err)}`);
            }
        }
    }

    p.note(lines.join("\n"), "status");
    if (existsSync(join(pluginDir(), "cli.mjs")) && !hooksRegistered()) {
        p.log.warn("run /hooks in codex to approve the hooks.");
    }
    p.outro("ok");
}

function hooksRegistered(): boolean {
    try {
        return readFileSync(hooksPath(), "utf8").includes(join(pluginDir(), "cli.mjs"));
    } catch {
        return false;
    }
}
