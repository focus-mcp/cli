---
'@focus-mcp/cli': minor
---

Add `tools:` namespace commands (Symfony-style) + rename MCP tool `focus_config` → `focus_tools`.

New canonical command names:
- `focus tools:hide <pattern>` — hide tool (alias: `filter hide`)
- `focus tools:show <pattern>` — unhide tool (alias: `filter show`)
- `focus tools:pin <pattern>` — mark as alwaysLoad
- `focus tools:unpin <pattern>` — remove from alwaysLoad
- `focus tools:list` — show hidden + alwaysLoad lists (alias: `filter list`)
- `focus tools:clear` — reset both lists (alias: `filter clear`)

Also adds `catalog:` namespace aliases:
- `focus catalog:list`, `focus catalog:add`, `focus catalog:remove`

Old flat names (`filter hide`, `filter list`, etc.) remain as permanent aliases — no deprecation, no breaking change.

MCP tool rename: `focus_config` → `focus_tools` (actions: `hide`, `show`, `pin`, `unpin`, `list`, `clear`). `focus_tools` is immune to hidden lists.
