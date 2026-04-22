// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpFetchAdapter } from './http-fetch-adapter.ts';

describe('HttpFetchAdapter', () => {
    let adapter: HttpFetchAdapter;

    beforeEach(() => {
        adapter = new HttpFetchAdapter();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe('fetchJson()', () => {
        it('returns parsed JSON on a successful response', async () => {
            const payload = { bricks: ['official/echo'] };
            const mockResponse = {
                ok: true,
                status: 200,
                json: vi.fn().mockResolvedValue(payload),
            };
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

            const result = await adapter.fetchJson('https://example.com/catalog.json');

            expect(result).toEqual(payload);
            expect(fetch).toHaveBeenCalledWith('https://example.com/catalog.json');
        });

        it('throws an error when the response is not ok (404)', async () => {
            const mockResponse = {
                ok: false,
                status: 404,
                json: vi.fn(),
            };
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

            await expect(adapter.fetchJson('https://example.com/missing.json')).rejects.toThrow(
                'HTTP 404 fetching https://example.com/missing.json',
            );
        });

        it('throws an error when the response is not ok (500)', async () => {
            const mockResponse = {
                ok: false,
                status: 500,
                json: vi.fn(),
            };
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

            await expect(adapter.fetchJson('https://example.com/catalog.json')).rejects.toThrow(
                'HTTP 500 fetching https://example.com/catalog.json',
            );
        });

        it('propagates network errors', async () => {
            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

            await expect(adapter.fetchJson('https://example.com/catalog.json')).rejects.toThrow(
                'Network error',
            );
        });
    });
});
