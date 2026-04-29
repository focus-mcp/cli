// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * Node.js I/O adapter for the update-checker module.
 *
 * `makeNodeIO()` constructs the `UpdateCheckIO` implementation that reads
 * from the local filesystem and fetches from the npm registry / catalogs.
 *
 * This lives in @focus-mcp/cli (not core) so that core stays browser-compatible.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import {
    createDefaultStore,
    getEnabledSources,
    parseCatalogStore,
    type UpdateCheckIO,
} from '@focus-mcp/core';

const FOCUS_DIR = join(homedir(), '.focus');
const CENTER_JSON = join(FOCUS_DIR, 'center.json');
const CATALOG_STORE_JSON = join(FOCUS_DIR, 'catalogs.json');

/**
 * Build the Node.js UpdateCheckIO adapter.
 *
 * Pure factory: no side effects at call time. The returned object performs
 * filesystem and network I/O only when its methods are invoked.
 */
export function makeNodeIO(): UpdateCheckIO {
    return {
        getFocusDir(): string {
            return FOCUS_DIR;
        },

        async readFile(path: string): Promise<string | undefined> {
            try {
                return await readFile(path, 'utf-8');
            } catch {
                return undefined;
            }
        },

        async writeFile(path: string, content: string): Promise<void> {
            await mkdir(dirname(path), { recursive: true });
            await writeFile(path, content, 'utf-8');
        },

        async fetchJson(url: string, timeoutMs: number): Promise<unknown | undefined> {
            try {
                const controller = new AbortController();
                const timer = setTimeout(() => {
                    controller.abort();
                }, timeoutMs);
                try {
                    const res = await fetch(url, { signal: controller.signal });
                    if (!res.ok) return undefined;
                    return (await res.json()) as unknown;
                } finally {
                    clearTimeout(timer);
                }
            } catch {
                return undefined;
            }
        },

        async getInstalledBricks(): Promise<Record<string, string>> {
            try {
                const raw = await readFile(CENTER_JSON, 'utf-8');
                const parsed = JSON.parse(raw) as unknown;
                if (
                    parsed !== null &&
                    typeof parsed === 'object' &&
                    'bricks' in parsed &&
                    typeof (parsed as Record<string, unknown>)['bricks'] === 'object'
                ) {
                    const bricks = (parsed as Record<string, unknown>)['bricks'] as Record<
                        string,
                        unknown
                    >;
                    const result: Record<string, string> = {};
                    for (const [name, entry] of Object.entries(bricks)) {
                        if (
                            entry !== null &&
                            typeof entry === 'object' &&
                            'version' in entry &&
                            typeof (entry as Record<string, unknown>)['version'] === 'string'
                        ) {
                            result[name] = (entry as Record<string, unknown>)['version'] as string;
                        }
                    }
                    return result;
                }
            } catch {
                // center.json absent or invalid — silently ignore
            }
            return {};
        },

        async getCatalogUrls(): Promise<readonly string[]> {
            try {
                const raw = await readFile(CATALOG_STORE_JSON, 'utf-8');
                const parsed = JSON.parse(raw) as unknown;
                const store = parseCatalogStore(parsed);
                return getEnabledSources(store).map((s) => s.url);
            } catch {
                return getEnabledSources(createDefaultStore()).map((s) => s.url);
            }
        },
    };
}
