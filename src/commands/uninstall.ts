import { rmSync } from "node:fs";
import { join } from "node:path";
import * as p from "@clack/prompts";
import { uninstallHooks } from "../codex/hooks-config.js";
import { removeSkill } from "../codex/skill.js";
import { pluginDir } from "../lib/paths.js";

export async function uninstall(): Promise<void> {
    p.intro("crosmos · codex");
    const target = join(pluginDir(), "cli.mjs");
    uninstallHooks(target);
    removeSkill();
    try {
        rmSync(pluginDir(), { recursive: true, force: true });
    } catch {}
    p.note("hooks and skill removed. your memories are untouched.", "done");
    p.outro("uninstalled");
}
