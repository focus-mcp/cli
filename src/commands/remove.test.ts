// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from 'vitest';
import type { InstallerIO } from '../adapters/npm-installer-adapter.ts';
import { removeCommand } from './remove.ts';

// ---------- helpers ----------

const DEFAULT_URL =
    'https://raw.githubusercontent.com/focus-mcp/marketplace/develop/publish/catalog.json';

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
                    npmPackage: '@focusmcp/brick-echo',
                    installedAt: '2026-01-01T00:00:00Z',
                },
            },
        }),
        ...overrides,
    };
}

// ---------- tests ----------

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

        expect(installer.npmUninstall).toHaveBeenCalledWith('@focusmcp/brick-echo');
        expect(installer.writeCenterJson).toHaveBeenCalledOnce();
        expect(installer.writeCenterLock).toHaveBeenCalledOnce();
        expect(result).toMatch(/removed echo/i);
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
