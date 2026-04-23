// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * useBricks — fetches bricks from a single catalog URL or all enabled catalogs.
 * When catalogUrl is undefined, fetches and aggregates all enabled sources.
 */

import type { AggregatedBrick } from '@focus-mcp/core';
import {
    aggregateCatalogs,
    createDefaultStore,
    fetchAllCatalogs,
    getEnabledSources,
    parseCatalogStore,
} from '@focus-mcp/core';
import { useEffect, useState } from 'react';
import { FilesystemCatalogStoreAdapter } from '../../adapters/catalog-store-adapter.ts';
import { HttpFetchAdapter } from '../../adapters/http-fetch-adapter.ts';

async function resolveUrls(
    catalogUrl: string | undefined,
    storeIO: FilesystemCatalogStoreAdapter,
): Promise<string[]> {
    if (catalogUrl !== undefined) {
        return [catalogUrl];
    }
    const raw = await storeIO.readStore();
    let store = parseCatalogStore(raw);
    if (store.sources.length === 0) {
        store = createDefaultStore();
    }
    return getEnabledSources(store).map((s) => s.url);
}

export function useBricks(catalogUrl?: string): {
    readonly bricks: AggregatedBrick[];
    readonly loading: boolean;
    readonly error: string | null;
} {
    const [bricks, setBricks] = useState<AggregatedBrick[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchIO = new HttpFetchAdapter();
        const storeIO = new FilesystemCatalogStoreAdapter();

        const load = async (): Promise<void> => {
            try {
                const urls = await resolveUrls(catalogUrl, storeIO);
                const { results, errors: fetchErrors } = await fetchAllCatalogs(fetchIO, urls);
                if (fetchErrors.length > 0 && results.length === 0) {
                    setError(
                        `Failed to fetch catalog(s): ${fetchErrors.map((e) => e.error).join(', ')}`,
                    );
                    return;
                }
                const agg = aggregateCatalogs(results);
                setBricks([...agg.bricks]);
            } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
            } finally {
                setLoading(false);
            }
        };

        void load();
    }, [catalogUrl]);

    return { bricks, loading, error };
}
