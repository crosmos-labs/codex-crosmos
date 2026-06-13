<div align="center">

<img src="docs/banner.png" alt="crosmos for codex" width="100%" />

# @crosmos/codex

<p><em>automatic, persistent context for the openai codex cli, powered by crosmos.</em></p>

<p>
  <a href="https://www.npmjs.com/package/@crosmos/codex"><img src="https://img.shields.io/npm/v/@crosmos/codex?style=for-the-badge&color=000000" alt="npm version" /></a>
  <img src="https://img.shields.io/npm/l/@crosmos/codex?style=for-the-badge&color=000000" alt="license: MIT" />
</p>

</div>

---

You don't manage memory. You use codex normally — relevant context is recalled before each
prompt, and your sessions are saved automatically. Nothing to remember, nothing to type.

---

## Requirements

- Node 18+ (you already have it if you can run `npx`).
- A crosmos api key (`csk_…`) from [console.crosmos.dev](https://console.crosmos.dev).

---

## Install

```sh
npx @crosmos/codex install
```

The installer asks for your api key (or reuses `~/.crosmos/credentials.json` if you've set
up crosmos before), registers the hooks, and installs the `crosmos-save` skill. Then run
`/hooks` inside codex once to approve — and you're done.

---

## What the installer writes

No magic. It's a plain script that writes a handful of files you can inspect — and
`crosmos-codex uninstall` reverts every one of them. Existing files are backed up before
they're touched, and it **never edits `~/.codex/config.toml`**.

| path | what it is |
| --- | --- |
| `~/.codex/hooks.json` | registers three codex hooks (see below). Your other hooks are preserved. |
| `~/.codex/crosmos/cli.mjs` | the bundled plugin script the hooks run. |
| `~/.codex/skills/crosmos-save/SKILL.md` | the `/crosmos-save` skill — a readable markdown file. |
| `~/.crosmos/credentials.json` | your api key, saved locally (only if you enter one at install). |

The three hooks are the whole mechanism — each just runs the bundled script on a codex
lifecycle event:

| hook | runs on | does |
| --- | --- | --- |
| `UserPromptSubmit` | before each prompt | recalls relevant memories |
| `Stop` | end of a turn | captures the conversation |
| `PreCompact` | before context is compacted | captures before anything is lost |

The skill file is just an instruction telling codex it *can* save a note when you ask —
open it and read it. Secrets are redacted before anything leaves your machine, and the
hooks **fail open**, so memory being unavailable never blocks your codex session.

---

## How it works

- **Recall** — before each prompt, the most relevant memories for your project are pulled in silently.
- **Capture** — as a session progresses and when it ends or compacts, the conversation is saved to crosmos.
- **`/crosmos-save`** — optional. Ask codex to save a specific note when you want to be explicit.

Everything runs in-process via the `crosmos` sdk and **fails open**: if memory is ever
unavailable, your codex session is never blocked.

---

## Commands

```sh
crosmos-codex status      # show key, space, and hook registration
crosmos-codex uninstall   # remove hooks + skill (memories are kept)
```

---

## Configuration

Set via environment variables or the optional file `~/.codex/crosmos.json`. Precedence is
**env > file > defaults**.

| env | purpose |
| --- | --- |
| `CROSMOS_API_KEY` | api key (overrides the credentials file) |
| `CROSMOS_API_BASE_URL` | api base url (default `https://api.crosmos.dev`) |
| `CROSMOS_SPACE_ID` / `CROSMOS_SPACE_NAME` | pin a memory space |
| `CROSMOS_RECALL_LIMIT` | max memories injected per prompt (default `5`) |
| `CROSMOS_RECALL_MODE` | `auto` (default), `always`, or `off` |
| `CROSMOS_CAPTURE_TURNS` | meaningful turns to batch before capturing (default `3`; `0` disables) |
| `CROSMOS_DEBUG` | write a debug log to `/tmp/crosmos-codex-<session>.log` |

The `~/.codex/crosmos.json` file accepts the same settings as keys:

```json
{
  "spaceId": "…",
  "spaceName": "…",
  "baseUrl": "https://api.crosmos.dev",
  "recallLimit": 5,
  "recallMode": "auto",
  "captureTurns": 3,
  "debug": false
}
```

---

## Development

```sh
npm install
npm run build      # esbuild → dist/cli.mjs (single node-runnable file)
npm test           # node --test
npm run lint       # biome
```

See [ROADMAP.md](./ROADMAP.md) for what's shipped in v0 and what's planned next.

---

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](./CONTRIBUTING.md) to get started.

---

## License

MIT.
