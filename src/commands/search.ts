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
    type AggregatedBrick,
    aggregateCatalogs,
    createDefaultStore,
    fetchAllCatalogs,
    getEnabledSources,
    parseCatalogStore,
    searchBricks,
} from '@focus-mcp/core';
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

/**
 * Enriched brick result that includes optional discovery fields.
 * keywords and recommendedFor are available when the brick manifest
 * declares them (requires @focus-mcp/core >= 1.5.0 at runtime).
 */
export interface SearchResultBrick {
    readonly name: string;
    readonly version: string;
    readonly catalog: string;
    readonly description: string;
    readonly keywords?: readonly string[];
    readonly recommendedFor?: readonly string[];
}

export interface SearchCommandResult {
    readonly output: string;
    readonly errors: readonly string[];
    /** Structured brick list, suitable for MCP tool JSON responses. */
    readonly bricks: readonly SearchResultBrick[];
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
        return {
            output: 'No enabled catalog sources. Use `focus catalog add <url>`.',
            errors: [],
            bricks: [],
        };
    }

    const urls = enabled.map((s) => s.url);
    const { results, errors: fetchErrors } = await fetchAllCatalogs(io.fetch, urls);

    const aggregated = aggregateCatalogs(results);
    const allErrors = [
        ...fetchErrors.map((e) => `${e.url}: ${e.error}`),
        ...aggregated.errors.map((e) => `${e.url}: ${e.error}`),
    ];

    const trimmedQuery = query.trim();
    const found: readonly AggregatedBrick[] =
        trimmedQuery.length === 0 ? aggregated.bricks : searchBricks(aggregated, trimmedQuery);

    if (found.length === 0) {
        return {
            output:
                trimmedQuery.length === 0
                    ? 'No bricks available.'
                    : `No bricks matching "${trimmedQuery}".`,
            errors: allErrors,
            bricks: [],
        };
    }

    const bricks: SearchResultBrick[] = found.map((b) => toBrickResult(b));
    const lines = formatTable(bricks);
    return { output: lines.join('\n'), errors: allErrors, bricks };
}

// ---------- helpers ----------

function toBrickResult(b: AggregatedBrick): SearchResultBrick {
    // keywords and recommendedFor are available at runtime when core >= 1.5.0.
    // They are not yet in the 1.4.0 type definitions, so we access them safely.
    const raw = b as AggregatedBrick & {
        keywords?: readonly string[];
        recommendedFor?: readonly string[];
    };
    return {
        name: b.name,
        version: b.version,
        catalog: b.catalogName,
        description: b.description,
        ...(raw.keywords !== undefined ? { keywords: raw.keywords } : {}),
        ...(raw.recommendedFor !== undefined ? { recommendedFor: raw.recommendedFor } : {}),
    };
}

// ---------- formatting ----------

function formatTable(bricks: readonly SearchResultBrick[]): string[] {
    const header = {
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
