<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# Vision — @focus-mcp/cli

## The problem

AI agents waste context on tools they don't use. Give them 100 tools, they waste tokens parsing schemas for 99 they don't need. From 200k tokens to 2k of what actually matters — that's the goal.

## What we're building

`@focus-mcp/cli` is the primary entry point of FocusMCP: a Node CLI that exposes a stdio MCP server to any AI client (Claude Code, Cursor, Codex, Gemini) and manages **bricks** — atomic MCP modules that load on demand.

## What makes it different

- **One server, many tools** — agents see a single MCP endpoint, but the tools behind it are composed dynamically
- **Marketplace-first** — 68+ official bricks, extensible via third-party catalogs
- **Interactive browser** — `focus browse` TUI to explore, install, and manage bricks without leaving the terminal
- **One-click setup** — native Claude Code plugin (`/plugin install focus-mcp`)

## Principles

1. **Context is precious** — fewer tools in memory, more reasoning power available
2. **Install, don't configure** — bricks are npm packages, the catalog is discoverable
3. **User-first ergonomics** — `focus browse` ≈ `gh`, `lazygit`, ergonomic by default
4. **Open ecosystem** — anyone can publish a brick, host a catalog

## Non-goals

- Not a new MCP protocol — we implement the existing spec
- Not an agent — we focus existing ones
- Not a platform — the CLI is just the orchestrator, logic lives in bricks
