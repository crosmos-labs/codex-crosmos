import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { uninstallHooks } from "../codex/hooks-config.js";
import { removeSkill } from "../codex/skill.js";
import { removeConfig } from "../config/config.js";
import { pluginDir } from "../lib/paths.js";

export async function uninstall(): Promise<void> {
    p.intro("crosmos · codex");
    const target = join(pluginDir(), "cli.mjs");
    const done: string[] = [];

    try {
        const removed = uninstallHooks(target);
        if (removed > 0)
            done.push(`removed ${removed} hook${removed === 1 ? "" : "s"} from hooks.json`);
    } catch (err) {
        p.log.warn(`left hooks.json untouched — ${String(err)}`);
    }

    if (removeSkill()) done.push("removed crosmos-save skill");
    if (existsSync(pluginDir())) {
        rmSync(pluginDir(), { recursive: true, force: true });
        done.push("removed plugin bundle");
    }
    if (removeConfig()) done.push("removed crosmos.json");

    p.note(
        `${done.length ? done.join("\n") : "nothing to remove"}\n\nyour crosmos login and saved memories are untouched.`,
        "done"
    );
    p.outro("uninstalled");
}
