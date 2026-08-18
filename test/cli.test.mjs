import assert from "node:assert/strict";
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
    hooksRegistered,
    installHookFiles,
    readHooksJson,
    reconcileHooks,
    removeManagedHooks,
    uninstallHookFiles,
} from "../dist/cli.js";

const definitions = [
    ["SessionStart", "session-start.js"],
    ["UserPromptSubmit", "user-prompt-submit.js"],
    ["Stop", "stop.js"],
    ["PreCompact", "pre-compact.js"],
];

test("reconciles managed hooks without duplicating or replacing unrelated hooks", () => {
    const runtimeDir = "/tmp/crosmos-runtime";
    const document = {
        description: "keep me",
        hooks: {
            Stop: [
                {
                    matcher: "other",
                    hooks: [{ type: "command", command: "node other.js" }],
                },
            ],
        },
    };

    reconcileHooks(document, runtimeDir);
    reconcileHooks(document, runtimeDir);

    assert.equal(document.description, "keep me");
    assert.equal(document.hooks.Stop[0].hooks[0].command, "node other.js");
    assert.equal(hooksRegistered(document, runtimeDir), true);

    for (const [event, file] of definitions) {
        const commands = document.hooks[event].flatMap((group) =>
            group.hooks.map((hook) => hook.command),
        );
        const managedCommand = `node ${JSON.stringify(join(runtimeDir, file))}`;
        assert.equal(
            commands.filter((command) => command === managedCommand).length,
            1,
        );
    }
});

test("removes only managed hook registrations", () => {
    const runtimeDir = "/tmp/crosmos-runtime";
    const document = reconcileHooks(
        {
            hooks: {
                Stop: [
                    {
                        hooks: [{ type: "command", command: "node other.js" }],
                    },
                ],
            },
        },
        runtimeDir,
    );

    assert.equal(removeManagedHooks(document, runtimeDir), 4);
    assert.equal(hooksRegistered(document, runtimeDir), false);
    assert.deepEqual(document.hooks.Stop, [
        { hooks: [{ type: "command", command: "node other.js" }] },
    ]);
});

test("copies and removes the managed runtime files", () => {
    const root = mkdtempSync(join(tmpdir(), "crosmos-cli-"));
    const sourceDir = join(root, "source");
    const runtimeDir = join(root, "runtime");
    mkdirSync(sourceDir);

    for (const [, file] of definitions) {
        const sourceFile = join(sourceDir, file);
        writeFileSync(sourceFile, file);
    }

    installHookFiles(runtimeDir, sourceDir);
    assert.equal(readFileSync(join(runtimeDir, "stop.js"), "utf8"), "stop.js");

    uninstallHookFiles(runtimeDir);
    assert.equal(existsSync(runtimeDir), false);
});

test("rejects invalid hooks.json before it can be changed", () => {
    const root = mkdtempSync(join(tmpdir(), "crosmos-cli-"));
    const hooksPath = join(root, "hooks.json");
    writeFileSync(hooksPath, "{");

    assert.throws(() => readHooksJson(hooksPath), /Unable to read/);
    assert.equal(readFileSync(hooksPath, "utf8"), "{");
});

test("rejects a non-array hook event before reconciliation", () => {
    assert.throws(
        () => reconcileHooks({ hooks: { Stop: {} } }, "/tmp/crosmos-runtime"),
        /invalid hooks configuration for Stop/,
    );
});
