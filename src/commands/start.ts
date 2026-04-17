// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * `focus start` — launches FocusMCP as a stdio MCP server.
 *
 * Stub implementation. The real implementation will:
 *
 *   1. Read `~/.focus/center.json` + `~/.focus/center.lock` via the parsers
 *      in `../center.ts`.
 *   2. Call `createFocusMcp()` from `@focusmcp/core` with the resolved brick
 *      list, the EventBus guards, and user permissions.
 *   3. Wire the returned router to a `StdioServerTransport` from
 *      `@modelcontextprotocol/sdk/server/stdio.js` so every `tools/*`,
 *      `resources/*`, and `prompts/*` JSON-RPC call lands on the router.
 *   4. Stream logs to stderr (stdout is reserved for the MCP transport).
 *   5. Handle SIGINT/SIGTERM to flush EventBus subscribers before exit.
 *
 * Until then the command fails explicitly so nobody mistakes the scaffolding
 * for a working server.
 */
export async function startCommand(): Promise<void> {
    throw new Error(
        'focus start not implemented yet — stdio MCP transport will land in the next PR',
    );
}
