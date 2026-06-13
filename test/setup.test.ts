import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { assertWritable, inspect, runInstall, runUninstall } from "../src/codex/setup.js";

let prevHome: string | undefined;
let home: string;
let bundle: string;

beforeEach(() => {
    prevHome = process.env.CODEX_HOME;
    home = mkdtempSync(join(tmpdir(), "crosmos-setup-"));
    process.env.CODEX_HOME = home;
    bundle = join(home, "fake-bundle.mjs");
    writeFileSync(bundle, "// fake bundle\n");
});

afterEach(() => {
    if (prevHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = prevHome;
});

const configToml = () => join(home, "config.toml");
const hooksJson = () => join(home, "hooks.json");

test("fresh install wires config flag, hooks, bundle, and skill", () => {
    runInstall(bundle);
    const i = inspect();
    assert.equal(i.hooksFlag, true);
    assert.equal(i.hooksRegistered, true);
    assert.equal(i.bundlePresent, true);
    assert.equal(i.skillPresent, true);

    const toml = readFileSync(configToml(), "utf8");
    assert.match(toml, /hooks = true/);

    const hooks = JSON.parse(readFileSync(hooksJson(), "utf8")).hooks;
    assert.deepEqual(Object.keys(hooks).sort(), ["PreCompact", "Stop", "UserPromptSubmit"]);
});

test("config.toml: preserves existing keys and only adds the flag", () => {
    writeFileSync(configToml(), 'model = "gpt-5.5"\n');
    runInstall(bundle);
    const toml = readFileSync(configToml(), "utf8");
    assert.match(toml, /model = "gpt-5\.5"/);
    assert.match(toml, /hooks = true/);
    assert.ok(existsSync(`${configToml()}.bak`));
});

test("config.toml: idempotent when hooks already enabled (incl. legacy key)", () => {
    writeFileSync(configToml(), 'model = "x"\n[features]\ncodex_hooks = true\n');
    runInstall(bundle);
    const toml = readFileSync(configToml(), "utf8");
    // legacy flag already enables hooks, so we must not add our own key
    assert.doesNotMatch(toml, /\bhooks = true/);
    assert.match(toml, /codex_hooks = true/);
});

test("aborts (no write) on corrupt config.toml or hooks.json", () => {
    writeFileSync(configToml(), "this = = not toml");
    assert.throws(() => assertWritable());
    writeFileSync(configToml(), 'model = "x"\n');
    writeFileSync(hooksJson(), "{ broken");
    assert.throws(() => assertWritable());
});

test("preserves foreign hooks", () => {
    writeFileSync(
        hooksJson(),
        JSON.stringify({
            hooks: { Stop: [{ hooks: [{ type: "command", command: "node other.js" }] }] },
        })
    );
    runInstall(bundle);
    assert.match(readFileSync(hooksJson(), "utf8"), /node other\.js/);
});

test("uninstall fully reverts a fresh install", () => {
    runInstall(bundle);
    const actions = runUninstall();
    assert.ok(actions.length > 0);
    const i = inspect();
    assert.equal(i.hooksRegistered, false);
    assert.equal(i.bundlePresent, false);
    assert.equal(i.skillPresent, false);
    assert.equal(i.hooksFlag, false);
    assert.equal(existsSync(join(home, "crosmos.json")), false);
});

test("uninstall keeps foreign hooks and a flag it did not set", () => {
    writeFileSync(configToml(), "[features]\ncodex_hooks = true\n");
    writeFileSync(
        hooksJson(),
        JSON.stringify({
            hooks: { Stop: [{ hooks: [{ type: "command", command: "node other.js" }] }] },
        })
    );
    runInstall(bundle);
    runUninstall();
    assert.match(readFileSync(hooksJson(), "utf8"), /node other\.js/);
    assert.match(readFileSync(configToml(), "utf8"), /codex_hooks = true/);
});

test("uninstall is safe when nothing is installed", () => {
    assert.deepEqual(runUninstall(), []);
});
