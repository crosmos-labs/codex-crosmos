import type Crosmos from "crosmos";
import { loadConfig, saveConfig } from "../config/config.js";

// Resolves a single space once and caches its id to config so hooks skip the lookup.
export async function resolveSpaceId(client: Crosmos): Promise<string | null> {
    const cfg = loadConfig();
    if (cfg.spaceId) return cfg.spaceId;

    if (cfg.spaceName) {
        const byName = await client.spaces.list({ name: cfg.spaceName });
        const match = byName.spaces[0];
        if (match) {
            saveConfig({ spaceId: match.id });
            return match.id;
        }
    }

    const all = await client.spaces.list();
    const first = all.spaces[0];
    if (!first) return null;
    saveConfig({ spaceId: first.id });
    return first.id;
}
