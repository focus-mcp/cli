// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockReadFile, mockAccess } = vi.hoisted(() => ({
    mockReadFile: vi.fn(),
    mockAccess: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
    readFile: mockReadFile,
    access: mockAccess,
}));

describe('FilesystemBrickSource', () => {
    beforeEach(() => {
        mockReadFile.mockReset();
        mockAccess.mockReset();
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

    // ---------- safeBrickName edge cases (lines 17-18) ----------

    it('readManifest() throws for empty brick name', async () => {
        const { FilesystemBrickSource } = await import('./filesystem-source.ts');

        const source = new FilesystemBrickSource({
            centerJson: { bricks: {} },
            bricksDir: '/fake/bricks',
        });

        await expect(source.readManifest('')).rejects.toThrow(/invalid brick name/i);
    });

    it('readManifest() throws for "." brick name', async () => {
        const { FilesystemBrickSource } = await import('./filesystem-source.ts');

        const source = new FilesystemBrickSource({
            centerJson: { bricks: {} },
            bricksDir: '/fake/bricks',
        });

        await expect(source.readManifest('.')).rejects.toThrow(/invalid brick name/i);
    });

    it('readManifest() throws for ".." brick name', async () => {
        const { FilesystemBrickSource } = await import('./filesystem-source.ts');

        const source = new FilesystemBrickSource({
            centerJson: { bricks: {} },
            bricksDir: '/fake/bricks',
        });

        await expect(source.readManifest('..')).rejects.toThrow(/invalid brick name/i);
    });

    // ---------- loadModule (lines 54-64) ----------

    it('loadModule() calls access on the dist path first', async () => {
        const { FilesystemBrickSource } = await import('./filesystem-source.ts');

        mockAccess.mockResolvedValue(undefined);

        const source = new FilesystemBrickSource({
            centerJson: { bricks: {} },
            bricksDir: '/fake/bricks',
        });

        // import() will fail because the path is not a real module — that is expected
        await expect(source.loadModule('brick-a')).rejects.toThrow();
        expect(mockAccess).toHaveBeenCalledWith('/fake/bricks/brick-a/dist/index.js');
    });

    it('loadModule() falls back to src/index.ts when dist/index.js is not accessible', async () => {
        const { FilesystemBrickSource } = await import('./filesystem-source.ts');

        mockAccess.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

        const source = new FilesystemBrickSource({
            centerJson: { bricks: {} },
            bricksDir: '/fake/bricks',
        });

        // import() will fail because the path is not a real module — that is expected
        await expect(source.loadModule('brick-a')).rejects.toThrow();
        // access was called on dist path, then fell through to src path import
        expect(mockAccess).toHaveBeenCalledWith('/fake/bricks/brick-a/dist/index.js');
    });
});
