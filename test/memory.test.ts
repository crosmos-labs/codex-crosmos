import { deepStrictEqual, equal, ok, strictEqual } from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
    environment,
    jsonLines,
    makeHome,
    removeHome,
    runTypeScript,
    startFakeApi,
    writeCredentials,
} from "./helpers";

test("UserPromptSubmit sends the query and injects SDK context", async () => {
    const home = makeHome("crosmos-prompt-");
    const api = await startFakeApi({
        candidates: [{ content: "remembered context" }],
    });
    writeCredentials(home, api.url);

    const result = await runTypeScript("src/hooks/user-prompt-submit.ts", [], {
        env: environment(home),
        input: JSON.stringify({
            prompt: "  What did we decide?  ",
            turn_id: " turn-42 ",
        }),
    });

    equal(result.status, 0);
    deepStrictEqual(jsonLines(result.stdout), [
        {
            hookSpecificOutput: {
                hookEventName: "UserPromptSubmit",
                additionalContext:
                    "<crosmos-memory>\nremembered context\n</crosmos-memory>",
            },
        },
    ]);
    const search = api.requests.find(
        (request) => request.path === "/api/v1/search",
    );
    deepStrictEqual(search?.body, {
        query: "What did we decide?",
        space_id: "space-1",
        limit: 5,
        recall_id: "turn-42",
    });

    await api.close();
    removeHome(home);
});

test("Stop ingests one current transcript exchange and avoids duplicates", async () => {
    const home = makeHome("crosmos-stop-");
    const api = await startFakeApi();
    writeCredentials(home, api.url);
    const transcriptPath = join(home.path, "transcript.jsonl");
    writeFileSync(
        transcriptPath,
        `${[
            JSON.stringify({
                type: "response_item",
                payload: {
                    type: "message",
                    role: "user",
                    content: [{ type: "input_text", text: "user question" }],
                },
            }),
            JSON.stringify({
                type: "response_item",
                payload: {
                    type: "message",
                    role: "assistant",
                    phase: "final_answer",
                    content: [
                        { type: "output_text", text: "assistant answer" },
                    ],
                },
            }),
        ].join("\n")}\n`,
    );

    const input = JSON.stringify({
        transcript_path: transcriptPath,
        session_id: "session-1",
        last_assistant_message: "assistant answer",
    });
    const first = await runTypeScript("src/hooks/stop.ts", [], {
        env: environment(home),
        input,
    });
    strictEqual(first.status, 0);
    equal(first.stdout, "");

    const conversations = () =>
        api.requests.filter(
            (request) => request.path === "/api/v1/conversations",
        );
    equal(conversations().length, 1);
    deepStrictEqual(conversations()[0].body, {
        messages: [
            { role: "user", content: "user question" },
            { role: "assistant", content: "assistant answer" },
        ],
        session_id: "session-1",
        space_id: "space-1",
        visibility: "private",
    });

    const second = await runTypeScript("src/hooks/stop.ts", [], {
        env: environment(home),
        input,
    });
    strictEqual(second.status, 0);
    equal(conversations().length, 1);
    ok(second.stdout === "");

    await api.close();
    removeHome(home);
});
