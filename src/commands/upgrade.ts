// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * focus upgrade [<brick>] [--all] [--check]
 *
 * Thin wrapper around core.executeUpgrade.
 * Loads the aggregated catalog from the configured sources, then
 * delegates all orchestration to @focus-mcp/core.
 *
 * --check  dry-run: list upgradable bricks without making any changes.
 *
 * Pure function: all I/O is injected via UpgradeIO.
 */

import {
    aggregateCatalogs,
    createDefaultStore,
    executeUpgrade,
    fetchAllCatalogs,
    getEnabledSources,
    parseCatalogStore,
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

async function loadAggregatedCatalog(io: UpgradeIO) {
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

// ---------- public API ----------

/**
 * Upgrade one or all bricks to their latest catalog version.
 *
 * Loads the catalog then delegates to core.executeUpgrade.
 * Returns a summary with counts and human-readable output.
 */
export async function upgradeCommand({
    brickName,
    all = false,
    check = false,
    io,
}: UpgradeCommandInput): Promise<UpgradeSummary> {
    const catalog = await loadAggregatedCatalog(io);
    return executeUpgrade({
        ...(brickName !== undefined ? { brickName } : {}),
        all,
        check,
        catalog,
        io: { installer: io.installer },
    });
}
