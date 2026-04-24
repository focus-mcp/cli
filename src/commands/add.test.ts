// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { DEFAULT_CATALOG_URL } from '@focus-mcp/core';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogStoreIO } from '../adapters/catalog-store-adapter.ts';
import type { FetchIO } from '../adapters/http-fetch-adapter.ts';
import type { InstallerIO } from '../adapters/npm-installer-adapter.ts';

// Re-export real implementations by default; individual tests can override parseCenterJson
const realCore = await vi.importActual<typeof import('@focus-mcp/core')>('@focus-mcp/core');

vi.mock('@focus-mcp/core', async (importOriginal) => {
    const real = await importOriginal<typeof import('@focus-mcp/core')>();
    return { ...real };
});

import { addCommand, addManyCommand } from './add.ts';

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

function makeStoreIO(sources?: unknown[]): CatalogStoreIO {
    const payload =
        sources !== undefined
            ? { sources }
            : {
                  sources: [
                      {
                          url: DEFAULT_URL,
                          name: 'FocusMCP Marketplace',
                          enabled: true,
                          addedAt: '2026-01-01T00:00:00Z',
                      },
                  ],
              };
    return {
        readStore: vi.fn().mockResolvedValue(payload),
        writeStore: vi.fn().mockResolvedValue(undefined),
    };
}

function makeInstallerIO(overrides: Partial<InstallerIO> = {}): InstallerIO {
    return {
        npmInstall: vi.fn().mockResolvedValue(undefined),
        npmUninstall: vi.fn().mockResolvedValue(undefined),
        writeCenterJson: vi.fn().mockResolvedValue(undefined),
        writeCenterLock: vi.fn().mockResolvedValue(undefined),
        readCenterJson: vi.fn().mockResolvedValue({ bricks: {} }),
        readCenterLock: vi.fn().mockResolvedValue({ bricks: {} }),
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
        version: '1.0.0',
        description: 'Echo brick',
        dependencies: [],
        tools: [{ name: 'say', description: 'Echo text' }],
        source: { type: 'npm', package: '@focus-mcp/brick-echo' },
        ...overrides,
    };
}

// ---------- addCommand (single-brick, backward compat) ----------

describe('addCommand', () => {
    it('throws when brick name is empty', async () => {
        const io = { fetch: makeFetchIO(), store: makeStoreIO(), installer: makeInstallerIO() };
        await expect(addCommand({ brickName: '  ', io })).rejects.toThrow(/must not be empty/i);
    });

    it('throws when no enabled catalog sources', async () => {
        const io = {
            fetch: makeFetchIO(),
            store: makeStoreIO([
                {
                    url: 'https://example.com/catalog.json',
                    name: 'Disabled',
                    enabled: false,
                    addedAt: '2026-01-01T00:00:00Z',
                },
            ]),
            installer: makeInstallerIO(),
        };
        await expect(addCommand({ brickName: 'echo', io })).rejects.toThrow(
            /no enabled catalog sources/i,
        );
    });

    it('throws when brick is not found in any catalog', async () => {
        const io = {
            fetch: makeFetchIO(() => Promise.resolve(validCatalog([]))),
            store: makeStoreIO(),
            installer: makeInstallerIO(),
        };
        await expect(addCommand({ brickName: 'ghost', io })).rejects.toThrow(
            /not found in any catalog/i,
        );
    });

    it('reports already installed when brick is in center.json', async () => {
        const io = {
            fetch: makeFetchIO(),
            store: makeStoreIO(),
            installer: makeInstallerIO({
                readCenterJson: vi.fn().mockResolvedValue({
                    bricks: { echo: { version: '1.0.0', enabled: true } },
                }),
                readCenterLock: vi.fn().mockResolvedValue({
                    bricks: {
                        echo: {
                            version: '1.0.0',
                            catalogUrl: DEFAULT_URL,
                            npmPackage: '@focus-mcp/brick-echo',
                            installedAt: '2026-01-01T00:00:00Z',
                        },
                    },
                }),
            }),
        };

        const result = await addCommand({ brickName: 'echo', io });
        expect(result).toMatch(/already installed/i);
        expect(result).toMatch(/1\.0\.0/);
    });

    it('calls npmInstall and writes center state on success', async () => {
        const installer = makeInstallerIO();
        const io = { fetch: makeFetchIO(), store: makeStoreIO(), installer };

        const result = await addCommand({ brickName: 'echo', io });

        expect(installer.npmInstall).toHaveBeenCalledOnce();
        expect(installer.writeCenterJson).toHaveBeenCalledOnce();
        expect(installer.writeCenterLock).toHaveBeenCalledOnce();
        expect(result).toMatch(/installed echo@1\.0\.0/i);
    });

    it('throws when all catalogs fail to fetch', async () => {
        const io = {
            fetch: { fetchJson: vi.fn().mockRejectedValue(new Error('network down')) },
            store: makeStoreIO(),
            installer: makeInstallerIO(),
        };
        await expect(addCommand({ brickName: 'echo', io })).rejects.toThrow(
            /failed to fetch any catalog/i,
        );
    });

    it('falls back to default store when sources list is empty and installs successfully', async () => {
        // lines 52-53: store.sources.length === 0 → createDefaultStore()
        const installer = makeInstallerIO();
        const io = {
            fetch: makeFetchIO(),
            store: makeStoreIO([]),
            installer,
        };

        const result = await addCommand({ brickName: 'echo', io });

        expect(installer.npmInstall).toHaveBeenCalledOnce();
        expect(result).toMatch(/installed echo@1\.0\.0/i);
    });

    it('shows "unknown" version when installed brick entry has no version (line 84 fallback)', async () => {
        // Override parseCenterJson to return a brick entry without a version field
        // so that centerJson.bricks[brickName]?.version is undefined, hitting the ?? 'unknown' branch
        const { default: core } = await import('@focus-mcp/core').then((m) => ({ default: m }));
        vi.spyOn(core, 'parseCenterJson').mockReturnValue({
            bricks: {
                echo: { enabled: true } as unknown as ReturnType<
                    typeof realCore.parseCenterJson
                >['bricks'][string],
            },
        });

        const io = {
            fetch: makeFetchIO(),
            store: makeStoreIO(),
            installer: makeInstallerIO({
                readCenterJson: vi.fn().mockResolvedValue({ bricks: { echo: {} } }),
                readCenterLock: vi.fn().mockResolvedValue({ bricks: {} }),
            }),
        };

        const result = await addCommand({ brickName: 'echo', io });
        expect(result).toMatch(/already installed/i);
        expect(result).toMatch(/unknown/);

        vi.restoreAllMocks();
    });
});

