<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# Security Policy

## Supported versions

`@focusmcp/cli` is pre-MVP (`0.x`). No version is yet considered stable — we reserve the right to ship breaking changes in `0.y` releases.

## Reporting a vulnerability

**Do not open a public issue** for a security vulnerability (in the CLI, in an installed brick, or in the MCP wiring).

Send a private report via:

- **[GitHub Security Advisories](https://github.com/focus-mcp/cli/security/advisories/new)** (recommended)
- or by email: security@focusmcp.dev

Please include if possible:

- Affected version of `@focusmcp/cli`
- Description of the issue
- Reproduction steps
- Estimated impact
- Mitigation suggestions

## Our commitment

We commit to:

- **Acknowledge** receipt within 72h
- **Assess** and **prioritize** within 7 days
- **Coordinate** responsible disclosure
- **Credit** the reporter (unless they request otherwise)

## Threat model

The CLI is typically **spawned as a subprocess** of an AI client (Claude Code, Cursor, etc.) and inherits the parent's sandbox. FocusMCP adds three layers on top of the host sandbox:

1. **EventBus guards** (in `@focusmcp/core`) — a brick can only emit / consume events it has declared in its manifest. Mismatches fail fast.
2. **User permissions via `center.json`** — bricks are opt-in. A disabled brick never boots. Per-brick `config` is validated against the brick manifest before being forwarded.
3. **Parent-process sandbox** — Claude Code / Cursor already sandbox stdio MCP servers (limited filesystem + network). The CLI does not try to break out of that sandbox.

## Scope

Our security priorities:

1. **The `focus start` transport** — the stdio JSON-RPC handshake, request validation, and error shape.
2. **`center.json` / `center.lock` parsers** — untrusted JSON from disk; structural validation is our first line of defence.
3. **Brick resolution** — integrity (SRI hash) and source provenance before a brick is loaded by `@focusmcp/core`.
4. **The CI pipeline** — secret scanning, least-privilege workflow permissions, pinned actions.

## Project security practices

- Secret scanning (gitleaks) in pre-commit and CI
- Dependency scanning (Renovate + `pnpm audit`)
- SAST (CodeQL) in CI
- REUSE compliance (explicit licenses)
- Signed commits (GPG/SSH) recommended for maintainers
- npm provenance on publish (`publishConfig.provenance: true`)
