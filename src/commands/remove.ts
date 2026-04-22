// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * focus remove <brick>
 *
 * Plans removal by looking up the brick in center.json + center.lock,
 * executes the npm uninstall, and updates both state files.
 * Pure function: all I/O is injected via RemoveIO.
 */

import { executeRemove, parseCenterJson, parseCenterLock, planRemove } from '@focusmcp/core';
import type { InstallerIO } from '../adapters/npm-installer-adapter.ts';

export interface RemoveIO {
    readonly installer: InstallerIO;
}

export interface RemoveCommandInput {
    readonly brickName: string;
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

    const rawCenter = await io.installer.readCenterJson();
    const rawLock = await io.installer.readCenterLock();
    const centerJson = parseCenterJson(rawCenter);
    const centerLock = parseCenterLock(rawLock);

    const { npmPackage } = planRemove(brickName, centerJson, centerLock);

    await executeRemove(io.installer, brickName, npmPackage, centerJson, centerLock);

    return `Removed ${brickName} (package: ${npmPackage})`;
}
