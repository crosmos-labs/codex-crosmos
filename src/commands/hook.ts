import { createClient } from "../client/crosmos.js";
import { EVENTS, type HookEvent } from "../codex/events.js";
import { emitContext, runHook } from "../codex/io.js";
import { loadConfig } from "../config/config.js";
import { gitBranch } from "../lib/git.js";
import { initLogger } from "../lib/logger.js";
import { capture } from "../memory/capture.js";
import { recall } from "../memory/recall.js";

const RECALL_TIMEOUT = 6000;
const CAPTURE_TIMEOUT = 12000;

export async function runHookCommand(args: string[]): Promise<void> {
    const event = args[0] as HookEvent;
    const cfg = loadConfig();

    if (event === EVENTS.userPromptSubmit) {
        await runHook(event, async (payload) => {
            initLogger(cfg.debug, payload.session_id);
            const client = createClient(RECALL_TIMEOUT);
            if (!client) return;
            const context = await recall(client, {
                prompt: String(payload.prompt ?? ""),
                cwd: payload.cwd,
                branch: gitBranch(payload.cwd),
                limit: cfg.recallLimit,
            });
            emitContext(event, context);
        });
        return;
    }

    if (event === EVENTS.stop || event === EVENTS.preCompact) {
        await runHook(event, async (payload) => {
            initLogger(cfg.debug, payload.session_id);
            const client = createClient(CAPTURE_TIMEOUT);
            if (!client) return;
            await capture(client, {
                event,
                transcriptPath: payload.transcript_path,
                cwd: payload.cwd,
                branch: gitBranch(payload.cwd),
                sessionId: payload.session_id,
            });
        });
        return;
    }

    process.exit(0);
}
