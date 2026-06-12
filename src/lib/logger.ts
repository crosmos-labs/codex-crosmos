import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let enabled = false;
let logPath = join(tmpdir(), "crosmos-codex.log");

export function initLogger(debug: boolean, session?: string): void {
    enabled = debug;
    if (session) logPath = join(tmpdir(), `crosmos-codex-${session}.log`);
}

export function log(...parts: unknown[]): void {
    if (!enabled) return;
    try {
        const msg = parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ");
        appendFileSync(logPath, `${new Date().toISOString()} ${msg}\n`);
    } catch {}
}
