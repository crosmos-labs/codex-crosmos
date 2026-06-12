import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { skillsDir } from "../lib/paths.js";

function dir(): string {
    return join(skillsDir(), "crosmos-save");
}

export function writeSkill(cliPath: string): void {
    mkdirSync(dir(), { recursive: true });
    writeFileSync(join(dir(), "SKILL.md"), body(cliPath));
}

export function removeSkill(): void {
    try {
        rmSync(dir(), { recursive: true, force: true });
    } catch {}
}

function body(cliPath: string): string {
    return `---
name: crosmos-save
description: Save an important note or decision to crosmos memory.
---

When the user explicitly asks to remember or save something specific, run:

\`node "${cliPath}" save --text "<concise note>"\`

Pass a clear, self-contained summary as the note. crosmos handles storage and
recall automatically — you never manage spaces or ingestion.
`;
}
