import * as p from "@clack/prompts";
import { getApiKey, getBaseUrl } from "../client/credentials.js";
import { createClient } from "../client/crosmos.js";
import { inspect } from "../codex/setup.js";
import { loadConfig } from "../config/config.js";
import { resolveSpaceId } from "../memory/space.js";

export async function status(): Promise<void> {
    p.intro("crosmos · codex");
    const key = getApiKey();
    const i = inspect();

    const lines = [
        `api key:          ${key ? `found (${key.slice(0, 8)}…)` : "missing"}`,
        `base url:         ${getBaseUrl()}`,
        `hooks flag:       ${i.hooksFlag ? "enabled" : "off"}`,
        `hooks registered: ${i.hooksRegistered ? "yes" : "no"}`,
        `bundle installed: ${i.bundlePresent ? "yes" : "no"}`,
        `skill installed:  ${i.skillPresent ? "yes" : "no"}`,
        `space (config):   ${loadConfig().spaceId ?? "unresolved"}`,
    ];

    if (key) {
        const client = createClient(10000);
        if (client) {
            try {
                lines.push(`space (live):     ${(await resolveSpaceId(client)) ?? "none"}`);
            } catch {
                lines.push("space (live):     error reaching crosmos");
            }
        }
    }

    p.note(lines.join("\n"), "status");
    if (i.bundlePresent && i.hooksRegistered) {
        p.log.info("if recall/capture isn't running, run /hooks in codex to approve the hooks.");
    } else if (i.bundlePresent) {
        p.log.warn("hooks not fully registered — re-run install.");
    }
    p.outro("ok");
}
