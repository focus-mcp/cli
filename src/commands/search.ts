// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * focus search <query>
 *
 * Fetches all enabled catalog sources, aggregates bricks across them,
 * then filters by the query and formats results as a table.
 * Pure function: all I/O is injected via SearchIO.
 */

import {
    aggregateCatalogs,
    fetchAllCatalogs,
    searchBricks,
} from '../../../core/packages/core/src/marketplace/catalog-fetcher.ts';
import {
    createDefaultStore,
    getEnabledSources,
    parseCatalogStore,
} from '../../../core/packages/core/src/marketplace/catalog-store.ts';
import type { CatalogStoreIO } from '../adapters/catalog-store-adapter.ts';
import type { FetchIO } from '../adapters/http-fetch-adapter.ts';

export interface SearchIO {
    readonly fetch: FetchIO;
    readonly store: CatalogStoreIO;
}

export interface SearchCommandInput {
    readonly query: string;
    readonly io: SearchIO;
}

export interface SearchCommandResult {
    readonly output: string;
    readonly errors: readonly string[];
}

/**
 * Executes the search command. Returns the formatted table string and any
 * non-fatal fetch errors (one per catalog URL that could not be reached).
 */
export async function searchCommand({
    query,
    io,
}: SearchCommandInput): Promise<SearchCommandResult> {
    const rawStore = await io.store.readStore();
    let store = parseCatalogStore(rawStore);

    // If no sources are configured, initialise with the default.
    if (store.sources.length === 0) {
        store = createDefaultStore();
    }

    const enabled = getEnabledSources(store);
    if (enabled.length === 0) {
        return { output: 'No enabled catalog sources. Use `focus catalog add <url>`.', errors: [] };
    }

    const urls = enabled.map((s) => s.url);
    const { results, errors: fetchErrors } = await fetchAllCatalogs(io.fetch, urls);

    const aggregated = aggregateCatalogs(results);
    const allErrors = [
        ...fetchErrors.map((e) => `${e.url}: ${e.error}`),
        ...aggregated.errors.map((e) => `${e.url}: ${e.error}`),
    ];

    const trimmedQuery = query.trim();
    const found =
        trimmedQuery.length === 0 ? aggregated.bricks : searchBricks(aggregated, trimmedQuery);

    if (found.length === 0) {
        return {
            output:
                trimmedQuery.length === 0
                    ? 'No bricks available.'
                    : `No bricks matching "${trimmedQuery}".`,
            errors: allErrors,
        };
    }

    const rows = found.map((b) => ({
        name: b.name,
        version: b.version,
        catalog: b.catalogName,
        description: b.description,
    }));
    const lines = formatTable(rows);
    return { output: lines.join('\n'), errors: allErrors };
}

// ---------- formatting ----------

interface Row {
    readonly name: string;
    readonly version: string;
    readonly catalog: string;
    readonly description: string;
}

function formatTable(bricks: readonly Row[]): string[] {
    const header: Row = {
        name: 'NAME',
        version: 'VERSION',
        catalog: 'CATALOG',
        description: 'DESCRIPTION',
    };
    const rows = [header, ...bricks];

    const nameW = Math.max(...rows.map((r) => r.name.length));
    const versionW = Math.max(...rows.map((r) => r.version.length));
    const catalogW = Math.max(...rows.map((r) => r.catalog.length));

    return rows.map(
        (r) =>
            `${r.name.padEnd(nameW)}  ${r.version.padEnd(versionW)}  ${r.catalog.padEnd(catalogW)}  ${r.description}`,
    );
}
