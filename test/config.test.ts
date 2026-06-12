import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { configPath, loadConfig, saveConfig } from "../src/config/config.js";

const ENV_KEYS = ["CODEX_HOME", "CROSMOS_SPACE_ID", "CROSMOS_RECALL_LIMIT", "CROSMOS_DEBUG"];
let saved: Record<string, string | undefined>;

beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    for (const k of ENV_KEYS) delete process.env[k];
    process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "crosmos-config-"));
});

afterEach(() => {
    for (const k of ENV_KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
    }
});

test("defaults when no file exists", () => {
    const cfg = loadConfig();
    assert.equal(cfg.recallLimit, 5);
    assert.equal(cfg.debug, false);
});

test("reads values from the config file", () => {
    writeFileSync(configPath(), JSON.stringify({ recallLimit: 9, spaceId: "from-file" }));
    const cfg = loadConfig();
    assert.equal(cfg.recallLimit, 9);
    assert.equal(cfg.spaceId, "from-file");
});

test("env overrides file", () => {
    writeFileSync(configPath(), JSON.stringify({ recallLimit: 9, spaceId: "from-file" }));
    process.env.CROSMOS_RECALL_LIMIT = "3";
    process.env.CROSMOS_SPACE_ID = "from-env";
    process.env.CROSMOS_DEBUG = "1";
    const cfg = loadConfig();
    assert.equal(cfg.recallLimit, 3);
    assert.equal(cfg.spaceId, "from-env");
    assert.equal(cfg.debug, true);
});

test("saveConfig persists across loads", () => {
    saveConfig({ spaceId: "cached" });
    assert.equal(loadConfig().spaceId, "cached");
});
