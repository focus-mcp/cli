---
"@focus-mcp/cli": patch
---

fix(cli): support Windows for `bricks:install` and brick load

- `spawn('npm', ...)` now uses `shell: process.platform === 'win32'` to resolve `npm.cmd` on Windows (was failing with `ENOENT`)
- `assertWithinBricksDir()` now uses `path.relative()` instead of fragile string `startsWith` to handle Windows path separators (was rejecting valid paths inside bricksDir on Windows)

Fixes Windows users on nvm4w + Codex MCP and similar setups.
