<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# Contributing to the FocusMCP CLI

Thanks for your interest in the FocusMCP CLI. This document describes **how to contribute a change** and the quality rules we enforce.

## AI-assisted contributions

FocusMCP was largely built with Claude Code. We encourage and welcome AI-assisted PRs.

**You don't need to hide it.** If Claude wrote the code, just say so in the PR description
(`Generated with Claude Code`, `Co-authored by GPT-4`, whatever's accurate). Bonus points
for including the prompt or the key instructions you used.

**What we care about, regardless of who wrote it:**

- Tests pass
- Types are strict (no `any`, no `@ts-ignore` without a comment)
- Lint is green (`pnpm lint`)
- Coverage >= 80% (100% on critical modules)
- Commit messages follow Conventional Commits
- PR has a clear description — "what, why, how to verify"
- You understand the diff and can discuss design during review

**What gets you rejected:**

- Obviously untested AI slop (generated code that doesn't run)
- PRs with no description, just "here's some code"
- Hidden AI use that makes review confusing

We don't care if you used AI, we care if the PR is good.

## Code of Conduct

All contributors agree to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Architecture overview

`@focus-mcp/cli` operates in two modes:

- **MCP server mode** (`focus start`) — exposes bricks over JSON-RPC stdio. The CLI wraps `@focus-mcp/core` and injects host adapters (npm, filesystem, http). All AI clients (Claude Code, Cursor, Codex…) connect in this mode.
- **CLI mode** — interactive commands (`focus add`, `focus list`, `focus search`, `focus catalog`, `focus browse`) and the `focus_self_update` mechanism for in-place updates.

The CLI is a thin UI layer. **Business logic belongs in `@focus-mcp/core`**, never in the CLI commands. Commands must stay testable: each `src/commands/<name>.ts` exports a pure function that takes structured input and returns a string.

## Git workflow

```
main       ← stable releases only (never commit directly)
develop    ← integration branch (persistent, never force-delete)
feat/*     ← feature branches, branch FROM develop
fix/*      ← bug fix branches, branch FROM develop
docs/*     ← documentation branches
```

1. **Open an issue** using the "Bug report" or "Feature request" template (or discuss in an existing one).
2. **Branch from `develop`** — never from `main`.
3. **Write the tests first.** We enforce strict TDD (Red → Green → Refactor). A PR without accompanying tests will be sent back.
4. **Open a PR targeting `develop`.** `main` is release-only.
5. **Auto-merge** is enabled: once CI passes and at least one review is approved, the PR merges automatically.
6. **Never force-push** to `develop` or `main`.

> `develop` is the persistent working branch. Never branch from `main` and never delete `develop`.

## Commit conventions

Enforced by commitlint (`config/commitlint.config.js`):

| Rule | Value |
|------|-------|
| Types allowed | `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`, `release` |
| Header max length | 100 characters |
| Body max line length | disabled |
| Footer max line length | disabled |
| Subject case | lowercase (not UPPER, not PascalCase, not Start Case) |

Scope is the command or subsystem: `feat(list): ...`, `fix(start): ...`, `docs(readme): ...`.

## Quality gates

Before opening a PR:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
pnpm reuse               # REUSE compliance (SPDX headers)
```

Never use `--no-verify` to bypass these checks — CI enforces them regardless.

## Non-negotiable rules

1. **Strict TDD** — tests first. Coverage >= 80% global (the `vitest` config enforces this).
2. **No `any`**, no `!` non-null assertion, no untyped `catch`.
3. **No `console.*` outside `src/bin/` and `src/commands/`.** Use structured logging from `@focus-mcp/core` everywhere else.
4. **ESM only**, `node:` protocol for Node built-ins.
5. **SPDX headers** in every source file (`SPDX-FileCopyrightText: 2026 FocusMCP contributors` + `SPDX-License-Identifier: MIT`). For JSON files, add a sibling `.license` file (REUSE convention).
6. **Conventional Commits** — enforced by commitlint (`feat(list): ...`, `fix(info): ...`). Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
7. **npm scope is `@focus-mcp`** (with hyphen). Never write `@focusmcp` in new code, docs, or commit messages.
8. **Pure command functions.** Every `src/commands/<name>.ts` exports a function that takes structured input and returns a string (or throws). Only `src/bin/focus.ts` is allowed to touch `process.*`, stdin/stdout, or the filesystem — this keeps the commands trivially testable.
9. **No scope creep.** Stick to the problem described in the linked issue.
10. **Logic in core, not in CLI.** If a feature requires non-trivial logic, it belongs in `@focus-mcp/core`. The CLI only wires adapters and formats output.

## Common pitfalls

- **`develop` ↔ `main` divergence** — if CI reports that `develop` is behind `main`, wait for the maintainer to run the back-merge workflow. Do not manually merge `main` into your branch.
- **Snapshot drift in tests** — if you change output formatting, run `pnpm test --update-snapshots` and commit the updated snapshots alongside your change.
- **`focus_self_update` side effects** — the self-update command replaces the running binary. Tests for it must not exercise real npm installs; use the fixtures/mock adapters.
- **Namespace clash** — tool names are prefixed with the brick namespace (e.g. `bricks:`). If adding a new brick namespace, ensure it does not conflict with existing tool names.

## Review

Maintainers check:

- problem statement in the linked issue;
- tests match the feature scope;
- code style + typing (lint, typecheck);
- coverage stayed >= 80% after the change;
- docs updated if a user-facing command changed (including `focus browse` TUI if applicable).

## Commit sign-off / DCO

By contributing you certify the [Developer Certificate of Origin](https://developercertificate.org/). Use `git commit --signoff` (`-s`) to add a `Signed-off-by` trailer. Signed commits (GPG/SSH) are strongly recommended.

## Security

Vulnerabilities must be reported **privately** — see [SECURITY.md](./SECURITY.md).

## Release process

See [docs/RELEASE.md](./docs/RELEASE.md) for the full release guide (for maintainers).
