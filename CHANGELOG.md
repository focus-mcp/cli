# @focus-mcp/cli

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
