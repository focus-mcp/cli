// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from 'vitest';
import type { CatalogStoreIO } from '../adapters/catalog-store-adapter.ts';
import type { FetchIO } from '../adapters/http-fetch-adapter.ts';
import type { InstallerIO } from '../adapters/npm-installer-adapter.ts';
import { addCommand } from './add.ts';

// ---------- helpers ----------

const DEFAULT_URL = 'https://focus-mcp.github.io/marketplace/catalog.json';

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
        source: { type: 'npm', package: '@focusmcp/brick-echo' },
        ...overrides,
    };
}

// ---------- tests ----------

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
                            npmPackage: '@focusmcp/brick-echo',
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
});
