import assert from "node:assert/strict";
import test from "node:test";
import {
    configurationFailure,
    parseHookInput,
    warningMessage,
} from "../dist/hooks/runtime.js";
import { checkConnection, createCrosmosClient } from "../dist/auth.js";

test("parses only JSON objects", () => {
    assert.deepEqual(parseHookInput('{"cwd":"/tmp"}'), { cwd: "/tmp" });
    assert.equal(parseHookInput("not json"), null);
    assert.equal(parseHookInput("[]"), null);
    assert.equal(parseHookInput("null"), null);
});

test("classifies configuration status codes", () => {
    assert.equal(configurationFailure({ status: 401 }), "authentication");
    assert.equal(configurationFailure({ status: 403 }), "authentication");
    assert.equal(configurationFailure({ status: 404 }), "space");
    assert.equal(configurationFailure({ status: 500 }), undefined);
});

test("uses distinct fixed warnings", () => {
    assert.match(warningMessage("authentication"), /API key/);
    assert.match(warningMessage("space"), /memory space/);
});

test("checks authenticated space access with one result", async () => {
    let query;
    const client = {
        spaces: {
            list: async (params) => {
                query = params;
            },
        },
    };

    assert.equal(await checkConnection(client), "authenticated");
    assert.deepEqual(query, { limit: 1 });
});

test("classifies connection failures", async () => {
    assert.equal(
        await checkConnection({
            spaces: {
                list: async () => {
                    throw { status: 401 };
                },
            },
        }),
        "rejected",
    );
    assert.equal(
        await checkConnection({
            spaces: {
                list: async () => {
                    throw { status: 403 };
                },
            },
        }),
        "rejected",
    );
    assert.equal(
        await checkConnection({
            spaces: {
                list: async () => {
                    throw new Error("offline");
                },
            },
        }),
        "unavailable",
    );
});

test("disables SDK logging", () => {
    const previous = process.env.CROSMOS_LOG;
    process.env.CROSMOS_LOG = "debug";

    try {
        assert.equal(createCrosmosClient({ apiKey: "test" })?.logLevel, "off");
    } finally {
        if (previous === undefined) {
            delete process.env.CROSMOS_LOG;
        } else {
            process.env.CROSMOS_LOG = previous;
        }
    }
});
