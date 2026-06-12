import { basename } from "node:path";
import type Crosmos from "crosmos";
import { log } from "../lib/logger.js";
import { resolveSpaceId } from "./space.js";

const MIN_PROMPT = 12;

export async function recall(
    client: Crosmos,
    opts: { prompt: string; cwd?: string; branch?: string; limit: number }
): Promise<string> {
    const prompt = opts.prompt.trim();
    if (prompt.length < MIN_PROMPT) return "";

    const spaceId = await resolveSpaceId(client);
    if (!spaceId) return "";

    const project = opts.cwd ? basename(opts.cwd) : "";
    const query = [project, opts.branch, prompt].filter(Boolean).join(" ");

    const res = await client.search.hybrid({ query, space_id: spaceId, limit: opts.limit });
    const hits = res.candidates ?? [];
    if (hits.length === 0) return "";

    log("recall hits", hits.length);
    const lines = hits.map((c) => `- ${c.content.trim()}`).join("\n");
    return `Relevant context from crosmos memory:\n${lines}`;
}
