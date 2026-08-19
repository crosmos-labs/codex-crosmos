import { createCrosmosClient, resolveAuth } from "../auth";
import { saveMemory } from "../memory";

function commandText(args: string[]): string {
    const text = args.join(" ").trim();
    if (!text) {
        throw new Error('usage: crosmos-codex save "<text>"');
    }
    return text;
}

/** Saves one explicit private memory from the command line. */
export async function runSave(args: string[]): Promise<void> {
    const content = commandText(args);
    const auth = resolveAuth();
    const client = auth ? createCrosmosClient(auth) : null;

    if (!client || !auth?.spaceId) {
        throw new Error(
            "crosmos authentication or space is unavailable. run `npx @crosmos/codex status`.",
        );
    }

    await saveMemory(client, auth.spaceId, content);
    console.log("✓ crosmos memory submitted");
}

if (require.main === module) {
    runSave(process.argv.slice(2)).catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    });
}
