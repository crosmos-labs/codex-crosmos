import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import type Crosmos from "crosmos";
import { recall } from "../src/memory/recall.js";

const ENV_KEYS = ["CODEX_HOME", "CROSMOS_SPACE_ID"];
let saved: Record<string, string | undefined>;

beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "crosmos-recall-"));
    process.env.CROSMOS_SPACE_ID = "space-1";
});

afterEach(() => {
    for (const k of ENV_KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
    }
});

test("auto recall lets the backend judge mechanical prompts", async () => {
    const client = fakeClient(["Use the npm test command from this repo."]);
    const context = await recall(client as unknown as Crosmos, {
        prompt: "run tests now please",
        limit: 5,
        mode: "auto",
        sessionId: "s1",
    });
    assert.match(context, /npm test/);
    assert.equal(client.calls, 1);
});

test("auto recall searches memory-intent prompts and dedups repeated queries", async () => {
    const client = fakeClient(["Use the settings endpoint from the previous plan."]);
    const opts = {
        prompt: "what did we decide about the settings endpoint?",
        limit: 5,
        mode: "auto" as const,
        sessionId: "s1",
        cwd: "/tmp/project",
    };

    const first = await recall(client as unknown as Crosmos, opts);
    const second = await recall(client as unknown as Crosmos, opts);

    assert.match(first, /settings endpoint/);
    assert.equal(second, "");
    assert.equal(client.calls, 1);
});

test("always recall bypasses the prompt gate", async () => {
    const client = fakeClient(["Run the usual test command."]);
    const context = await recall(client as unknown as Crosmos, {
        prompt: "run tests now please",
        limit: 5,
        mode: "always",
        sessionId: "s1",
    });
    assert.match(context, /usual test command/);
    assert.equal(client.calls, 1);
});

interface FakeRecallClient {
    calls: number;
    search: { hybrid: () => Promise<{ candidates: { content: string }[] }> };
}

function fakeClient(contents: string[]): FakeRecallClient {
    const client = {
        calls: 0,
        search: {
            hybrid: async () => {
                client.calls += 1;
                return { candidates: contents.map((content) => ({ content })) };
            },
        },
    };
    return client;
}
