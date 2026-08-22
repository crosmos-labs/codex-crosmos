# Release Process

Use this process when releasing `@crosmos/codex`.

## Version bump

Never commit directly to `main`. Start from the latest `main` branch:

```sh
git switch main
git pull --ff-only origin main
git switch -c release/vX.Y.Z
```

Choose the appropriate semantic version bump:

```sh
npm version patch --no-git-tag-version
```

Use `minor` for backward-compatible features and `major` for breaking changes. The command updates
`package.json` and `package-lock.json` without creating a commit or tag.

## Validate and open the PR

Run all checks before opening the PR:

```sh
npm ci
npm run typecheck
npm run build
npx --no-install biome check src
```

Commit the manifest changes and push the release branch:

```sh
git add package.json package-lock.json
git commit -m "release: vX.Y.Z"
git push --set-upstream origin release/vX.Y.Z
```

Open a PR targeting `main` with this title format:

```text
Release: vX.Y.Z
```

Use the following body format. Keep only sections that contain entries:

```md
## Added

- New user-facing capabilities.

## Changed

- User-visible behavior changes.

## Fixed

- User-visible bug fixes.

## Breaking

- Required migration notes for breaking changes.
```

The body must describe the complete user-facing release. Keep entries short and changelog-like. Do
not include CI implementation details or a verification section.

## After merge

After the PR is merged, CI runs the checks, creates and pushes `vX.Y.Z`, publishes the package to
npm through Trusted Publishing, and creates the GitHub Release from the PR body.

Do not manually create the tag, GitHub Release, or run `npm publish`.
