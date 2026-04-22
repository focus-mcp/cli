// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from 'vitest';
import type { CatalogStoreIO } from '../adapters/catalog-store-adapter.ts';
import { catalogCommand } from './catalog.ts';

// ---------- helpers ----------

const DEFAULT_URL = 'https://focus-mcp.github.io/marketplace/catalog.json';
const EXTRA_URL = 'https://example.com/catalog.json';

function makeStoreIO(sourcesPayload: unknown = { sources: [] }): CatalogStoreIO {
    return {
        readStore: vi.fn().mockResolvedValue(sourcesPayload),
        writeStore: vi.fn().mockResolvedValue(undefined),
    };
}

function storeWithDefault() {
    return makeStoreIO({
        sources: [
            {
                url: DEFAULT_URL,
                name: 'FocusMCP Marketplace',
                enabled: true,
                addedAt: '2026-01-01T00:00:00Z',
            },
        ],
    });
}

function storeWithExtra() {
    return makeStoreIO({
        sources: [
            {
                url: DEFAULT_URL,
                name: 'FocusMCP Marketplace',
                enabled: true,
                addedAt: '2026-01-01T00:00:00Z',
            },
            {
                url: EXTRA_URL,
                name: 'Extra Catalog',
                enabled: true,
                addedAt: '2026-01-01T00:00:00Z',
            },
        ],
    });
}

// ---------- catalog list ----------

describe('catalogCommand list', () => {
    it('shows "no catalog sources" when none are configured (empty sources)', async () => {
        const store = makeStoreIO({ sources: [] });
        // Empty store falls back to default which has one source
        const result = await catalogCommand({ subcommand: 'list', io: { store } });
        // Falls back to default store
        expect(result).toMatch(DEFAULT_URL);
    });

    it('lists configured sources with name, url and status', async () => {
        const store = storeWithDefault();
        const result = await catalogCommand({ subcommand: 'list', io: { store } });
        expect(result).toMatch(/FocusMCP Marketplace/);
        expect(result).toMatch(DEFAULT_URL);
        expect(result).toMatch(/enabled/);
    });

    it('lists multiple sources', async () => {
        const store = storeWithExtra();
        const result = await catalogCommand({ subcommand: 'list', io: { store } });
        expect(result).toMatch(/FocusMCP Marketplace/);
        expect(result).toMatch(/Extra Catalog/);
    });
});

// ---------- catalog add ----------

describe('catalogCommand add', () => {
    it('throws when url is empty', async () => {
        const store = storeWithDefault();
        await expect(
            catalogCommand({ subcommand: 'add', url: '', name: 'My Catalog', io: { store } }),
        ).rejects.toThrow(/url must not be empty/i);
    });

    it('throws when name is empty', async () => {
        const store = storeWithDefault();
        await expect(
            catalogCommand({ subcommand: 'add', url: EXTRA_URL, name: '', io: { store } }),
        ).rejects.toThrow(/name must not be empty/i);
    });

    it('throws when the url already exists', async () => {
        const store = storeWithDefault();
        await expect(
            catalogCommand({
                subcommand: 'add',
                url: DEFAULT_URL,
                name: 'Duplicate',
                io: { store },
            }),
        ).rejects.toThrow(/already exists/i);
    });

    it('writes the updated store and returns a success message', async () => {
        const store = storeWithDefault();
        const result = await catalogCommand({
            subcommand: 'add',
            url: EXTRA_URL,
            name: 'Extra Catalog',
            io: { store },
        });

        expect(store.writeStore).toHaveBeenCalledOnce();
        expect(result).toMatch(/added catalog/i);
        expect(result).toMatch(/Extra Catalog/);
        expect(result).toMatch(EXTRA_URL);
    });

    it('includes the new source in the written store data', async () => {
        const store = storeWithDefault();
        await catalogCommand({
            subcommand: 'add',
            url: EXTRA_URL,
            name: 'Extra Catalog',
            io: { store },
        });

        const written = (store.writeStore as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
            sources: Array<{ url: string }>;
        };
        expect(written.sources.some((s) => s.url === EXTRA_URL)).toBe(true);
    });
});

// ---------- catalog remove ----------

describe('catalogCommand remove', () => {
    it('throws when url is empty', async () => {
        const store = storeWithDefault();
        await expect(
            catalogCommand({ subcommand: 'remove', url: '', io: { store } }),
        ).rejects.toThrow(/url must not be empty/i);
    });

    it('throws when trying to remove the default catalog', async () => {
        const store = storeWithDefault();
        await expect(
            catalogCommand({ subcommand: 'remove', url: DEFAULT_URL, io: { store } }),
        ).rejects.toThrow(/cannot remove the default/i);
    });

    it('throws when the source does not exist', async () => {
        const store = storeWithDefault();
        await expect(
            catalogCommand({
                subcommand: 'remove',
                url: 'https://notexist.com/catalog.json',
                io: { store },
            }),
        ).rejects.toThrow(/not found/i);
    });

    it('writes the updated store without the removed source', async () => {
        const store = storeWithExtra();
        const result = await catalogCommand({
            subcommand: 'remove',
            url: EXTRA_URL,
            io: { store },
        });

        expect(store.writeStore).toHaveBeenCalledOnce();
        const written = (store.writeStore as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
            sources: Array<{ url: string }>;
        };
        expect(written.sources.some((s) => s.url === EXTRA_URL)).toBe(false);
        expect(result).toMatch(/removed catalog/i);
        expect(result).toMatch(EXTRA_URL);
    });
});
