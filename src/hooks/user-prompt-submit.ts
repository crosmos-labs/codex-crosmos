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

    const result = await client.search.hybrid({
        query: prompt,
        space_id: auth.spaceId,
        limit: 5,
    });
    const context = result.candidates
        .map(({ content }) => content.trim())
        .filter(Boolean)
        .join("\n\n");

    return context || undefined;
}

void runHook("UserPromptSubmit", recallUserPrompt);
