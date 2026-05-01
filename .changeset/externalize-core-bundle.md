---
"@focus-mcp/cli": minor
---

Externalize @focus-mcp/core from the cli bundle.

Going forward, @focus-mcp/core is a runtime npm dependency of the cli (listed in `dependencies`), allowing it to be updated independently (`npm install -g @focus-mcp/core@latest`) without re-releasing the cli.

Adds a boot-time version compatibility check in `bin/focus.ts` that exits with a clear message if an incompatible @focus-mcp/core version is detected. Also adds a non-fatal warning in `commands/start.ts` (MCP server entry) that logs to stderr without crashing the running server.

This unblocks future consumers of @focus-mcp/core (Tauri client, web dashboard, IDE plugins, bricks) that depend on core directly without going through the cli bundle.
