// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * useCatalogs — loads registered catalog sources from ~/.focus/catalogs.json.
 * Falls back to the default store if the file is missing or empty.
 */

import type { CatalogSource } from '@focus-mcp/core';
import { createDefaultStore, parseCatalogStore } from '@focus-mcp/core';
import { useEffect, useState } from 'react';
import { FilesystemCatalogStoreAdapter } from '../../adapters/catalog-store-adapter.ts';

export interface CatalogEntry extends CatalogSource {
    readonly brickCount?: number;
}

export function useCatalogs(): {
    readonly catalogs: CatalogEntry[];
    readonly loading: boolean;
    readonly error: string | null;
} {
    const [catalogs, setCatalogs] = useState<CatalogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const adapter = new FilesystemCatalogStoreAdapter();
        adapter
            .readStore()
            .then((raw) => {
                if (cancelled) return;
                try {
                    const store = parseCatalogStore(raw);
                    const sources =
                        store.sources.length > 0 ? store.sources : createDefaultStore().sources;
                    setCatalogs([...sources]);
                } catch {
                    setCatalogs([...createDefaultStore().sources]);
                }
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                setError(err instanceof Error ? err.message : String(err));
                setCatalogs([...createDefaultStore().sources]);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    return { catalogs, loading, error };
}
