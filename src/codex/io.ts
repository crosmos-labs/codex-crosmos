import { readFileSync } from "node:fs";
import { log } from "../lib/logger.js";
import type { HookEvent, HookPayload } from "./events.js";

export function readPayload(): HookPayload {
    try {
        const raw = readFileSync(0, "utf8");
        return raw.trim() ? (JSON.parse(raw) as HookPayload) : {};
    } catch {
        return {};
    }
}

export function emitContext(event: HookEvent, context: string): void {
    if (!context) return;
    process.stdout.write(
        `${JSON.stringify({
            suppressOutput: true,
            hookSpecificOutput: { hookEventName: event, additionalContext: context },
        })}\n`
    );
}

// Always exits 0 so a memory failure never blocks the codex session.
export async function runHook(
    event: HookEvent,
    fn: (payload: HookPayload) => Promise<void>
): Promise<void> {
    const payload = readPayload();
    try {
        await fn(payload);
    } catch (err) {
        log("hook error", event, String(err));
    }
    process.exit(0);
}
