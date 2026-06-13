import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "../lib/fsx.js";
import { codexHome } from "../lib/paths.js";
import { type Config, configSchema } from "./schema.js";

function file(): string {
    return join(codexHome(), "crosmos.json");
}

export function configPath(): string {
    return file();
}

export function removeConfig(): boolean {
    if (!existsSync(file())) return false;
    rmSync(file(), { force: true });
    return true;
}

export function loadConfig(): Config {
    let raw: unknown = {};
    try {
        raw = JSON.parse(readFileSync(file(), "utf8"));
    } catch {}

    let cfg: Config;
    try {
        cfg = configSchema.parse(raw);
    } catch {
        cfg = configSchema.parse({});
    }

    if (process.env.CROSMOS_SPACE_ID) cfg.spaceId = process.env.CROSMOS_SPACE_ID;
    if (process.env.CROSMOS_SPACE_NAME) cfg.spaceName = process.env.CROSMOS_SPACE_NAME;
    if (process.env.CROSMOS_RECALL_LIMIT) {
        const n = Number(process.env.CROSMOS_RECALL_LIMIT);
        if (Number.isFinite(n) && n > 0) cfg.recallLimit = Math.floor(n);
    }
    if (
        process.env.CROSMOS_RECALL_MODE === "auto" ||
        process.env.CROSMOS_RECALL_MODE === "always" ||
        process.env.CROSMOS_RECALL_MODE === "off"
    ) {
        cfg.recallMode = process.env.CROSMOS_RECALL_MODE;
    }
    if (process.env.CROSMOS_CAPTURE_MODE === "auto" || process.env.CROSMOS_CAPTURE_MODE === "off") {
        cfg.captureMode = process.env.CROSMOS_CAPTURE_MODE;
    }
    if (process.env.CROSMOS_CAPTURE_EVERY_N_TURNS) {
        const n = Number(process.env.CROSMOS_CAPTURE_EVERY_N_TURNS);
        if (Number.isFinite(n) && n > 0) cfg.captureEveryNTurns = Math.floor(n);
    }
    if (process.env.CROSMOS_DEBUG) {
        cfg.debug = process.env.CROSMOS_DEBUG !== "0" && process.env.CROSMOS_DEBUG !== "false";
    }
    return cfg;
}

export function saveConfig(patch: Partial<Config>): Config {
    const next = { ...loadConfig(), ...patch };
    mkdirSync(codexHome(), { recursive: true });
    writeFileAtomic(file(), `${JSON.stringify(next, null, 2)}\n`);
    return next;
}
