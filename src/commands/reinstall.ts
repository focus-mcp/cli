// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * focus reinstall <brick> [<brick2> ...]
 *
 * Convenience alias for `focus remove <X> && focus add <X> --force`.
 * Preserves the `enabled` state from center.json.
 * Accepts multiple brick names (bulk recovery after `focus doctor`).
 *
 * Pure function: all I/O is injected via ReinstallIO.
 */

import { parseCenterJson } from '@focus-mcp/core';
import type { CatalogStoreIO } from '../adapters/catalog-store-adapter.ts';
import type { FetchIO } from '../adapters/http-fetch-adapter.ts';
import type { InstallerIO } from '../adapters/npm-installer-adapter.ts';
import { addManyCommand } from './add.ts';

export interface ReinstallIO {
    readonly fetch: FetchIO;
    readonly store: CatalogStoreIO;
    readonly installer: InstallerIO;
    rmDir?(path: string): Promise<void>;
    getBricksDir?(): string;
}

export interface ReinstallCommandInput {
    readonly brickNames: readonly string[];
    readonly io: ReinstallIO;
}

export interface ReinstallSummary {
    readonly reinstalled: string[];
    readonly failed: string[];
    readonly output: string;
}

// ---------- helpers ----------

async function restoreDisabledState(name: string, installer: InstallerIO): Promise<void> {
    const rawCenter2 = await installer.readCenterJson();
    const centerJson2 = parseCenterJson(rawCenter2) as {
        bricks: Record<
            string,
            { version: string; enabled: boolean; config?: Record<string, unknown> }
        >;
    };
    const entry = centerJson2.bricks[name];
    if (entry !== undefined) {
        entry.enabled = false;
        await installer.writeCenterJson(
            centerJson2 as Parameters<InstallerIO['writeCenterJson']>[0],
        );
    }
}

async function reinstallOne(name: string, wasEnabled: boolean, io: ReinstallIO): Promise<string> {
    const result = await addManyCommand({ brickNames: [name], io, force: true });
    if (!wasEnabled) {
        await restoreDisabledState(name, io.installer);
    }
    return result;
}

// ---------- public API ----------

/**
 * Reinstalls one or more bricks, preserving their `enabled` state.
 *
 * Steps per brick:
 *  1. Snapshot `enabled` from center.json.
 *  2. Delegate to addManyCommand with force=true (which removes + re-installs).
 *  3. If the brick was disabled, restore disabled state after install.
 */
export async function reinstallCommand({
    brickNames,
    io,
}: ReinstallCommandInput): Promise<ReinstallSummary> {
    if (brickNames.length === 0) throw new Error('At least one brick name is required.');
    for (const name of brickNames) {
        if (name.trim().length === 0) throw new Error('Brick name must not be empty.');
    }

    // Snapshot enabled states before any changes
    const rawCenter = await io.installer.readCenterJson();
    const centerJson = parseCenterJson(rawCenter);

    const enabledStates: Record<string, boolean> = {};
    for (const name of brickNames) {
        enabledStates[name] = centerJson.bricks[name]?.enabled ?? true;
    }

    const reinstalled: string[] = [];
    const failed: string[] = [];
    const lines: string[] = [];

    for (const name of brickNames) {
        try {
            const result = await reinstallOne(name, enabledStates[name] ?? true, io);
            lines.push(result);
            reinstalled.push(name);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            lines.push(`Failed to reinstall "${name}": ${msg}`);
            failed.push(name);
        }
    }

    lines.push('');
    lines.push(
        `Reinstalled: ${reinstalled.length} brick(s)${failed.length > 0 ? `, failed: ${failed.length}` : ''}.`,
    );

    return { reinstalled, failed, output: lines.join('\n') };
}
