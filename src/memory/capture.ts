import { basename } from "node:path";
import type Crosmos from "crosmos";
import { parseTranscriptEntries, type Turn } from "../codex/transcript.js";
import type { Config } from "../config/schema.js";
import { log } from "../lib/logger.js";
import { resolveSpaceId } from "./space.js";
import { loadSessionState, saveSessionState, sessionKey } from "./state.js";

const SIGNAL =
    /\b(remember|decided|prefer|todo|task|next|bug|fix|release|version|architecture|design|endpoint|settings?|config|blocked|waiting|follow up)\b/i;

export async function capture(
    client: Crosmos,
    opts: {
        event: string;
        transcriptPath?: string | null;
        cwd?: string;
        branch?: string;
        sessionId?: string;
        mode: Config["captureMode"];
    }
): Promise<void> {
    if (opts.mode === "off") {
        log("hook", opts.event, "capture skipped reason=mode_off");
        return;
    }
    const entries = opts.transcriptPath ? parseTranscriptEntries(opts.transcriptPath) : [];
    if (entries.length === 0) {
        log("hook", opts.event, "capture skipped reason=no_transcript_entries");
        return;
    }

    const key = sessionKey({
        sessionId: opts.sessionId,
        transcriptPath: opts.transcriptPath,
        cwd: opts.cwd,
    });
    const state = loadSessionState(key);
    const lastCaptured = state.capturedLine ?? 0;
    const delta = entries.filter((t) => t.line > lastCaptured);
    if (delta.length === 0) {
        log("hook", opts.event, "capture skipped reason=no_new_turns");
        return;
    }

    const turns = meaningfulTurns(delta);
    const maxDeltaLine = Math.max(...delta.map((t) => t.line));
    if (!shouldCaptureDelta(opts.event, delta, turns)) {
        if (turns.length === 0) {
            saveSessionState(key, { ...state, capturedLine: maxDeltaLine });
            log(
                "hook",
                opts.event,
                "capture skipped reason=no_meaningful_turns",
                `delta=${delta.length}`
            );
        } else {
            log(
                "hook",
                opts.event,
                "capture skipped reason=below_threshold",
                `delta=${delta.length}`,
                `meaningful=${turns.length}`
            );
        }
        return;
    }

    const spaceId = await resolveSpaceId(client);
    if (!spaceId) {
        log("hook", opts.event, "capture skipped reason=no_space");
        return;
    }

    const project = opts.cwd ? basename(opts.cwd) : "";
    const res = await client.conversations.ingest({
        messages: turns.map((t) => ({ role: t.role, content: t.content })),
        space_id: spaceId,
        session_id: opts.sessionId ?? null,
        session_date: new Date().toISOString(),
        meta: { source: `codex:${opts.event}`, project, branch: opts.branch ?? "" },
    });
    saveSessionState(key, { ...state, capturedLine: maxDeltaLine });
    log("hook", opts.event, "capture proceed", `turns=${turns.length}`, `job_id=${res.job_id}`);
}

export function shouldCaptureDelta(event: string, delta: Turn[], meaningful: Turn[]): boolean {
    if (meaningful.length === 0) return false;
    if (event === "PreCompact") return true;
    return meaningful.length >= 2 || delta.some((t) => SIGNAL.test(t.content));
}

function meaningfulTurns(turns: Turn[]): Turn[] {
    return turns.filter((t) => {
        const words = t.content.trim().split(/\s+/).filter(Boolean).length;
        return words >= 4 || SIGNAL.test(t.content);
    });
}
