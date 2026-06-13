import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import type Crosmos from "crosmos";
import { capture, shouldCaptureDelta } from "../src/memory/capture.js";

const ENV_KEYS = ["CODEX_HOME", "CROSMOS_SPACE_ID"];
let saved: Record<string, string | undefined>;
let home: string;

beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    home = mkdtempSync(join(tmpdir(), "crosmos-capture-"));
    process.env.CODEX_HOME = home;
    process.env.CROSMOS_SPACE_ID = "space-1";
});

afterEach(() => {
    for (const k of ENV_KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
    }
});

test("Stop skips trivial deltas", async () => {
    const transcript = writeTranscript([
        event("user_message", "ok"),
        event("agent_message", "done"),
    ]);
    const client = fakeClient();

    await capture(client as unknown as Crosmos, {
        event: "Stop",
        transcriptPath: transcript,
        sessionId: "s1",
        mode: "auto",
    });

    assert.equal(client.ingests.length, 0);
});

test("Stop advances cursor for empty deltas only", async () => {
    const transcript = writeTranscript([
        event("user_message", "ok"),
        event("agent_message", "done"),
    ]);
    const client = fakeClient();
    const opts = {
        event: "Stop",
        transcriptPath: transcript,
        sessionId: "s1",
        mode: "auto" as const,
    };

    await capture(client as unknown as Crosmos, opts);
    appendFileSync(transcript, `${event("user_message", "plain four word update")}\n`);
    await capture(client as unknown as Crosmos, opts);
    appendFileSync(transcript, `${event("agent_message", "another plain word update")}\n`);
    await capture(client as unknown as Crosmos, opts);

    assert.equal(client.ingests.length, 1);
    assert.deepEqual(
        client.ingests[0].messages.map((m: { content: string }) => m.content),
        ["plain four word update", "another plain word update"]
    );
});

test("Stop captures meaningful deltas once", async () => {
    const transcript = writeTranscript([
        event("user_message", "Remember that the settings page is overdue"),
        event("agent_message", "We decided to finish the settings endpoint first"),
    ]);
    const client = fakeClient();
    const opts = {
        event: "Stop",
        transcriptPath: transcript,
        sessionId: "s1",
        mode: "auto" as const,
    };

    await capture(client as unknown as Crosmos, opts);
    await capture(client as unknown as Crosmos, opts);

    assert.equal(client.ingests.length, 1);
    assert.deepEqual(
        client.ingests[0].messages.map((m: { content: string }) => m.content),
        [
            "Remember that the settings page is overdue",
            "We decided to finish the settings endpoint first",
        ]
    );
});

test("PreCompact captures one meaningful uncaptured turn", async () => {
    const transcript = writeTranscript([
        event("user_message", "Architecture decision is to keep SDK direct"),
    ]);
    const client = fakeClient();

    await capture(client as unknown as Crosmos, {
        event: "PreCompact",
        transcriptPath: transcript,
        sessionId: "s1",
        mode: "auto",
    });

    assert.equal(client.ingests.length, 1);
    assert.equal(client.ingests[0].messages.length, 1);
});

test("capture mode off skips ingestion", async () => {
    const transcript = writeTranscript([
        event("user_message", "Remember that the settings page is overdue"),
        event("agent_message", "We decided to finish the settings endpoint first"),
    ]);
    const client = fakeClient();

    await capture(client as unknown as Crosmos, {
        event: "Stop",
        transcriptPath: transcript,
        sessionId: "s1",
        mode: "off",
    });

    assert.equal(client.ingests.length, 0);
});

test("capture threshold is conservative for Stop and aggressive for PreCompact", () => {
    const meaningful = [{ role: "user" as const, content: "Architecture decision changed today" }];
    assert.equal(shouldCaptureDelta("Stop", meaningful, meaningful), true);
    assert.equal(
        shouldCaptureDelta(
            "Stop",
            [{ role: "user" as const, content: "plain four word update" }],
            meaningful
        ),
        false
    );
    assert.equal(
        shouldCaptureDelta(
            "PreCompact",
            [{ role: "user" as const, content: "plain four word update" }],
            meaningful
        ),
        true
    );
});

interface FakeCaptureClient {
    ingests: { messages: { role: string; content: string }[] }[];
    conversations: {
        ingest: (payload: { messages: { role: string; content: string }[] }) => Promise<{
            job_id: string;
        }>;
    };
}

function fakeClient(): FakeCaptureClient {
    const client = {
        ingests: [] as { messages: { role: string; content: string }[] }[],
        conversations: {
            ingest: async (payload: { messages: { role: string; content: string }[] }) => {
                client.ingests.push(payload);
                return { job_id: "job-1" };
            },
        },
    };
    return client;
}

function writeTranscript(lines: string[]): string {
    const path = join(home, `rollout-${Math.random()}.jsonl`);
    writeFileSync(path, `${lines.join("\n")}\n`);
    return path;
}

function event(type: string, message: string): string {
    return JSON.stringify({ type: "event_msg", payload: { type, message } });
}
