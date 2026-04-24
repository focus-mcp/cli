# @focus-mcp/cli

## 1.3.0

### Minor Changes

- Default catalog URL now points to GitHub Pages CDN (https://focus-mcp.github.io/marketplace/catalog.json) instead of the raw.githubusercontent.com/.../develop URL. The Pages endpoint auto-updates after every stable publish. Users who installed the CLI before this change can migrate with: focus catalog remove <old> && focus catalog add https://focus-mcp.github.io/marketplace/catalog.json.

## 1.2.0

### Minor Changes

- Bump CLI to 1.2.0 to publish PR #38 (brick resolver now handles both flat and npm-nested layouts via require.resolve). The 1.1.0 on npm was published before the fix landed.
