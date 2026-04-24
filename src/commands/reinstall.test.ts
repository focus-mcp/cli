// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { DEFAULT_CATALOG_URL } from '@focus-mcp/core';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogStoreIO } from '../adapters/catalog-store-adapter.ts';
import type { FetchIO } from '../adapters/http-fetch-adapter.ts';
import type { InstallerIO } from '../adapters/npm-installer-adapter.ts';
import { reinstallCommand } from './reinstall.ts';

// ---------- helpers ----------

const DEFAULT_URL = DEFAULT_CATALOG_URL;

function makeFetchIO(brickNames: string[] = ['echo']): FetchIO {
    return {
        fetchJson: vi.fn().mockResolvedValue({
            name: 'Test Catalog',
            owner: { name: 'FocusMCP' },
            updated: '2026-01-01',
            bricks: brickNames.map((name) => ({
                name,
                version: '1.0.0',
                description: `${name} brick`,
                dependencies: [],
                tools: [{ name: 'run', description: 'Run' }],
                source: { type: 'npm', package: `@focus-mcp/brick-${name}` },
            })),
        }),
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

function makeInstallerIO(brickName = 'echo', enabled = true): InstallerIO {
    return {
        npmInstall: vi.fn().mockResolvedValue(undefined),
        npmUninstall: vi.fn().mockResolvedValue(undefined),
        writeCenterJson: vi.fn().mockResolvedValue(undefined),
        writeCenterLock: vi.fn().mockResolvedValue(undefined),
        readCenterJson: vi
            .fn()
            // First call: brick is installed; subsequent calls: after removal
            .mockResolvedValueOnce({
                bricks: { [brickName]: { version: '1.0.0', enabled } },
            })
            .mockResolvedValue({ bricks: {} }),
        readCenterLock: vi
            .fn()
            .mockResolvedValueOnce({
                bricks: {
                    [brickName]: {
                        version: '1.0.0',
                        catalogUrl: DEFAULT_URL,
                        npmPackage: `@focus-mcp/brick-${brickName}`,
                        installedAt: '2026-01-01T00:00:00Z',
                    },
                },
            })
            .mockResolvedValue({ bricks: {} }),
    };
}

// ---------- tests ----------

describe('reinstallCommand', () => {
    it('throws when brickNames is empty', async () => {
        const io = {
            fetch: makeFetchIO(),
            store: makeStoreIO(),
            installer: makeInstallerIO(),
        };
        await expect(reinstallCommand({ brickNames: [], io })).rejects.toThrow(
            /at least one brick name/i,
        );
    });

    it('throws when a brick name is empty string', async () => {
        const io = {
            fetch: makeFetchIO(),
            store: makeStoreIO(),
            installer: makeInstallerIO(),
        };
        await expect(reinstallCommand({ brickNames: [''], io })).rejects.toThrow(
            /must not be empty/i,
        );
    });

    it('reinstalls a single brick (remove + re-add)', async () => {
        const installer = makeInstallerIO('echo', true);
        const io = { fetch: makeFetchIO(), store: makeStoreIO(), installer };

        const result = await reinstallCommand({ brickNames: ['echo'], io });

        expect(installer.npmInstall).toHaveBeenCalledOnce();
        expect(result.reinstalled).toContain('echo');
        expect(result.failed).toHaveLength(0);
        expect(result.output).toMatch(/installed echo@/i);
    });

    it('reinstalls multiple bricks in bulk', async () => {
        // Two separate installers to avoid state conflicts; use shared fetch
        const installer1 = makeInstallerIO('echo', true);
        const installer2 = makeInstallerIO('grep', true);

        // We need a single installer that returns state for both bricks
        const combinedInstaller: InstallerIO = {
            npmInstall: vi.fn().mockResolvedValue(undefined),
            npmUninstall: vi.fn().mockResolvedValue(undefined),
            writeCenterJson: vi.fn().mockResolvedValue(undefined),
            writeCenterLock: vi.fn().mockResolvedValue(undefined),
            readCenterJson: vi
                .fn()
                .mockResolvedValueOnce({
                    bricks: {
                        echo: { version: '1.0.0', enabled: true },
                        grep: { version: '1.0.0', enabled: true },
                    },
                })
                .mockResolvedValueOnce({ bricks: { grep: { version: '1.0.0', enabled: true } } })
                .mockResolvedValueOnce({ bricks: {} })
                .mockResolvedValueOnce({ bricks: { grep: { version: '1.0.0', enabled: true } } })
                .mockResolvedValueOnce({ bricks: {} })
                .mockResolvedValue({ bricks: {} }),
            readCenterLock: vi
                .fn()
                .mockResolvedValueOnce({
                    bricks: {
                        echo: {
                            version: '1.0.0',
                            catalogUrl: DEFAULT_URL,
                            npmPackage: '@focus-mcp/brick-echo',
                            installedAt: '2026-01-01T00:00:00Z',
                        },
                        grep: {
                            version: '1.0.0',
                            catalogUrl: DEFAULT_URL,
                            npmPackage: '@focus-mcp/brick-grep',
                            installedAt: '2026-01-01T00:00:00Z',
                        },
                    },
                })
                .mockResolvedValue({ bricks: {} }),
        };

        const io = {
            fetch: makeFetchIO(['echo', 'grep']),
            store: makeStoreIO(),
            installer: combinedInstaller,
        };

        const result = await reinstallCommand({ brickNames: ['echo', 'grep'], io });

        expect(combinedInstaller.npmInstall).toHaveBeenCalledTimes(2);
        expect(result.reinstalled).toHaveLength(2);
        expect(result.failed).toHaveLength(0);

        void installer1;
        void installer2;
    });

    it('preserves disabled=false state after reinstall', async () => {
        const installer: InstallerIO = {
            npmInstall: vi.fn().mockResolvedValue(undefined),
            npmUninstall: vi.fn().mockResolvedValue(undefined),
            writeCenterJson: vi.fn().mockResolvedValue(undefined),
            writeCenterLock: vi.fn().mockResolvedValue(undefined),
            readCenterJson: vi
                .fn()
                // Snapshot call (enabled=false)
                .mockResolvedValueOnce({
                    bricks: { echo: { version: '1.0.0', enabled: false } },
                })
                // addManyCommand force — before removal
                .mockResolvedValueOnce({
                    bricks: { echo: { version: '1.0.0', enabled: false } },
                })
                // after removal in force flow
                .mockResolvedValueOnce({ bricks: {} })
                // after install — restore enabled check
                .mockResolvedValue({ bricks: { echo: { version: '1.0.0', enabled: true } } }),
            readCenterLock: vi
                .fn()
                .mockResolvedValueOnce({
                    bricks: {
                        echo: {
                            version: '1.0.0',
                            catalogUrl: DEFAULT_URL,
                            npmPackage: '@focus-mcp/brick-echo',
                            installedAt: '2026-01-01T00:00:00Z',
                        },
                    },
                })
                .mockResolvedValueOnce({
                    bricks: {
                        echo: {
                            version: '1.0.0',
                            catalogUrl: DEFAULT_URL,
                            npmPackage: '@focus-mcp/brick-echo',
                            installedAt: '2026-01-01T00:00:00Z',
                        },
                    },
                })
                .mockResolvedValue({ bricks: {} }),
        };

        const io = { fetch: makeFetchIO(), store: makeStoreIO(), installer };
        const result = await reinstallCommand({ brickNames: ['echo'], io });

        expect(result.reinstalled).toContain('echo');

        // writeCenterJson should have been called with enabled=false to restore disabled state
        const writeCalls = (installer.writeCenterJson as ReturnType<typeof vi.fn>).mock
            .calls as Array<[{ bricks: Record<string, { enabled: boolean }> }]>;
        const disablingCall = writeCalls.find(
            (call) => call[0]?.bricks?.['echo']?.enabled === false,
        );
        expect(disablingCall).toBeDefined();
    });

    it('collects failures without throwing when one brick fails', async () => {
        const installer: InstallerIO = {
            npmInstall: vi.fn().mockRejectedValue(new Error('npm registry unavailable')),
            npmUninstall: vi.fn().mockResolvedValue(undefined),
            writeCenterJson: vi.fn().mockResolvedValue(undefined),
            writeCenterLock: vi.fn().mockResolvedValue(undefined),
            readCenterJson: vi
                .fn()
                .mockResolvedValueOnce({ bricks: { echo: { version: '1.0.0', enabled: true } } })
                .mockResolvedValue({ bricks: {} }),
            readCenterLock: vi
                .fn()
                .mockResolvedValueOnce({
                    bricks: {
                        echo: {
                            version: '1.0.0',
                            catalogUrl: DEFAULT_URL,
                            npmPackage: '@focus-mcp/brick-echo',
                            installedAt: '2026-01-01T00:00:00Z',
                        },
                    },
                })
                .mockResolvedValue({ bricks: {} }),
        };

        const io = { fetch: makeFetchIO(), store: makeStoreIO(), installer };
        const result = await reinstallCommand({ brickNames: ['echo'], io });

        expect(result.failed).toContain('echo');
        expect(result.reinstalled).toHaveLength(0);
        expect(result.output).toMatch(/failed to reinstall/i);
    });
});
