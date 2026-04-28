---
'@focus-mcp/cli': minor
---

Add tool hidden-list to `focus start` — hide specific tools from your AI client without uninstalling bricks.

- `focus start --hide=<patterns>` hides matching tools at launch (comma-separated, glob `*` supported)
- `~/.focus/config.json` `tools.hidden` array for persistent per-session config; CLI arg overrides it
- `focus filter hide/show/list/clear` subcommand to manage the hidden list from the terminal
- `focus_filter` MCP tool lets agents manage the hidden list directly from within the AI client
- `focus_filter` itself is always visible regardless of the hidden list (avoids deadlocks)
