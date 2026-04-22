// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * Node.js (≥ 22) implementation of FetchIO using the global fetch API.
 *
 * Conforms to the FetchIO interface expected by @focusmcp/core
 * marketplace/catalog-fetcher pure functions.
 */

export interface FetchIO {
    fetchJson(url: string): Promise<unknown>;
}

export class HttpFetchAdapter implements FetchIO {
    async fetchJson(url: string): Promise<unknown> {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status.toString()} fetching ${url}`);
        }
        return response.json() as Promise<unknown>;
    }
}
