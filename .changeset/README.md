<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# Changesets

This folder holds the FocusMCP CLI changesets. Every PR that changes user-facing behaviour must add a changeset via `pnpm changeset`.

- Mode: **single package** — `@focus-mcp/cli` is published as one npm package.
- `access: public` — published to the public npm registry on the `@focus-mcp/` scope.
- `baseBranch: develop` — changesets are opened against `develop` and promoted to `main` at release time.

Format: Markdown with frontmatter listing the package + bump level (patch / minor / major).

Reference: https://github.com/changesets/changesets
