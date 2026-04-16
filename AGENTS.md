<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# AGENTS.md

> Instructions for AI agents working on this repository (Claude Code, Cursor, Codex, Copilot, Gemini CLI, Aider, etc.).
> Format inspired by the emerging [agents.md](https://agentsmd.net/) convention.

## Project

**FocusMCP CLI** — the primary entry point of FocusMCP. Fourth repo of the ecosystem (after `core`, `client` (frozen), `marketplace`). CLI-first pivot: no Tauri app for MVP — any AI client that speaks MCP can consume FocusMCP through this CLI.
Read [PRD.md](./PRD.md) for the complete CLI vision (commands, transport, distribution).

## Stack

- **Node.js ≥ 22** (LTS), **pnpm ≥ 10**, **TypeScript 5.7+** strict
- **ESM only** (`"type": "module"`)
- **Single package** — `@focusmcp/cli` published to npm under the `@focusmcp` scope
- Tests: **Vitest**
- Lint/format: **Biome 2.x**
- Build: **tsup** (ESM, Node 22 target, dts for the programmatic entry only)
- Changesets in **single-package** mode

## File layout

All tool configs live in **`config/`** (vitest, commitlint, lint-staged, gitleaks). The repo root keeps only the strict conventions (README, LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, CHANGELOG, AGENTS, PRD, package.json, tsconfig.json, biome.json, tsup.config.ts, dotfiles).

Source code lives in `src/`:

- `src/bin/focus.ts` — the `focus` binary (shebang, `parseArgs` dispatch)
- `src/commands/<name>.ts` — pure functions, one per subcommand
- `src/center.ts` — parsers for `~/.focus/center.json` and `~/.focus/center.lock`
- `src/index.ts` — programmatic API (re-exports only)

## Non-negotiable rules

1. **Strict TDD** — write the test BEFORE the code (Red → Green → Refactor). Coverage ≥ 80 % global.
2. **No `any`**, no untyped catch, no `!` non-null assertions.
3. **No `console.log` outside `src/bin/` and `src/commands/`.** The Biome override allows console in those two folders (they are the CLI surface); everywhere else, use structured logging via `@focusmcp/core`.
4. **SPDX header** in every source file: `SPDX-FileCopyrightText: 2026 FocusMCP contributors` + `SPDX-License-Identifier: MIT`.
   For JSON files (no comment support), create a sibling `.license` file (REUSE convention).
5. **Imports**: `node:` protocol (`import { parseArgs } from 'node:util'`).
6. **Commits**: [Conventional Commits](https://www.conventionalcommits.org/) — allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
7. **No unsolicited features** — stick strictly to the requested scope.
8. **stdio MCP is the canonical transport.** An HTTP admin API is Phase 2, gated behind an explicit flag; it is not the way AI clients attach.
9. **`@focusmcp/core` is a git dependency** (`github:focus-mcp/core`). Do not try to publish `@focusmcp/core` to npm from this repo.
10. **Pure command functions.** Every `src/commands/<name>.ts` exports a function that takes already-parsed state (or structured input) and returns the string to print — no I/O, no `process.exit`. The binary in `src/bin/focus.ts` is the only layer allowed to touch `process.*`, stdin/stdout, and the filesystem.

## Commands

```bash
pnpm install              # install (frozen lockfile in CI)
pnpm test                 # Vitest
pnpm test:watch           # watch mode
pnpm test:coverage        # coverage + thresholds
pnpm typecheck
pnpm lint                 # Biome check
pnpm lint:fix             # Biome auto-fix
pnpm build                # tsup
pnpm changeset            # create a changeset before merging
```

## CLI-first architecture

```
AI client (Claude Code, Cursor, …)
       │ stdio (JSON-RPC / MCP)
       ▼
@focusmcp/cli (focus start)
  ├─ @modelcontextprotocol/sdk StdioServerTransport
  ├─ @focusmcp/core (createFocusMcp)
  │    Registry + EventBus + Router + bricks
  └─ ~/.focus/center.json + ~/.focus/center.lock
```

`focus start` is the **only** way AI clients attach. Do not add HTTP as the default transport; do not bundle a UI. A separate `cli-manager` (Phase 2) will consume a future admin API if needed.

## Git-flow

- Working branch: **`develop`** (persistent, never deleted).
- Release: PR `develop → main`; `main` triggers `release.yml` (Changesets → npm publish).
- **Never `--delete-branch` on the develop→main PR.**

## Security

- **No secrets** in the code (gitleaks blocks in pre-commit and CI).
- **No `eval`**, no `new Function()`.
- Every external input (center.json, center.lock) is validated structurally before reaching `@focusmcp/core`.

## Git remote

- **origin**: `git@github.com:focus-mcp/cli.git`.

## Documentation to read first

1. [PRD.md](./PRD.md) — vision, commands, roadmap
2. [CONTRIBUTING.md](./CONTRIBUTING.md) — contribution workflow
3. [../core/PRD.md](../core/PRD.md) — how the library the CLI embeds is shaped
4. [../marketplace/PRD.md](../marketplace/PRD.md) — where the catalogue the CLI resolves from comes from
