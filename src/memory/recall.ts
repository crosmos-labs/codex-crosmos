import { basename } from "node:path";
import type Crosmos from "crosmos";
import type { Config } from "../config/schema.js";
import { log } from "../lib/logger.js";
import { resolveSpaceId } from "./space.js";
import {
    addInjectedHashes,
    hashText,
    loadSessionState,
    saveSessionState,
    sessionKey,
} from "./state.js";

const MIN_PROMPT = 12;
const BACKOFF_BASE_MS = 60_000;
const BACKOFF_MAX_MS = 300_000;

export async function recall(
    client: Crosmos,
    opts: {
        prompt: string;
        cwd?: string;
        branch?: string;
        limit: number;
        mode: Config["recallMode"];
        sessionId?: string | null;
        transcriptPath?: string | null;
    }
): Promise<string> {
    const prompt = opts.prompt.trim();
    if (prompt.length < MIN_PROMPT) {
        log("hook UserPromptSubmit recall skipped reason=short_prompt", `chars=${prompt.length}`);
        return "";
    }
    if (opts.mode === "off") {
        log("hook UserPromptSubmit recall skipped reason=mode_off");
        return "";
    }

    const key = sessionKey({
        sessionId: opts.sessionId,
        transcriptPath: opts.transcriptPath,
        cwd: opts.cwd,
    });
    let state = loadSessionState(key);
    const now = Date.now();
    if ((state.recallBackoffUntil ?? 0) > now) {
        log("hook UserPromptSubmit recall skipped reason=backoff");
        return "";
    }

    const project = opts.cwd ? basename(opts.cwd) : "";
    const query = [project, opts.branch, prompt].filter(Boolean).join(" ");
    const queryHash = hashText(query);

    if (opts.mode === "auto" && state.lastRecallQueryHash === queryHash) {
        log("hook UserPromptSubmit recall skipped reason=repeat_query");
        return "";
    }

    try {
        const spaceId = await resolveSpaceId(client);
        if (!spaceId) {
            log("hook UserPromptSubmit recall skipped reason=no_space");
            return "";
        }

        const res = await client.search.hybrid({ query, space_id: spaceId, limit: opts.limit });
        const hits = res.candidates ?? [];
        const seen = new Set(state.injectedMemoryHashes ?? []);
        const fresh = hits.filter((c) => !seen.has(hashText(c.content.trim())));
        const freshHashes = fresh.map((c) => hashText(c.content.trim()));

        state = addInjectedHashes(
            {
                ...state,
                lastRecallQueryHash: queryHash,
                lastRecallAt: now,
                recallFailures: 0,
                recallBackoffUntil: 0,
            },
            freshHashes
        );
        saveSessionState(key, state);

        log(
            "hook UserPromptSubmit recall proceed",
            `hits=${hits.length}`,
            `fresh=${fresh.length}`,
            `emitted_context=${fresh.length > 0}`
        );
        if (fresh.length === 0) return "";

        const lines = fresh.map((c) => `- ${c.content.trim()}`).join("\n");
        return `Relevant context from crosmos memory:\n${lines}`;
    } catch (err) {
        const failures = (state.recallFailures ?? 0) + 1;
        saveSessionState(key, {
            ...state,
            recallFailures: failures,
            recallBackoffUntil: now + Math.min(BACKOFF_BASE_MS * failures, BACKOFF_MAX_MS),
        });
        log("hook UserPromptSubmit recall proceed error", String(err), `failures=${failures}`);
        return "";
    }
}
