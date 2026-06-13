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
        everyNTurns: 1,
    });

    assert.equal(client.ingests.length, 0);
});

test("Stop waits for N meaningful turns, then captures the batch once", async () => {
    const transcript = writeTranscript([
        event("user_message", "ok"),
        event("agent_message", "done"),
    ]);
    const client = fakeClient();
    const opts = {
        event: "Stop",
        transcriptPath: transcript,
        sessionId: "s1",
        everyNTurns: 2,
    };

    await capture(client as unknown as Crosmos, opts);
    appendFileSync(transcript, `${event("user_message", "plain four word update")}\n`);
    await capture(client as unknown as Crosmos, opts); // 1 meaningful turn < N: no ingest
    appendFileSync(transcript, `${event("agent_message", "another plain word update")}\n`);
    await capture(client as unknown as Crosmos, opts); // 2 meaningful turns >= N: ingest

    assert.equal(client.ingests.length, 1);
    assert.deepEqual(
        client.ingests[0].messages.map((m: { content: string }) => m.content),
        ["plain four word update", "another plain word update"]
    );
});

test("Stop does not re-capture a batch on a later empty delta", async () => {
    const transcript = writeTranscript([
        event("user_message", "first plain four word update"),
        event("agent_message", "second plain four word update"),
    ]);
    const client = fakeClient();
    const opts = {
        event: "Stop",
        transcriptPath: transcript,
        sessionId: "s1",
        everyNTurns: 2,
    };

    await capture(client as unknown as Crosmos, opts);
    await capture(client as unknown as Crosmos, opts);

    assert.equal(client.ingests.length, 1);
    assert.equal(client.ingests[0].messages.length, 2);
});

test("PreCompact flushes pending turns below the N threshold", async () => {
    const transcript = writeTranscript([
        event("user_message", "a single plain four word turn"),
    ]);
    const client = fakeClient();

    await capture(client as unknown as Crosmos, {
        event: "PreCompact",
        transcriptPath: transcript,
        sessionId: "s1",
        everyNTurns: 3,
    });

    assert.equal(client.ingests.length, 1);
    assert.equal(client.ingests[0].messages.length, 1);
});

test("everyNTurns 0 disables capture", async () => {
    const transcript = writeTranscript([
        event("user_message", "plain four word update one"),
        event("agent_message", "plain four word update two"),
    ]);
    const client = fakeClient();

    await capture(client as unknown as Crosmos, {
        event: "Stop",
        transcriptPath: transcript,
        sessionId: "s1",
        everyNTurns: 0,
    });

    assert.equal(client.ingests.length, 0);
});

test("shouldCaptureDelta batches Stop by turn count and always flushes PreCompact", () => {
    const one = [{ role: "user" as const, content: "plain four word update" }];
    const two = [
        { role: "user" as const, content: "plain four word update" },
        { role: "assistant" as const, content: "another plain word update" },
    ];

    assert.equal(shouldCaptureDelta("Stop", [], 2), false);
    assert.equal(shouldCaptureDelta("Stop", one, 2), false);
    assert.equal(shouldCaptureDelta("Stop", two, 2), true);
    assert.equal(shouldCaptureDelta("PreCompact", one, 3), true);
    assert.equal(shouldCaptureDelta("PreCompact", [], 3), false);
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
