import { createClient } from "../client/crosmos.js";
import { EVENTS, type HookEvent } from "../codex/events.js";
import { emitContext, runHook } from "../codex/io.js";
import { loadConfig } from "../config/config.js";
import { gitBranch } from "../lib/git.js";
import { initLogger, log } from "../lib/logger.js";
import { capture } from "../memory/capture.js";
import { recall } from "../memory/recall.js";

const RECALL_TIMEOUT = 30000;
const CAPTURE_TIMEOUT = 5000;

export async function runHookCommand(args: string[]): Promise<void> {
    const event = args[0] as HookEvent;
    const cfg = loadConfig();

    if (event === EVENTS.userPromptSubmit) {
        await runHook(event, async (payload) => {
            initLogger(cfg.debug, payload.session_id);
            if (cfg.recallMode === "off") {
                log("hook", event, "recall skipped reason=mode_off");
                return;
            }
            const client = createClient(RECALL_TIMEOUT);
            if (!client) {
                log("hook", event, "recall skipped reason=no_client");
                return;
            }
            const context = await recall(client, {
                prompt: String(payload.prompt ?? ""),
                cwd: payload.cwd,
                branch: gitBranch(payload.cwd),
                limit: cfg.recallLimit,
                mode: cfg.recallMode,
                sessionId: payload.session_id,
                transcriptPath: payload.transcript_path,
            });
            emitContext(event, context);
        });
        return;
    }

    if (event === EVENTS.stop || event === EVENTS.preCompact) {
        await runHook(event, async (payload) => {
            initLogger(cfg.debug, payload.session_id);
            if (cfg.captureMode === "off") {
                log("hook", event, "capture skipped reason=mode_off");
                return;
            }
            const client = createClient(CAPTURE_TIMEOUT);
            if (!client) {
                log("hook", event, "capture skipped reason=no_client");
                return;
            }
            await capture(client, {
                event,
                transcriptPath: payload.transcript_path,
                cwd: payload.cwd,
                branch: gitBranch(payload.cwd),
                sessionId: payload.session_id,
                mode: cfg.captureMode,
                everyNTurns: cfg.captureEveryNTurns,
            });
        });
        return;
    }

    process.exit(0);
}
