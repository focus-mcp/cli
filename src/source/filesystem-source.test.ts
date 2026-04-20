// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockReadFile } = vi.hoisted(() => ({
    mockReadFile: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
    readFile: mockReadFile,
}));

// We cannot easily mock dynamic import() — we test loadModule indirectly via
// the integration path. The unit tests below cover list() and readManifest().

describe('FilesystemBrickSource', () => {
    beforeEach(() => {
        mockReadFile.mockReset();
    });

    it('list() returns only enabled bricks', async () => {
        const { FilesystemBrickSource } = await import('./filesystem-source.ts');

        const source = new FilesystemBrickSource({
            centerJson: {
                bricks: {
                    'catalog/brick-a': { version: '^1.0.0', enabled: true },
                    'catalog/brick-b': { version: '^2.0.0', enabled: false },
                    'catalog/brick-c': { version: '^3.0.0', enabled: true },
                },
            },
            bricksDir: '/fake/bricks',
        });

        const list = await source.list();

        expect(list).toEqual(['catalog/brick-a', 'catalog/brick-c']);
    });

    it('list() returns empty array when no bricks are enabled', async () => {
        const { FilesystemBrickSource } = await import('./filesystem-source.ts');

        const source = new FilesystemBrickSource({
            centerJson: {
                bricks: {
                    'catalog/brick-a': { version: '^1.0.0', enabled: false },
                },
            },
            bricksDir: '/fake/bricks',
        });

        const list = await source.list();

        expect(list).toEqual([]);
    });

    it('readManifest() reads mcp-brick.json from the correct path', async () => {
        const { FilesystemBrickSource } = await import('./filesystem-source.ts');

        const manifest = { name: 'brick-a', version: '1.0.0', tools: [] };
        mockReadFile.mockResolvedValue(JSON.stringify(manifest));

        const source = new FilesystemBrickSource({
            centerJson: { bricks: {} },
            bricksDir: '/fake/bricks',
        });

        const result = await source.readManifest('catalog/brick-a');

        expect(mockReadFile).toHaveBeenCalledWith('/fake/bricks/brick-a/mcp-brick.json', 'utf-8');
        expect(result).toEqual(manifest);
    });

    it('readManifest() uses the brick name directly when no catalog prefix', async () => {
        const { FilesystemBrickSource } = await import('./filesystem-source.ts');

        const manifest = { name: 'brick-a', version: '1.0.0', tools: [] };
        mockReadFile.mockResolvedValue(JSON.stringify(manifest));

        const source = new FilesystemBrickSource({
            centerJson: { bricks: {} },
            bricksDir: '/fake/bricks',
        });

        const result = await source.readManifest('brick-a');

        expect(mockReadFile).toHaveBeenCalledWith('/fake/bricks/brick-a/mcp-brick.json', 'utf-8');
        expect(result).toEqual(manifest);
    });

    it('readManifest() throws when file is not found', async () => {
        const { FilesystemBrickSource } = await import('./filesystem-source.ts');

        const error = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        mockReadFile.mockRejectedValue(error);

        const source = new FilesystemBrickSource({
            centerJson: { bricks: {} },
            bricksDir: '/fake/bricks',
        });

        await expect(source.readManifest('catalog/missing-brick')).rejects.toThrow('ENOENT');
    });
});
