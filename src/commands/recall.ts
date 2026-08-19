import { createCrosmosClient, resolveAuth } from "../auth";
import { recallMemory } from "../memory";

function commandText(args: string[]): string {
    const text = args.join(" ").trim();
    if (!text) {
        throw new Error('usage: crosmos-codex recall "<query>"');
    }
    return text;
}

/** Runs an explicit memory search and prints readable results. */
export async function runRecall(args: string[]): Promise<void> {
    const query = commandText(args);
    const auth = resolveAuth();
    const client = auth ? createCrosmosClient(auth) : null;

    if (!client || !auth?.spaceId) {
        throw new Error(
            "crosmos authentication or space is unavailable. run `npx @crosmos/codex status`.",
        );
    }

    const memories = await recallMemory(client, auth.spaceId, query);
    console.log(
        memories.length ? memories.join("\n\n") : "no crosmos memories found.",
    );
}

if (require.main === module) {
    runRecall(process.argv.slice(2)).catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
