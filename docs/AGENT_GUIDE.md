<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# FocusMCP — Agent Bootstrap Guide

You are an AI agent with access to FocusMCP via MCP. FocusMCP is a marketplace of **bricks** — atomic capability modules you can install, search, and pin to your toolset. It solves context pollution: instead of 200+ tools loaded at once, you load only what you need.

## In 30 seconds

```
1. Detect the project stack (read package.json / pyproject.toml / go.mod / etc.)
2. focus_bricks_search query="<framework>"  — find relevant bricks
3. focus_bricks_install name="<brick>"      — install the useful ones
4. focus_tools_pin pattern="<tool>"         — surface frequently-used tools to top
5. focus_check_updates                      — stay current
```

---

## Bootstrap workflow (detailed)

### Step 1 — Detect the stack

Read the project manifest before installing anything:

```
# Node / JS / TS
read package.json  →  look at "dependencies", "devDependencies", scripts

# Python
read pyproject.toml or requirements.txt

# Go
read go.mod

# PHP
read composer.json

# Rust
read Cargo.toml
```

### Step 2 — Search for relevant bricks

```
focus_bricks_search query="typescript"
focus_bricks_search query="git"
focus_bricks_search query="refactoring"
```

The search returns brick names, descriptions, and tags from the official catalog (68 bricks).

### Step 3 — Install the ones you need

```
focus_bricks_install name="codebase"
focus_bricks_install name="shell"
focus_bricks_install name="filesystem"
```

Each brick installs to `~/.focus/bricks/` via npm — fast on warm npm cache, but requires network access on first install. No additional local build step is required.

### Step 4 — Verify what is loaded

```
focus_bricks_list
```

Returns the list of bricks currently **loaded** in the running MCP server and their status/tools. It does not list bricks installed on disk but not yet loaded. To list all installed bricks, use the terminal command `focus list`.

### Step 5 — Load bricks into the active session

Installed bricks are not automatically active. Load them:

```
focus_bricks_load name="codebase"
focus_bricks_load name="shell"
```

To reload a single loaded brick (stop, reimport from disk, restart):

```
focus_bricks_reload name="codebase"
```

Note: `focus_bricks_reload` requires a `name=` argument and operates on one brick at a time. To reload multiple bricks, call it once per brick.

### Step 6 — Pin the tools you use most

```
focus_tools_pin pattern="sym_find"
focus_tools_pin pattern="ts_index"
focus_tools_list
```

Pinned tools are surfaced via the MCP tool descriptor `_meta` field as `_meta["anthropic/alwaysLoad"]: true` — MCP clients that support this hint (e.g. Claude Code) keep these tools always loaded.

---

## Decision tree by stack

Use this table to pick bricks quickly. Install the composite brick first; it bundles the listed atomics.

### TypeScript / Node.js project

| Goal | Brick(s) |
|---|---|
| Understand the codebase | `codebase` (bundles: treesitter, symbol, outline, callgraph, depgraph, refs) |
| Run scripts / commands | `devtools` (bundles: shell, sandbox, batch) |
| Refactor symbols | `codemod` (bundles: symbol, rename, codeedit, inline, textsearch) |
| File operations | `filesystem` (bundles: fileread, filewrite, filelist, fileops, filesearch) |
| Validate types / lint | `validate` |
| Check API routes | `routes` |
| Search across files | `fts` or `semanticsearch` |

Suggested starter set:
```
focus_bricks_install name="codebase"
focus_bricks_install name="devtools"
focus_bricks_install name="filesystem"
```

### Python project (FastAPI / Django / Flask)

| Goal | Brick(s) |
|---|---|
| Understand structure | `overview`, `outline` |
| Navigate symbols | `symbol`, `refs` |
| Search code | `textsearch`, `fts` |
| File ops | `filesystem` |
| Run commands | `shell` |
| Audit security | `fullaudit` |

Suggested starter set:
```
focus_bricks_install name="overview"
focus_bricks_install name="filesystem"
focus_bricks_install name="shell"
focus_bricks_install name="symbol"
```

### Go project

| Goal | Brick(s) |
|---|---|
| Code navigation | `symbol`, `refs`, `outline` |
| Dependency analysis | `depgraph` |
| File operations | `filesystem` |
| Shell / build | `shell` |
| Search | `textsearch` |

### Rust project

| Goal | Brick(s) |
|---|---|
| Code structure | `outline`, `symbol` |
| Build / test | `shell` |
| File ops | `filesystem` |
| Search | `fts` |

### PHP / Symfony project

| Goal | Brick(s) |
|---|---|
| Route mapping | `routes` |
| Symbol navigation | `symbol`, `refs` |
| File operations | `filesystem` |
| Search | `textsearch` |
| Shell | `shell` |

### Multi-repo / monorepo

