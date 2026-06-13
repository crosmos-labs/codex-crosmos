import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const bundle = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));

// Runs the actual built bundle (not the TS source) so esbuild/ESM packaging
// regressions — e.g. a CJS dep's require() failing — are caught. Skipped if unbuilt.
test("built bundle runs and parses config.toml without a packaging error", {
    skip: !existsSync(bundle),
}, () => {
    const home = mkdtempSync(join(tmpdir(), "crosmos-bundle-"));
    writeFileSync(join(home, "config.toml"), 'model = "x"\n[features]\nhooks = true\n');
    const res = spawnSync(process.execPath, [bundle, "status"], {
        input: "",
        encoding: "utf8",
        env: {
            ...process.env,
            CODEX_HOME: home,
            CROSMOS_API_KEY: "",
            CROSMOS_CREDENTIALS_DIR: home,
        },
    });
    assert.equal(res.status, 0, res.stderr);
    assert.doesNotMatch(res.stderr, /Dynamic require|is not supported/);
});

// Full offline install through the built bundle (seeded space → no network), exercising the
// config.toml TOML write — this is the exact command that crashed before.
test("built bundle completes an offline install", { skip: !existsSync(bundle) }, () => {
    const home = mkdtempSync(join(tmpdir(), "crosmos-bundle-"));
    const creds = mkdtempSync(join(tmpdir(), "crosmos-creds-"));
    writeFileSync(join(creds, "credentials.json"), '{"api_key":"csk_dummy0000000000"}\n');
    writeFileSync(
        join(home, "crosmos.json"),
        '{"recallLimit":5,"debug":false,"spaceId":"seeded"}\n'
    );
    writeFileSync(join(home, "config.toml"), 'model = "x"\n');
    const res = spawnSync(process.execPath, [bundle, "install", "--force"], {
        input: "",
        encoding: "utf8",
        env: {
            ...process.env,
            CODEX_HOME: home,
            CROSMOS_API_KEY: "",
            CROSMOS_CREDENTIALS_DIR: creds,
        },
    });
    assert.equal(res.status, 0, res.stderr);
    assert.equal(readFileSync(join(home, "config.toml"), "utf8"), 'model = "x"\n'); // untouched
    assert.ok(existsSync(join(home, "hooks.json")));
    assert.ok(existsSync(join(home, "crosmos", "cli.mjs")));
});
