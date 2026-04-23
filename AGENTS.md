<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# AGENTS.md

> This file is the **single source of truth for AI agent behavior** on this project.
> It follows the [agents.md](https://agents.md) standard and is read by Claude Code,
> Cursor, Aider, GitHub Copilot, and any other AI coding tool.
>
> Humans, this file is for you too — it documents our conventions and expectations.

## Project

**FocusMCP CLI** — the primary entry point of FocusMCP. Published as `@focus-mcp/cli` on npm.
This repo is the **primary entry point**: a Node CLI that embeds `@focus-mcp/core` and speaks **stdio MCP** (via `@modelcontextprotocol/sdk`) to AI clients (Claude Code, Cursor, Codex, Gemini CLI…).
Read [VISION.md](./VISION.md) for the complete CLI vision (commands, transport, distribution).

## Ecosystem

| Repo | Status | Role |
|---|---|---|
| `focus-mcp/core` | active | TS monorepo lib — 3 pillars (Registry/EventBus/Router) + SDK/Validator/Marketplace resolver. Consumed via `file:../core/packages/core`. |
| `focus-mcp/cli` (here) | active | `@focus-mcp/cli` — stdio MCP, brick manager (`focus list/info/add/remove/search/catalog/browse`). Published on npm. |
| `focus-mcp/marketplace` | active | Official catalog + `bricks/*` + `modules/*`. |
| `focus-mcp/client` | **archived** | Former Tauri desktop app, frozen after CLI-first pivot. |

## CLI-first architecture

```
AI client (Claude Code, Cursor, Codex, Gemini…)
       │ stdio (JSON-RPC / MCP)
       ▼
@focus-mcp/cli (focus start)
  ├─ @modelcontextprotocol/sdk StdioServerTransport
  ├─ @focus-mcp/core (createFocusMcp)
  │    Registry + EventBus + Router + bricks
  └─ ~/.focus/center.json + ~/.focus/center.lock
```

`focus start` is the **only** way AI clients attach. Do not add HTTP as the default transport; do not bundle a UI. A separate `cli-manager` (Phase 2) will consume a future admin API if needed.

**Distribution**: `npm install -g @focus-mcp/cli` or `npx @focus-mcp/cli start`.

## Claude Code native plugin

The repo ships a native Claude Code plugin in `.claude-plugin/plugin.json` (v1.1.0):

```json
{
    "mcpServers": {
        "focus": {
            "command": "npx",
            "args": ["-y", "@focus-mcp/cli@latest", "start"]
        }
    }
}
```

Install in one command: `/plugin install focus-mcp`.

## Stack

- **Node.js ≥ 22** (LTS), **pnpm ≥ 10**, **TypeScript 5.7+** strict
- **ESM only** (`"type": "module"`)
- **Single package** — `@focus-mcp/cli` published to npm under the `@focus-mcp` scope
- Tests: **Vitest** (coverage target: 100%; minimum absolute: 80%)
- Lint/format: **Biome 2.x**
- Build: **tsup** (ESM, Node 22 target, dts for the programmatic entry only)
- TUI: **ink** (React-based terminal UI for `focus browse`)

## File layout

All tool configs live in **`config/`** (vitest, commitlint, lint-staged, gitleaks). The repo root keeps only the strict conventions (README, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, CHANGELOG, AGENTS, PRD, package.json, tsconfig.json, biome.json, tsup.config.ts, dotfiles).

Source code lives in `src/`:

- `src/bin/focus.ts` — the `focus` binary (shebang, `parseArgs` dispatch)
- `src/commands/<name>.ts` — pure functions, one per subcommand
- `src/commands/browse/` — interactive TUI (`focus browse`) built with ink
- `src/center.ts` — parsers for `~/.focus/center.json` and `~/.focus/center.lock`
- `src/index.ts` — programmatic API (re-exports only)

The Claude Code native plugin lives in `.claude-plugin/plugin.json` — it wires `focus start` as an MCP server automatically when installed via `/plugin install focus-mcp`.

## CLI commands (v1.1.0 — all implemented)

- `focus list` — list installed bricks (reads `~/.focus/center.json` + `center.lock`)
- `focus info <name>` — details for a brick
- `focus start` — launch stdio MCP via `@modelcontextprotocol/sdk`
- `focus add <name>` — install a brick from the catalog (npm)
- `focus remove <name>` — uninstall a brick
- `focus search <query>` — search the catalog
- `focus catalog` — display/manage catalog sources
- `focus browse` — **interactive TUI** (ink + React) — split left/right panel, help overlay (`?`), keyboard navigation, search `/`, install `i`, uninstall `u`

## Infrastructure adapters

```
focus add <name>
  ├─ http-fetch-adapter      → catalog.json (remote source URL)
  ├─ catalog-store-adapter   → local cache + brick resolution (~/.focus/)
  └─ npm-installer-adapter   → npm install @focus-mcp/<name>
```

## Critical dependency: `@focus-mcp/core`

`@focus-mcp/core` is consumed via `file:../core/packages/core`. This means:

- **Local dev**: `focus-mcp/core` must be cloned as a sibling of this repo (`../core`).
- **CI**: composite action `.github/actions/setup` clones core, builds it, then installs this repo.
- **npm publish**: `tsup --noExternal '@focus-mcp/core'` bundles core into dist — end users only install `@focus-mcp/cli`.

## Non-negotiable rules

1. **Strict TDD** — write the test BEFORE the code (Red → Green → Refactor). Coverage ≥ 80% global (target: 100%).
2. **No `any`**, no untyped catch, no `!` non-null assertions.
3. **No `console.log` outside `src/bin/` and `src/commands/`.** The Biome override allows console in those two folders (they are the CLI surface); everywhere else, use structured logging via `@focus-mcp/core`.
4. **SPDX header** in every source file: `SPDX-FileCopyrightText: 2026 FocusMCP contributors` + `SPDX-License-Identifier: MIT`.
   For JSON files (no comment support), create a sibling `.license` file (REUSE convention).
5. **Imports**: `node:` protocol (`import { parseArgs } from 'node:util'`).
6. **Commits**: [Conventional Commits](https://www.conventionalcommits.org/) — allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
7. **No unsolicited features** — stick strictly to the requested scope.
8. **stdio MCP is the canonical transport.** An HTTP admin API is Phase 2, gated behind an explicit flag; it is not the way AI clients attach.
9. **`@focus-mcp/core` is a file dependency** (`file:../core/packages/core`). Do not try to publish `@focus-mcp/core` to npm from this repo. It is bundled into the CLI dist via `tsup --noExternal`.
10. **Pure command functions.** Every `src/commands/<name>.ts` exports a function that takes already-parsed state (or structured input) and returns the string to print — no I/O, no `process.exit`. The binary in `src/bin/focus.ts` is the only layer allowed to touch `process.*`, stdin/stdout, and the filesystem.
11. **npm scope is `@focus-mcp`** (with hyphen). Never write `@focusmcp` (no hyphen) in new code or docs.
12. **No dynamic code evaluation** — no `eval`, no dynamic `Function` constructor, no `vm.runInContext` unless absolutely unavoidable and reviewed.

## GitHub Rulesets

Every active repo in the FocusMCP org has two rulesets — do not modify without discussion:

- **`main protection`** — targets `refs/heads/main` ONLY: `required_status_checks`, `pull_request`, `code_scanning` (CodeQL), `code_quality`, `required_linear_history`, `deletion`, `non_fast_forward`. **No `required_signatures`** (AI-assisted commits are not signed).
- **`develop protection`** — targets `refs/heads/develop` ONLY: `deletion`, `non_fast_forward`, `required_linear_history`, `pull_request` (no `code_quality` — this check is not available on non-default branches).
- **Known pitfall**: NEVER include `develop` in the targets of "main protection".

## Commands

```bash
pnpm install              # install (frozen lockfile in CI)
pnpm test                 # Vitest
pnpm test:watch           # watch mode
pnpm test:coverage        # coverage + thresholds
pnpm typecheck
pnpm lint                 # Biome check
pnpm lint:fix             # Biome auto-fix
pnpm build                # tsup → dist/bin/focus.js + dist/index.js
```

## Workflow for adding a feature

1. Read [VISION.md](./VISION.md) and this file
2. Feature branch from `develop`
3. Red → Green → Refactor
4. `pnpm test:coverage && pnpm typecheck && pnpm lint`
5. Conventional Commits
6. PR to `develop` — resolve all review threads before merge

## Publishing

Two workflows, no GitHub Packages:

| Workflow | Trigger | Tag | Target |
|---|---|---|---|
| `dev-publish.yml` | push to `develop` | `dev` | npmjs.org |
| `stable-publish.yml` | push to `main` | `latest` | npmjs.org |

Both require the `NPM_TOKEN` repo secret. No Changesets "Version Packages" PR is used.
To release: bump the version in `package.json` on `develop`, then merge to `main`.

## Security

- **No secrets** in the code (gitleaks blocks in pre-commit and CI).
- **No dynamic code evaluation** (see rule 12 above).
- Every external input (center.json, center.lock) is validated structurally before reaching `@focus-mcp/core`.
- The OS sandbox comes from the parent process (Claude Code spawns the CLI via stdio).
- EventBus guards (security layer 1) are intact, provided by `@focus-mcp/core`.
- For running unreviewed bricks: add `isolated-vm` in Phase 2 (not in MVP).

## Git-flow

- **origin**: `git@github.com:focus-mcp/cli.git`.
- Working branch: **`develop`** (persistent, never deleted).
- Release: PR `develop → main`; `main` triggers `stable-publish.yml` (npm publish with `latest` tag).
- Dev snapshots: every push to `develop` triggers `dev-publish.yml` (npm publish with `dev` tag).
- **Never `--delete-branch` on the develop→main PR.**

## Documentation to read first

1. [VISION.md](./VISION.md) — CLI vision and principles
2. [CONTRIBUTING.md](./CONTRIBUTING.md) — contribution workflow
3. [../core/VISION.md](../core/VISION.md) — how the library the CLI embeds is shaped
4. [../marketplace/VISION.md](../marketplace/VISION.md) — where the catalogue the CLI resolves from comes from
