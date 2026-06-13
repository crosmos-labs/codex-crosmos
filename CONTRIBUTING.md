# Contributing

Thanks for helping improve `@crosmos/codex`. This is a small, deliberately simple codebase —
keep changes focused and the implementation minimal.

---

## Development setup

```sh
git clone git@github.com:crosmos-labs/codex-crosmos.git
cd codex-crosmos
npm install

npm run build      # esbuild → dist/cli.mjs (single node-runnable file)
npm test           # node --test via tsx
npm run typecheck  # tsc --noEmit
npm run lint       # biome   (npm run lint:fix to apply)
```

Unit tests run the TypeScript source directly; the build produces the bundled
`dist/cli.mjs` that end users actually run.

---

## Run your local build in codex

Instead of the published package, install **your build** into codex. The `install`
command copies whichever bundle it's run from, so point it at your freshly built
`dist/cli.mjs`:

```sh
npm run build
node dist/cli.mjs install        # asks for a csk_ key, registers hooks for THIS build
```

Then run `/hooks` in codex once to approve. After any code change, rebuild and re-install —
the installer copies the new bundle to `~/.codex/crosmos/cli.mjs` (the hooks run that copy,
not your repo's `dist/`), so a re-run is required to pick up changes:

```sh
npm run build && node dist/cli.mjs install   # idempotent
node dist/cli.mjs uninstall                  # revert when done
```

**Test in isolation** (recommended — don't touch your real `~/.codex`): point `CODEX_HOME`
at a throwaway dir. The `--force` flag is required because it's not the default home, and
codex itself reads the same variable:

```sh
export CODEX_HOME=/tmp/codex-dev
node dist/cli.mjs install --force
codex                                        # uses /tmp/codex-dev
```

Inspect and debug:

```sh
node dist/cli.mjs status                     # key, space, hook registration
CROSMOS_DEBUG=1 codex                         # writes /tmp/crosmos-codex-<session>.log
```

`install` connects to crosmos, so you need a real api key (`csk_…`) and an existing space.

---

## Project layout & conventions

Architecture, file layout, and the house rules for **how to write code here** live in
[AGENTS.md](./AGENTS.md) — read it before opening a PR. In short: simplest implementation
that works, expressive code over opaque constants, minimal dependencies, and the brand word
`crosmos` stays lowercase everywhere.

---

## Submitting changes

- Branch off `main`.
- Keep **`typecheck`, `test`, and `lint` green** before pushing.
- Prefer small, focused PRs with a clear description of the why.
- Match the existing commit style (e.g. `feat(capture): …`, `fix(build): …`, `docs: …`).

---

## Reporting issues

Open an issue at [github.com/crosmos-labs/codex-crosmos/issues](https://github.com/crosmos-labs/codex-crosmos/issues)
with steps to reproduce and, where relevant, a debug log (`CROSMOS_DEBUG=1`).
