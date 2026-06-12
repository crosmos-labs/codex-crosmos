import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseTranscript } from "../src/codex/transcript.js";

const fixture = fileURLToPath(new URL("./fixtures/rollout.jsonl", import.meta.url));

test("extracts only user/agent messages in order", () => {
    const turns = parseTranscript(fixture);
    assert.deepEqual(
        turns.map((t) => t.role),
        ["user", "assistant", "user"]
    );
    assert.equal(turns[0].content, "first user question");
});

test("ignores session_meta, response_item, token_count, empty, and invalid lines", () => {
    const turns = parseTranscript(fixture);
    assert.equal(turns.length, 3);
    assert.ok(turns.every((t) => !t.content.includes("system noise")));
});

test("redacts secrets in captured turns", () => {
    const turns = parseTranscript(fixture);
    assert.ok(turns[1].content.includes("[redacted]"));
    assert.ok(!turns[1].content.includes("SUPERSECRETVALUE"));
    assert.ok(turns[2].content.includes("[redacted]"));
    assert.ok(!turns[2].content.includes("csk_"));
});

test("returns empty for a missing file", () => {
    assert.deepEqual(parseTranscript("/no/such/file.jsonl"), []);
});
