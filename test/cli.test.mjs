import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
    hookRuntimeReady,
    hooksRegistered,
    installHookFiles,
    parseInstallArgs,
    readHooksJson,
    reconcileHooks,
    removeManagedHooks,
    uninstallHookFiles,
} from "../dist/cli.js";

const definitions = [
    ["UserPromptSubmit", "user-prompt-submit.js"],
    ["Stop", "stop.js"],
    ["PreCompact", "pre-compact.js"],
];
const sharedRuntimeFile = "runtime.js";
const sharedAuthFile = "auth.js";
const sharedSdkEntry = join("node_modules", "crosmos", "index.js");

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

    assert.equal(removeManagedHooks(document, runtimeDir), 3);
    assert.equal(hooksRegistered(document, runtimeDir), false);
    assert.deepEqual(document.hooks.Stop, [
        { hooks: [{ type: "command", command: "node other.js" }] },
    ]);
});

test("copies and removes the managed runtime files", () => {
    const root = mkdtempSync(join(tmpdir(), "crosmos-cli-"));
    const sourceDir = join(root, "source");
    const runtimeDir = join(root, "runtime");
    const sdkDir = join(root, "sdk");
    mkdirSync(sourceDir);
    mkdirSync(sdkDir);

    for (const [, file] of definitions) {
        const sourceFile = join(sourceDir, file);
        writeFileSync(sourceFile, file);
    }
    writeFileSync(join(sourceDir, sharedRuntimeFile), sharedRuntimeFile);
    writeFileSync(join(sourceDir, sharedAuthFile), sharedAuthFile);
    writeFileSync(join(sdkDir, "index.js"), "sdk");

    installHookFiles(runtimeDir, sourceDir, sdkDir);
    assert.equal(readFileSync(join(runtimeDir, "stop.js"), "utf8"), "stop.js");
    assert.equal(
        readFileSync(join(runtimeDir, sharedRuntimeFile), "utf8"),
        sharedRuntimeFile,
    );
    assert.equal(
        readFileSync(join(runtimeDir, sharedAuthFile), "utf8"),
        sharedAuthFile,
    );
    assert.equal(readFileSync(join(runtimeDir, sharedSdkEntry), "utf8"), "sdk");

    writeFileSync(join(runtimeDir, "keep.txt"), "keep");
    uninstallHookFiles(runtimeDir);
    assert.equal(existsSync(join(runtimeDir, sharedRuntimeFile)), false);
    assert.equal(existsSync(join(runtimeDir, sharedAuthFile)), false);
    assert.equal(existsSync(join(runtimeDir, sharedSdkEntry)), false);
    assert.equal(readFileSync(join(runtimeDir, "keep.txt"), "utf8"), "keep");
    assert.equal(existsSync(runtimeDir), true);
});

test("status requires the complete shared hook runtime", () => {
    const root = mkdtempSync(join(tmpdir(), "crosmos-cli-"));
    const sourceDir = join(root, "source");
    const runtimeDir = join(root, "runtime");
    const sdkDir = join(root, "sdk");
    mkdirSync(sourceDir);
    mkdirSync(sdkDir);

    for (const [, file] of definitions) {
        writeFileSync(join(sourceDir, file), file);
    }
    writeFileSync(join(sourceDir, sharedRuntimeFile), sharedRuntimeFile);
    writeFileSync(join(sourceDir, sharedAuthFile), sharedAuthFile);
    writeFileSync(join(sdkDir, "index.js"), "sdk");

    for (const file of [sharedRuntimeFile, sharedAuthFile, sharedSdkEntry]) {
        installHookFiles(runtimeDir, sourceDir, sdkDir);
        assert.equal(hookRuntimeReady(runtimeDir), true);
        rmSync(join(runtimeDir, file));
        assert.equal(hookRuntimeReady(runtimeDir), false);
    }
});

test("runs a copied hook and writes its debug log", () => {
    const root = mkdtempSync(join(tmpdir(), "crosmos-hook-"));
    const runtimeDir = join(root, "runtime");
    const homeDir = join(root, "home");
    installHookFiles(runtimeDir);

    const result = spawnSync(
        process.execPath,
        [join(runtimeDir, "user-prompt-submit.js")],
        {
            env: {
                ...process.env,
                CROSMOS_API_KEY: "",
                CROSMOS_DEBUG: "true",
                HOME: homeDir,
            },
            input: '{"prompt":"remember this"}\n',
            encoding: "utf8",
        },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Crosmos authentication is unavailable/);
    assert.match(
        readFileSync(join(homeDir, ".crosmos", "codex.log"), "utf8"),
        /authentication_failure/,
    );
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

test("parses the explicit install space option", () => {
    assert.equal(parseInstallArgs(["--space", "space-id"]), "space-id");
    assert.throws(() => parseInstallArgs(["--space"]), /usage:/);
    assert.throws(() => parseInstallArgs(["--space", "id", "extra"]), /usage:/);
});
