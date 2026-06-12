import { basename } from "node:path";
import type Crosmos from "crosmos";
import { parseTranscript } from "../codex/transcript.js";
import { log } from "../lib/logger.js";
import { resolveSpaceId } from "./space.js";

export async function capture(
    client: Crosmos,
    opts: {
        event: string;
        transcriptPath?: string | null;
        cwd?: string;
        branch?: string;
        sessionId?: string;
    }
): Promise<void> {
    const turns = opts.transcriptPath ? parseTranscript(opts.transcriptPath) : [];
    if (turns.length === 0) return;

    const spaceId = await resolveSpaceId(client);
    if (!spaceId) return;

    const project = opts.cwd ? basename(opts.cwd) : "";
    const res = await client.conversations.ingest({
        messages: turns.map((t) => ({ role: t.role, content: t.content })),
        space_id: spaceId,
        session_id: opts.sessionId ?? null,
        session_date: new Date().toISOString(),
        meta: { source: `codex:${opts.event}`, project, branch: opts.branch ?? "" },
    });
    log("capture submitted", res.job_id, "turns", turns.length);
}
