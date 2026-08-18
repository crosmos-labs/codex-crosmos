import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const cliPath = join(process.cwd(), "dist", "cli.js");
const userPromptSubmitPath = join(
    process.cwd(),
    "dist",
    "hooks",
    "user-prompt-submit.js",
);

async function runInstall(root) {
    const server = createServer((request, response) => {
        if (
            request.method !== "GET" ||
            request.url !== "/api/v1/spaces/space-id"
        ) {
            response.writeHead(404);
            response.end();
            return;
        }

        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ id: "space-id", name: "Test Space" }));
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    const apiUrl = `http://127.0.0.1:${address.port}`;
    const child = spawn(
        process.execPath,
        [cliPath, "install", "--space", "space-id"],
        {
            cwd: process.cwd(),
            env: {
                ...process.env,
                HOME: root,
                CODEX_HOME: join(root, ".codex"),
                CROSMOS_API_KEY: "environment-key",
                CROSMOS_API_URL: apiUrl,
            },
            stdio: ["ignore", "ignore", "pipe"],
        },
    );

    let errorOutput = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
        errorOutput += chunk;
    });

    const [code] = await once(child, "close");
    await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
    );
    assert.equal(code, 0, errorOutput);
}

async function runUserPromptSubmit(
    root,
    { spaceId = "space-id", candidates = null } = {},
) {
    let requestBody;
    const server = createServer((request, response) => {
        let raw = "";
        request.setEncoding("utf8");
        request.on("data", (chunk) => {
            raw += chunk;
        });
        request.on("end", () => {
            requestBody = JSON.parse(raw);
            response.writeHead(200, { "content-type": "application/json" });
            response.end(
                JSON.stringify({
                    candidates: candidates ?? [
                        { content: "preference one" },
                        { content: " project context " },
                        { content: "" },
                    ],
                }),
            );
        });
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    const credentialsDir = join(root, ".crosmos");
    mkdirSync(credentialsDir);
    writeFileSync(
        join(credentialsDir, "credentials.json"),
        JSON.stringify(spaceId ? { space_id: spaceId } : {}),
    );

    const child = spawn(process.execPath, [userPromptSubmitPath], {
        cwd: process.cwd(),
        env: {
            ...process.env,
            HOME: root,
            CROSMOS_API_KEY: "environment-key",
            CROSMOS_API_URL: `http://127.0.0.1:${address.port}`,
        },
        stdio: ["pipe", "pipe", "pipe"],
    });
    let output = "";
    let errorOutput = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
        output += chunk;
    });
    child.stderr.on("data", (chunk) => {
        errorOutput += chunk;
    });
    child.stdin.end(
        JSON.stringify({
            cwd: "/workspace/project",
            prompt: "remember this project preference",
        }),
    );
    const [code] = await once(child, "close");
    await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
    );

    assert.equal(code, 0, errorOutput);
    return {
        body: requestBody,
        output: output ? JSON.parse(output) : undefined,
    };
}

test("does not persist environment credentials during install", async () => {
    const root = mkdtempSync(join(tmpdir(), "crosmos-auth-"));

    try {
        await runInstall(root);
        const hooksJson = readFileSync(
            join(root, ".codex", "hooks.json"),
            "utf8",
        );
        assert.match(hooksJson, /\n    "hooks":/);
        assert.match(hooksJson, /\n        "UserPromptSubmit":/);
        assert.doesNotMatch(hooksJson, /"SessionStart"/);
        assert.deepEqual(
            JSON.parse(
                readFileSync(
                    join(root, ".crosmos", "credentials.json"),
                    "utf8",
                ),
            ),
            { space_id: "space-id" },
        );
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test("preserves stored credentials when environment auth selects a space", async () => {
    const root = mkdtempSync(join(tmpdir(), "crosmos-auth-"));
    const credentialsDir = join(root, ".crosmos");
    mkdirSync(credentialsDir);
    writeFileSync(
        join(credentialsDir, "credentials.json"),
        JSON.stringify({
            future_field: "preserve me",
            api_key: "stored-key",
            api_url: "https://stored.example.com",
            space_id: "old-space",
        }),
    );

    try {
        await runInstall(root);
        assert.deepEqual(
            JSON.parse(
                readFileSync(join(credentialsDir, "credentials.json"), "utf8"),
            ),
            {
                future_field: "preserve me",
                api_key: "stored-key",
                api_url: "https://stored.example.com",
                space_id: "space-id",
            },
        );
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test("recalls five content-only candidates at UserPromptSubmit", async () => {
    const root = mkdtempSync(join(tmpdir(), "crosmos-prompt-"));

    try {
        const { body, output } = await runUserPromptSubmit(root);
        assert.deepEqual(body, {
            query: "remember this project preference",
            space_id: "space-id",
            limit: 5,
        });
        assert.deepEqual(output, {
            hookSpecificOutput: {
                hookEventName: "UserPromptSubmit",
                additionalContext: "preference one\n\nproject context",
            },
        });
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test("continues silently when UserPromptSubmit recall is empty", async () => {
    const root = mkdtempSync(join(tmpdir(), "crosmos-prompt-"));

    try {
        const { output } = await runUserPromptSubmit(root, { candidates: [] });
        assert.equal(output, undefined);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test("warns and skips UserPromptSubmit without a selected space", async () => {
    const root = mkdtempSync(join(tmpdir(), "crosmos-prompt-"));

    try {
        const { body, output } = await runUserPromptSubmit(root, {
            spaceId: null,
        });
        assert.equal(body, undefined);
        assert.deepEqual(output, {
            systemMessage:
                "Crosmos memory space is unavailable. Run `npx @crosmos/codex status` to check your configuration.",
        });
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
