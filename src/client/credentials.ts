import { mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { writeFileAtomic } from "../lib/fsx.js";

const DEFAULT_BASE_URL = "https://api.crosmos.dev";

interface Credentials {
    api_key?: string;
    base_url?: string;
}

function dir(): string {
    return process.env.CROSMOS_CREDENTIALS_DIR || join(homedir(), ".crosmos");
}

function file(): string {
    return join(dir(), "credentials.json");
}

function read(): Credentials {
    try {
        return JSON.parse(readFileSync(file(), "utf8")) as Credentials;
    } catch {
        return {};
    }
}

export function credentialsPath(): string {
    return file();
}

export function getApiKey(): string | undefined {
    return process.env.CROSMOS_API_KEY || read().api_key;
}

export function getBaseUrl(): string {
    const raw = process.env.CROSMOS_API_BASE_URL || read().base_url || DEFAULT_BASE_URL;
    return raw.replace(/\/+$/, "");
}

export function saveApiKey(apiKey: string): void {
    mkdirSync(dir(), { recursive: true, mode: 0o700 });
    const creds: Credentials = { ...read(), api_key: apiKey, base_url: getBaseUrl() };
    writeFileAtomic(file(), `${JSON.stringify(creds, null, 2)}\n`, 0o600);
}
