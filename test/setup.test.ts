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

const hooksJson = () => join(home, "hooks.json");

test("fresh install wires hooks, bundle, skill — and never touches config.toml", () => {
    writeFileSync(join(home, "config.toml"), 'model = "x"\n');
    runInstall(bundle);
    const i = inspect();
    assert.equal(i.hooksRegistered, true);
    assert.equal(i.bundlePresent, true);
    assert.equal(i.skillPresent, true);

    const hooks = JSON.parse(readFileSync(hooksJson(), "utf8")).hooks;
    assert.deepEqual(Object.keys(hooks).sort(), ["PreCompact", "Stop", "UserPromptSubmit"]);
    assert.equal(hooks.UserPromptSubmit[0].hooks[0].timeout, 35);
    assert.equal(hooks.Stop[0].hooks[0].timeout, 10);
    assert.equal(hooks.PreCompact[0].hooks[0].timeout, 10);
    assert.equal(hooks.UserPromptSubmit[0].hooks[0].statusMessage, "recalling crosmos memory");
    assert.equal(hooks.Stop[0].hooks[0].statusMessage, "saving to crosmos");
    assert.equal(hooks.PreCompact[0].hooks[0].statusMessage, "saving to crosmos");

    // config.toml is left byte-for-byte unchanged
    assert.equal(readFileSync(join(home, "config.toml"), "utf8"), 'model = "x"\n');
});

test("aborts (writes nothing) on a corrupt hooks.json", () => {
    writeFileSync(hooksJson(), "{ broken");
    assert.throws(() => assertWritable());
    assert.throws(() => runInstall(bundle));
    assert.equal(readFileSync(hooksJson(), "utf8"), "{ broken");
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

test("reinstall is idempotent", () => {
    runInstall(bundle);
    runInstall(bundle);
    const hooks = JSON.parse(readFileSync(hooksJson(), "utf8")).hooks;
    const count = hooks.UserPromptSubmit.reduce(
        (n: number, g: { hooks: unknown[] }) => n + g.hooks.length,
        0
    );
    assert.equal(count, 1);
});

test("uninstall reverts a fresh install and keeps foreign hooks", () => {
    writeFileSync(
        hooksJson(),
        JSON.stringify({
            hooks: { Stop: [{ hooks: [{ type: "command", command: "node other.js" }] }] },
        })
    );
    runInstall(bundle);
    runUninstall();
    const i = inspect();
    assert.equal(i.hooksRegistered, false);
    assert.equal(i.bundlePresent, false);
    assert.equal(i.skillPresent, false);
    assert.match(readFileSync(hooksJson(), "utf8"), /node other\.js/);
});

test("uninstall is safe when nothing is installed", () => {
    assert.deepEqual(runUninstall(), []);
});

test("inspect flags an explicit hooks = false opt-out", () => {
    writeFileSync(join(home, "config.toml"), "[features]\nhooks = false\n");
    assert.equal(inspect().hooksDisabled, true);
    writeFileSync(join(home, "config.toml"), "[features]\nhooks = true\n");
    assert.equal(inspect().hooksDisabled, false);
});

test("uninstall removes crosmos.json when present", () => {
    writeFileSync(join(home, "crosmos.json"), '{"recallLimit":5}\n');
    runInstall(bundle);
    runUninstall();
    assert.equal(existsSync(join(home, "crosmos.json")), false);
});
