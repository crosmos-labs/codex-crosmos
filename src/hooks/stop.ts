import {
    mkdirSync,
    readFileSync,
    renameSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type Crosmos from "crosmos";
import type { AuthConfig } from "../auth";
import { type HookPayload, runHook } from "./runtime";

type Message = {
    content: string;
    role: "assistant" | "user";
};

type TranscriptRecord = {
    content: string;
    line: number;
    role: "assistant" | "user";
};

type Exchange = {
    endLine: number;
    messages: Message[];
};

type Cursor = {
    line: number;
    transcriptPath: string;
};

type Batch = {
    endLine: number;
    messages: Message[];
};

const STATE_DIR = join(homedir(), ".crosmos", "codex-state");
const MAX_MESSAGES = 500;
const MAX_CONTENT_LENGTH = 100_000;

/** Captures completed exchange groups from the current Codex transcript. */
async function captureStop(
    payload: HookPayload,
    client: Crosmos,
    auth: AuthConfig,
): Promise<string | undefined> {
    const transcriptPath = stringValue(payload.transcript_path);
    const sessionId = stringValue(payload.session_id);

    if (!transcriptPath || !sessionId) return;

    const cursor = readCursor(sessionId, transcriptPath);
    const transcript = readTranscript(transcriptPath, cursor?.line ?? 0);
    const lastAssistantMessage = stringValue(payload.last_assistant_message);
    const spaceId = auth.spaceId;

    if (!spaceId || (!cursor && !lastAssistantMessage)) return;

    const records = transcript.records;
    appendMissingAssistant(records, lastAssistantMessage, transcript.endLine);

    const exchanges = groupExchanges(records);
    const selected = cursor ? exchanges : exchanges.slice(-1);

    if (!selected.length) return;

    for (const batch of buildBatches(selected)) {
        await client.conversations.ingest({
            messages: batch.messages,
            session_id: sessionId,
            space_id: spaceId,
            visibility: "private",
        });

        writeCursor(sessionId, {
            line: batch.endLine,
            transcriptPath,
        });
    }
}

/** Reads transcript records after the last successfully captured line. */
function readTranscript(
    transcriptPath: string,
    startLine: number,
): { endLine: number; records: TranscriptRecord[] } {
    const lines = readFileSync(transcriptPath, "utf8").split(/\r?\n/);
    const records: TranscriptRecord[] = [];

    for (let index = startLine; index < lines.length; index += 1) {
        const line = lines[index];
        if (!line) continue;

        let record: unknown;
        try {
            record = JSON.parse(line);
        } catch {
            continue;
        }

        if (!isRecord(record) || record.type !== "event_msg") continue;
        if (!isRecord(record.payload)) continue;

        const payload = record.payload;
        const content = stringValue(payload.message);

        if (!content) continue;

        if (payload.type === "user_message") {
            records.push({ content, line: index + 1, role: "user" });
        }

        if (
            payload.type === "agent_message" &&
            payload.phase === "final_answer"
        ) {
            records.push({ content, line: index + 1, role: "assistant" });
        }
    }

    return { endLine: lines.length, records };
}

/** Adds the Stop payload answer when Codex has not flushed it to the transcript. */
function appendMissingAssistant(
    records: TranscriptRecord[],
    lastAssistantMessage: string | undefined,
    line: number,
): void {
    if (!lastAssistantMessage) return;

    const last = records.at(-1);
    if (last?.role === "assistant" && last.content === lastAssistantMessage) {
        return;
    }

    records.push({
        content: lastAssistantMessage,
        line,
        role: "assistant",
    });
}

/** Groups all user prompts before each final assistant answer into one exchange. */
function groupExchanges(records: TranscriptRecord[]): Exchange[] {
    const exchanges: Exchange[] = [];
    let pendingUsers: Message[] = [];

    for (const record of records) {
        if (record.role === "user") {
            pendingUsers.push({ content: record.content, role: "user" });
            continue;
        }

        if (!pendingUsers.length) continue;

        exchanges.push({
            endLine: record.line,
            messages: [
                ...pendingUsers,
                { content: record.content, role: "assistant" },
            ],
        });
        pendingUsers = [];
    }

    return exchanges;
}

/** Splits delivery only between complete exchange groups. */
function buildBatches(exchanges: Exchange[]): Batch[] {
    const batches: Batch[] = [];
    let current: Batch | undefined;

    for (const exchange of exchanges) {
        const messages = prepareExchange(exchange.messages);

        if (
            !current ||
            current.messages.length + messages.length > MAX_MESSAGES
        ) {
            if (current) batches.push(current);
            current = { endLine: exchange.endLine, messages: [] };
        }

        current.messages.push(...messages);
        current.endLine = exchange.endLine;
    }

    if (current?.messages.length) batches.push(current);
    return batches;
}

/** Keeps normal message boundaries and flattens only oversized exchanges. */
function prepareExchange(messages: Message[]): Message[] {
    const prepared = messages.flatMap(splitMessage);
    if (prepared.length <= MAX_MESSAGES) return prepared;

    const assistant = messages.at(-1);
    if (assistant?.role !== "assistant") {
        throw new Error("crosmos exchange has no final assistant message");
    }

    const userContent = messages
        .filter((message) => message.role === "user")
        .map((message) => message.content)
        .join("\n\n");

    const flattenedUsers: Message[] = splitContent(userContent).map(
        (content) => ({
            content,
            role: "user",
        }),
    );
    const preparedAssistant = splitMessage(assistant);

    if (flattenedUsers.length + preparedAssistant.length > MAX_MESSAGES) {
        throw new Error("crosmos exchange exceeds the ingestion limit");
    }

    return [...flattenedUsers, ...preparedAssistant];
}

/** Splits a single API message without changing its role. */
function splitMessage(message: Message): Message[] {
    return splitContent(message.content).map((content) => ({
        content,
        role: message.role,
    }));
}

/** Splits content only when it exceeds Crosmos’s per-message limit. */
function splitContent(content: string): string[] {
    if (content.length <= MAX_CONTENT_LENGTH) return [content];

    const chunks: string[] = [];
    for (
        let offset = 0;
        offset < content.length;
        offset += MAX_CONTENT_LENGTH
    ) {
        chunks.push(content.slice(offset, offset + MAX_CONTENT_LENGTH));
    }
    return chunks;
}

/** Reads the cursor only when it belongs to the current transcript. */
function readCursor(sessionId: string, transcriptPath: string): Cursor | null {
    const file = cursorPath(sessionId);

    try {
        const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
        if (!isRecord(parsed)) return null;

        const line = parsed.line;
        const storedPath = parsed.transcriptPath;

        if (
            typeof line !== "number" ||
            !Number.isInteger(line) ||
            line < 0 ||
            typeof storedPath !== "string" ||
            storedPath !== transcriptPath
        ) {
            return null;
        }

        return { line, transcriptPath: storedPath };
    } catch {
        return null;
    }
}

/** Atomically records the next transcript line to capture. */
function writeCursor(sessionId: string, cursor: Cursor): void {
    mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });

    const file = cursorPath(sessionId);
    const temporaryFile = `${file}.tmp`;

    try {
        writeFileSync(temporaryFile, `${JSON.stringify(cursor)}\n`, {
            encoding: "utf8",
            mode: 0o600,
        });
        renameSync(temporaryFile, file);
    } catch (error) {
        rmSync(temporaryFile, { force: true });
        throw error;
    }
}

/** Maps a Codex session identifier to a safe local cursor filename. */
function cursorPath(sessionId: string): string {
    return join(STATE_DIR, `${encodeURIComponent(sessionId)}.json`);
}

function stringValue(value: unknown): string | undefined {
    return typeof value === "string" && value ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

void runHook("Stop", captureStop);
