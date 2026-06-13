import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "../lib/fsx.js";
import { pluginDir } from "../lib/paths.js";

export interface SessionState {
    capturedLine?: number;
    injectedMemoryHashes?: string[];
    lastRecallQueryHash?: string;
    lastRecallAt?: number;
    recallFailures?: number;
    recallBackoffUntil?: number;
}

const MAX_HASHES = 200;

export function sessionKey(opts: {
    sessionId?: string | null;
    transcriptPath?: string | null;
    cwd?: string;
}): string {
    return hashText(opts.sessionId || opts.transcriptPath || opts.cwd || "default");
}

export function hashText(text: string): string {
    return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

export function loadSessionState(key: string): SessionState {
    const path = statePath(key);
    if (!existsSync(path)) return {};
    try {
        const parsed = JSON.parse(readFileSync(path, "utf8")) as SessionState;
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
        return {};
    }
}

export function saveSessionState(key: string, state: SessionState): void {
    const dir = stateDir();
    mkdirSync(dir, { recursive: true });
    writeFileAtomic(statePath(key), `${JSON.stringify(state, null, 2)}\n`, 0o600);
}

export function addInjectedHashes(state: SessionState, hashes: string[]): SessionState {
    const seen = new Set(state.injectedMemoryHashes ?? []);
    for (const hash of hashes) seen.add(hash);
    return { ...state, injectedMemoryHashes: [...seen].slice(-MAX_HASHES) };
}

function stateDir(): string {
    return join(pluginDir(), "state");
}

function statePath(key: string): string {
    return join(stateDir(), `${key}.json`);
}
