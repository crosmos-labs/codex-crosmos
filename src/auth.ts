import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import Crosmos from "crosmos";

const CREDENTIALS_DIR = join(homedir(), ".crosmos");
const CREDENTIALS_FILE = join(CREDENTIALS_DIR, "credentials.json");

type StoredCredentials = {
    api_key?: string;
    api_url?: string;
    space_id?: string;
    [key: string]: unknown;
};

export type AuthConfig = {
    apiKey: string;
    apiUrl?: string;
    spaceId?: string;
};

export type CrosmosSpace = {
    id: string;
    name: string;
};

export type ConnectionStatus = "authenticated" | "rejected" | "unavailable";

/** Trims a string value and treats empty input as absent. */
function value(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed || undefined;
}

/** Identifies a missing-file error without depending on Node error classes. */
function isMissingFile(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: string }).code === "ENOENT"
    );
}

/** Reads the shared credentials file and validates its supported fields. */
function readCredentials(): StoredCredentials | null {
    let raw: string;

    try {
        raw = readFileSync(CREDENTIALS_FILE, "utf8");
    } catch (error) {
        if (isMissingFile(error)) {
            return null;
        }

        throw new Error(
            `unable to read ${CREDENTIALS_FILE}: ${errorMessage(error)}`,
        );
    }

    let parsed: unknown;

    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        throw new Error(
            `unable to read ${CREDENTIALS_FILE}: ${errorMessage(error)}`,
        );
    }

    if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
    ) {
        throw new Error(`invalid credentials file: ${CREDENTIALS_FILE}`);
    }

    const object = parsed as Record<string, unknown>;

    if (object.api_key !== undefined && typeof object.api_key !== "string") {
        throw new Error(`invalid credentials file: ${CREDENTIALS_FILE}`);
    }

    if (object.api_url !== undefined && typeof object.api_url !== "string") {
        throw new Error(`invalid credentials file: ${CREDENTIALS_FILE}`);
    }

    if (object.space_id !== undefined && typeof object.space_id !== "string") {
        throw new Error(`invalid credentials file: ${CREDENTIALS_FILE}`);
    }

    return {
        ...object,
        api_key: value(object.api_key as string | undefined),
        api_url: value(object.api_url as string | undefined),
        space_id: value(object.space_id as string | undefined),
    };
}

/** Validates that an API URL uses an absolute HTTP or HTTPS scheme. */
function validateApiUrl(apiUrl: string): string {
    let parsed: URL;

    try {
        parsed = new URL(apiUrl);
    } catch {
        throw new Error(
            `crosmos api url must be an absolute http/https URL: ${apiUrl}`,
        );
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(
            `crosmos api url must be an absolute http/https URL: ${apiUrl}`,
        );
    }

    return apiUrl;
}

/** Resolves the API URL from the environment before stored credentials. */
function resolveApiUrl(stored: StoredCredentials | null): string | undefined {
    const apiUrl = value(process.env.CROSMOS_API_URL) ?? stored?.api_url;
    return apiUrl ? validateApiUrl(apiUrl) : undefined;
}

/** Converts CROSMOS_DEBUG into the boolean used by CLI and hook clients. */
export function isDebugEnabled(): boolean {
    return ["1", "true", "yes", "on"].includes(
        (process.env.CROSMOS_DEBUG || "false").trim().toLowerCase(),
    );
}

/** Combines environment and stored credentials into the active auth config. */
function resolveAuthFrom(stored: StoredCredentials | null): AuthConfig | null {
    const apiKey = value(process.env.CROSMOS_API_KEY) ?? stored?.api_key;

    if (!apiKey) {
        return null;
    }

    return {
        apiKey,
        apiUrl: resolveApiUrl(stored),
        spaceId: stored?.space_id,
    };
}

/** Resolves authentication with environment variables taking precedence. */
export function resolveAuth(): AuthConfig | null {
    const environmentApiKey = value(process.env.CROSMOS_API_KEY);
    let stored: StoredCredentials | null = null;

    try {
        stored = readCredentials();
    } catch (error) {
        if (!environmentApiKey) {
            throw error;
        }
    }

    return resolveAuthFrom(stored);
}

/** Creates a Crosmos SDK client using auth settings and optional client overrides. */
export function createCrosmosClient(
    auth: AuthConfig | null = resolveAuth(),
): Crosmos | null {
    if (!auth) {
        return null;
    }

    return new Crosmos({
        apiKey: auth.apiKey,
        ...(auth.apiUrl ? { baseURL: auth.apiUrl } : {}),
        // Keep SDK logs out of plugin processes; plugin diagnostics use its file logger.
        logLevel: "off",
        maxRetries: 1,
        timeout: 10_000,
    });
}

