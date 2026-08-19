import type Crosmos from "crosmos";
import type { AuthConfig } from "./auth";
import { type HookPayload, runHook } from "./runtime";

/** Recalls memories relevant to the submitted prompt. */
async function recallUserPrompt(
    payload: HookPayload,
    client: Crosmos,
    auth: AuthConfig,
): Promise<string | undefined> {
    if (!auth.spaceId || typeof payload.prompt !== "string") return;

    const prompt = payload.prompt.trim();
    if (!prompt) return;

    const turnId =
        typeof payload.turn_id === "string" ? payload.turn_id.trim() : "";
    const result = await client.search.hybrid({
        query: prompt,
        space_id: auth.spaceId,
        limit: 5,
        ...(turnId ? { recall_id: turnId } : {}),
    });
    const context = (Array.isArray(result.candidates) ? result.candidates : [])
        .map((candidate) =>
            typeof candidate?.content === "string"
                ? candidate.content.trim()
                : "",
        )
        .filter(Boolean)
        .join("\n\n");

    return context
        ? `<crosmos-memory>\n${context}\n</crosmos-memory>`
        : undefined;
}

void runHook("UserPromptSubmit", recallUserPrompt);
