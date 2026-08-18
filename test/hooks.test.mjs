import assert from "node:assert/strict";
import test from "node:test";
import prompts from "prompts";
import {
    checkConnection,
    createCrosmosClient,
    resolveSpace,
} from "../dist/auth.js";
import {
    configurationFailure,
    parseHookInput,
    warningMessage,
} from "../dist/hooks/runtime.js";

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

test("prefers an explicit space over the stored space", async () => {
    const requested = { id: "requested", name: "Requested" };
    const client = {
        spaces: {
            get: async (id) =>
                id === requested.id ? requested : { id, name: "Stored" },
            list: async () => ({ spaces: [] }),
        },
    };

    assert.deepEqual(
        await resolveSpace(client, "stored", requested.id),
        requested,
    );
});

test("falls back to accessible spaces when the stored space is unavailable", async () => {
    const available = { id: "available", name: "Available" };
    const client = {
        spaces: {
            get: async () => {
                throw new Error("not found");
            },
            list: async () => ({ spaces: [available] }),
        },
    };

    assert.deepEqual(await resolveSpace(client, "missing"), available);
});

test("selects one of the first ten spaces with the prompt", async () => {
    const spaces = Array.from({ length: 10 }, (_, index) => ({
        id: `space-${index}`,
        name: `Space ${index}`,
    }));
    prompts.inject(["space-9"]);

    const client = {
        spaces: {
            list: async (params) => {
                assert.deepEqual(params, { limit: 10 });
                return { spaces };
            },
        },
    };

    assert.deepEqual(await resolveSpace(client), spaces[9]);
});

test("rejects when no spaces are accessible", async () => {
    await assert.rejects(
        resolveSpace({ spaces: { list: async () => ({ spaces: [] }) } }),
        /no crosmos memory spaces found/,
    );
});
