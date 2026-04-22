// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * focus add <brick>
 *
 * Fetches catalog sources, finds the brick, plans the npm install, executes it,
 * and updates center.json + center.lock.
 * Pure function: all I/O is injected via AddIO.
 */

import {
    aggregateCatalogs,
    fetchAllCatalogs,
    findBrickAcrossCatalogs,
} from '../../../core/packages/core/src/marketplace/catalog-fetcher.ts';
import {
    createDefaultStore,
    getEnabledSources,
    parseCatalogStore,
} from '../../../core/packages/core/src/marketplace/catalog-store.ts';
import {
    executeInstall,
    parseCenterJson,
    parseCenterLock,
    planInstall,
} from '../../../core/packages/core/src/marketplace/installer.ts';
import type { CatalogStoreIO } from '../adapters/catalog-store-adapter.ts';
import type { FetchIO } from '../adapters/http-fetch-adapter.ts';
import type { InstallerIO } from '../adapters/npm-installer-adapter.ts';

export interface AddIO {
    readonly fetch: FetchIO;
    readonly store: CatalogStoreIO;
    readonly installer: InstallerIO;
}

export interface AddCommandInput {
    readonly brickName: string;
    readonly io: AddIO;
}

/**
 * Executes the add command. Returns a user-facing message describing what was
 * installed or a clear error message when the brick cannot be found.
 */
export async function addCommand({ brickName, io }: AddCommandInput): Promise<string> {
    if (brickName.trim().length === 0) {
        throw new Error('Brick name must not be empty.');
    }

    // Load catalog sources
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

    const aggregated = aggregateCatalogs(results);
    const brick = findBrickAcrossCatalogs(aggregated, brickName);
    if (brick === undefined) {
        throw new Error(`Brick "${brickName}" not found in any catalog.`);
    }

    const plan = planInstall(brick, brick.catalogUrl);

    // Load existing center state
    const rawCenter = await io.installer.readCenterJson();
    const rawLock = await io.installer.readCenterLock();
    const centerJson = parseCenterJson(rawCenter);
    const centerLock = parseCenterLock(rawLock);

    // Check already installed
    if (brickName in centerJson.bricks) {
        return `Brick "${brickName}" is already installed (version ${centerJson.bricks[brickName]?.version ?? 'unknown'}). Use \`focus update\` to upgrade.`;
    }

    await executeInstall(io.installer, plan, centerJson, centerLock);

    return `Installed ${brickName}@${plan.version} from ${plan.catalogUrl}`;
}
