// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * focus add <brick> [<brick2> ...]
 *
 * Fetches catalog sources, finds each brick (plus transitive deps), plans the
 * npm install for each, executes them, and updates center.json + center.lock.
 * Pure function: all I/O is injected via AddIO.
 */

import {
    type AggregatedCatalog,
    aggregateCatalogs,
    type CenterJson,
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

export interface AddIO {
    readonly fetch: FetchIO;
    readonly store: CatalogStoreIO;
    readonly installer: InstallerIO;
    /**
     * Optional: delete a directory by path (used by --force to wipe corrupted
     * node_modules/<pkg> before re-installing). If absent, force-purge is
     * skipped (dir removal handled by npm uninstall).
     */
    rmDir?(path: string): Promise<void>;
    /** Return the bricks node_modules root (e.g. ~/.focus/bricks) */
    getBricksDir?(): string;
}

export interface AddCommandInput {
    readonly brickName: string;
    readonly io: AddIO;
    /** When true: re-install even if already present or corrupted */
    readonly force?: boolean;
}

export interface AddManyCommandInput {
    readonly brickNames: readonly string[];
    readonly io: AddIO;
    /** When true: re-install even if already present or corrupted */
    readonly force?: boolean | undefined;
}

// ---------- catalog loading ----------

async function loadAggregatedCatalog(io: AddIO): Promise<AggregatedCatalog> {
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

// ---------- dependency resolution ----------

/**
 * Walk the dep graph for a single brick and return an ordered install list
 * (deps-first). Throws on circular dependencies or missing catalog entries.
 */
function resolveDeps(
    brickName: string,
    aggregated: AggregatedCatalog,
    centerJson: CenterJson,
    visited: string[],
    resolved: string[],
    log: (msg: string) => void,
): void {
    if (visited.includes(brickName)) {
        const cycle = [...visited, brickName].join(' → ');
        throw new Error(`Circular dependency detected: ${cycle}`);
    }

    if (resolved.includes(brickName) || brickName in centerJson.bricks) return;

    const brick = findBrickAcrossCatalogs(aggregated, brickName);
    if (brick === undefined) {
        throw new Error(`Brick "${brickName}" not found in any catalog.`);
    }

    visited.push(brickName);
    for (const dep of brick.dependencies) {
        if (dep in centerJson.bricks || resolved.includes(dep)) continue;
        log(`  Cascading dep "${dep}" from "${brickName}"`);
        resolveDeps(dep, aggregated, centerJson, visited, resolved, log);
    }
    visited.pop();

    resolved.push(brickName);
}

// ---------- rollback helpers ----------

async function rollbackInstalled(installer: InstallerIO, installed: string[]): Promise<void> {
    for (const name of [...installed].reverse()) {
        try {
            const rawCenter = await installer.readCenterJson();
            const rawLock = await installer.readCenterLock();
            const center = parseCenterJson(rawCenter);
            const lock = parseCenterLock(rawLock);
            const { npmPackage } = planRemove(name, center, lock);
            await executeRemove(installer, name, npmPackage, center, lock);
        } catch {
            // Best-effort rollback — ignore secondary failures
        }
    }
}

// ---------- install loop ----------

async function installSequentially(
    installOrder: string[],
    aggregated: AggregatedCatalog,
    installer: InstallerIO,
): Promise<string[]> {
    const installed: string[] = [];

    for (const name of installOrder) {
        const brick = findBrickAcrossCatalogs(aggregated, name);
        if (brick === undefined) throw new Error(`Brick "${name}" not found in any catalog.`);

        const plan = planInstall(brick, brick.catalogUrl);

        const rawCenter = await installer.readCenterJson();
        const rawLock = await installer.readCenterLock();
        const centerJson = parseCenterJson(rawCenter);
        const centerLock = parseCenterLock(rawLock);

        try {
            await executeInstall(installer, plan, centerJson, centerLock);
            installed.push(name);
        } catch (err) {
            if (installed.length > 0) {
                await rollbackInstalled(installer, installed);
            }
            const errMsg = err instanceof Error ? err.message : String(err);
            throw new Error(`Failed to install "${name}": ${errMsg}`);
        }
    }

    return installed;
}

// ---------- summary helpers ----------

function buildSummary(
    installed: string[],
    installOrder: string[],
    aggregated: AggregatedCatalog,
    messages: string[],
): string {
    if (installed.length === 0) return messages.join('\n');

    if (installed.length === 1) {
        const name = installOrder[0] as string;
        const brick = findBrickAcrossCatalogs(aggregated, name);
        const version = brick?.version ?? 'unknown';
        const catalogUrl = brick?.catalogUrl ?? '';
        messages.push(`Installed ${name}@${version} from ${catalogUrl}`);
    } else {
        const labelled = installed.map((n) => {
            const b = findBrickAcrossCatalogs(aggregated, n);
            return `${n}@${b?.version ?? 'unknown'}`;
        });
        messages.push(`Installed ${installed.length} bricks: ${labelled.join(', ')}`);
    }

    return messages.join('\n');
}

// ---------- force-purge helper ----------

/**
 * When --force is set and the brick is already installed:
 * 1. Wipe the corrupted node_modules/<pkg> dir (best-effort).
 * 2. Remove the brick from center state.
 * 3. Re-read state so the in-memory centerJson no longer lists the brick.
 */
async function forcePurgeBrick(
    brickName: string,
    centerJson: ReturnType<typeof parseCenterJson>,
    centerLock: ReturnType<typeof parseCenterLock>,
    io: AddIO,
): Promise<void> {
    const lockEntry = centerLock.bricks[brickName];

    if (lockEntry !== undefined && io.getBricksDir !== undefined && io.rmDir !== undefined) {
        const pkgDir = `${io.getBricksDir()}/node_modules/${lockEntry.npmPackage}`;
        try {
            await io.rmDir(pkgDir);
        } catch {
            // Best-effort: continue even if rm fails
        }
    }

    try {
        const { npmPackage } = planRemove(brickName, centerJson, centerLock);
        await executeRemove(io.installer, brickName, npmPackage, centerJson, centerLock);
    } catch {
        // Best-effort: may already be partially gone
    }

    // Sync in-memory state to reflect removal
    const rawCenter2 = await io.installer.readCenterJson();
    const centerJson2 = parseCenterJson(rawCenter2);
    Object.assign(centerJson.bricks, centerJson2.bricks);
    delete (centerJson.bricks as Record<string, unknown>)[brickName];
}

// ---------- public API ----------

/**
 * Executes the add command. Returns a user-facing message describing what was
 * installed or a clear error message when the brick cannot be found.
 */
export async function addCommand({ brickName, io, force }: AddCommandInput): Promise<string> {
    if (brickName.trim().length === 0) {
        throw new Error('Brick name must not be empty.');
    }
    return addManyCommand({ brickNames: [brickName], io, force });
}

/**
 * Installs multiple bricks (and their transitive dependencies) in one run.
 *
 * - Skips bricks already present in center.json (unless force=true).
 * - When force=true: removes existing center.json entry + optionally wipes the
 *   corrupted node_modules/<pkg> dir before re-installing.
 * - Detects circular dependencies in the dep graph.
 * - Aborts and restores state on any install failure.
 */
export async function addManyCommand({
    brickNames,
    io,
    force = false,
}: AddManyCommandInput): Promise<string> {
    if (brickNames.length === 0) throw new Error('At least one brick name is required.');
    for (const name of brickNames) {
        if (name.trim().length === 0) throw new Error('Brick name must not be empty.');
    }

    const aggregated = await loadAggregatedCatalog(io);

    const rawCenter = await io.installer.readCenterJson();
    const rawLock = await io.installer.readCenterLock();
    const centerJson = parseCenterJson(rawCenter);
    const centerLock = parseCenterLock(rawLock);

    const messages: string[] = [];
    const installOrder: string[] = [];

    for (const brickName of brickNames) {
        if (brickName in centerJson.bricks) {
            if (!force) {
                const ver = centerJson.bricks[brickName]?.version ?? 'unknown';
                messages.push(
                    `Brick "${brickName}" is already installed (version ${ver}). Use \`focus upgrade\` (or \`focus update\`) to upgrade.`,
                );
                continue;
            }
            messages.push(`Force-reinstalling "${brickName}"...`);
            await forcePurgeBrick(brickName, centerJson, centerLock, io);
        }

        resolveDeps(brickName, aggregated, centerJson, [], installOrder, (msg) => {
            messages.push(msg);
        });
    }

    if (installOrder.length === 0) return messages.join('\n');

    const installed = await installSequentially(installOrder, aggregated, io.installer);

    return buildSummary(installed, installOrder, aggregated, messages);
}
