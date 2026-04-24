// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { DEFAULT_CATALOG_URL } from '@focus-mcp/core';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogStoreIO } from '../adapters/catalog-store-adapter.ts';
import type { FetchIO } from '../adapters/http-fetch-adapter.ts';
import type { InstallerIO } from '../adapters/npm-installer-adapter.ts';
import { upgradeCommand } from './upgrade.ts';

// ---------- helpers ----------

const DEFAULT_URL = DEFAULT_CATALOG_URL;

function makeFetchIO(fetchJsonImpl?: () => Promise<unknown>): FetchIO {
    return {
        fetchJson: vi
            .fn()
            .mockImplementation(
                fetchJsonImpl ?? (() => Promise.resolve(validCatalog([validBrick()]))),
            ),
    };
}

function makeStoreIO(): CatalogStoreIO {
    return {
        readStore: vi.fn().mockResolvedValue({
            sources: [
                {
                    url: DEFAULT_URL,
                    name: 'FocusMCP Marketplace',
                    enabled: true,
                    addedAt: '2026-01-01T00:00:00Z',
                },
            ],
        }),
        writeStore: vi.fn().mockResolvedValue(undefined),
    };
}

/**
 * Creates a mock InstallerIO.
 * centerJsonData: what readCenterJson returns (simulates on-disk state).
 * Supports sequential reads (first call, second call, ...) via arrays.
 */
function makeInstallerIO(
    centerJsonData: unknown = {
        bricks: { echo: { version: '1.0.0', enabled: true } },
    },
    centerLockData: unknown = {
        bricks: {
            echo: {
                version: '1.0.0',
                catalogUrl: DEFAULT_URL,
                npmPackage: '@focus-mcp/brick-echo',
                installedAt: '2026-01-01T00:00:00Z',
            },
        },
    },
    overrides: Partial<InstallerIO> = {},
): InstallerIO {
    // Support sequential reads by cycling through arrays
    const centerJsonValues = Array.isArray(centerJsonData) ? centerJsonData : [centerJsonData];
    const centerLockValues = Array.isArray(centerLockData) ? centerLockData : [centerLockData];
    let centerJsonCallCount = 0;
    let centerLockCallCount = 0;

    return {
        npmInstall: vi.fn().mockResolvedValue(undefined),
        npmUninstall: vi.fn().mockResolvedValue(undefined),
        writeCenterJson: vi.fn().mockResolvedValue(undefined),
        writeCenterLock: vi.fn().mockResolvedValue(undefined),
        readCenterJson: vi.fn().mockImplementation(() => {
            const idx = Math.min(centerJsonCallCount, centerJsonValues.length - 1);
            centerJsonCallCount++;
            return Promise.resolve(centerJsonValues[idx]);
        }),
        readCenterLock: vi.fn().mockImplementation(() => {
            const idx = Math.min(centerLockCallCount, centerLockValues.length - 1);
            centerLockCallCount++;
            return Promise.resolve(centerLockValues[idx]);
        }),
        ...overrides,
    };
}

function validCatalog(bricks: unknown[] = []) {
    return {
        name: 'Test Catalog',
        owner: { name: 'FocusMCP' },
        updated: '2026-01-01',
        bricks,
    };
}

function validBrick(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
        name: 'echo',
        version: '2.0.0', // latest in catalog is 2.0.0
        description: 'Echo brick',
        dependencies: [],
        tools: [{ name: 'say', description: 'Echo text' }],
        source: { type: 'npm', package: '@focus-mcp/brick-echo' },
        ...overrides,
    };
}

// ---------- single upgrade ----------

