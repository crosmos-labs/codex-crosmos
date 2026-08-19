<div align="center">

<img src="./docs/banner.png" alt="crosmos for codex" width="100%" />

# @crosmos/codex

<p><em>automatic, persistent context for the openai codex cli, powered by crosmos.</em></p>

[![npm version](https://img.shields.io/npm/v/@crosmos/codex?style=for-the-badge&logo=npm)](https://www.npmjs.com/package/@crosmos/codex)

</div>

<br>

You use Codex normally. Relevant context is recalled before each prompt, and completed turns
are saved automatically to your selected Crosmos memory space.

> [!IMPORTANT]
> Node.js 20 or newer is required.

## Requirements

- Node.js 20+
- A Crosmos API key from [console.crosmos.dev](https://console.crosmos.dev)
- Access to at least one Crosmos memory space

## Install

```sh
npx @crosmos/codex install
```

The installer asks for your API key and lets you select a memory space. Existing verified
credentials are reused when available.

It also asks whether to install these optional Codex skills:

- `$crosmos-status`
- `$crosmos-recall`
- `$crosmos-save`

For automation or explicit space selection:

```sh
export CROSMOS_API_KEY="csk_..."
npx @crosmos/codex install --space "<space-id>"
```

Restart Codex after installation. If the hooks are not active, inspect Codex's hook controls
and approve or enable the registered Crosmos hooks when prompted.

## How It Works

| Hook | Runs on | Behavior |
| --- | --- | --- |
| `UserPromptSubmit` | Before each prompt | Searches the current prompt and injects relevant memories into the turn. |
| `Stop` | After the assistant completes a turn | Captures the completed exchange in the selected private Crosmos space. |

Hooks fail open: an unavailable API, missing configuration, or failed capture does not block
your Codex session. PreCompact pending-memory recovery is deferred from v1.

## Commands

```sh
npx @crosmos/codex install
npx @crosmos/codex install --space "<space-id>"
npx @crosmos/codex login
npx @crosmos/codex status
npx @crosmos/codex recall "<query>"
npx @crosmos/codex save "<text>"
npx @crosmos/codex --help
npx @crosmos/codex --version
npx @crosmos/codex uninstall
```

`status` checks the API connection, selected memory space, hook runtime, hook registration, and
managed skills.

Automatic recall still runs before every prompt. Use `$crosmos-recall` only for historical context
that the current prompt recall did not provide. Use `$crosmos-save` only when you explicitly want
to store a memory.

The installer manages these Codex skills:

- `$crosmos-status` — check Crosmos configuration and connectivity.
- `$crosmos-recall` — search selected-space memory on demand.
- `$crosmos-save` — submit one private memory for ingestion.

> [!IMPORTANT]
> `$crosmos-status`, `$crosmos-recall`, and `$crosmos-save` make Crosmos API requests from inside
> Codex. Codex's default `workspace-write` sandbox blocks outbound network access.
>
> Enable it in `~/.codex/config.toml`:
>
> ```toml
> [sandbox_workspace_write]
> network_access = true
> ```
>
> Restart Codex after changing this setting. Crosmos does not modify Codex sandbox settings. See
> the [Codex advanced configuration](https://learn.chatgpt.com/docs/config-file/config-advanced).

`uninstall` removes Crosmos hook registrations and managed runtime files. It preserves your
credentials and remote memories.

## Configuration

Environment variables override stored credentials where applicable.

| Variable | Description |
| --- | --- |
| `CROSMOS_API_KEY` | API key used for authentication. |
| `CROSMOS_API_URL` | Optional Crosmos API URL. When omitted, the SDK supplies its default. |
| `CROSMOS_DEBUG` | Set to `true`, `1`, `yes`, or `on` to enable sanitized hook diagnostics. Disabled by default. |

The selected memory space is stored with the shared credentials so future Crosmos plugins can
reuse it.

## Local Files

| Path | Purpose |
| --- | --- |
| `~/.crosmos/credentials.json` | Verified API credentials and selected memory space. |
| `~/.crosmos/codex.log` | Sanitized hook diagnostics when `CROSMOS_DEBUG` is enabled. |
| `~/.agents/skills/crosmos-*` | Managed skills installed by Crosmos. |

Credentials are stored with restrictive local permissions. Debug logs do not contain prompts,
responses, API keys, headers, or request bodies.

## Troubleshooting

### Check the connection

```sh
npx @crosmos/codex status
```

If authentication or the selected space is unavailable, run installation again with a valid
API key and, when needed, `--space <space-id>`.

### Hooks are not running

Restart Codex, then inspect its hook controls and approve or enable the Crosmos registrations.
Confirm that `status` reports both the runtime and `hooks.json` as installed.

### Enable diagnostics

```sh
export CROSMOS_DEBUG=true
tail -f ~/.crosmos/codex.log
```

## License

[MIT](./LICENSE) © Crosmos Labs
