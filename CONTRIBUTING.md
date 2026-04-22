<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# Contributing to the FocusMCP CLI

Thanks for your interest in the FocusMCP CLI. This document describes **how to contribute a change** and the quality rules we enforce.

## Code of Conduct

All contributors agree to follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Workflow

1. **Open an issue** using the "Bug report" or "Feature request" template (or discuss in an existing one).
2. **Branch from `develop`** (`develop` is the persistent working branch — never branch from `main`).
3. **Write the tests first.** We enforce strict TDD (Red → Green → Refactor). A PR without accompanying tests will be sent back.
4. **Open a PR** targeting `develop`. `main` is release-only.
5. The PR must pass **the whole CI**: lint, typecheck, tests (coverage ≥ 80 %), REUSE, gitleaks, build, commitlint.

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

## Non-negotiable rules

1. **Strict TDD** — tests first. Coverage ≥ 80 % global (the `vitest` config enforces this).
2. **No `any`**, no `!` non-null assertion, no untyped `catch`.
3. **No `console.*` outside `src/bin/` and `src/commands/`.** Use structured logging from `@focusmcp/core` everywhere else.
4. **ESM only**, `node:` protocol for Node built-ins.
5. **SPDX headers** in every source file (`SPDX-FileCopyrightText: 2026 FocusMCP contributors` + `SPDX-License-Identifier: MIT`). For JSON files, add a sibling `.license` file (REUSE convention).
6. **Conventional Commits** — enforced by commitlint (`feat(list): ...`, `fix(info): ...`, `docs(readme): ...`). Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
7. **Changeset required** on every PR that changes user-visible behaviour (`pnpm changeset`).
8. **Pure command functions.** Every `src/commands/<name>.ts` exports a function that takes structured input and returns a string (or throws). Only `src/bin/focus.ts` is allowed to touch `process.*`, stdin/stdout, or the filesystem — this keeps the commands trivially testable.
9. **No scope creep.** Stick to the problem described in the linked issue.

## Commit sign-off / DCO

By contributing you certify the [Developer Certificate of Origin](https://developercertificate.org/). Use `git commit --signoff` (`-s`) to add a `Signed-off-by` trailer. Signed commits (GPG/SSH) are strongly recommended.

## Review

Maintainers check:

- problem statement in the linked issue;
- tests match the feature scope;
- code style + typing (lint, typecheck);
- coverage stayed ≥ 80 % after the change;
- docs updated if a user-facing command changed.

## Security

Vulnerabilities must be reported **privately** — see [SECURITY.md](./SECURITY.md).
