// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { homedir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', () => ({
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
}));

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { FilesystemCatalogStoreAdapter } from './catalog-store-adapter.ts';

const FOCUS_DIR = join(homedir(), '.focus');
const CATALOGS_PATH = join(FOCUS_DIR, 'catalogs.json');

describe('FilesystemCatalogStoreAdapter', () => {
    let adapter: FilesystemCatalogStoreAdapter;

    beforeEach(() => {
        adapter = new FilesystemCatalogStoreAdapter();
        vi.clearAllMocks();
    });

    describe('readStore()', () => {
        it('returns { sources: [] } when file does not exist (ENOENT)', async () => {
            const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
            vi.mocked(readFile).mockRejectedValue(err);

            const result = await adapter.readStore();

            expect(result).toEqual({ sources: [] });
        });

        it('parses and returns valid JSON content', async () => {
            const data = {
                sources: [
                    {
                        url: 'https://example.com/catalog.json',
                        name: 'test',
                        enabled: true,
                        addedAt: '2026-01-01T00:00:00Z',
                    },
                ],
            };
            vi.mocked(readFile).mockResolvedValue(JSON.stringify(data));

            const result = await adapter.readStore();

            expect(result).toEqual(data);
            expect(readFile).toHaveBeenCalledWith(CATALOGS_PATH, 'utf-8');
        });

        it('re-throws errors that are not ENOENT', async () => {
            const err = Object.assign(new Error('Permission denied'), { code: 'EACCES' });
            vi.mocked(readFile).mockRejectedValue(err);

            await expect(adapter.readStore()).rejects.toThrow('Permission denied');
        });

        it('re-throws non-Error exceptions', async () => {
            vi.mocked(readFile).mockRejectedValue('unexpected string error');

            await expect(adapter.readStore()).rejects.toBe('unexpected string error');
        });
    });

    describe('writeStore()', () => {
        it('creates the directory and writes the file', async () => {
            vi.mocked(mkdir).mockResolvedValue(undefined);
            vi.mocked(writeFile).mockResolvedValue(undefined);

            const data = {
                sources: [
                    {
                        url: 'https://example.com/catalog.json',
                        name: 'test',
                        enabled: true,
                        addedAt: '2026-01-01T00:00:00Z',
                    },
                ],
            };
            await adapter.writeStore(data);

            expect(mkdir).toHaveBeenCalledWith(FOCUS_DIR, { recursive: true });
            expect(writeFile).toHaveBeenCalledWith(
                CATALOGS_PATH,
                JSON.stringify(data, null, 4),
                'utf-8',
            );
        });
    });
});
