import * as p from "@clack/prompts";
import { runUninstall } from "../codex/setup.js";

export async function uninstall(): Promise<void> {
    p.intro("crosmos · codex");
    const actions = runUninstall();
    const body = actions.length
        ? actions.map((a) => `${a.action}\n  ${a.path}`).join("\n")
        : "nothing to remove";
    p.note(`${body}\n\nyour crosmos login and saved memories are untouched.`, "uninstalled");
    p.outro("done");
}
