// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * focus catalog add|remove|list
 *
 * Manages the list of catalog source URLs stored at ~/.focus/catalogs.json.
 * Pure function: all I/O is injected via CatalogCommandIO.
 */

import {
    addSource,
    createDefaultStore,
    listSources,
    parseCatalogStore,
    removeSource,
} from '@focus-mcp/core';
import type { CatalogStoreData, CatalogStoreIO } from '../adapters/catalog-store-adapter.ts';

export type CatalogSubcommand = 'add' | 'remove' | 'list';

export interface CatalogCommandIO {
    readonly store: CatalogStoreIO;
}

export interface CatalogAddInput {
    readonly subcommand: 'add';
    readonly url: string;
    readonly name: string;
    readonly io: CatalogCommandIO;
}

export interface CatalogRemoveInput {
    readonly subcommand: 'remove';
    readonly url: string;
    /** When true, removes even the default catalog source. */
    readonly force?: boolean;
    readonly io: CatalogCommandIO;
}

export interface CatalogListInput {
    readonly subcommand: 'list';
    readonly io: CatalogCommandIO;
}

export type CatalogCommandInput = CatalogAddInput | CatalogRemoveInput | CatalogListInput;

// ---------- helpers ----------

async function loadStore(io: CatalogCommandIO): Promise<CatalogStoreData> {
    const raw = await io.store.readStore();
    try {
        const parsed = parseCatalogStore(raw);
        return parsed.sources.length === 0 ? createDefaultStore() : parsed;
    } catch {
        return createDefaultStore();
    }
}

// ---------- catalogCommand ----------

export async function catalogCommand(input: CatalogCommandInput): Promise<string> {
    if (input.subcommand === 'add') {
        return catalogAdd(input);
    }
    if (input.subcommand === 'remove') {
        return catalogRemove(input);
    }
    return catalogList(input);
}

async function catalogAdd({ url, name, io }: CatalogAddInput): Promise<string> {
    if (url.trim().length === 0) {
        throw new Error('Catalog URL must not be empty.');
    }
    if (name.trim().length === 0) {
        throw new Error('Catalog name must not be empty.');
    }

    const store = await loadStore({ store: io.store });
    const updated = addSource(store, url, name);
    await io.store.writeStore(updated as CatalogStoreData);
    return `Added catalog "${name}" (${url})`;
}

async function catalogRemove({ url, force, io }: CatalogRemoveInput): Promise<string> {
    if (url.trim().length === 0) {
        throw new Error('Catalog URL must not be empty.');
    }

    const store = await loadStore({ store: io.store });
    const updated = removeSource(store, url, force === true ? { force: true } : {});
    await io.store.writeStore(updated as CatalogStoreData);
    return `Removed catalog ${url}`;
}

async function catalogList({ io }: CatalogListInput): Promise<string> {
    const store = await loadStore({ store: io.store });
    const sources = listSources(store);

    if (sources.length === 0) {
        return 'No catalog sources configured.';
    }

    const lines = sources.map((s) => {
        const status = s.enabled ? 'enabled' : 'disabled';
        return `${s.name}  ${s.url}  [${status}]`;
    });
    return lines.join('\n');
}
