import assert from "node:assert/strict";
import { test } from "node:test";
import { hasSecret, redact } from "../src/lib/redact.js";

test("redacts crosmos keys, credential assignments, and PEM blocks", () => {
    assert.equal(redact("token is csk_abcdef1234567890"), "token is [redacted]");
    assert.equal(redact("api_key=hunter2"), "[redacted]");
    assert.equal(redact("Authorization: Bearer xyz"), "[redacted]");
    const pem = "-----BEGIN RSA PRIVATE KEY-----\nABC\n-----END RSA PRIVATE KEY-----";
    assert.equal(redact(`key:\n${pem}`), "key:\n[redacted]");
});

test("leaves clean text untouched", () => {
    const clean = "just a normal sentence about recall and capture";
    assert.equal(redact(clean), clean);
    assert.equal(hasSecret(clean), false);
});

test("hasSecret detects secrets regardless of prior matches", () => {
    assert.equal(hasSecret("csk_abcdef1234567890"), true);
    assert.equal(hasSecret("csk_abcdef1234567890"), true);
});