describe('upgradeCommand — single brick', () => {
    it('upgrades a brick when a newer version exists in the catalog', async () => {
        // After remove, center.json is empty; after install, new version appears
        const emptyCenter = { bricks: {} };
        const emptyLock = { bricks: {} };
        const installer = makeInstallerIO(
            // sequence: [initial state, after-remove state, after-install state]
            [
                { bricks: { echo: { version: '1.0.0', enabled: true } } },
                emptyCenter,
                emptyCenter,
                emptyCenter,
            ],
            [
                {
                    bricks: {
                        echo: {
                            version: '1.0.0',
                            catalogUrl: DEFAULT_URL,
                            npmPackage: '@focus-mcp/brick-echo',
                            installedAt: '2026-01-01T00:00:00Z',
                        },
                    },
                },
                emptyLock,
                emptyLock,
            ],
        );

        const result = await upgradeCommand({
            brickName: 'echo',
            io: { fetch: makeFetchIO(), store: makeStoreIO(), installer },
        });

        expect(result.upgraded).toBe(1);
        expect(result.upToDate).toBe(0);
        expect(result.failed).toBe(0);
        expect(result.output).toMatch(/echo.*1\.0\.0.*2\.0\.0/);
        expect(installer.npmUninstall).toHaveBeenCalledOnce();
        expect(installer.npmInstall).toHaveBeenCalledOnce();
    });

    it('reports up-to-date when installed version matches catalog version', async () => {
        const installer = makeInstallerIO({
            bricks: { echo: { version: '2.0.0', enabled: true } },
        });

        const result = await upgradeCommand({
            brickName: 'echo',
            io: { fetch: makeFetchIO(), store: makeStoreIO(), installer },
        });

        expect(result.upgraded).toBe(0);
        expect(result.upToDate).toBe(1);
        expect(result.output).toMatch(/already at latest/i);
        expect(installer.npmUninstall).not.toHaveBeenCalled();
        expect(installer.npmInstall).not.toHaveBeenCalled();
    });

    it('returns failed when the brick is not installed', async () => {
        const installer = makeInstallerIO({ bricks: {} });

        const result = await upgradeCommand({
            brickName: 'echo',
            io: { fetch: makeFetchIO(), store: makeStoreIO(), installer },
        });

        expect(result.failed).toBe(1);
        expect(result.output).toMatch(/not installed/i);
        expect(installer.npmUninstall).not.toHaveBeenCalled();
    });

    it('returns failed when brick is not found in any catalog', async () => {
        const installer = makeInstallerIO({
            bricks: { echo: { version: '1.0.0', enabled: true } },
        });

        const result = await upgradeCommand({
            brickName: 'echo',
            io: {
                fetch: makeFetchIO(() => Promise.resolve(validCatalog([]))),
                store: makeStoreIO(),
                installer,
            },
        });

        expect(result.failed).toBe(1);
        expect(result.output).toMatch(/not found in any catalog/i);
    });
});

// ---------- --all mode ----------

describe('upgradeCommand — --all', () => {
    it('upgrades all installed bricks', async () => {
        const emptyCenter = { bricks: {} };
        const emptyLock = { bricks: {} };
        // Each brick requires: read center (before remove), read lock (before remove),
        // read center again (before install), read lock again (before install),
        // read center again (restore enabled state check) — supply enough states
        const installer = makeInstallerIO(
            [
                { bricks: { echo: { version: '1.0.0', enabled: true } } }, // initial for target list
                { bricks: { echo: { version: '1.0.0', enabled: true } } }, // before remove of echo
                emptyCenter,
                emptyCenter,
                emptyCenter,
            ],
            [
                {
                    bricks: {
                        echo: {
                            version: '1.0.0',
                            catalogUrl: DEFAULT_URL,
                            npmPackage: '@focus-mcp/brick-echo',
                            installedAt: '2026-01-01T00:00:00Z',
                        },
                    },
                },
                {
                    bricks: {
                        echo: {
                            version: '1.0.0',
                            catalogUrl: DEFAULT_URL,
                            npmPackage: '@focus-mcp/brick-echo',
                            installedAt: '2026-01-01T00:00:00Z',
                        },
                    },
                },
                emptyLock,
                emptyLock,
            ],
        );

        const result = await upgradeCommand({
            all: true,
            io: { fetch: makeFetchIO(), store: makeStoreIO(), installer },
        });

        expect(result.upgraded).toBe(1);
        expect(result.failed).toBe(0);
    });

    it('returns "No bricks installed" when center.json is empty', async () => {
        const installer = makeInstallerIO({ bricks: {} });

        const result = await upgradeCommand({
            all: true,
            io: { fetch: makeFetchIO(), store: makeStoreIO(), installer },
        });

        expect(result.output).toMatch(/no bricks installed/i);
        expect(result.upgraded).toBe(0);
    });

    it('treats no brickName and no --all as --all mode', async () => {
        const installer = makeInstallerIO({ bricks: {} });

        const result = await upgradeCommand({
            io: { fetch: makeFetchIO(), store: makeStoreIO(), installer },
        });

        expect(result.output).toMatch(/no bricks installed/i);
    });
});

