// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockReadFile, mockCreateRequire, mockRealpathSync } = vi.hoisted(() => ({
    mockReadFile: vi.fn(),
    mockCreateRequire: vi.fn(),
    mockRealpathSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
    readFile: mockReadFile,
}));

vi.mock('node:fs', () => ({
    realpathSync: mockRealpathSync,
}));

// createRequire returns a require-like function with a .resolve method
const mockResolve = vi.fn();
vi.mock('node:module', () => ({
    createRequire: mockCreateRequire,
}));

describe('FilesystemBrickSource', () => {
    beforeEach(() => {
        mockReadFile.mockReset();
        mockResolve.mockReset();
        mockCreateRequire.mockReset();
        mockRealpathSync.mockReset();
        // Default: realpathSync returns the path unchanged
        mockRealpathSync.mockImplementation((p: string) => p);
        // Default: createRequire returns an object with resolve
        mockCreateRequire.mockReturnValue(Object.assign(mockResolve, { resolve: mockResolve }));
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

    // ---------- readManifest — flat layout ----------

    it('readManifest() resolves manifest via node module resolution (flat layout)', async () => {
        const { FilesystemBrickSource } = await import('./filesystem-source.ts');

        const manifest = { name: 'brick-a', version: '1.0.0', tools: [] };
        // Simulate flat layout: <bricksDir>/brick-a/mcp-brick.json
        mockResolve.mockReturnValue('/fake/bricks/brick-a/mcp-brick.json');
        mockReadFile.mockResolvedValue(JSON.stringify(manifest));

        const source = new FilesystemBrickSource({
            centerJson: { bricks: {} },
            bricksDir: '/fake/bricks',
        });

        const result = await source.readManifest('catalog/brick-a');

        expect(mockResolve).toHaveBeenCalledWith('@focus-mcp/brick-brick-a/mcp-brick.json');
        expect(mockReadFile).toHaveBeenCalledWith('/fake/bricks/brick-a/mcp-brick.json', 'utf-8');
        expect(result).toEqual(manifest);
    });

    // ---------- readManifest — npm-nested layout ----------

    it('readManifest() resolves manifest via node module resolution (npm-nested layout)', async () => {
        const { FilesystemBrickSource } = await import('./filesystem-source.ts');

        const manifest = { name: 'brick-a', version: '1.0.0', tools: [] };
        // Simulate npm layout: <bricksDir>/node_modules/@focus-mcp/brick-a/mcp-brick.json
        mockResolve.mockReturnValue(
            '/fake/bricks/node_modules/@focus-mcp/brick-brick-a/mcp-brick.json',
        );
        mockReadFile.mockResolvedValue(JSON.stringify(manifest));

        const source = new FilesystemBrickSource({
            centerJson: { bricks: {} },
            bricksDir: '/fake/bricks',
        });

        const result = await source.readManifest('brick-a');

        expect(mockResolve).toHaveBeenCalledWith('@focus-mcp/brick-brick-a/mcp-brick.json');
        expect(mockReadFile).toHaveBeenCalledWith(
            '/fake/bricks/node_modules/@focus-mcp/brick-brick-a/mcp-brick.json',
            'utf-8',
        );
        expect(result).toEqual(manifest);
    });

    it('readManifest() uses the brick name directly when no catalog prefix', async () => {
        const { FilesystemBrickSource } = await import('./filesystem-source.ts');

        const manifest = { name: 'brick-a', version: '1.0.0', tools: [] };
        mockResolve.mockReturnValue('/fake/bricks/brick-a/mcp-brick.json');
        mockReadFile.mockResolvedValue(JSON.stringify(manifest));

        const source = new FilesystemBrickSource({
            centerJson: { bricks: {} },
            bricksDir: '/fake/bricks',
        });

        const result = await source.readManifest('brick-a');

        expect(mockResolve).toHaveBeenCalledWith('@focus-mcp/brick-brick-a/mcp-brick.json');
        expect(result).toEqual(manifest);
    });

    it('readManifest() falls back to walking up from main when mcp-brick.json not in exports', async () => {
        const { FilesystemBrickSource } = await import('./filesystem-source.ts');

        const manifest = { name: 'brick-a', version: '1.0.0', tools: [] };

        // First resolve call (subpath) throws ERR_PACKAGE_PATH_NOT_EXPORTED
        // Second resolve call (main entry) returns a src path
        let resolveCallCount = 0;
        mockResolve.mockImplementation((_specifier: string) => {
            resolveCallCount++;
            if (resolveCallCount === 1) {
                // subpath not exported
                const err = Object.assign(new Error('ERR_PACKAGE_PATH_NOT_EXPORTED'), {
                    code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
                });
                throw err;
            }
            // main entry: inside node_modules
            return '/fake/bricks/node_modules/@focus-mcp/brick-brick-a/src/index.ts';
        });

        // First readFile call (mcp-brick.json candidate) succeeds
        mockReadFile.mockImplementation((p: string) => {
            if (p === '/fake/bricks/node_modules/@focus-mcp/brick-brick-a/mcp-brick.json') {
                return Promise.resolve(JSON.stringify(manifest));
            }
            // final read of manifest content
            return Promise.resolve(JSON.stringify(manifest));
        });

        const source = new FilesystemBrickSource({
            centerJson: { bricks: {} },
            bricksDir: '/fake/bricks',
        });

        const result = await source.readManifest('brick-a');

        expect(result).toEqual(manifest);
        // Verify both resolve calls happened
        expect(mockResolve).toHaveBeenCalledTimes(2);
        expect(mockResolve).toHaveBeenNthCalledWith(1, '@focus-mcp/brick-brick-a/mcp-brick.json');
        expect(mockResolve).toHaveBeenNthCalledWith(2, '@focus-mcp/brick-brick-a');
    });

    it('readManifest() throws when module resolve fails (file not found)', async () => {
        const { FilesystemBrickSource } = await import('./filesystem-source.ts');

        const error = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        mockResolve.mockImplementation(() => {
            throw error;
        });

        const source = new FilesystemBrickSource({
            centerJson: { bricks: {} },
            bricksDir: '/fake/bricks',
        });

        await expect(source.readManifest('catalog/missing-brick')).rejects.toThrow('ENOENT');
    });

    it('readManifest() throws if resolved path escapes bricksDir (symlink attack)', async () => {
        const { FilesystemBrickSource } = await import('./filesystem-source.ts');

        // Resolved path points outside bricksDir
        mockResolve.mockReturnValue('/etc/passwd');
        mockRealpathSync.mockReturnValue('/fake/bricks');

        const source = new FilesystemBrickSource({
            centerJson: { bricks: {} },
            bricksDir: '/fake/bricks',
        });

        await expect(source.readManifest('evil')).rejects.toThrow(/escapes bricksDir/);
    });

    // ---------- safeBrickName edge cases ----------

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

    // ---------- loadModule — flat layout ----------

    it('loadModule() resolves entry via node module resolution (flat layout)', async () => {
        const { FilesystemBrickSource } = await import('./filesystem-source.ts');

        // Simulate flat layout: <bricksDir>/brick-a/dist/index.js
        mockResolve.mockReturnValue('/fake/bricks/brick-a/dist/index.js');

        const source = new FilesystemBrickSource({
            centerJson: { bricks: {} },
            bricksDir: '/fake/bricks',
        });

        // import() will fail for a fake path — that is expected
        await expect(source.loadModule('brick-a')).rejects.toThrow();
        expect(mockResolve).toHaveBeenCalledWith('@focus-mcp/brick-brick-a');
    });

    // ---------- loadModule — npm-nested layout ----------

    it('loadModule() resolves entry via node module resolution (npm-nested layout)', async () => {
        const { FilesystemBrickSource } = await import('./filesystem-source.ts');

        // Simulate npm-nested layout
        mockResolve.mockReturnValue(
            '/fake/bricks/node_modules/@focus-mcp/brick-brick-a/dist/index.js',
        );

        const source = new FilesystemBrickSource({
            centerJson: { bricks: {} },
            bricksDir: '/fake/bricks',
        });

        // import() will fail for a fake path — that is expected
        await expect(source.loadModule('brick-a')).rejects.toThrow();
        expect(mockResolve).toHaveBeenCalledWith('@focus-mcp/brick-brick-a');
    });

    it('loadModule() throws if resolved entry escapes bricksDir (symlink attack)', async () => {
        const { FilesystemBrickSource } = await import('./filesystem-source.ts');

        mockResolve.mockReturnValue('/etc/evil.js');
        mockRealpathSync.mockReturnValue('/fake/bricks');

        const source = new FilesystemBrickSource({
            centerJson: { bricks: {} },
            bricksDir: '/fake/bricks',
        });

        await expect(source.loadModule('evil')).rejects.toThrow(/escapes bricksDir/);
    });
});
