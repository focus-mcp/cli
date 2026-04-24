// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { DEFAULT_CATALOG_URL } from '@focus-mcp/core';
import { describe, expect, it, vi } from 'vitest';
import type { InstallerIO } from '../adapters/npm-installer-adapter.ts';
import { removeCommand, removeManyCommand } from './remove.ts';

// ---------- helpers ----------

const DEFAULT_URL = DEFAULT_CATALOG_URL;

function makeInstallerIO(overrides: Partial<InstallerIO> = {}): InstallerIO {
    return {
        npmInstall: vi.fn().mockResolvedValue(undefined),
        npmUninstall: vi.fn().mockResolvedValue(undefined),
        writeCenterJson: vi.fn().mockResolvedValue(undefined),
        writeCenterLock: vi.fn().mockResolvedValue(undefined),
        readCenterJson: vi.fn().mockResolvedValue({
            bricks: {
                echo: { version: '1.0.0', enabled: true },
            },
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
        ...overrides,
    };
}

// ---------- removeCommand (single-brick, backward compat) ----------

describe('removeCommand', () => {
    it('throws when brick name is empty', async () => {
        const io = { installer: makeInstallerIO() };
        await expect(removeCommand({ brickName: '', io })).rejects.toThrow(/must not be empty/i);
    });

    it('throws when brick is not installed', async () => {
        const installer = makeInstallerIO({
            readCenterJson: vi.fn().mockResolvedValue({ bricks: {} }),
            readCenterLock: vi.fn().mockResolvedValue({ bricks: {} }),
        });
        const io = { installer };
        await expect(removeCommand({ brickName: 'ghost', io })).rejects.toThrow(/not installed/i);
    });

    it('throws when lock entry is missing', async () => {
        const installer = makeInstallerIO({
            readCenterLock: vi.fn().mockResolvedValue({ bricks: {} }),
        });
        const io = { installer };
        await expect(removeCommand({ brickName: 'echo', io })).rejects.toThrow(
            /lock entry not found/i,
        );
    });

    it('calls npmUninstall and writes updated center state on success', async () => {
        const installer = makeInstallerIO();
        const io = { installer };

        const result = await removeCommand({ brickName: 'echo', io });

        expect(installer.npmUninstall).toHaveBeenCalledWith('@focus-mcp/brick-echo');
        expect(installer.writeCenterJson).toHaveBeenCalledOnce();
        expect(installer.writeCenterLock).toHaveBeenCalledOnce();
        expect(result).toMatch(/removed/i);
        expect(result).toMatch(/echo/i);
    });

    it('removes the brick entry from the written center.json', async () => {
        const installer = makeInstallerIO();
        const io = { installer };

        await removeCommand({ brickName: 'echo', io });

        const writtenCenter = (installer.writeCenterJson as ReturnType<typeof vi.fn>).mock
            .calls[0]?.[0] as { bricks: Record<string, unknown> };
        expect(writtenCenter).toBeDefined();
        expect(writtenCenter.bricks['echo']).toBeUndefined();
    });

    it('removes the brick entry from the written center.lock', async () => {
        const installer = makeInstallerIO();
        const io = { installer };

        await removeCommand({ brickName: 'echo', io });

        const writtenLock = (installer.writeCenterLock as ReturnType<typeof vi.fn>).mock
            .calls[0]?.[0] as { bricks: Record<string, unknown> };
        expect(writtenLock).toBeDefined();
        expect(writtenLock.bricks['echo']).toBeUndefined();
    });
});

// ---------- removeManyCommand (bulk) ----------

describe('removeManyCommand', () => {
    it('removes all three bricks: focus remove a b c', async () => {
        const installer = makeInstallerIO({
            readCenterJson: vi
                .fn()
                .mockResolvedValueOnce({
                    bricks: {
                        a: { version: '1.0.0', enabled: true },
                        b: { version: '1.0.0', enabled: true },
                        c: { version: '1.0.0', enabled: true },
                    },
                })
                .mockResolvedValueOnce({
                    bricks: {
                        b: { version: '1.0.0', enabled: true },
                        c: { version: '1.0.0', enabled: true },
                    },
                })
                .mockResolvedValueOnce({
                    bricks: { c: { version: '1.0.0', enabled: true } },
                }),
            readCenterLock: vi
                .fn()
                .mockResolvedValueOnce({
                    bricks: {
                        a: {
                            version: '1.0.0',
                            catalogUrl: DEFAULT_URL,
                            npmPackage: '@focus-mcp/a',
                            installedAt: '2026-01-01T00:00:00Z',
                        },
                        b: {
                            version: '1.0.0',
                            catalogUrl: DEFAULT_URL,
                            npmPackage: '@focus-mcp/b',
                            installedAt: '2026-01-01T00:00:00Z',
                        },
                        c: {
                            version: '1.0.0',
                            catalogUrl: DEFAULT_URL,
                            npmPackage: '@focus-mcp/c',
                            installedAt: '2026-01-01T00:00:00Z',
                        },
                    },
                })
                .mockResolvedValueOnce({
                    bricks: {
                        b: {
                            version: '1.0.0',
                            catalogUrl: DEFAULT_URL,
                            npmPackage: '@focus-mcp/b',
                            installedAt: '2026-01-01T00:00:00Z',
                        },
                        c: {
                            version: '1.0.0',
                            catalogUrl: DEFAULT_URL,
                            npmPackage: '@focus-mcp/c',
                            installedAt: '2026-01-01T00:00:00Z',
                        },
                    },
                })
                .mockResolvedValueOnce({
                    bricks: {
                        c: {
                            version: '1.0.0',
                            catalogUrl: DEFAULT_URL,
                            npmPackage: '@focus-mcp/c',
                            installedAt: '2026-01-01T00:00:00Z',
                        },
                    },
                }),
        });
        const io = { installer };

        const result = await removeManyCommand({ brickNames: ['a', 'b', 'c'], io });

        expect(installer.npmUninstall).toHaveBeenCalledTimes(3);
        expect(result).toMatch(/removed 3 brick/i);
        expect(result).toMatch(/\ba\b/);
        expect(result).toMatch(/\bb\b/);
        expect(result).toMatch(/\bc\b/);
    });

    it('throws when brickNames is empty', async () => {
        const io = { installer: makeInstallerIO() };
        await expect(removeManyCommand({ brickNames: [], io })).rejects.toThrow(
            /at least one brick name/i,
        );
    });

    it('throws when all removals fail', async () => {
        const installer = makeInstallerIO({
            readCenterJson: vi.fn().mockResolvedValue({ bricks: {} }),
            readCenterLock: vi.fn().mockResolvedValue({ bricks: {} }),
        });
        const io = { installer };
        await expect(removeManyCommand({ brickNames: ['ghost'], io })).rejects.toThrow(
            /not installed/i,
        );
    });
});
