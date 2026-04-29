// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * cli-updater — detect the package manager used to install @focus-mcp/cli
 * and return the self-update command to run.
 *
 * Pure function: no side effects, no I/O. The caller is responsible for
 * actually executing the command (MCP paradox: the server can't kill itself).
 */

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'unknown';

export interface CliUpdaterOptions {
    /** If true, also include list of installed bricks to update. */
    includeBricks?: boolean;
    /** List of installed brick names (from center.json), required when includeBricks=true. */
    installedBricks?: string[];
}

export interface CliUpdateResult {
    /** The shell command to run (e.g. `npm i -g @focus-mcp/cli@latest`). */
    command: string;
    /** Detected package manager. */
    manager: PackageManager;
    /** Brick names to update (only present when includeBricks=true). */
    bricksToUpdate?: string[];
}

/**
 * Detect the package manager from environment variables.
 *
 * Detection order:
 * 1. `npm_execpath` contains "pnpm" → pnpm
 * 2. `npm_execpath` contains "yarn" → yarn
 * 3. `npm_execpath` set (any other path) → npm
 * 4. Nothing set → unknown (user may be running via npx or similar)
 */
export function detectPackageManager(): PackageManager {
    const execPath = process.env['npm_execpath'] ?? '';
    if (execPath.includes('pnpm')) return 'pnpm';
    if (execPath.includes('yarn')) return 'yarn';
    if (execPath.length > 0) return 'npm';
    return 'unknown';
}

/**
 * Build the self-update command for @focus-mcp/cli.
 *
 * Returns the command string and manager. Does NOT execute anything.
 */
export function buildUpdateCommand(manager: PackageManager): string {
    switch (manager) {
        case 'pnpm':
            return 'pnpm add -g @focus-mcp/cli@latest';
        case 'yarn':
            return 'yarn global add @focus-mcp/cli@latest';
        case 'npm':
            return 'npm install -g @focus-mcp/cli@latest';
        case 'unknown':
            return 'npm install -g @focus-mcp/cli@latest';
    }
}

/**
 * Compute the CLI self-update result.
 *
 * Pure: reads `process.env` but performs no I/O.
 */
export function cliUpdater(opts: CliUpdaterOptions = {}): CliUpdateResult {
    const manager = detectPackageManager();
    const command = buildUpdateCommand(manager);
    const result: CliUpdateResult = { command, manager };

    if (opts.includeBricks === true) {
        result.bricksToUpdate = opts.installedBricks ?? [];
    }

    return result;
}
