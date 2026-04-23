<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# Architecture — @focus-mcp/cli

## Overview

`@focus-mcp/cli` is the primary Node CLI. It wraps `@focus-mcp/core`, adds I/O adapters for
filesystem/npm/http, and exposes an MCP stdio server + an interactive TUI.

```
AI client (Claude Code, Cursor, Codex, Gemini…)
       │ JSON-RPC over stdio
       ▼
@focus-mcp/cli
  ├─ @modelcontextprotocol/sdk StdioServerTransport
  ├─ @focus-mcp/core (bundled via tsup)
  │    ├─ Registry, EventBus, Router
  │    └─ Loader, Marketplace resolver
  ├─ Adapters (inject host I/O)
  │    ├─ catalog-store-adapter → ~/.focus/catalogs.json
  │    ├─ http-fetch-adapter   → global fetch()
  │    └─ npm-installer-adapter → child_process spawn
  ├─ Commands (CLI surface)
  │    ├─ list, info, add, remove, search, catalog
  │    ├─ start (MCP server)
  │    └─ browse (interactive TUI)
  └─ TUI (ink + React)
       ├─ Screens (Catalogs, Bricks, BrickDetails)
       ├─ Hooks (useCatalogs, useBricks, useInstalled)
       └─ Components (List, Breadcrumb, StatusBar, …)
```

## Directory layout

```
src/
├── bin/focus.ts              ← entry point, argv dispatch
├── commands/                 ← one file per subcommand
│   ├── list.ts, info.ts, add.ts, remove.ts
│   ├── search.ts, catalog.ts, start.ts, browse.ts
├── adapters/                 ← I/O implementations
│   ├── catalog-store-adapter.ts
│   ├── http-fetch-adapter.ts
│   └── npm-installer-adapter.ts
├── tui/                      ← ink React app
│   ├── App.tsx, screens/, components/, hooks/
└── center.ts                 ← ~/.focus/center.json state
```

## Key flows

### `focus start` — MCP server

1. Read `~/.focus/center.json` to know which bricks are enabled
2. Load each brick via `@focus-mcp/core` loader
3. Wrap `@modelcontextprotocol/sdk` StdioServerTransport
4. Route `tools/list` / `tools/call` through the core Router
5. Block until SIGINT/SIGTERM

### `focus add <name>`

1. Fetch enabled catalogs in parallel (`fetchAllCatalogs`)
2. Aggregate and find the brick (`findBrickAcrossCatalogs`)
3. Plan npm install (`planInstall`)
4. Execute: `npm install --prefix ~/.focus/bricks @focus-mcp/brick-<name>@version`
5. Update `center.json` and `center.lock`

### `focus browse` — Interactive TUI

1. Render ink app (`App.tsx`) that routes between 3 screens
2. Each screen uses hooks to fetch data via `@focus-mcp/core` functions
3. Install/uninstall actions call the same `add`/`remove` command pipeline

## Publish & distribution

- Node 22+, TypeScript 5.7+ strict, ESM only
- `@focus-mcp/core` consumed as `file:../core/packages/core` (sibling clone)
- `tsup --noExternal '@focus-mcp/core'` bundles core into dist
- End users only install `@focus-mcp/cli`, no peer-dep management

## Testing

Vitest with mocked I/O adapters. 100% coverage on commands and center state parsers.
