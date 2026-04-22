// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * Filesystem implementation of CatalogStoreIO.
 *
 * Reads and writes the catalog source registry at ~/.focus/catalogs.json.
 * Conforms to the CatalogStoreIO interface expected by @focusmcp/core
 * marketplace/catalog-store pure functions.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { CatalogStoreData, CatalogStoreIO } from '@focusmcp/core';

export type { CatalogStoreData, CatalogStoreIO };

const FOCUS_DIR = join(homedir(), '.focus');
const CATALOGS_PATH = join(FOCUS_DIR, 'catalogs.json');

export class FilesystemCatalogStoreAdapter implements CatalogStoreIO {
    async readStore(): Promise<unknown> {
        try {
            const raw = await readFile(CATALOGS_PATH, 'utf-8');
            return JSON.parse(raw) as unknown;
        } catch (err: unknown) {
            const isNotFound =
                err instanceof Error &&
                'code' in err &&
                (err as { code: string }).code === 'ENOENT';
            if (isNotFound) {
                return { sources: [] };
            }
            throw err;
        }
    }

    async writeStore(data: CatalogStoreData): Promise<void> {
        await mkdir(FOCUS_DIR, { recursive: true });
        await writeFile(CATALOGS_PATH, JSON.stringify(data, null, 4), 'utf-8');
    }
}
