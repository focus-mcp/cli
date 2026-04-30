<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# Release guide — @focus-mcp/cli

This document is for **maintainers** only. External contributors do not need to follow this process.

## Overview

Two publish workflows exist:

| Workflow | Trigger | npm tag |
|----------|---------|---------|
| `dev-publish.yml` | push to `develop` | `dev` |
| `stable-publish.yml` | push to `main` | `latest` |

There is no Changesets "Version Packages" PR. Version bumps are made directly in `package.json` on `develop` before merging to `main`.

## Release order

The CLI depends on `@focus-mcp/core`. If the release includes a core update:

1. Release **core** first (see `focus-mcp/core` release guide).
2. Update the `@focus-mcp/core` version in `cli/package.json`.
3. Then release **cli**.

## Pre-conditions

Before cutting a stable release:

- `develop` and `main` are aligned (no divergence — run `/sync-status` to check).
- All open PRs blocking the milestone are merged to `develop`.
- CI is green on `develop` (lint, typecheck, tests, coverage, build, REUSE, gitleaks).
- `package.json` version on `develop` is already bumped to the target version.
- `CHANGELOG.md` (if maintained) reflects the new version.

## Using the `/release` skill

```
/release cli <bump>
```

Where `<bump>` is `patch`, `minor`, or `major`. The skill:

1. Verifies pre-conditions.
2. Bumps the version in `package.json` on `develop`.
3. Commits `chore: release vX.Y.Z`.
4. Opens a sync PR (`develop` → `main`).
5. CI on `main` runs `stable-publish.yml` → publishes to npm with the `latest` tag.
6. The back-merge workflow re-syncs `main` → `develop`.

## Manual fallback

If the `/release` skill is unavailable or fails:

```bash
# 1. Ensure you are on develop and up to date
git checkout develop
git fetch origin && git rebase origin/develop

# 2. Bump the version (edit package.json manually or use npm version)
npm version patch --no-git-tag-version   # or minor / major

# 3. Verify build
pnpm build

# 4. Commit
git add package.json
git commit -m "chore: release vX.Y.Z"

# 5. Push develop — triggers dev-publish.yml (npm tag: dev)
git push origin develop

# 6. Open a PR: develop → main
gh pr create --title "chore: release vX.Y.Z" --base main --head develop \
  --body "Stable release — merge to trigger stable-publish.yml"

# 7. Once merged, stable-publish.yml publishes to npm (tag: latest)
```

## Recovery back-merge

If the back-merge workflow fails after a release (i.e. `main` is ahead of `develop`):

```bash
/back-merge cli
```

Or manually:

```bash
git checkout -b chore/back-merge-main-$(date +%Y%m%d)
git fetch origin
git merge origin/main --no-ff -m "chore: back-merge main → develop"
git push origin HEAD
gh pr create --title "chore: back-merge main → develop" --base develop --head HEAD \
  --body "Recovery back-merge after release."
```

## Verification post-release

After the stable workflow completes:

```bash
# Check the published version
npm view @focus-mcp/cli version
npm view @focus-mcp/cli dist-tags

# Verify git tag
git fetch --tags origin
git tag --sort=-version:refname | head -5

# Check GitHub Release was created
gh release list --repo focus-mcp/cli --limit 5

# Smoke-test the published package
npx @focus-mcp/cli --version
```

## npm OIDC Trusted Publishing

No `NPM_TOKEN` secret is used. Publishing relies on npm OIDC Trusted Publishing (configured since July 2025). The workflows require `id-token: write` permission and a registered Trusted Publisher on npmjs.com.

See [../RELEASE_OIDC_SETUP.md](../RELEASE_OIDC_SETUP.md) at the root of the `focusmcp` workspace for setup instructions (or the equivalent in the org-level docs).
