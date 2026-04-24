// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * focus remove <brick> [<brick2> ...]
 *
 * Plans removal by looking up each brick in center.json + center.lock,
 * executes the npm uninstall, and updates both state files.
 * Pure function: all I/O is injected via RemoveIO.
 */

import { executeRemove, parseCenterJson, parseCenterLock, planRemove } from '@focus-mcp/core';
import type { InstallerIO } from '../adapters/npm-installer-adapter.ts';

export interface RemoveIO {
    readonly installer: InstallerIO;
}

export interface RemoveCommandInput {
    readonly brickName: string;
    readonly io: RemoveIO;
}

export interface RemoveManyCommandInput {
    readonly brickNames: readonly string[];
    readonly io: RemoveIO;
}

/**
 * Executes the remove command. Returns a user-facing success message or
 * throws with a clear error when the brick is not installed.
 */
export async function removeCommand({ brickName, io }: RemoveCommandInput): Promise<string> {
    if (brickName.trim().length === 0) {
        throw new Error('Brick name must not be empty.');
    }
    return removeManyCommand({ brickNames: [brickName], io });
}

/**
 * Removes multiple bricks sequentially. Returns a summary message.
 * Each brick is removed independently; if one fails the rest are still attempted.
 */
export async function removeManyCommand({
    brickNames,
    io,
}: RemoveManyCommandInput): Promise<string> {
    if (brickNames.length === 0) {
        throw new Error('At least one brick name is required.');
    }

    for (const name of brickNames) {
        if (name.trim().length === 0) {
            throw new Error('Brick name must not be empty.');
        }
    }

    const removed: string[] = [];
    const errors: string[] = [];

    for (const brickName of brickNames) {
        const rawCenter = await io.installer.readCenterJson();
        const rawLock = await io.installer.readCenterLock();
        const centerJson = parseCenterJson(rawCenter);
        const centerLock = parseCenterLock(rawLock);

        try {
            const { npmPackage } = planRemove(brickName, centerJson, centerLock);
            await executeRemove(io.installer, brickName, npmPackage, centerJson, centerLock);
            removed.push(brickName);
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            errors.push(`"${brickName}": ${errMsg}`);
        }
    }

    const lines: string[] = [];
    if (removed.length > 0) {
        lines.push(`Removed ${removed.length} brick(s): ${removed.join(', ')}`);
    }
    if (errors.length > 0) {
        lines.push(`Errors:\n${errors.map((e) => `  ${e}`).join('\n')}`);
    }

    if (errors.length > 0 && removed.length === 0) {
        throw new Error(lines.join('\n'));
    }

    return lines.join('\n');
}
