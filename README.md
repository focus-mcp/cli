<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# @focus-mcp/cli

> Focus your AI agents on what matters. Reduce context from 200k to ~2k tokens.

[![npm](https://img.shields.io/npm/v/@focus-mcp/cli)](https://www.npmjs.com/package/@focus-mcp/cli)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![CI](https://github.com/focus-mcp/cli/actions/workflows/ci.yml/badge.svg)](https://github.com/focus-mcp/cli/actions/workflows/ci.yml)
![Built with Claude Code](https://img.shields.io/badge/built_with-Claude_Code-8A2BE2)

## What

FocusMCP is an MCP (Model Context Protocol) orchestrator. Instead of giving your AI agent ALL your tools at once — polluting its context window — you compose **bricks**: atomic MCP modules that load on demand.

- **68+ official bricks** covering files, code intel, git, shell, reasoning, search, and more
- **One CLI, one MCP server**, modular capabilities
- Works with **Claude Code, Cursor, Codex, Gemini CLI**, any MCP-compatible AI

## Install

```bash
npm install -g @focus-mcp/cli
```

Or via the **Claude Code native plugin** (one-click setup):

```
/plugin install focus-mcp
```

Requires **Node.js ≥ 22**.

## Quick start

Add FocusMCP as an MCP server in your AI client config:

```json
{
    "mcpServers": {
        "focus": {
            "command": "npx",
            "args": ["-y", "@focus-mcp/cli", "start"]
        }
    }
}
```

For **Claude Code** specifically, this is already wired via the native plugin above.

Then browse and manage bricks:

```bash
focus browse          # Interactive TUI — browse, search, install/uninstall bricks
focus search git      # Search the catalog for bricks matching "git"
focus add echo        # Install the "echo" brick
focus list            # Show all installed bricks
focus info echo       # Show details for a specific brick
```

## Commands

| Command | Description |
|---|---|
| `focus list` | List installed bricks (reads `~/.focus/center.json`) |
| `focus info <name>` | Show details for a brick (version, catalog, config) |
| `focus start` | Launch FocusMCP as an MCP server over stdio |
| `focus add <name>` | Install a brick from the catalog |
| `focus remove <name>` | Uninstall a brick |
| `focus search <query>` | Search the catalog |
| `focus catalog` | Show and manage catalog sources |
| `focus browse` | Interactive TUI browser (see below) |

## Interactive TUI — `focus browse`

`focus browse` opens a full-screen terminal interface to explore, search, and manage bricks without leaving your terminal.

```
┌─ Bricks (68) ────────────────┬─ echo ───────────────────────────────────┐
│ > echo              ✓        │                                          │
│   indexer                    │  A simple echo brick for testing.        │
│   shell                      │                                          │
│   git-log                    │  Version   ^1.0.0                        │
│   web-search                 │  Source    @focus-mcp/echo               │
│   …                          │  Status    installed                     │
│                              │                                          │
│  / search  i install         │  [i] Install   [u] Uninstall             │
│  ↑↓ nav    Enter open        │  [?] Help                                │
└──────────────────────────────┴──────────────────────────────────────────┘
```

**Keybindings:**

| Key | Action |
|---|---|
| `↑` / `↓` | Navigate the brick list |
| `Enter` | Open brick details |
| `/` | Search / filter |
| `i` | Install selected brick |
| `u` | Uninstall selected brick |
| `?` | Toggle help overlay |
| `q` / `Esc` | Quit |

## Architecture

```
AI client (Claude Code, Cursor, Codex, …)
       │ stdio (JSON-RPC / MCP)
       ▼
@focus-mcp/cli  (this package)
  ├─ @modelcontextprotocol/sdk  StdioServerTransport
  ├─ @focus-mcp/core            Registry + EventBus + Router + brick loader
  └─ ~/.focus/center.json       user brick declarations
```

**Bricks** are atomic MCP modules. Each brick exposes exactly one domain of tools to the AI agent. You declare which bricks you want in `~/.focus/center.json`; FocusMCP loads them on demand when `focus start` is called.

**Why not give the agent all tools at once?** Because a 200k-token context window filled with hundreds of tool descriptions leaves very little room for actual work. FocusMCP keeps the agent's context lean — ~2k tokens for the orchestrator itself — and loads domain-specific tools only when needed.

## Links

- **Marketplace**: <https://github.com/focus-mcp/marketplace>
- **Core library**: <https://github.com/focus-mcp/core>
- **Official catalog**: <https://raw.githubusercontent.com/focus-mcp/marketplace/main/publish/catalog.json>
- **Website**: <https://focusmcp.dev>

## AI-assisted development

FocusMCP was built with heavy Claude Code assistance — its architecture, implementation,
docs, and tests have all been co-authored with AI. We embrace this openly because:

1. **Transparency matters** — we'd rather disclose it than pretend otherwise
2. **AI tooling is the context** — we're building tools for AI agents, it makes sense to use them
3. **Quality over origin** — what matters is that the code is tested, reviewed, and working

**Your AI-assisted contributions are welcome.** We don't require you to hide the fact that
Claude, Copilot, Cursor, or any other tool helped you. What we do expect:

- Tests pass, code is typed, lint is green
- You've read the diff and understand what the PR does
- Conventional Commits, clear PR description
- You can explain your design choices during review

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guidelines.

## License

[MIT](./LICENSE)
