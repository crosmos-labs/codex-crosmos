# @crosmos/codex

automatic, invisible memory for the [openai codex cli](https://developers.openai.com/codex), powered by [crosmos](https://crosmos.dev).

you don't manage memory. you use codex normally — relevant context is recalled before
each prompt, and your sessions are saved automatically. nothing to remember, nothing to type.

## requirements

- node 18+ (you already have it if you can run `npx`)
- a crosmos api key (`csk_…`) from [console.crosmos.dev](https://console.crosmos.dev)

## install

```sh
npx @crosmos/codex install
```

the installer asks for your api key (or reuses `~/.crosmos/credentials.json` if you've set up
crosmos before), registers the hooks, and installs the `crosmos-save` skill. then run `/hooks`
inside codex once to approve, and you're done.

## how it works

- **recall** — before each prompt, the most relevant memories for your project are pulled in silently.
- **capture** — when a session ends or compacts, the conversation is saved to crosmos.
- **`/crosmos-save`** — optional. ask codex to save a specific note when you want to be explicit.

everything runs in-process via the `crosmos` sdk and fails open: if memory is ever unavailable,
your codex session is never blocked.

## commands

```sh
crosmos-codex status      # show key, space, and hook registration
crosmos-codex uninstall   # remove hooks + skill (memories are kept)
```

## configuration

| env | purpose |
| --- | --- |
| `CROSMOS_API_KEY` | api key (overrides the credentials file) |
| `CROSMOS_API_BASE_URL` | api base url (default `https://api.crosmos.dev`) |
| `CROSMOS_SPACE_ID` / `CROSMOS_SPACE_NAME` | pin a memory space |
| `CROSMOS_RECALL_LIMIT` | max memories injected per prompt (default 5) |
| `CROSMOS_DEBUG` | write a debug log to `/tmp/crosmos-codex-<session>.log` |

optional file `~/.codex/crosmos.json`: `{ spaceId?, spaceName?, baseUrl?, recallLimit?, debug? }`.
precedence is env > file > defaults.

## development

```sh
npm install
npm run build      # esbuild → dist/cli.mjs (single node-runnable file)
npm test           # node --test
npm run lint       # biome
```

see [ROADMAP.md](./ROADMAP.md) for what's shipped in v0 and what's planned next.
