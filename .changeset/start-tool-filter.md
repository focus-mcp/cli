---
'@focus-mcp/cli': minor
---

Add tool visibility management to `focus start` — hide or pin tools without uninstalling bricks.

- `focus start --hide=<patterns>` hides matching tools at launch; `--pin=<patterns>` marks tools as `alwaysLoad`
- `~/.focus/config.json` `tools.hidden` and `tools.alwaysLoad` arrays for persistent config; CLI args override
- `focus config tools hide/show/pin/unpin/list/clear` subcommand to manage visibility from the terminal
- `focus_config` MCP tool lets agents manage their own toolset visibility from within the AI client
- `focus_config` itself is always visible regardless of the hidden list (deadlock protection)
- 5 essential meta tools (`focus_list`, `focus_load`, `focus_search`, `focus_install`, `focus_config`) carry `_meta.anthropic/alwaysLoad: true` by default
