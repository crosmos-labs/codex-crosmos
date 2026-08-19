import { appendFileSync, chmodSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type Crosmos from "crosmos";
import {
    type AuthConfig,
    createCrosmosClient,
    isDebugEnabled,
    resolveAuth,
} from "../auth";

export type HookEvent = "UserPromptSubmit" | "Stop";

export type HookPayload = Record<string, unknown>;

type HookHandler = (
    payload: HookPayload,
    client: Crosmos,
    auth: AuthConfig,
) => Promise<string | undefined> | string | undefined;

type DebugFields = Record<string, boolean | null | number | string | undefined>;

const DEBUG_LOG_DIR = join(homedir(), ".crosmos");
const DEBUG_LOG_FILE = join(DEBUG_LOG_DIR, "codex.log");

/** Parses hook stdin while accepting future Codex fields unchanged. */
export function parseHookInput(raw: string): HookPayload | null {
    let parsed: unknown;

    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }

    if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
    ) {
        return null;
    }

    return parsed as HookPayload;
}

/** Runs a lifecycle hook without allowing plugin failures to disrupt Codex. */
export async function runHook(
    event: HookEvent,
    handler: HookHandler = () => undefined,
): Promise<void> {
    const startedAt = Date.now();
    const payload = readHookPayload();

    if (!payload) {
        writeDebug(event, startedAt, "invalid_input");
        return;
    }

    let auth: AuthConfig | null;

    try {
        auth = resolveAuth();
    } catch (error) {
        reportFailure(event, startedAt, "authentication", error);
        return;
    }

    if (!auth) {
        reportFailure(event, startedAt, "authentication");
        return;
    }

    if (!auth.spaceId) {
        reportFailure(event, startedAt, "space");
        return;
    }

    const client = createCrosmosClient(auth);

    if (!client) {
        reportFailure(event, startedAt, "authentication");
        return;
    }

    try {
        const additionalContext = await handler(payload, client, auth);
        if (additionalContext) {
            writeHookOutput(event, additionalContext);
        }
        writeDebug(event, startedAt, "success");
    } catch (error) {
        reportFailure(event, startedAt, configurationFailure(error), error);
    }
}

function readHookPayload(): HookPayload | null {
    let raw: string;

    try {
        raw = readFileSync(0, "utf8");
    } catch {
        return null;
    }

    return parseHookInput(raw);
}

/** Maps SDK authentication and missing-space status codes to warning kinds. */
export function configurationFailure(
    error: unknown,
): "authentication" | "space" | undefined {
    const status =
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        typeof error.status === "number"
            ? error.status
            : undefined;

    if (status === 401 || status === 403) {
        return "authentication";
    }

    if (status === 404) {
        return "space";
    }

    return undefined;
}

/** Returns the fixed user-facing warning for a configuration failure kind. */
export function warningMessage(kind: "authentication" | "space"): string {
    return kind === "authentication"
        ? "Crosmos authentication is unavailable. Run `npx @crosmos/codex status` to check your API key."
        : "Crosmos memory space is unavailable. Run `npx @crosmos/codex status` to check your configuration.";
}

/** Reports a failure, warning only during prompt recall and logging when enabled. */
function reportFailure(
    event: HookEvent,
    startedAt: number,
    kind: "authentication" | "space" | undefined,
    error?: unknown,
): void {
    if (event === "UserPromptSubmit" && kind) {
        writeSystemMessage(warningMessage(kind));
    }

    const status =
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        typeof error.status === "number"
            ? error.status
            : undefined;

    writeDebug(event, startedAt, kind ? `${kind}_failure` : "failure", {
        status,
        errorType: error instanceof Error ? error.name : undefined,
    });
}

/** Emits a Codex-compatible user-facing system message. */
function writeSystemMessage(message: string): void {
    try {
        process.stdout.write(`${JSON.stringify({ systemMessage: message })}\n`);
    } catch {
        return;
    }
}

/** Emits model-visible context in the JSON shape expected by Codex. */
function writeHookOutput(event: HookEvent, additionalContext: string): void {
    try {
        process.stdout.write(
            `${JSON.stringify({
                hookSpecificOutput: {
                    hookEventName: event,
                    additionalContext,
                },
            })}\n`,
        );
    } catch {
        return;
    }
}

/** Saves and emits sanitized diagnostics when CROSMOS_DEBUG is enabled. */
function writeDebug(
    event: HookEvent,
    startedAt: number,
    outcome: string,
    fields: DebugFields = {},
): void {
    if (!isDebugEnabled()) {
        return;
    }

    const line = JSON.stringify({
        durationMs: Date.now() - startedAt,
        event,
        outcome,
        timestamp: new Date().toISOString(),
        ...fields,
    });

    try {
        mkdirSync(DEBUG_LOG_DIR, { recursive: true, mode: 0o700 });
        appendFileSync(DEBUG_LOG_FILE, `${line}\n`, {
            encoding: "utf8",
            mode: 0o600,
        });
        chmodSync(DEBUG_LOG_FILE, 0o600);
    } catch {
        return;
    }
}