// ---------- addManyCommand (bulk + dep resolution) ----------

describe('addManyCommand', () => {
    it('installs all three bricks: focus add a b c', async () => {
        const brickA = validBrick({ name: 'batch', dependencies: [] });
        const brickB = validBrick({ name: 'format', dependencies: [] });
        const brickC = validBrick({ name: 'filewrite', dependencies: [] });

        const installer = makeInstallerIO();
        const io = {
            fetch: makeFetchIO(() => Promise.resolve(validCatalog([brickA, brickB, brickC]))),
            store: makeStoreIO(),
            installer,
        };

        const result = await addManyCommand({ brickNames: ['batch', 'format', 'filewrite'], io });

        expect(installer.npmInstall).toHaveBeenCalledTimes(3);
        expect(result).toMatch(/installed 3 bricks/i);
        expect(result).toMatch(/batch@/i);
        expect(result).toMatch(/format@/i);
        expect(result).toMatch(/filewrite@/i);
    });

    it('auto-installs deps: focus add a where a.deps = [b, c]', async () => {
        const brickB = validBrick({ name: 'b', dependencies: [] });
        const brickC = validBrick({ name: 'c', dependencies: [] });
        const brickA = validBrick({ name: 'a', dependencies: ['b', 'c'] });

        const installer = makeInstallerIO();
        const io = {
            fetch: makeFetchIO(() => Promise.resolve(validCatalog([brickA, brickB, brickC]))),
            store: makeStoreIO(),
            installer,
        };

        const result = await addManyCommand({ brickNames: ['a'], io });

        // a + b + c = 3 installs
        expect(installer.npmInstall).toHaveBeenCalledTimes(3);
        expect(result).toMatch(/installed 3 bricks/i);
        expect(result).toMatch(/Cascading dep "b" from "a"/);
        expect(result).toMatch(/Cascading dep "c" from "a"/);
    });

    it('skips already-installed dep: focus add a where a.deps=[b] and b is installed', async () => {
        const brickB = validBrick({ name: 'b', dependencies: [] });
        const brickA = validBrick({ name: 'a', dependencies: ['b'] });

        // b is already installed
        const installer = makeInstallerIO({
            readCenterJson: vi.fn().mockResolvedValue({
                bricks: { b: { version: '1.0.0', enabled: true } },
            }),
            readCenterLock: vi.fn().mockResolvedValue({
                bricks: {
                    b: {
                        version: '1.0.0',
                        catalogUrl: DEFAULT_URL,
                        npmPackage: '@focus-mcp/brick-b',
                        installedAt: '2026-01-01T00:00:00Z',
                    },
                },
            }),
        });
        const io = {
            fetch: makeFetchIO(() => Promise.resolve(validCatalog([brickA, brickB]))),
            store: makeStoreIO(),
            installer,
        };

        const result = await addManyCommand({ brickNames: ['a'], io });

        // Only a should be installed; b is already present
        expect(installer.npmInstall).toHaveBeenCalledTimes(1);
        expect(result).toMatch(/installed a@/i);
        // No cascade message for b
        expect(result).not.toMatch(/cascading dep "b"/i);
    });

    it('throws clean error when a dep is missing from catalog', async () => {
        const brickA = validBrick({ name: 'a', dependencies: ['missing-dep'] });

        const installer = makeInstallerIO();
        const io = {
            fetch: makeFetchIO(() => Promise.resolve(validCatalog([brickA]))),
            store: makeStoreIO(),
            installer,
        };

        await expect(addManyCommand({ brickNames: ['a'], io })).rejects.toThrow(
            /not found in any catalog/i,
        );
        // Nothing should have been installed
        expect(installer.npmInstall).not.toHaveBeenCalled();
    });

    it('detects circular dependency and throws with cycle path', async () => {
        const brickA = validBrick({ name: 'a', dependencies: ['b'] });
        const brickB = validBrick({ name: 'b', dependencies: ['a'] });

        const installer = makeInstallerIO();
        const io = {
            fetch: makeFetchIO(() => Promise.resolve(validCatalog([brickA, brickB]))),
            store: makeStoreIO(),
            installer,
        };

        await expect(addManyCommand({ brickNames: ['a'], io })).rejects.toThrow(
            /circular dependency/i,
        );
        expect(installer.npmInstall).not.toHaveBeenCalled();
    });

    it('throws when brickNames is empty', async () => {
        const io = { fetch: makeFetchIO(), store: makeStoreIO(), installer: makeInstallerIO() };
        await expect(addManyCommand({ brickNames: [], io })).rejects.toThrow(
            /at least one brick name/i,
        );
    });
});
