# @focus-mcp/cli

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
