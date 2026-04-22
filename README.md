<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# FocusMCP — CLI

> **The primary entry point of FocusMCP.** Spawn MCP over stdio, manage bricks, connect any AI client.
>
> [focusmcp.dev](https://focusmcp.dev) · [PRD](./PRD.md) · [Core](https://github.com/focus-mcp/core) · [Marketplace](https://github.com/focus-mcp/marketplace)

`@focus-mcp/cli` is the fourth pillar of FocusMCP (after `core`, `client` and `marketplace`). It is the **primary, canonical entry point** of FocusMCP — the same binary is invoked by AI clients (Claude Code, Cursor, etc.) to bring FocusMCP's bricks into any MCP-compatible agent.

## Status

Active development — pre-MVP. `focus list` and `focus info` are functional; `focus start` is a stub that will be completed in the next PR (stdio MCP transport). See [PRD.md](./PRD.md).

## Install

```bash
# One-shot
npx @focus-mcp/cli start

# Or install globally
npm install -g @focus-mcp/cli
focus --version
```

Requires Node.js ≥ 22.

## Usage

```bash
focus help            # print help
focus list            # list the bricks declared in ~/.focus/center.json
focus info <name>     # show details for a single brick (requested + resolved version, catalog, config)
focus start           # launch FocusMCP as an MCP server over stdio (attach from an AI client)
```

### Wiring from Claude Code

Add FocusMCP as an MCP server in your Claude Code config:

```json
{
  "mcpServers": {
    "focusmcp": {
      "command": "npx",
      "args": ["-y", "@focus-mcp/cli", "start"]
    }
  }
}
```

The CLI inherits Claude Code's sandbox — stdin/stdout are reserved for the MCP protocol, stderr carries logs.

## Layout

```
src/
  bin/focus.ts         — CLI entry point (shebang, parseArgs dispatch)
  commands/
    list.ts            — `focus list`
    info.ts            — `focus info <name>`
    start.ts           — `focus start` (stub, stdio MCP coming next)
  center.ts            — parsers for ~/.focus/center.json and ~/.focus/center.lock
  index.ts             — programmatic API (empty for now)
config/                — vitest, biome (via root), commitlint, lint-staged, gitleaks
.github/               — CI, release, CodeQL, templates, renovate
```

## Scripts

```bash
pnpm install
pnpm lint              # Biome
pnpm typecheck         # tsc --noEmit
pnpm test              # Vitest
pnpm test:coverage     # Vitest + coverage (≥ 80% gate)
pnpm build             # tsup (dist/index.js + dist/bin/focus.js)
pnpm changeset         # create a changeset before merging
```

## Versioning & publishing

`@focus-mcp/cli` is a single npm package versioned via Changesets. `develop` is the base branch; merging a "Version Packages" PR on `main` triggers `release.yml`, which publishes to npm and creates a GitHub Release (requires the `NPM_TOKEN` repo secret).

## Dependency on `@focus-mcp/core`

`@focus-mcp/core` is referenced as a **git dependency** (`github:focus-mcp/core`) because the monorepo that hosts it does not publish to npm at MVP. Local dev can swap the dep for a workspace link (`pnpm link ../core/packages/core`) — the CLI only uses the public API of `createFocusMcp`.

## License

[MIT](./LICENSE)
