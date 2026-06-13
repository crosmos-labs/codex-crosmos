import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import {
    assertWritable,
    hooksPath,
    installHooks,
    uninstallHooks,
} from "../src/codex/hooks-config.js";

const MARKER = "/home/u/.codex/crosmos/cli.mjs";
const specs = [
    { event: "UserPromptSubmit", command: `node "${MARKER}" hook UserPromptSubmit`, timeout: 8 },
    { event: "Stop", command: `node "${MARKER}" hook Stop`, timeout: 15 },
];
let prevHome: string | undefined;

beforeEach(() => {
    prevHome = process.env.CODEX_HOME;
    process.env.CODEX_HOME = mkdtempSync(join(tmpdir(), "crosmos-hooks-"));
});

afterEach(() => {
    if (prevHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = prevHome;
});

function readHooks() {
    return JSON.parse(readFileSync(hooksPath(), "utf8")).hooks;
}

test("preserves foreign hooks while adding ours", () => {
    writeFileSync(
        hooksPath(),
        JSON.stringify({
            hooks: {
                UserPromptSubmit: [{ hooks: [{ type: "command", command: "node other.js" }] }],
            },
        })
    );
    installHooks(specs, MARKER);
    const h = readHooks();
    const commands = h.UserPromptSubmit.flatMap((g: { hooks: { command: string }[] }) =>
        g.hooks.map((c) => c.command)
    );
    assert.ok(commands.includes("node other.js"));
    assert.ok(commands.some((c: string) => c.includes(MARKER)));
    assert.ok(h.Stop);
});

test("reinstall is idempotent (no duplicate entries)", () => {
    installHooks(specs, MARKER);
    installHooks(specs, MARKER);
    const h = readHooks();
    const ours = h.UserPromptSubmit.flatMap((g: { hooks: { command: string }[] }) =>
        g.hooks.filter((c) => c.command.includes(MARKER))
    );
    assert.equal(ours.length, 1);
});

test("uninstall removes ours but keeps foreign", () => {
    writeFileSync(
        hooksPath(),
        JSON.stringify({
            hooks: {
                UserPromptSubmit: [{ hooks: [{ type: "command", command: "node other.js" }] }],
            },
        })
    );
    installHooks(specs, MARKER);
    uninstallHooks(MARKER);
    const h = readHooks();
    const all = JSON.stringify(h);
    assert.ok(all.includes("node other.js"));
    assert.ok(!all.includes(MARKER));
    assert.equal(h.Stop, undefined);
});

test("never clobbers a corrupt hooks.json — aborts and leaves it intact", () => {
    writeFileSync(hooksPath(), "{ this is not json");
    assert.throws(() => assertWritable());
    assert.throws(() => installHooks(specs, MARKER));
    assert.equal(readFileSync(hooksPath(), "utf8"), "{ this is not json");
});

test("backs up hooks.json before modifying it", () => {
    writeFileSync(hooksPath(), JSON.stringify({ hooks: {} }));
    installHooks(specs, MARKER);
    assert.ok(existsSync(`${hooksPath()}.bak`));
});

test("uninstall reports count and is safe when nothing is installed", () => {
    assert.equal(uninstallHooks(MARKER), 0);
    installHooks(specs, MARKER);
    assert.equal(uninstallHooks(MARKER), 2);
});
