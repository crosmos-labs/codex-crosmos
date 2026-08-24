import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const projectRoot = resolve(__dirname, "..");
const tsx = resolve(projectRoot, "node_modules/.bin/tsx");

export type Home = {
    path: string;
    codexHome: string;
};

export function makeHome(prefix: string): Home {
    const path = mkdtempSync(join(tmpdir(), prefix));
    return { path, codexHome: join(path, ".codex") };
}

export function removeHome(home: Home): void {
    rmSync(home.path, { recursive: true, force: true });
}

export function environment(
    home: Home,
    extra: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
    return {
        ...process.env,
        HOME: home.path,
        USERPROFILE: home.path,
        CODEX_HOME: home.codexHome,
        ...extra,
    };
}

export function writeCredentials(
    home: Home,
    apiUrl: string,
    spaceId = "space-1",
    apiKey = "test-key",
): void {
    const directory = join(home.path, ".crosmos");
    mkdirSync(directory, { recursive: true });
    writeFileSync(
        join(directory, "credentials.json"),
        `${JSON.stringify({ api_key: apiKey, api_url: apiUrl, space_id: spaceId })}\n`,
    );
}

export type RunResult = {
    status: number | null;
    stdout: string;
    stderr: string;
};

export function runTypeScript(
    entry: string,
    args: string[] = [],
    options: { env?: NodeJS.ProcessEnv; input?: string } = {},
): Promise<RunResult> {
    return new Promise((resolveResult, reject) => {
        const child = spawn(tsx, [resolve(projectRoot, entry), ...args], {
            cwd: projectRoot,
            env: options.env,
        });
        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (chunk: Buffer) => {
            stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk: Buffer) => {
            stderr += chunk.toString();
        });
        child.once("error", reject);
        child.once("close", (status) => {
            resolveResult({ status, stdout, stderr });
        });
        child.stdin.end(options.input ?? "");
    });
}

export type ApiRequest = {
    method: string;
    path: string;
    body: unknown;
};

export type FakeApi = {
    url: string;
    requests: ApiRequest[];
    close(): Promise<void>;
};

async function requestBody(
    request: import("node:http").IncomingMessage,
): Promise<unknown> {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString("utf8");
    if (!raw) return undefined;

    try {
        return JSON.parse(raw);
    } catch {
        return raw;
    }
}

export async function startFakeApi(
    options: {
        candidates?: Array<{ content?: unknown }>;
        spaces?: Array<{ id: string; name: string }>;
    } = {},
): Promise<FakeApi> {
    const requests: ApiRequest[] = [];
    const candidates = options.candidates ?? [
        { content: "remembered context" },
    ];
    const spaces = options.spaces ?? [{ id: "space-1", name: "Test space" }];

    const server = createServer(async (request, response) => {
        const path = new URL(request.url ?? "/", "http://localhost").pathname;
        const body = await requestBody(request);
        requests.push({ method: request.method ?? "GET", path, body });
        response.setHeader("content-type", "application/json");

        if (request.method === "GET" && path === "/api/v1/spaces") {
            response.end(JSON.stringify({ spaces, total: spaces.length }));
            return;
        }

        if (request.method === "GET" && path.startsWith("/api/v1/spaces/")) {
            const id = path.slice("/api/v1/spaces/".length);
            const space = spaces.find((item) => item.id === id);
            response.statusCode = space ? 200 : 404;
            response.end(JSON.stringify(space ?? { error: "not found" }));
            return;
        }

        if (request.method === "POST" && path === "/api/v1/search") {
            response.end(JSON.stringify({ candidates }));
            return;
        }

        if (
            request.method === "POST" &&
            (path === "/api/v1/sources" || path === "/api/v1/conversations")
        ) {
            response.statusCode = 202;
            response.end(JSON.stringify({ accepted: true }));
            return;
        }

        response.statusCode = 404;
        response.end(JSON.stringify({ error: "unknown test route" }));
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") {
        throw new Error("fake API did not start");
    }

    return {
        url: `http://127.0.0.1:${address.port}`,
        requests,
        close: async () => {
            server.close();
            await once(server, "close");
        },
    };
}

export function jsonLines(output: string): unknown[] {
    return output
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
}