| Goal | Brick(s) |
|---|---|
| Register repos | `repos` |
| Cross-repo search | `fts`, `semanticsearch` |
| Impact analysis | `impact` |
| Graph of dependencies | `graphbuild`, `graphquery` |
| Parallel work | `parallel` |

### New / unfamiliar codebase (any stack)

```
focus_bricks_install name="onboarding"
focus_bricks_install name="overview"
focus_bricks_install name="codebase"
```

Run `onb_scan` first — it auto-discovers structure, conventions, and key files.

---

## Common workflows

### Understanding an unfamiliar repo

Bricks: `onboarding`, `overview`, `codebase`

```
onb_scan dir="/path/to/project"
ovw_project dir="/path/to/project"
sr_map dir="/path/to/project"          # from codebase → outline
```

These three tools give you architecture, conventions, and symbol map without reading every file.

### Refactoring a codebase

Bricks: `codemod` (includes codeedit, rename, inline, symbol, textsearch)

```
sym_find name="OldClassName" dir="."
ren_preview old="OldClassName" new="NewClassName" dir="."
ren_symbol  old="OldClassName" new="NewClassName" dir="."
ce_replacebody symbol="myFunction" body="..." file="src/foo.ts"
```

Use `ren_preview` before any rename to see what would change.

### Searching across files

Bricks: `fts`, `semanticsearch`, `textsearch`

```
# Full-text, TF-IDF ranked:
fts_index  dir="."
fts_search query="authentication middleware"

# Semantic / intent-based:
sem_search query="where tokens are validated" dir="."

# Raw regex:
txt_search pattern="TODO|FIXME" dir="src/"
```

### Analyzing dependencies

Bricks: `codebase` (depgraph, callgraph)

```
dep_imports  file="src/auth.ts"
dep_circular dir="."
cg_callers   symbol="verifyToken" file="src/auth.ts"
cg_chain     from="login" to="generateJwt" dir="."
```

### Running automated refactoring

Bricks: `codemod`, `impact`

```
imp_analyze  file="src/utils/logger.ts"   # who depends on this?
imp_affected symbol="logError" file="src/utils/logger.ts"
# Then apply changes with codeedit / rename tools
```

---

## Tools menu hygiene

When you have 200+ tools available, context overload is a real risk. FocusMCP provides:

```
focus_tools_hide   pattern="focus_*"     # hide FocusMCP management tools when not needed
focus_tools_hide   pattern="sym_body"    # hide rarely-used tool
focus_tools_pin    pattern="sym_find"    # pin frequently-used tool (alwaysLoad)
focus_tools_list                         # see current state: hidden + pinned
focus_tools_show   pattern="sym_body"    # un-hide a tool
focus_tools_unpin  pattern="sym_find"    # remove from pinned
focus_tools_clear                        # reset everything
```

**Practical rule:** start a session with only the bricks you plan to use. Load more on demand with `focus_bricks_load`. Unload what you no longer need:

```
focus_bricks_unload name="codebase"
```

---

## Catalog management

By default FocusMCP uses the official catalog at `https://raw.githubusercontent.com/focus-mcp/marketplace/main/publish/catalog.json`.

You can add private or third-party catalogs:

```
focus_catalog_add    url="https://example.com/my-catalog.json"
focus_catalog_list
focus_catalog_remove url="https://example.com/my-catalog.json"
```

---

## Updates

```
focus_check_updates              # show which bricks and CLI have updates
focus_bricks_update brick="codebase"   # update a specific brick
focus_bricks_update              # update all installed bricks (omit brick= to update all)
focus_self_update                # update the CLI itself
```

---

## What FocusMCP is NOT

- Not an agent itself — it provides tools, not reasoning
- Not a code generator — bricks expose operations, you decide what to do with them
- Not a replacement for built-in tools (`Read`, `Edit`, `Bash`, etc.) — bricks complement them
- Not a universal solution — if a built-in tool does the job, use it

---

## Self-help

```bash
# From the terminal:
focus doctor            # full diagnostic (checks installs, config, catalog reachability)
focus list              # show installed bricks
focus info <name>       # details for a brick
```

```
# From MCP (within your AI client session):
focus_check_updates     # bricks + CLI update status
focus_bricks_list       # loaded bricks + status/tools (use `focus list` in terminal for installed)
focus_bricks_search query="<topic>"   # search catalog
```

Catalog dashboard: <https://focus-mcp.github.io/marketplace/dashboard/>

---

## See also

- CLI README: <https://github.com/focus-mcp/cli>
- Marketplace: <https://github.com/focus-mcp/marketplace>
- Issue tracker: <https://github.com/focus-mcp/cli/issues>
- Official catalog: <https://raw.githubusercontent.com/focus-mcp/marketplace/main/publish/catalog.json>
