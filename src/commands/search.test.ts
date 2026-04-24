// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from 'vitest';
import type { CatalogStoreIO } from '../adapters/catalog-store-adapter.ts';
import type { FetchIO } from '../adapters/http-fetch-adapter.ts';
import { searchCommand } from './search.ts';

// ---------- helpers ----------

const DEFAULT_URL =
    'https://focus-mcp.github.io/marketplace/catalog.json';

function makeFetchIO(overrides: Partial<FetchIO> = {}): FetchIO {
    return {
        fetchJson: vi.fn().mockResolvedValue(validCatalog()),
        ...overrides,
    };
}

function makeStoreIO(sourcesPayload: unknown = { sources: [] }): CatalogStoreIO {
    return {
        readStore: vi.fn().mockResolvedValue(sourcesPayload),
        writeStore: vi.fn().mockResolvedValue(undefined),
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
        description: 'Echo brick for testing',
        tags: ['utility'],
        dependencies: [],
        tools: [{ name: 'say', description: 'Echo text' }],
        source: { type: 'npm', package: '@focus-mcp/brick-echo' },
        ...overrides,
    };
}

// ---------- tests ----------

describe('searchCommand', () => {
    it('uses the default catalog when store has no sources', async () => {
        const fetch = makeFetchIO();
        const store = makeStoreIO({ sources: [] });

        await searchCommand({ query: '', io: { fetch, store } });

        expect(fetch.fetchJson).toHaveBeenCalledWith(DEFAULT_URL);
    });

    it('shows "no enabled sources" when all sources are disabled', async () => {
        const fetch = makeFetchIO();
        const store = makeStoreIO({
            sources: [
                {
                    url: 'https://example.com/catalog.json',
                    name: 'Disabled',
                    enabled: false,
                    addedAt: '2026-01-01T00:00:00Z',
                },
            ],
        });

        const result = await searchCommand({ query: 'anything', io: { fetch, store } });

        expect(result.output).toMatch(/no enabled catalog sources/i);
        expect(fetch.fetchJson).not.toHaveBeenCalled();
    });

    it('returns all bricks when query is empty', async () => {
        const fetch = makeFetchIO({
            fetchJson: vi
                .fn()
                .mockResolvedValue(
                    validCatalog([validBrick({ name: 'echo' }), validBrick({ name: 'indexer' })]),
                ),
        });
        const store = makeStoreIO({
            sources: [
                {
                    url: DEFAULT_URL,
                    name: 'FocusMCP Marketplace',
                    enabled: true,
                    addedAt: '2026-01-01T00:00:00Z',
                },
            ],
        });

        const result = await searchCommand({ query: '', io: { fetch, store } });

        expect(result.output).toMatch(/echo/);
        expect(result.output).toMatch(/indexer/);
    });

    it('filters bricks by query on name', async () => {
        const fetch = makeFetchIO({
            fetchJson: vi
                .fn()
                .mockResolvedValue(
                    validCatalog([
                        validBrick({ name: 'echo', description: 'Echo tool' }),
                        validBrick({ name: 'indexer', description: 'Index documents' }),
                    ]),
                ),
        });
        const store = makeStoreIO({
            sources: [
                {
                    url: DEFAULT_URL,
                    name: 'FocusMCP Marketplace',
                    enabled: true,
                    addedAt: '2026-01-01T00:00:00Z',
                },
            ],
        });

        const result = await searchCommand({ query: 'echo', io: { fetch, store } });

        expect(result.output).toMatch(/echo/);
        expect(result.output).not.toMatch(/indexer/);
    });

    it('returns "no bricks matching" when query yields nothing', async () => {
        const fetch = makeFetchIO({
            fetchJson: vi.fn().mockResolvedValue(validCatalog([validBrick({ name: 'echo' })])),
        });
        const store = makeStoreIO({
            sources: [
                {
                    url: DEFAULT_URL,
                    name: 'FocusMCP Marketplace',
                    enabled: true,
                    addedAt: '2026-01-01T00:00:00Z',
                },
            ],
        });

        const result = await searchCommand({ query: 'nonexistent', io: { fetch, store } });

        expect(result.output).toMatch(/no bricks matching/i);
    });

    it('surfaces fetch errors as non-fatal', async () => {
        const fetch = makeFetchIO({
            fetchJson: vi.fn().mockRejectedValue(new Error('network failure')),
        });
        const store = makeStoreIO({
            sources: [
                {
                    url: DEFAULT_URL,
                    name: 'FocusMCP Marketplace',
                    enabled: true,
                    addedAt: '2026-01-01T00:00:00Z',
                },
            ],
        });

        const result = await searchCommand({ query: '', io: { fetch, store } });

        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toMatch(/network failure/);
    });

    it('formats results with NAME / VERSION / CATALOG / DESCRIPTION columns', async () => {
        const fetch = makeFetchIO({
            fetchJson: vi
                .fn()
                .mockResolvedValue(
                    validCatalog([
                        validBrick({ name: 'echo', version: '2.1.0', description: 'An echo tool' }),
                    ]),
                ),
        });
        const store = makeStoreIO({
            sources: [
                {
                    url: DEFAULT_URL,
                    name: 'FocusMCP Marketplace',
                    enabled: true,
                    addedAt: '2026-01-01T00:00:00Z',
                },
            ],
        });

        const result = await searchCommand({ query: '', io: { fetch, store } });

        expect(result.output).toMatch(/NAME/);
        expect(result.output).toMatch(/VERSION/);
        expect(result.output).toMatch(/CATALOG/);
        expect(result.output).toMatch(/DESCRIPTION/);
        expect(result.output).toMatch(/2\.1\.0/);
        expect(result.output).toMatch(/An echo tool/);
    });
});