/** Checks authenticated access without selecting a memory space. */
export async function checkConnection(
    client: Pick<Crosmos, "spaces">,
): Promise<ConnectionStatus> {
    try {
        await client.spaces.list({ limit: 1 });
        return "authenticated";
    } catch (error) {
        const status =
            typeof error === "object" &&
            error !== null &&
            "status" in error &&
            typeof error.status === "number"
                ? error.status
                : undefined;

        return status === 401 || status === 403 ? "rejected" : "unavailable";
    }
}

/** Verifies an API key by making an authenticated spaces request. */
async function verifyApiKey(auth: AuthConfig): Promise<void> {
    const client = createCrosmosClient(auth);

    if (!client) {
        throw new Error("crosmos api key is required.");
    }

    if ((await checkConnection(client)) !== "authenticated") {
        throw new Error(
            "unable to verify crosmos api key. check your api key or try again later.",
        );
    }
}

/** Persists credentials with restrictive directory and file permissions. */
function writeCredentialFile(credentials: StoredCredentials): void {
    mkdirSync(CREDENTIALS_DIR, { recursive: true, mode: 0o700 });

    writeFileSync(
        CREDENTIALS_FILE,
        `${JSON.stringify(credentials, null, 2)}\n`,
        { encoding: "utf8", mode: 0o600 },
    );
    chmodSync(CREDENTIALS_FILE, 0o600);
}

/** Writes verified credentials and the optional selected space. */
function writeCredentials(auth: AuthConfig): void {
    writeCredentialFile({
        api_key: auth.apiKey,
        ...(auth.apiUrl ? { api_url: auth.apiUrl } : {}),
        ...(auth.spaceId ? { space_id: auth.spaceId } : {}),
    });
}

/** Updates only the shared space selection without persisting environment values. */
function writeSpaceSelection(spaceId: string): void {
    const credentials = readCredentials() ?? {};
    credentials.space_id = spaceId;
    writeCredentialFile(credentials);
}

/** Reuses or interactively collects, verifies, and stores install credentials. */
export async function ensureAuthForInstall(): Promise<AuthConfig> {
    const existing = resolveAuth();

    if (existing) {
        return existing;
    }

    const stored = readCredentials();
    const apiUrl = resolveApiUrl(stored);
    const { default: prompts } = await import("prompts");
    const response = await prompts(
        { type: "password", name: "apiKey", message: "crosmos api key" },
        { onCancel: () => true },
    );
    const apiKey = value(response.apiKey);

    if (!apiKey) {
        throw new Error("crosmos api key is required.");
    }

    const auth = { apiKey, apiUrl };
    await verifyApiKey(auth);
    writeCredentials(auth);
    return auth;
}

/** Resolves a requested or stored space, then falls back to interactive selection. */
export async function resolveSpace(
    client: Pick<Crosmos, "spaces">,
    storedSpaceId?: string,
    requestedSpaceId?: string,
): Promise<CrosmosSpace> {
    if (requestedSpaceId) {
        try {
            return await client.spaces.get(requestedSpaceId);
        } catch {
            throw new Error(
                "unable to use crosmos memory space. check the space id and try again.",
            );
        }
    }

    if (storedSpaceId) {
        try {
            return await client.spaces.get(storedSpaceId);
        } catch {
            // The stored space may have been deleted or access may have changed.
        }
    }

    let spaces: CrosmosSpace[];

    try {
        spaces = (await client.spaces.list({ limit: 10 })).spaces;
    } catch {
        throw new Error(
            "unable to load crosmos memory spaces. check your connection and try again.",
        );
    }

    if (spaces.length === 0) {
        throw new Error(
            "no crosmos memory spaces found. create a space and run install again.",
        );
    }

    if (spaces.length === 1) {
        return spaces[0];
    }

    const { default: prompts } = await import("prompts");
    const response = await prompts(
        {
            type: "select",
            name: "spaceId",
            message: "select crosmos space",
            choices: spaces.map(({ id, name }) => ({ title: name, value: id })),
        },
        { onCancel: () => true },
    );
    const selected = spaces.find((space) => space.id === response.spaceId);

    if (!selected) {
        throw new Error("crosmos memory space selection was cancelled.");
    }

    return selected;
}

/** Selects, validates, and stores the global memory space used by install. */
export async function ensureSpaceForInstall(
    auth: AuthConfig,
    requestedSpaceId?: string,
): Promise<CrosmosSpace> {
    const client = createCrosmosClient(auth);

    if (!client) {
        throw new Error("crosmos api key is required.");
    }

    const space = await resolveSpace(client, auth.spaceId, requestedSpaceId);
    if (value(process.env.CROSMOS_API_KEY)) {
        writeSpaceSelection(space.id);
    } else {
        writeCredentials({ ...auth, spaceId: space.id });
    }
    return space;
}

/** Converts an unknown thrown value into readable error text. */
function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
