import type Crosmos from "crosmos";

/** Returns relevant memory content for one search query. */
export async function recallMemory(
    client: Crosmos,
    spaceId: string,
    query: string,
    recallId?: string,
): Promise<string[]> {
    const result = await client.search.hybrid({
        query,
        space_id: spaceId,
        limit: 5,
        ...(recallId ? { recall_id: recallId } : {}),
    });

    return (Array.isArray(result.candidates) ? result.candidates : [])
        .map((candidate) =>
            typeof candidate?.content === "string"
                ? candidate.content.trim()
                : "",
        )
        .filter(Boolean);
}

/** Stores one explicit private memory in Crosmos. */
export async function saveMemory(
    client: Crosmos,
    spaceId: string,
    content: string,
): Promise<void> {
    await client.sources.ingest({
        space_id: spaceId,
        sources: [
            {
                content,
                content_type: "text",
                visibility: "private",
            },
        ],
    });
}
