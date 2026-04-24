---
'@focus-mcp/cli': minor
---

fix(cli): unify center.lock parser, add --force for catalog remove, schema versioning

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
