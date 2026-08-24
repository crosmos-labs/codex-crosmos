import { deepStrictEqual, equal, ok, strictEqual } from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import {
    installHookFiles,
    installSkills,
    parseInstallArgs,
    reconcileHooks,
    removeManagedHooks,
    uninstallHookFiles,
    uninstallSkills,
} from "../src/cli.ts";
import {
    environment,
    makeHome,
    projectRoot,
    removeHome,
    runTypeScript,
    startFakeApi,
    writeCredentials,
} from "./helpers";

const runtimeFiles = [
    "hooks/user-prompt-submit.js",
    "hooks/stop.js",
    "hooks/runtime.js",
    "auth.js",
    "memory.js",
    "commands/recall.js",
    "commands/save.js",
    "commands/status.js",
];

function createRuntimeFixture(sourceDir: string): void {
    for (const file of runtimeFiles) {
        const target = join(sourceDir, file);
        mkdirSync(resolve(target, ".."), { recursive: true });
        writeFileSync(target, `// fixture: ${file}\n`);
    }
}

test("CLI commands expose stable behavior and memory payloads", async () => {
    const home = makeHome("crosmos-cli-");
    const api = await startFakeApi({
        candidates: [{ content: "old decision" }],
    });
    writeCredentials(home, api.url);
    const env = environment(home);

    const help = await runTypeScript("src/cli.ts", ["--help"], { env });
    equal(help.status, 0);
    ok(help.stdout.includes("usage: crosmos-codex"));

    const version = await runTypeScript("src/cli.ts", ["--version"], { env });
    equal(version.status, 0);
    equal(
        version.stdout.trim(),
        JSON.parse(readFileSync("package.json", "utf8")).version,
    );

    const login = await runTypeScript("src/cli.ts", ["login"], { env });
    equal(login.status, 0);
    ok(login.stdout.includes("authentication ready"));

    const recall = await runTypeScript(
        "src/cli.ts",
        ["recall", "  prior", "decision  "],
        { env },
    );
    equal(recall.status, 0);
    equal(recall.stdout.trim(), "old decision");
    const search = api.requests.find(
        (request) => request.path === "/api/v1/search",
    );
    deepStrictEqual(search?.body, {
        query: "prior decision",
        space_id: "space-1",
        limit: 5,
    });

    const save = await runTypeScript(
        "src/cli.ts",
        ["save", "remember", "this"],
        { env },
    );
    equal(save.status, 0);
    ok(save.stdout.includes("memory submitted"));
    const ingest = api.requests.find(
        (request) => request.path === "/api/v1/sources",
    );
    deepStrictEqual(ingest?.body, {
        space_id: "space-1",
        sources: [
            {
                content: "remember this",
                content_type: "text",
                visibility: "private",
            },
        ],
    });

    const invalid = await runTypeScript("src/cli.ts", ["recall"], { env });
    equal(invalid.status, 1);
    ok(invalid.stderr.includes("usage: crosmos-codex recall"));

    await api.close();
    removeHome(home);
});

test("status reports a prepared installation as ready", async () => {
    const home = makeHome("crosmos-status-");
    const api = await startFakeApi();
    writeCredentials(home, api.url);
    const sourceDir = join(home.path, "fixture-dist");
    const runtime = join(home.codexHome, "crosmos");
    createRuntimeFixture(sourceDir);
    installHookFiles(
        runtime,
        sourceDir,
        join(projectRoot, "node_modules", "crosmos"),
    );
    installSkills(
        join(home.path, ".agents", "skills"),
        join(projectRoot, "skills"),
        runtime,
    );
    const hooks = reconcileHooks({}, runtime);
    mkdirSync(home.codexHome, { recursive: true });
    writeFileSync(
        join(home.codexHome, "hooks.json"),
        `${JSON.stringify(hooks)}\n`,
    );

    const result = await runTypeScript("src/cli.ts", ["status"], {
        env: environment(home),
    });
    equal(result.status, 0);
    ok(result.stdout.includes("hook runtime: ✓ installed"));
    ok(result.stdout.includes("skills:       ✓ installed"));
    ok(result.stdout.includes("hooks.json:   ✓ registered"));
    ok(result.stdout.includes("api key:      ✓ authenticated"));
    ok(result.stdout.includes("space:        ✓ Test space"));

    await api.close();
    removeHome(home);
});

test("installer copies and removes only managed files and hooks", () => {
    const home = makeHome("crosmos-install-");
    const sourceDir = join(home.path, "fixture-dist");
    const runtime = join(home.codexHome, "crosmos");
    createRuntimeFixture(sourceDir);
    installHookFiles(
        runtime,
        sourceDir,
        join(projectRoot, "node_modules", "crosmos"),
    );

    for (const file of runtimeFiles) {
        ok(existsSync(join(runtime, file)), `missing ${file}`);
    }
    ok(existsSync(join(runtime, "node_modules", "crosmos", "index.js")));

    const hooks = reconcileHooks(
        { hooks: { Stop: [{ hooks: [{ command: "node unrelated.js" }] }] } },
        runtime,
    );
    const stopGroups = hooks.hooks?.Stop as
        | Array<{ hooks: Array<{ command?: string }> }>
        | undefined;
    if (!stopGroups) throw new Error("Stop hooks were not registered");
    strictEqual(
        stopGroups[0].hooks.filter((hook) => hook.command?.includes("stop.js"))
            .length,
        1,
    );
    equal(removeManagedHooks(hooks, runtime), 2);
    const remainingStopGroups = hooks.hooks?.Stop as
        | Array<{ hooks: Array<{ command?: string }> }>
        | undefined;
    deepStrictEqual(remainingStopGroups?.[0].hooks, [
        { command: "node unrelated.js" },
    ]);

    writeFileSync(join(runtime, "keep.txt"), "unrelated");
    uninstallHookFiles(runtime);
    ok(existsSync(join(runtime, "keep.txt")));
    ok(!existsSync(join(runtime, "hooks", "runtime.js")));

    installSkills(
        join(home.path, ".agents", "skills"),
        join(projectRoot, "skills"),
        runtime,
    );
    const skill = readFileSync(
        join(home.path, ".agents", "skills", "crosmos-recall", "SKILL.md"),
        "utf8",
    );
    ok(skill.includes(runtime));
    ok(!skill.includes("{{CROSMOS_RUNTIME_DIR}}"));
    uninstallSkills(join(home.path, ".agents", "skills"));
    ok(!existsSync(join(home.path, ".agents", "skills", "crosmos-recall")));

    equal(parseInstallArgs(["--space", "  space-1  "]), "space-1");
    try {
        parseInstallArgs(["--space"]);
        strictEqual(true, false, "expected invalid install arguments to fail");
    } catch (error) {
        ok(String(error).includes("usage: crosmos-codex install"));
    }
    removeHome(home);
});
