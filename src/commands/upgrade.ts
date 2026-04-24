// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * focus upgrade [<brick>] [--all] [--check]
 *
 * Re-installs one or all bricks at the latest catalog version, preserving the
 * `enabled` state from center.json.  Equivalent to `focus remove + focus add`
 * but in a single atomic command per brick.
 *
 * --check  dry-run: list upgradable bricks without making any changes.
 *
 * Pure function: all I/O is injected via UpgradeIO.
 */

import {
    type AggregatedCatalog,
    aggregateCatalogs,
    compareSemver,
    createDefaultStore,
    executeInstall,
    executeRemove,
    fetchAllCatalogs,
    findBrickAcrossCatalogs,
    getEnabledSources,
    parseCatalogStore,
    parseCenterJson,
    parseCenterLock,
    planInstall,
    planRemove,
} from '@focus-mcp/core';
import type { CatalogStoreIO } from '../adapters/catalog-store-adapter.ts';
import type { FetchIO } from '../adapters/http-fetch-adapter.ts';
import type { InstallerIO } from '../adapters/npm-installer-adapter.ts';

// ---------- interfaces ----------

export interface UpgradeIO {
    readonly fetch: FetchIO;
    readonly store: CatalogStoreIO;
    readonly installer: InstallerIO;
}

export interface UpgradeCommandInput {
    /** Brick name to upgrade, or undefined / empty for --all mode. */
    readonly brickName?: string;
    /** Upgrade every brick in center.json. */
    readonly all?: boolean;
    /** Dry-run: list what would be upgraded without acting. */
    readonly check?: boolean;
    readonly io: UpgradeIO;
}

export interface UpgradeSummary {
    readonly upgraded: number;
    readonly upToDate: number;
    readonly failed: number;
    readonly output: string;
}

// ---------- catalog loading ----------

async function loadAggregatedCatalog(io: UpgradeIO): Promise<AggregatedCatalog> {
    const rawStore = await io.store.readStore();
    let store = parseCatalogStore(rawStore);
    if (store.sources.length === 0) {
        store = createDefaultStore();
    }

    const enabled = getEnabledSources(store);
    if (enabled.length === 0) {
        throw new Error('No enabled catalog sources. Use `focus catalog add <url>`.');
    }

    const urls = enabled.map((s) => s.url);
    const { results, errors: fetchErrors } = await fetchAllCatalogs(io.fetch, urls);
    if (fetchErrors.length > 0 && results.length === 0) {
        throw new Error(
            `Failed to fetch any catalog: ${fetchErrors.map((e) => e.error).join('; ')}`,
        );
    }

    return aggregateCatalogs(results);
}

// ---------- upgrade one brick ----------

interface UpgradeOneResult {
    status: 'upgraded' | 'up-to-date' | 'failed' | 'would-upgrade';
    message: string;
}

async function upgradeOne(
    brickName: string,
    aggregated: AggregatedCatalog,
    io: UpgradeIO,
    check: boolean,
): Promise<UpgradeOneResult> {
    const rawCenter = await io.installer.readCenterJson();
    const rawLock = await io.installer.readCenterLock();
    const centerJson = parseCenterJson(rawCenter);
    const centerLock = parseCenterLock(rawLock);

    const installed = centerJson.bricks[brickName];
    if (installed === undefined) {
        return {
            status: 'failed',
            message: `"${brickName}" is not installed — use \`focus add ${brickName}\` first.`,
        };
    }

    const brick = findBrickAcrossCatalogs(aggregated, brickName);
    if (brick === undefined) {
        return {
            status: 'failed',
            message: `"${brickName}": not found in any catalog.`,
        };
    }

    const currentVersion = installed.version;
    const latestVersion = brick.version;

    const cmp = compareSemver(latestVersion, currentVersion);
    if (cmp <= 0) {
        return {
            status: 'up-to-date',
            message: `${brickName} — already at latest (${currentVersion})`,
        };
    }

    if (check) {
        return {
            status: 'would-upgrade',
            message: `${brickName}: ${currentVersion} → ${latestVersion}`,
        };
    }

    // Preserve `enabled` state before remove
    const wasEnabled = installed.enabled;

    try {
        // Remove old version
        const { npmPackage } = planRemove(brickName, centerJson, centerLock);
        await executeRemove(io.installer, brickName, npmPackage, centerJson, centerLock);

        // Re-read state after remove, then install new version
        const rawCenter2 = await io.installer.readCenterJson();
        const rawLock2 = await io.installer.readCenterLock();
        const centerJson2 = parseCenterJson(rawCenter2);
        const centerLock2 = parseCenterLock(rawLock2);

        const plan = planInstall(brick, brick.catalogUrl);
        await executeInstall(io.installer, plan, centerJson2, centerLock2);

        // If brick was disabled, restore disabled state
        if (!wasEnabled) {
            const rawCenter3 = await io.installer.readCenterJson();
            const centerJson3 = parseCenterJson(rawCenter3) as {
                bricks: Record<
                    string,
                    { version: string; enabled: boolean; config?: Record<string, unknown> }
                >;
            };
            const entry3 = centerJson3.bricks[brickName];
            if (entry3 !== undefined) {
                entry3.enabled = false;
                await io.installer.writeCenterJson(
                    centerJson3 as Parameters<InstallerIO['writeCenterJson']>[0],
                );
            }
        }

        return {
            status: 'upgraded',
            message: `${brickName}: ${currentVersion} → ${latestVersion}`,
        };
    } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        return {
            status: 'failed',
            message: `"${brickName}": ${errMsg}`,
        };
    }
}

// ---------- public API ----------

/**
 * Upgrade one or all bricks to their latest catalog version.
 *
 * Returns a summary with counts and human-readable output.
 */
export async function upgradeCommand({
    brickName,
    all = false,
    check = false,
    io,
}: UpgradeCommandInput): Promise<UpgradeSummary> {
    const aggregated = await loadAggregatedCatalog(io);

    // Determine target brick list
    let targets: string[];

    if (all || brickName === undefined || brickName.trim().length === 0) {
        const rawCenter = await io.installer.readCenterJson();
        const centerJson = parseCenterJson(rawCenter);
        targets = Object.keys(centerJson.bricks);
        if (targets.length === 0) {
            return {
                upgraded: 0,
                upToDate: 0,
                failed: 0,
                output: 'No bricks installed.',
            };
        }
    } else {
        targets = [brickName.trim()];
    }

    let upgraded = 0;
    let upToDate = 0;
    let failed = 0;
    const lines: string[] = [];

    for (const target of targets) {
        const result = await upgradeOne(target, aggregated, io, check);
        lines.push(result.message);
        if (result.status === 'upgraded') upgraded++;
        else if (result.status === 'up-to-date') upToDate++;
        else if (result.status === 'would-upgrade')
            upgraded++; // counts as "would upgrade"
        else failed++;
    }

    const summary = check
        ? `${upgraded} would upgrade, ${upToDate} up-to-date, ${failed} failed`
        : `${upgraded} upgraded, ${upToDate} up-to-date, ${failed} failed`;

    lines.push('');
    lines.push(summary);

    return { upgraded, upToDate, failed, output: lines.join('\n') };
}
