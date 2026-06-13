# contributing

local setup for working on `@crosmos/codex`.

## requirements

- node 18+ and npm

## setup

```sh
npm install
```

## common tasks

```sh
npm run build      # esbuild → dist/cli.mjs (single node-runnable file)
npm test           # node --test
npm run typecheck  # tsc --noEmit
npm run lint       # biome check
npm run lint:fix   # biome check --write
```

## run it locally

build first, then point the cli at a throwaway codex home so you don't touch your real `~/.codex`:

```sh
npm run build
export CODEX_HOME=$(mktemp -d)   # fish: set -x CODEX_HOME (mktemp -d)
node dist/cli.mjs install        # paste a csk_ key when asked (or set CROSMOS_API_KEY)
node dist/cli.mjs status
```

test a hook directly by piping a payload to it (no key needed — it just exits quietly):

```sh
echo '{"prompt":"a recall smoke test prompt"}' | node dist/cli.mjs hook UserPromptSubmit
```

## test in a real codex session

this installs into your real `~/.codex` so codex actually loads it.

```sh
npm run build
node dist/cli.mjs install        # uses your real ~/.codex (no CODEX_HOME override)
```

then, in codex:

1. run `/hooks` once and approve the crosmos hooks (codex trusts hooks by content hash).
2. prompt normally — recall runs silently before each prompt, capture runs when the session
   ends or compacts. ask about something you discussed earlier to see recall pull it back.
3. to watch it work, launch codex with debug on and tail the log:

```sh
export CROSMOS_DEBUG=1   # fish: set -x CROSMOS_DEBUG 1 — set before launching codex
tail -f /tmp/crosmos-codex-*.log   # in another terminal
```

your api key is saved to `~/.crosmos/credentials.json` on first install, so you **log in once** —
it persists across terminals and is shared with other crosmos tooling. no per-terminal env needed.

after changing code, re-run `npm run build && node dist/cli.mjs install` (it re-copies the
bundle) and re-approve via `/hooks` since the hash changed.

## uninstall / rollback

```sh
node dist/cli.mjs uninstall
```

it removes only what this plugin created — our hook entries in `hooks.json`, the `crosmos-save`
skill, the bundle dir, and `crosmos.json` — and reports each. your crosmos **login and saved
memories are left untouched** (uninstalling a plugin shouldn't log you out everywhere).

safety guarantees for `hooks.json`: install **backs it up** (`hooks.json.bak`) and writes
atomically; if it's ever present-but-corrupt, install/uninstall **abort without touching it** rather
than risk clobbering hooks from other tools.
