# Canonical References & Verified Facts

Single source of truth for the external facts this plugin depends on. **Codex's plugin/hook
surface changes fast** — supermemory's plugin already shipped against stale assumptions (see
"Known staleness traps"). Re-verify the dated facts below against the live docs before each
release; update the date when you do.

> Last full verification: **2026-06-13**

---

## Official documentation links

### OpenAI Codex
| Topic | URL |
|---|---|
| Hooks | https://developers.openai.com/codex/hooks |
| Config (basic) | https://developers.openai.com/codex/config-basic |
| Config (advanced) | https://developers.openai.com/codex/config-advanced |
| Config reference | https://developers.openai.com/codex/config-reference |
| Plugins overview | https://developers.openai.com/codex/plugins |
| Build plugins | https://developers.openai.com/codex/plugins/build |
| Skills | https://developers.openai.com/codex/skills |
| Memories / Chronicle | https://developers.openai.com/codex/memories |
| Changelog | https://developers.openai.com/codex/changelog |
| CLI reference | https://developers.openai.com/codex/cli/reference |
| Source (manifest/app-server specs) | https://github.com/openai/codex — `codex-rs/app-server/README.md`, `codex-rs/skills/src/assets/samples/plugin-creator/references/plugin-json-spec.md` |

### Crosmos
| Topic | URL |
|---|---|
| SDK docs | https://docs.crosmos.dev/sdks |
| TS SDK (npm `crosmos`, Stainless-gen) | https://github.com/crosmos-labs/crosmos-ts-sdk |
| Python SDK | https://github.com/crosmos-labs/crosmos-py-sdk |
| API base | https://api.crosmos.dev  ·  Console: https://console.crosmos.dev |
| Backend repo | local: `~/Work/crosmos/crosmos-mem` |

---

## Verified Codex facts (2026-06-13)

- **Hooks feature flag:** `[features] hooks` is **enabled by default** (confirmed: docs feature-flags
  table + the `default_enabled: true` FeatureSpec model; precedence is cloud > `--enable` > config.toml >
  runtime > code-default). So a flag is **not required** — **we never edit `config.toml`.** The old
  `features.codex_hooks` is a deprecated legacy alias (Codex warns on it; not ours). A standalone
  `~/.codex/hooks.json` is what Codex runs; it still requires `/hooks` approval. Only an explicit
  `hooks = false` disables hooks — `status` warns about that via a parser-free substring check.
- **Hook events:** `SessionStart`, `SubagentStart`, `PreToolUse`, `PermissionRequest`, `PostToolUse`,
  `PreCompact`, `PostCompact`, `UserPromptSubmit`, `SubagentStop`, `Stop`.
- **PreToolUse supports allow/deny + input rewrite** (`permissionDecision: allow|deny`, `updatedInput`).
  Codex CAN auto-approve via hooks. (Corrects the old crosmos plugin README + supermemory assumption.)
- **Hook config:** `hooks.json` (`{ "hooks": { Event: [{ matcher?, hooks: [{ type:"command", command, commandWindows?, statusMessage?, timeout? }] }] } }`)
  OR inline `[[hooks.Event]]` / `[[hooks.Event.hooks]]` in `config.toml`. Same schema.
- **Hook stdin payload (common):** `session_id`, `transcript_path` (string|null), `cwd`,
  `hook_event_name`, `model`, `permission_mode`, `turn_id` (turn-scoped only).
  PreToolUse adds `tool_name`, `tool_use_id`, `tool_input`. → **`transcript_path` is given to us; never guess the sessions path.**
- **Hook stdout envelope:** `{ continue?, stopReason?, systemMessage?, suppressOutput?,
  hookSpecificOutput: { hookEventName, additionalContext } }`. Inject context via `additionalContext`.
- **Exit codes:** 0 = continue; 2 = block/deny (reason on stderr). JSON on stdout parsed first. Default timeout 600s.
- **Matchers:** PreToolUse/PostToolUse/PermissionRequest → tool_name; PreCompact/PostCompact → trigger;
  SessionStart → source (startup|resume|clear|compact); UserPromptSubmit/Stop → no matcher.
