// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock node:fs/promises
vi.mock('node:fs/promises', () => ({
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
}));

// Mock node:os
vi.mock('node:os', () => ({
    homedir: vi.fn(() => '/home/testuser'),
}));

// Mock @focus-mcp/core
vi.mock('@focus-mcp/core', () => ({
    createDefaultStore: vi.fn(() => ({ sources: [] })),
    getEnabledSources: vi.fn(() => [{ url: 'https://catalog.focusmcp.io/catalog.json' }]),
    parseCatalogStore: vi.fn((data: unknown) => data),
}));

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createDefaultStore, getEnabledSources, parseCatalogStore } from '@focus-mcp/core';
import { makeNodeIO } from './check-updates-io.ts';

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockMkdir = vi.mocked(mkdir);
const mockCreateDefaultStore = vi.mocked(createDefaultStore);
const mockGetEnabledSources = vi.mocked(getEnabledSources);
const mockParseCatalogStore = vi.mocked(parseCatalogStore);

const FOCUS_DIR = '/home/testuser/.focus';
const CENTER_JSON = join(FOCUS_DIR, 'center.json');
const CATALOG_STORE_JSON = join(FOCUS_DIR, 'catalogs.json');

describe('makeNodeIO', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // ---------- getFocusDir ----------

    describe('getFocusDir', () => {
        it('returns ~/.focus directory path', () => {
            const io = makeNodeIO();
            expect(io.getFocusDir()).toBe(FOCUS_DIR);
        });
    });

    // ---------- readFile ----------

    describe('readFile', () => {
        it('returns file content when file exists', async () => {
            mockReadFile.mockResolvedValue(
                '{"content": true}' as unknown as Awaited<ReturnType<typeof readFile>>,
            );
            const io = makeNodeIO();
            const result = await io.readFile('/some/path');
            expect(result).toBe('{"content": true}');
            expect(mockReadFile).toHaveBeenCalledWith('/some/path', 'utf-8');
        });

        it('returns undefined when file does not exist', async () => {
            mockReadFile.mockRejectedValue(new Error('ENOENT'));
            const io = makeNodeIO();
            const result = await io.readFile('/nonexistent');
            expect(result).toBeUndefined();
        });

        it('returns undefined for any read error', async () => {
            mockReadFile.mockRejectedValue(new Error('EACCES: permission denied'));
            const io = makeNodeIO();
            const result = await io.readFile('/protected');
            expect(result).toBeUndefined();
        });
    });

    // ---------- writeFile ----------

    describe('writeFile', () => {
        it('creates directory and writes file', async () => {
            mockMkdir.mockResolvedValue(undefined);
            mockWriteFile.mockResolvedValue(undefined);
            const io = makeNodeIO();
            await io.writeFile('/home/testuser/.focus/update-cache.json', '{}');
            expect(mockMkdir).toHaveBeenCalledWith('/home/testuser/.focus', { recursive: true });
            expect(mockWriteFile).toHaveBeenCalledWith(
                '/home/testuser/.focus/update-cache.json',
                '{}',
                'utf-8',
            );
        });

        it('propagates write errors', async () => {
            mockMkdir.mockResolvedValue(undefined);
            mockWriteFile.mockRejectedValue(new Error('disk full'));
            const io = makeNodeIO();
            await expect(io.writeFile('/path/file.json', '{}')).rejects.toThrow('disk full');
        });

        it('propagates mkdir errors', async () => {
            mockMkdir.mockRejectedValue(new Error('EACCES'));
            const io = makeNodeIO();
            await expect(io.writeFile('/path/file.json', '{}')).rejects.toThrow('EACCES');
        });
    });

    // ---------- fetchJson ----------

    describe('fetchJson', () => {
        beforeEach(() => {
            vi.stubGlobal('fetch', vi.fn());
        });

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it('returns parsed JSON on successful fetch', async () => {
            const mockFetch = vi.mocked(fetch);
            mockFetch.mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue({ version: '1.0.0' }),
            } as unknown as Response);
            const io = makeNodeIO();
            const result = await io.fetchJson('https://registry.npmjs.org/foo/latest', 2000);
            expect(result).toEqual({ version: '1.0.0' });
        });

        it('returns undefined when response is not ok', async () => {
            const mockFetch = vi.mocked(fetch);
            mockFetch.mockResolvedValue({
                ok: false,
            } as unknown as Response);
            const io = makeNodeIO();
            const result = await io.fetchJson('https://example.com/404', 2000);
            expect(result).toBeUndefined();
        });

        it('returns undefined on network error', async () => {
            const mockFetch = vi.mocked(fetch);
            mockFetch.mockRejectedValue(new Error('network error'));
            const io = makeNodeIO();
            const result = await io.fetchJson('https://example.com', 2000);
            expect(result).toBeUndefined();
        });

        it('returns undefined when aborted (timeout)', async () => {
            const mockFetch = vi.mocked(fetch);
            mockFetch.mockRejectedValue(
                new DOMException('The operation was aborted.', 'AbortError'),
            );
            const io = makeNodeIO();
            const result = await io.fetchJson('https://example.com', 1);
            expect(result).toBeUndefined();
        });

        it('passes AbortSignal to fetch', async () => {
            const mockFetch = vi.mocked(fetch);
            mockFetch.mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue({}),
            } as unknown as Response);
            const io = makeNodeIO();
            await io.fetchJson('https://example.com', 2000);
            expect(mockFetch).toHaveBeenCalledWith(
                'https://example.com',
                expect.objectContaining({ signal: expect.any(AbortSignal) }),
            );
        });
    });

    // ---------- getInstalledBricks ----------

    describe('getInstalledBricks', () => {
        it('returns installed bricks from center.json', async () => {
            const centerJson = JSON.stringify({
                bricks: {
                    treesitter: { version: '0.5.1', enabled: true },
                    refs: { version: '0.3.2', enabled: false },
                },
            });
            mockReadFile.mockResolvedValue(
                centerJson as unknown as Awaited<ReturnType<typeof readFile>>,
            );
            const io = makeNodeIO();
            const result = await io.getInstalledBricks();
            expect(result).toEqual({ treesitter: '0.5.1', refs: '0.3.2' });
            expect(mockReadFile).toHaveBeenCalledWith(CENTER_JSON, 'utf-8');
        });

        it('returns empty object when center.json does not exist', async () => {
            mockReadFile.mockRejectedValue(new Error('ENOENT'));
            const io = makeNodeIO();
            const result = await io.getInstalledBricks();
            expect(result).toEqual({});
        });

        it('returns empty object when center.json has no bricks key', async () => {
            mockReadFile.mockResolvedValue('{}' as unknown as Awaited<ReturnType<typeof readFile>>);
            const io = makeNodeIO();
            const result = await io.getInstalledBricks();
            expect(result).toEqual({});
        });

        it('returns empty object when center.json is invalid JSON', async () => {
            mockReadFile.mockResolvedValue(
                'not-json' as unknown as Awaited<ReturnType<typeof readFile>>,
            );
            const io = makeNodeIO();
            const result = await io.getInstalledBricks();
            expect(result).toEqual({});
        });

        it('skips brick entries without a version string', async () => {
            const centerJson = JSON.stringify({
                bricks: {
                    treesitter: { version: '0.5.1' },
                    badentry: { noversion: true },
                    nullentry: null,
                },
            });
            mockReadFile.mockResolvedValue(
                centerJson as unknown as Awaited<ReturnType<typeof readFile>>,
            );
            const io = makeNodeIO();
            const result = await io.getInstalledBricks();
            expect(result).toEqual({ treesitter: '0.5.1' });
        });

        it('returns empty object when bricks value is not an object', async () => {
            const centerJson = JSON.stringify({ bricks: 'not-an-object' });
            mockReadFile.mockResolvedValue(
                centerJson as unknown as Awaited<ReturnType<typeof readFile>>,
            );
            const io = makeNodeIO();
            const result = await io.getInstalledBricks();
            expect(result).toEqual({});
        });
    });

    // ---------- getCatalogUrls ----------

    describe('getCatalogUrls', () => {
        it('returns catalog URLs from catalogs.json', async () => {
            const storeJson = JSON.stringify({
                sources: [{ url: 'https://custom.io/catalog.json' }],
            });
            mockReadFile.mockResolvedValue(
                storeJson as unknown as Awaited<ReturnType<typeof readFile>>,
            );
            mockParseCatalogStore.mockReturnValue({ sources: [] });
            mockGetEnabledSources.mockReturnValue([
                { url: 'https://custom.io/catalog.json' },
            ] as unknown as ReturnType<typeof getEnabledSources>);
            const io = makeNodeIO();
            const result = await io.getCatalogUrls();
            expect(result).toEqual(['https://custom.io/catalog.json']);
            expect(mockReadFile).toHaveBeenCalledWith(CATALOG_STORE_JSON, 'utf-8');
        });

        it('falls back to default store when catalogs.json does not exist', async () => {
            mockReadFile.mockRejectedValue(new Error('ENOENT'));
            mockCreateDefaultStore.mockReturnValue({ sources: [] } as ReturnType<
                typeof createDefaultStore
            >);
            mockGetEnabledSources.mockReturnValue([
                { url: 'https://catalog.focusmcp.io/catalog.json' },
            ] as unknown as ReturnType<typeof getEnabledSources>);
            const io = makeNodeIO();
            const result = await io.getCatalogUrls();
            expect(result).toEqual(['https://catalog.focusmcp.io/catalog.json']);
            expect(mockCreateDefaultStore).toHaveBeenCalled();
        });

        it('falls back to default store when catalogs.json is invalid JSON', async () => {
            mockReadFile.mockResolvedValue(
                'invalid-json' as unknown as Awaited<ReturnType<typeof readFile>>,
            );
            mockCreateDefaultStore.mockReturnValue({ sources: [] } as ReturnType<
                typeof createDefaultStore
            >);
            mockGetEnabledSources.mockReturnValue([
                { url: 'https://catalog.focusmcp.io/catalog.json' },
            ] as unknown as ReturnType<typeof getEnabledSources>);
            const io = makeNodeIO();
            const result = await io.getCatalogUrls();
            expect(result).toEqual(['https://catalog.focusmcp.io/catalog.json']);
            expect(mockCreateDefaultStore).toHaveBeenCalled();
        });
    });
});
