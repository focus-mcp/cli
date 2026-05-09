---
"@focus-mcp/cli": minor
---

feat(cli): add `focus_init` and `focus_help` MCP tools

Two new MCP tools that improve agent self-discoverability:

- `focus_init` — Detects project stack (TS/JS, Python, Go, Rust, monorepo, generic) and recommends FocusMCP bricks to install. Returns a structured analysis with detected files, recommended bricks (with reasons), install commands, and a next-step hint. Read-only: does not install anything.
- `focus_help` — Returns FocusMCP concepts (brick, catalog, center, namespace, filtering, bootstrap, benchmarks) plus URLs to AGENT_GUIDE and README. Pass a `topic` arg to get a specific concept description.

Both tools are marked `alwaysLoad` so they stay visible to MCP clients that respect the hint.

Backed by new APIs in @focus-mcp/core@1.6.0.

See ADR: decisions/2026-05-09-focus-init-and-help-self-bootstrap.md