- **plugin.json fields:** `name, version, description, author{name,email,url}, homepage, repository,
  license, keywords, skills (path), hooks (path), mcpServers (path → .mcp.json), apps (path → .app.json),
  interface{}`. `interface`: `displayName, shortDescription, longDescription, developerName, category,
  capabilities[], websiteURL, privacyPolicyURL, termsOfServiceURL, defaultPrompt[], brandColor,
  composerIcon, logo, screenshots[]`.
- **marketplace.json:** `{ name, interface{displayName}, plugins:[{ name, source{source:"local"|..., path},
  policy{ installation: NOT_AVAILABLE|AVAILABLE|INSTALLED_BY_DEFAULT (default AVAILABLE),
  authentication: ON_INSTALL|ON_USE (default ON_INSTALL) }, category }] }`.
- **Marketplace CLI:** `codex plugin marketplace add <owner/repo|url|./path> [--ref <r>] [--sparse <p>]`,
  `... list | upgrade | remove <name>`.
- **Native `plugin/install` API is "under development; do not call from production clients yet."**
  → v0 uses our own npx installer, not native marketplace install.
- **Skills:** `SKILL.md` folder, YAML frontmatter (`name`, `description` required) + markdown body;
  optional `agents/openai.yaml`, `scripts/`, `references/`, `assets/`.
- **CODEX_HOME** defaults to `~/.codex`. Native `[features] memories` / "Chronicle" exists (coexist, don't fight it).
- **Rollout transcript format (confirmed 2026-06-13 against a real `~/.codex/sessions/**/*.jsonl`):**
  one JSON object per line with a top-level `type` and nested `payload`. User text =
  `type:"event_msg"` + `payload.type:"user_message"` + `payload.message` (string); assistant text =
  `type:"event_msg"` + `payload.type:"agent_message"` + `payload.message`. Other lines
  (`session_meta`, `turn_context`, `response_item` message/reasoning/function_call, `token_count`)
  are noise — skip them. (NOT the Claude `type:"user"/"assistant"` + `message.content` shape.)

## Verified Crosmos facts (2026-06-13)

- **TS SDK:** npm `crosmos`, Stainless-generated, multi-runtime (Node 20+/edge/bun/deno). Instantiate
  `new Crosmos({ apiKey })`; e.g. `client.search.hybrid({ query, space_id })`. v0.1.0.
  → **VERIFY full namespace coverage (sources/conversations/spaces/jobs) against the SDK before coding.**
- **API base:** dashboard uses `https://api.crosmos.dev/api/v1`; SDK base may omit `/api/v1` — **VERIFY**.
- **Backend (crosmos-mem):** `POST /api/v1/search` (space_id required, hybrid), `POST /sources` & `/conversations`
  (async → `job_id`, poll `GET /jobs/{id}`), `GET /spaces` (`?name=` resolver), `GET/DELETE /memories/{uuid}` (soft forget by UUID).
- **Auth:** `csk_` API keys, **org-scoped**. Credentials file `~/.crosmos/credentials.json` (0600).
- **Missing vs supermemory backend:** `profile`/digest endpoint, natural-language forget, free-form user/project tags.

---

## Known staleness traps (don't repeat supermemory's mistakes)

- supermemory's installer sets `features.codex_hooks = true` — **deprecated**; the flag is now `features.hooks` and on by default.
- supermemory (and the old crosmos plugin) assume Codex can't auto-approve tools via hooks — **false now**; PreToolUse supports allow/deny.
- Don't hardcode the `~/.codex/sessions/YYYY/MM/DD` transcript path — Codex passes `transcript_path` in the hook payload.

## Verification practice

Before each release, re-fetch the Codex docs above (prefer the official site + `openai/codex` source over
memory or third-party plugins), diff against the "Verified facts" sections, and bump the date. Treat any
fact older than the current Codex minor version as suspect.
