import { basename } from "node:path";
import { createClient } from "../client/crosmos.js";
import { gitBranch } from "../lib/git.js";
import { resolveSpaceId } from "../memory/space.js";

export async function save(args: string[]): Promise<void> {
    const text = parseText(args);
    if (!text) {
        process.stderr.write('usage: crosmos-codex save --text "<note>"\n');
        process.exit(1);
    }

    const client = createClient(15000);
    if (!client) {
        process.stderr.write("no crosmos api key configured\n");
        process.exit(1);
    }
    const spaceId = await resolveSpaceId(client);
    if (!spaceId) {
        process.stderr.write("no memory space available\n");
        process.exit(1);
    }

    await client.sources.ingest({
        space_id: spaceId,
        sources: [
            {
                content: text,
                content_type: "text",
                meta: {
                    source: "codex:save",
                    project: basename(process.cwd()),
                    branch: gitBranch(),
                },
            },
        ],
    });
    process.stdout.write("saved to crosmos memory.\n");
}

function parseText(args: string[]): string {
    const i = args.indexOf("--text");
    if (i >= 0 && args[i + 1]) return args[i + 1];
    return args
        .filter((a) => !a.startsWith("--"))
        .join(" ")
        .trim();
}
