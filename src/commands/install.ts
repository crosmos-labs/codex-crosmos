import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
import { getApiKey, saveApiKey } from "../client/credentials.js";
import { createClient } from "../client/crosmos.js";
import { assertWritable, runInstall } from "../codex/setup.js";
import { codexHome, isDefaultCodexHome } from "../lib/paths.js";
import { resolveSpaceId } from "../memory/space.js";

export async function install(args: string[]): Promise<void> {
    p.intro("crosmos · codex");

    if (!isDefaultCodexHome() && !args.includes("--force")) {
        p.log.warn(
            `CODEX_HOME points to ${codexHome()} (not ~/.codex) — install would write there.`
        );
        p.log.warn("unset CODEX_HOME, or re-run with --force if that's intended.");
        p.outro("aborted");
        process.exit(1);
    }

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
    try {
        if (!(await resolveSpaceId(client))) {
            s.stop("no memory space found — create one in the crosmos console first");
            process.exit(1);
        }
    } catch (err) {
        s.stop("could not reach crosmos");
        p.log.error(String(err));
        process.exit(1);
    }
    s.stop("connected");

    try {
        assertWritable();
    } catch (err) {
        p.log.error(String(err));
        process.exit(1);
    }

    let actions: { path: string; action: string }[];
    try {
        actions = runInstall(fileURLToPath(import.meta.url));
    } catch (err) {
        p.log.error(`install failed: ${String(err)}`);
        process.exit(1);
    }

    p.note(actions.map((a) => `${a.action}\n  ${a.path}`).join("\n"), "installed");
    p.note(
        "run /hooks in codex to approve, then just use codex normally.\nmemory is recalled and saved automatically.",
        "next"
    );
    p.outro("crosmos is set up");
}
