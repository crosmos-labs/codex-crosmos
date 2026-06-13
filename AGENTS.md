# AGENTS.md

Conventions and architecture for `@crosmos/codex` — a memory plugin for the OpenAI Codex CLI.

## Product principle

Memory is **invisible and automatic**. Users never type a memory command — relevant context is
recalled before each prompt and the session is captured silently. The automatic hook loop IS the
product; it runs transparently (`suppressOutput: true`) and **fails open** (always exits 0) so it
can never block or break a Codex session. `/crosmos-save` is a secondary convenience, not the path.

## Architecture

- **SDK-direct, in-process.** Hooks call the `crosmos` SDK directly. No subprocess/MCP on the hot path.
- **One bundled entrypoint.** `src/main.ts` dispatches subcommands (`hook | install | uninstall | status | save`),
  esbuild-bundled into a single self-contained `dist/cli.mjs`. End users need only Node — never Bun.
- **Codex integration via hooks**, written to `~/.codex/hooks.json`: `UserPromptSubmit` (recall),
  `Stop` + `PreCompact` (capture). Plus a `crosmos-save` skill. Distributed as an npx installer.
- **Never edit `~/.codex/config.toml`.** The `hooks` feature is enabled by default in Codex; setting
  any flag is unnecessary and risks clobbering the user's config. `status` only *reads* it to warn
  if a user explicitly set `hooks = false`.
- **Transcripts:** Codex rollout JSONL — user/assistant text lives in `event_msg` payloads
  (`user_message` / `agent_message`, `payload.message`). Verify parsing against a real session file.

## Layout (`src/`)

`commands/` (thin CLI), `codex/` (Codex glue: hooks.json/skill wiring, transcript, io, events),
`memory/` (recall, capture, space — the testable core), `client/` (SDK + `~/.crosmos/credentials.json`),
`config/` (`~/.codex/crosmos.json` + zod schema), `lib/` (redact, git, logger, fsx, paths).

## Safety (any file we touch)

- **No-clobber:** distinguish missing (fine) from corrupt (abort, touch nothing).
- **Backup + atomic:** back up before modifying; write via temp-file + rename.
- **Install guard:** refuse to write if `CODEX_HOME` ≠ `~/.codex` unless `--force`; report every path written.
- **Uninstall** reverts only our footprint (hook entries, skill, bundle, `crosmos.json`); leaves the
  crosmos login and server-side memories untouched. Secrets are redacted before anything leaves the machine.

## Toolchain & conventions

- ESM (`"type": "module"`), npm, **esbuild** bundle, **Biome** (4-space, double quotes), `node --test` via `tsx`, `zod`.
- **Minimal dependencies.** Comments: ≤2 lines, only where necessary. Brand is lowercase `crosmos` everywhere.
- Verify Codex/crosmos facts against **live official docs** before relying on them (see `docs/REFERENCES.md`).
- Bundle smoke tests run the real `dist/cli.mjs` (unit tests run TS source, so packaging bugs hide there).
- Keep `ROADMAP.md` and `docs/REFERENCES.md` current. Use the default git identity (no overrides).
