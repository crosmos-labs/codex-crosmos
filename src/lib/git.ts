import { spawnSync } from "node:child_process";

export function gitBranch(cwd?: string): string {
    try {
        const res = spawnSync("git", ["branch", "--show-current"], {
            cwd: cwd || process.cwd(),
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
            timeout: 1000,
        });
        return res.stdout?.trim() || "";
    } catch {
        return "";
    }
}
