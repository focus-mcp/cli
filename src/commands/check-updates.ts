// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * check-updates — wraps core.checkForUpdates for the CLI and MCP server.
 *
 * Provides:
 *   - `runUpdateCheck()` : fire-and-forget warning on stderr for `focus` CLI
 *   - `checkUpdatesCommand()` : pure-output version for the `focus_check_updates` MCP tool
 */

// NOTE: UpdateCheckResult and checkForUpdates are exported from @focus-mcp/core ^1.4.0.
// This file requires core 1.4.0 (feat/update-checker PR). The types below
// will be imported from core once that version is released.
import type { UpdateCheckResult } from '@focus-mcp/core';
import { checkForUpdates } from '@focus-mcp/core';

// ---------- skip conditions ----------

const UPDATE_COMMANDS = new Set(['update', 'upgrade', 'self-update']);

/**
 * Returns true when the update-check warning should be skipped.
 *
 * Skip when:
 *   1. FOCUS_NO_UPDATE_NOTIFY=1 is set
 *   2. --no-update-check flag is present
 *   3. stdout is not a TTY (piped output)
 *   4. The current command is update/upgrade (avoids recursion)
 */
export function shouldSkipUpdateCheck(argv: string[]): boolean {
    if (process.env['FOCUS_NO_UPDATE_NOTIFY'] === '1') return true;
    if (!process.stdout.isTTY) return true;
    if (argv.includes('--no-update-check')) return true;
    // Skip during update/upgrade commands
    const command = argv[0];
    if (command !== undefined && UPDATE_COMMANDS.has(command)) return true;
    return false;
}

// ---------- warning formatter ----------

export function formatUpdateWarning(result: UpdateCheckResult): string {
    const lines: string[] = [];

    if (result.cliUpdate) {
        const { current, latest, command } = result.cliUpdate;
        lines.push(`⚠ Update available: focus ${current} → ${latest}`);
        lines.push(`  Run: ${command}`);
    }

    if (result.bricksUpdates && result.bricksUpdates.length > 0) {
        const count = result.bricksUpdates.length;
        const brickList = result.bricksUpdates
            .map((b: { name: string; current: string; latest: string }) => `${b.name} (${b.current} → ${b.latest})`)
            .join(', ');
        lines.push(
            `⚠ ${count.toString()} ${count === 1 ? 'brick has an update' : 'bricks have updates'}: ${brickList}`,
        );
        lines.push('  Run: focus bricks:update --all');
    }

    return lines.join('\n');
}

// ---------- runUpdateCheck (fire-and-forget for CLI) ----------

/**
 * Runs the update check asynchronously and prints a warning to stderr if
 * updates are available.
 *
 * This function is fire-and-forget: it never throws and does not block the
 * CLI command from running.
 *
 * @param argv  The command arguments (starting with the subcommand, not `focus`)
 * @param cliCurrentVersion  The CLI version string (e.g. "2.0.0")
 */
export function runUpdateCheck(argv: string[], cliCurrentVersion: string): void {
    if (shouldSkipUpdateCheck(argv)) return;

    // Fire-and-forget: intentionally not awaited
    checkForUpdates({
        includeCli: true,
        includeBricks: true,
        cliCurrentVersion,
    })
        .then((result: UpdateCheckResult) => {
            const warning = formatUpdateWarning(result);
            if (warning.length > 0) {
                process.stderr.write(`${warning}\n`);
            }
        })
        .catch(() => {
            // silently ignore all errors
        });
}

// ---------- checkUpdatesCommand (MCP tool) ----------

export interface CheckUpdatesInput {
    readonly include_cli?: boolean;
    readonly include_bricks?: boolean;
}

export interface CheckUpdatesOutput {
    readonly cliUpdate: {
        readonly current: string;
        readonly latest: string;
        readonly command: string;
    } | null;
    readonly bricksUpdates: ReadonlyArray<{
        readonly name: string;
        readonly current: string;
        readonly latest: string;
    }>;
    readonly fromCache: boolean;
}

/**
 * Runs the update check for the MCP `focus_check_updates` tool.
 * Always resolves (never throws).
 */
export async function checkUpdatesCommand(
    input: CheckUpdatesInput,
    cliCurrentVersion: string,
): Promise<CheckUpdatesOutput> {
    try {
        const result = await checkForUpdates({
            includeCli: input.include_cli ?? true,
            includeBricks: input.include_bricks ?? true,
            cliCurrentVersion,
        });

        return {
            cliUpdate: result.cliUpdate
                ? {
                      current: result.cliUpdate.current,
                      latest: result.cliUpdate.latest,
                      command: result.cliUpdate.command,
                  }
                : null,
            bricksUpdates: result.bricksUpdates ?? [],
            fromCache: result.fromCache,
        };
    } catch {
        return { cliUpdate: null, bricksUpdates: [], fromCache: false };
    }
}
