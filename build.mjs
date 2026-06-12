// Bundles the CLI + crosmos SDK into one self-contained, Node-runnable dist/cli.mjs.
// The installer copies this single file into ~/.codex/; end users only need Node.
import { build } from "esbuild";

await build({
    entryPoints: ["src/main.ts"],
    outfile: "dist/cli.mjs",
    bundle: true,
    platform: "node",
    target: "node18",
    format: "esm",
    packages: "bundle",
    minify: false,
    sourcemap: false,
    banner: { js: "#!/usr/bin/env node" },
    logLevel: "info",
});
