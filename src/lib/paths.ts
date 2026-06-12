import { homedir } from "node:os";
import { join } from "node:path";

export function codexHome(): string {
    return process.env.CODEX_HOME || join(homedir(), ".codex");
}

export function pluginDir(): string {
    return join(codexHome(), "crosmos");
}

export function skillsDir(): string {
    return join(codexHome(), "skills");
}
