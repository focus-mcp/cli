---
"@focus-mcp/cli": minor
---

feat(cli): expose keywords and recommendedFor in focus_search MCP tool

The focus_search tool now returns a structured JSON block alongside the
formatted table, including keywords and recommendedFor per brick when
present. SearchCommandResult gains a bricks field for downstream use.
Full enrichment requires @focus-mcp/core >= 1.5.0 once released.
