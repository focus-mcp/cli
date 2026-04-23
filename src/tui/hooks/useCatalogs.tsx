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
} {
    const [catalogs, setCatalogs] = useState<CatalogEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const adapter = new FilesystemCatalogStoreAdapter();
        adapter
            .readStore()
            .then((raw) => {
                try {
                    const store = parseCatalogStore(raw);
                    const sources =
                        store.sources.length > 0 ? store.sources : createDefaultStore().sources;
                    setCatalogs([...sources]);
                } catch {
                    setCatalogs([...createDefaultStore().sources]);
                }
            })
            .catch(() => {
                setCatalogs([...createDefaultStore().sources]);
            })
            .finally(() => {
                setLoading(false);
            });
    }, []);

    return { catalogs, loading };
}
