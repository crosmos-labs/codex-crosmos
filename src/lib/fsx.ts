import { copyFileSync, existsSync, renameSync, writeFileSync } from "node:fs";

// Write via temp file + rename so a crash can never leave a half-written file.
export function writeFileAtomic(path: string, data: string, mode?: number): void {
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, data, mode ? { mode } : undefined);
    renameSync(tmp, path);
}

export function backup(path: string): string | null {
    if (!existsSync(path)) return null;
    const bak = `${path}.bak`;
    copyFileSync(path, bak);
    return bak;
}
