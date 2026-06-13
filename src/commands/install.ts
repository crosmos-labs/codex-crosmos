import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
import { getApiKey, saveApiKey } from "../client/credentials.js";
import { createClient } from "../client/crosmos.js";
import { EVENTS } from "../codex/events.js";
import { assertWritable, installHooks } from "../codex/hooks-config.js";
import { writeSkill } from "../codex/skill.js";
import { pluginDir } from "../lib/paths.js";
import { resolveSpaceId } from "../memory/space.js";

export async function install(): Promise<void> {
    p.intro("crosmos · codex");

    let apiKey = getApiKey();
    if (!apiKey) {
        const entered = await p.text({
            message: "paste your crosmos api key (csk_…)",
            placeholder: "csk_…",
            validate: (v) =>
                v?.startsWith("csk_") ? undefined : "expected a key starting with csk_",
        });
        if (p.isCancel(entered)) {
            p.cancel("cancelled");
            process.exit(1);
        }
        apiKey = entered;
        saveApiKey(apiKey);
    }

    const s = p.spinner();
    s.start("connecting to crosmos");
    const client = createClient(15000);
    if (!client) {
        s.stop("no api key");
        process.exit(1);
    }
    let spaceId: string | null;
    try {
        spaceId = await resolveSpaceId(client);
    } catch (err) {
        s.stop("could not reach crosmos");
        p.log.error(String(err));
        process.exit(1);
    }
    if (!spaceId) {
        s.stop("no memory space found — create one in the crosmos console first");
        process.exit(1);
    }
    s.stop("connected");

    // Validate hooks.json before writing anything, so we never clobber a corrupt file.
    try {
        assertWritable();
    } catch (err) {
        p.log.error(String(err));
        process.exit(1);
    }

    const self = fileURLToPath(import.meta.url);
    const target = join(pluginDir(), "cli.mjs");
    mkdirSync(pluginDir(), { recursive: true });
    copyFileSync(self, target);

    const node = process.execPath;
    const cmd = (event: string) => `"${node}" "${target}" hook ${event}`;
    installHooks(
        [
            {
                event: EVENTS.userPromptSubmit,
                command: cmd(EVENTS.userPromptSubmit),
                commandWindows: cmd(EVENTS.userPromptSubmit),
                timeout: 8,
                statusMessage: "recalling crosmos memory",
            },
            {
                event: EVENTS.stop,
                command: cmd(EVENTS.stop),
                commandWindows: cmd(EVENTS.stop),
                timeout: 15,
                statusMessage: "saving to crosmos",
            },
            {
                event: EVENTS.preCompact,
                command: cmd(EVENTS.preCompact),
                commandWindows: cmd(EVENTS.preCompact),
                timeout: 15,
                statusMessage: "saving to crosmos",
            },
        ],
        target
    );
    writeSkill(target);

    p.note(
        "run /hooks in codex to approve, then just use codex normally.\nmemory is recalled and saved automatically.",
        "done"
    );
    p.outro("crosmos is set up");
}
