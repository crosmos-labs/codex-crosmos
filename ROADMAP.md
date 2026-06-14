# crosmos-codex — Roadmap

A standalone OpenAI Codex memory plugin for crosmos. Built SDK-direct (the `crosmos`
TS SDK in-process, esbuild-bundled).
Primary goal: **simple implementation + ease of access for the user.**

---

## v0 scope (what we're building first)

Deliberately minimal — prove the loop end-to-end, then iterate.

- **Distribution:** single npm package, esbuild-bundled. CLI bin `codex` (run via `npx @crosmos/codex`)
  with `install` / `uninstall` / `status`. Installs via npx (writes `~/.codex/hooks.json`,
  copies bundled scripts to `~/.codex/crosmos/`, installs skills to `~/.codex/skills/`).
- **Backend:** SDK-direct in-process (`crosmos` SDK → REST). No MCP in the hot path.
- **Auth:** manual API key. Reuse `~/.crosmos/credentials.json` (shared with crosmos-mcp);
  `CROSMOS_API_KEY` env overrides.
- **Scoping:** single configurable space. Resolve `CROSMOS_SPACE_ID` → `CROSMOS_SPACE_NAME`
  → org default/first space. project + branch + repo path attached as source `meta`.
- **Recall:** one hook — `UserPromptSubmit`. One `search.hybrid` per prompt
  (query = project + branch + prompt), inject top-N via `hookSpecificOutput.additionalContext`.
- **Capture:** two hooks — `Stop` + `PreCompact` (shared handler). Parse rollout JSONL,
  redact secrets, ingest via `conversations.ingest` with project/branch/session metadata.
- **Skills:** one — `/crosmos-save` (explicit save), via the bundled CLI.
- **Config:** `~/.codex/crosmos.json` ({ spaceId?, spaceName?, baseUrl?, recallLimit=5, debug }).
  Precedence env > file > defaults. Debug log to `/tmp/crosmos-codex-<session>.log`.

---

## Deferred to v1+ (tracked from v0 decisions)

### Auth (deferred — not yet designed)
- [ ] Improve auth/onboarding beyond manual key paste. Approach is **undecided** — do not assume
      any specific flow (browser / loopback / OAuth / native apps auth / org-selection) until it's
      actually designed. Today: manual `CROSMOS_API_KEY` / `~/.crosmos/credentials.json`.

### Distribution (deferred from the v0 "npx-installer" decision)
- [ ] Native Codex marketplace plugin (`plugin.json` + `marketplace.json` + `interface` block).
      Blocked: Codex `plugin/install` API is "under development; not for production clients yet."
- [ ] Configurable/alternate CLI entrypoint name (v0 hardcodes the `codex` bin name).
- [ ] Optional `.mcp.json` reference so power users get callable memory tools in-conversation.

### Scoping (deferred from the v0 "single space" decision — the real blocker)
- [ ] Per-project auto-created/resolved spaces (repo → space mapping).
- [ ] User-level vs project-level memory separation (separate user-wide and per-project containers).
      Blocked: backend has no free-form user/project tags; everything is a space.
- [ ] Git worktree handling (share vs isolate memory across worktrees).
- [ ] Branch-aware scoping.

### Recall (deferred from the v0 "minimal hooks" decision)
- [ ] `SessionStart` seed recall (inject project/recent context once at session start).
- [ ] A real backend `profile`/digest endpoint (`{static[], dynamic[]}` + search in one call)
      to replace the manual-search workaround. Backend work required.
- [ ] Per-session fact dedup (factCache) — avoid re-injecting the same memories every prompt.
- [ ] User+project interleaving of recall results.
- [ ] `PreToolUse(Read)` file-context injection (Codex DOES support PreToolUse — confirmed).
- [ ] `PostToolUse(Bash)` error-recall ("you've hit this error before").

### Capture (deferred from the v0 "minimal hooks" decision)
- [x] `PreCompact` capture (catch context before compaction). — shipped in v0
- [ ] Incremental capture every N turns (vs only at Stop).
- [ ] Session coalescing (one appended doc per session via a stable customId).
- [ ] Job-status polling / capture confirmation (vs fire-and-forget).
- [ ] Signal-based turn filtering (only capture meaningful turns).

### Skills (deferred from the v0 "minimal skills" decision)
- [ ] `/crosmos-search` (explicit recall).
- [ ] `/crosmos-forget` — needs backend natural-language forget (only delete-by-UUID today).
- [ ] `/crosmos-status`, spaces management skills.

### Backend asks
- [ ] `profile`/digest endpoint.
- [ ] Natural-language `forget` endpoint.
- [ ] Free-form user/project tags on search (or a sanctioned per-project space pattern).
- [ ] Agent-friendly key issuance (for whatever auth flow is eventually chosen).

### Quality / infra
- [ ] Unit tests (transcript parsing, redaction, config precedence, hooks.json merge idempotency).
- [ ] Live e2e battle test against the API.
- [ ] CI (typecheck + test; tag-triggered npm publish).