// ---------- --check dry-run ----------

describe('upgradeCommand — --check flag', () => {
    it('lists upgradable bricks without performing any action', async () => {
        const installer = makeInstallerIO({
            bricks: { echo: { version: '1.0.0', enabled: true } },
        });

        const result = await upgradeCommand({
            brickName: 'echo',
            check: true,
            io: { fetch: makeFetchIO(), store: makeStoreIO(), installer },
        });

        expect(result.upgraded).toBe(1); // "would upgrade" counts
        expect(result.output).toMatch(/1\.0\.0.*2\.0\.0/);
        expect(result.output).toMatch(/would upgrade/i);
        // No actual install or uninstall
        expect(installer.npmInstall).not.toHaveBeenCalled();
        expect(installer.npmUninstall).not.toHaveBeenCalled();
    });

    it('marks up-to-date bricks correctly in check mode', async () => {
        const installer = makeInstallerIO({
            bricks: { echo: { version: '2.0.0', enabled: true } },
        });

        const result = await upgradeCommand({
            brickName: 'echo',
            check: true,
            io: { fetch: makeFetchIO(), store: makeStoreIO(), installer },
        });

        expect(result.upToDate).toBe(1);
        expect(result.upgraded).toBe(0);
        expect(installer.npmInstall).not.toHaveBeenCalled();
        expect(installer.npmUninstall).not.toHaveBeenCalled();
    });
});

// ---------- failure handling ----------

describe('upgradeCommand — failure handling', () => {
    it('counts failures in summary and continues for --all', async () => {
        // Two bricks: 'echo' (upgradable) and 'shell' (not in catalog → fails)
        const emptyCenter = { bricks: {} };
        const emptyLock = { bricks: {} };
        const installer = makeInstallerIO(
            [
                // initial read for target list
                {
                    bricks: {
                        echo: { version: '1.0.0', enabled: true },
                        shell: { version: '1.0.0', enabled: true },
                    },
                },
                // reads during echo upgrade
                {
                    bricks: {
                        echo: { version: '1.0.0', enabled: true },
                        shell: { version: '1.0.0', enabled: true },
                    },
                },
                emptyCenter,
                emptyCenter,
                emptyCenter,
                // reads during shell "upgrade" (no remove needed — fails at catalog lookup)
                { bricks: { shell: { version: '1.0.0', enabled: true } } },
            ],
            [
                {
                    bricks: {
                        echo: {
                            version: '1.0.0',
                            catalogUrl: DEFAULT_URL,
                            npmPackage: '@focus-mcp/brick-echo',
                            installedAt: '2026-01-01T00:00:00Z',
                        },
                        shell: {
                            version: '1.0.0',
                            catalogUrl: DEFAULT_URL,
                            npmPackage: '@focus-mcp/brick-shell',
                            installedAt: '2026-01-01T00:00:00Z',
                        },
                    },
                },
                {
                    bricks: {
                        echo: {
                            version: '1.0.0',
                            catalogUrl: DEFAULT_URL,
                            npmPackage: '@focus-mcp/brick-echo',
                            installedAt: '2026-01-01T00:00:00Z',
                        },
                    },
                },
                emptyLock,
                emptyLock,
                emptyLock,
                {
                    bricks: {
                        shell: {
                            version: '1.0.0',
                            catalogUrl: DEFAULT_URL,
                            npmPackage: '@focus-mcp/brick-shell',
                            installedAt: '2026-01-01T00:00:00Z',
                        },
                    },
                },
            ],
        );

        // Catalog only has 'echo', not 'shell'
        const fetch = makeFetchIO(() => Promise.resolve(validCatalog([validBrick()])));

        const result = await upgradeCommand({
            all: true,
            io: { fetch, store: makeStoreIO(), installer },
        });

        expect(result.upgraded).toBe(1);
        expect(result.failed).toBe(1);
        expect(result.output).toMatch(/1 upgraded/i);
        expect(result.output).toMatch(/1 failed/i);
    });
});
