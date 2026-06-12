import { readFileSync } from "node:fs";
import { redact } from "../lib/redact.js";

export interface Turn {
    role: "user" | "assistant";
    content: string;
}

const MAX_CHARS = 1600;
const MAX_TURNS = 40;

// Parses codex rollout JSONL: user/assistant text lives in event_msg payloads
// (user_message / agent_message), each with payload.message as a string.
export function parseTranscript(path: string): Turn[] {
    let lines: string[];
    try {
        lines = readFileSync(path, "utf8").split("\n");
    } catch {
        return [];
    }

    const turns: Turn[] = [];
    for (const line of lines) {
        if (!line.trim()) continue;
        let entry: { type?: string; payload?: { type?: string; message?: unknown } };
        try {
            entry = JSON.parse(line);
        } catch {
            continue;
        }
        if (entry?.type !== "event_msg") continue;
        const p = entry.payload;
        const text = typeof p?.message === "string" ? p.message.trim() : "";
        if (!text) continue;
        if (p?.type === "user_message") turns.push({ role: "user", content: clean(text) });
        else if (p?.type === "agent_message")
            turns.push({ role: "assistant", content: clean(text) });
    }
    return turns.slice(-MAX_TURNS);
}

function clean(text: string): string {
    return redact(text).slice(0, MAX_CHARS);
}
