import type Crosmos from "crosmos";
import type { AuthConfig } from "../auth";
import { recallMemory } from "../memory";
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
    const memories = await recallMemory(
        client,
        auth.spaceId,
        prompt,
        turnId || undefined,
    );

    return memories.length
        ? `<crosmos-memory>\n${memories.join("\n\n")}\n</crosmos-memory>`
        : undefined;
}

void runHook("UserPromptSubmit", recallUserPrompt);
