# @focus-mcp/cli

## 2.3.0

### Minor Changes

- 3c20842: Externalize @focus-mcp/core from the cli bundle.

  Going forward, @focus-mcp/core is a runtime npm dependency of the cli (listed in `dependencies`), allowing it to be updated independently (`npm install -g @focus-mcp/core@latest`) without re-releasing the cli.

  Adds a boot-time version compatibility check in `bin/focus.ts` that exits with a clear message if an incompatible @focus-mcp/core version is detected. Also adds a non-fatal warning in `commands/start.ts` (MCP server entry) that logs to stderr without crashing the running server.

  This unblocks future consumers of @focus-mcp/core (Tauri client, web dashboard, IDE plugins, bricks) that depend on core directly without going through the cli bundle.

## 2.2.1

### Patch Changes

- e5cb4d9: chore(release): bump cli after stable-publish dist-tag fix + ensure @latest sync after release

## 2.2.0

### Minor Changes

- 01ef020: feat(cli): expose keywords and recommendedFor in focus_search MCP tool

  The focus_search tool now returns a structured JSON block alongside the
  formatted table, including keywords and recommendedFor per brick when
  present. SearchCommandResult gains a bricks field for downstream use.
  Full enrichment requires @focus-mcp/core >= 1.5.0 once released.

## 2.1.0

### Minor Changes

- 422cb46: feat(cli): update notifier — warns when new cli or brick version is available

## 2.0.0

### Major Changes

**BREAKING CHANGES — Migration required for existing users.**

#### MCP tools renamed to `focus_<namespace>_<action>` pattern

| Before (1.9.0)                              | After (2.0.0)                       |
| ------------------------------------------- | ----------------------------------- |
| `focus_install`                             | `focus_bricks_install`              |
| `focus_remove`                              | `focus_bricks_remove`               |
| `focus_search`                              | `focus_bricks_search`               |
| `focus_load`                                | `focus_bricks_load`                 |
| `focus_unload`                              | `focus_bricks_unload`               |
| `focus_reload`                              | `focus_bricks_reload`               |
| `focus_update`                              | `focus_bricks_update`               |
| `focus_upgrade`                             | removed (use `focus_bricks_update`) |
| `focus_tools` (singleton with `action` arg) | split into 6 distinct tools         |
| _(new)_                                     | `focus_self_update`                 |

The 6 new tools replacing `focus_tools`: `focus_tools_hide`, `focus_tools_show`, `focus_tools_pin`, `focus_tools_unpin`, `focus_tools_list`, `focus_tools_clear`.

`focus_catalog_add`, `focus_catalog_list`, `focus_catalog_remove` are unchanged.

#### `focus update` / `focus upgrade` now self-update the CLI

- `focus update` / `focus upgrade` → self-update the CLI
- `focus update --all` → self-update CLI + all installed bricks
- `focus update <name>` → **ERROR** (use `focus bricks:update <name>`)
- `focus bricks:update [name] [--all] [--check]` → update brick(s)

#### New `bricks:` namespace

`focus bricks:install`, `focus bricks:remove`, `focus bricks:list`,
`focus bricks:search`, `focus bricks:update`, `focus bricks:load`, `focus bricks:unload`.

Flat aliases (`add`, `remove`, `list`, `search`) remain as permanent back-compat.

#### Migration

- Update MCP tool names in AI client configs (`focus_install` → `focus_bricks_install`, etc.)
- Replace `focus_tools { action: "hide", pattern: "..." }` with `focus_tools_hide { pattern: "..." }`
- Replace `focus update <brick>` with `focus bricks:update <brick>`

### Patch Changes

- e45c4b1: chore(ci): auto-tag and create GitHub Release on stable publish

## 1.9.0

### Minor Changes

- 205453e: Add tool visibility management to `focus start` — hide or pin tools without uninstalling bricks.

  - `focus start --hide=<patterns>` hides matching tools at launch; `--pin=<patterns>` marks tools as `alwaysLoad`
  - `~/.focus/config.json` `tools.hidden` and `tools.alwaysLoad` arrays for persistent config; CLI args override
  - `focus config tools hide/show/pin/unpin/list/clear` subcommand to manage visibility from the terminal
  - `focus_config` MCP tool lets agents manage their own toolset visibility from within the AI client
  - `focus_config` itself is always visible regardless of the hidden list (deadlock protection)
  - 5 essential meta tools (`focus_list`, `focus_load`, `focus_search`, `focus_install`, `focus_config`) carry `_meta.anthropic/alwaysLoad: true` by default

- e13e2b5: Add `tools:` namespace commands (Symfony-style) + rename MCP tool `focus_config` → `focus_tools`.

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

## 1.8.1

### Patch Changes

- 9d82945: feat(cli): FOCUS_BENCH_MODE env var skips meta tools (focus_list, focus_install, etc.) for benchmark isolation. Default behavior unchanged.

## 1.8.0

### Minor Changes

- DX improvements:
  - `focus add --force`/`-f` overwrites existing/corrupted installs
  - `focus reinstall <X> [Y Z ...]` — fast recovery from corrupted state
  - Bundle bricks (tools=0, deps>0) now cascade-install their deps (verifies 1.5.0 coverage)
  - `focus doctor --fix` auto-remediates corrupted installs and missing deps
  - `focus start` "Missing dependency" error now suggests actionable commands

## 1.7.0

### Minor Changes

- Add `focus upgrade <name>` and `focus upgrade --all` to refresh installed bricks to the latest catalog version. Also accepts `--check` for dry-run.

## 1.6.0

### Minor Changes

- Publish `focus doctor` command (merged in 1.5.x without a changeset/bump). Also ships bulk-args + auto-install-deps that were in 1.5.0.

## 1.5.0

### Minor Changes

- feat(cli): bulk install/remove + automatic dependency resolution.
  - `focus add X Y Z` now installs multiple bricks in one command.
  - `focus remove X Y Z` likewise.
  - `focus add X` auto-installs deps declared in X's mcp-brick.json (cascades transitively, skips already-installed, detects circularity).

## 1.4.0

### Minor Changes

- 3d1bbcb: fix(cli): unify center.lock parser, add --force for catalog remove, schema versioning

  - **Bug 1 (critical)**: `parseCenterLock` in `center.ts` now accepts both the
    on-disk wrapper format `{ bricks: {...} }` written by `focus add`/`focus remove`
    and the legacy flat format for backward compatibility. Previously `focus list`
    crashed with "missing resolved version" after any `focus add` because the two
    parsers were incompatible.

  - **Bug 2**: `focus catalog remove <url> --force` now bypasses the default-source
    protection. Without `--force` the existing error is preserved. Updated
    `removeSource` in `@focus-mcp/core` to accept an optional `force` option.

  - **Bug 3**: `writeCenterJson`/`writeCenterLock` in the adapter now emit a
    top-level `"version": "1"` field (schema versioning groundwork). Both parsers
    accept files with or without this field for backward compatibility.

## 1.3.0

### Minor Changes

- Default catalog URL now points to GitHub Pages CDN (https://focus-mcp.github.io/marketplace/catalog.json) instead of the raw.githubusercontent.com/.../develop URL. The Pages endpoint auto-updates after every stable publish. Users who installed the CLI before this change can migrate with: focus catalog remove <old> && focus catalog add https://focus-mcp.github.io/marketplace/catalog.json.

## 1.2.0

### Minor Changes

- Bump CLI to 1.2.0 to publish PR #38 (brick resolver now handles both flat and npm-nested layouts via require.resolve). The 1.1.0 on npm was published before the fix landed.
