// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { BrickSource } from '@focus-mcp/core';
import type { CenterJson } from '../center.ts';

export interface FilesystemSourceOptions {
    readonly centerJson: CenterJson;
    readonly bricksDir: string;
}

function safeBrickName(name: string): string {
    // split('/') always produces a non-empty array, so pop() never returns undefined
    const segment = name.split('/').pop() as string;
    if (!segment || segment === '.' || segment === '..' || segment.includes('/')) {
        throw new Error(`Invalid brick name: "${name}"`);
    }
    return segment;
}

/**
 * Verify that a resolved path stays within bricksDir to prevent
 * symlink / alias escapes.
 */
function assertWithinBricksDir(resolvedPath: string, bricksDir: string): void {
    let realBricksDir: string;
    try {
        realBricksDir = realpathSync(bricksDir);
    } catch {
        realBricksDir = bricksDir;
    }
    if (!resolvedPath.startsWith(`${realBricksDir}/`) && resolvedPath !== realBricksDir) {
        throw new Error(`Resolved path "${resolvedPath}" escapes bricksDir "${realBricksDir}"`);
    }
}

export class FilesystemBrickSource implements BrickSource {
    readonly #centerJson: CenterJson;
    readonly #bricksDir: string;

    constructor(options: FilesystemSourceOptions) {
        this.#centerJson = options.centerJson;
        this.#bricksDir = options.bricksDir;
    }

    async list(): Promise<readonly string[]> {
        return Object.entries(this.#centerJson.bricks)
            .filter(([, entry]) => entry.enabled)
            .map(([name]) => name);
    }

    async readManifest(name: string): Promise<unknown> {
        const brickName = safeBrickName(name);
        // Use Node's module resolution so both layouts work:
        //   flat:        <bricksDir>/<name>/mcp-brick.json
        //   npm-nested:  <bricksDir>/node_modules/@focus-mcp/brick-<name>/mcp-brick.json
        const require = createRequire(pathToFileURL(`${this.#bricksDir}/`).href);
        let manifestPath: string;
        try {
            // Preferred: package exports ./mcp-brick.json explicitly
            manifestPath = require.resolve(`@focus-mcp/brick-${brickName}/mcp-brick.json`);
        } catch (err: unknown) {
            // Fallback for packages that don't export ./mcp-brick.json:
            // resolve the package root via its main entry and look alongside it.
            const code = (err as NodeJS.ErrnoException).code;
            if (code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED' && code !== 'MODULE_NOT_FOUND') {
                throw err;
            }
            const pkgMain = require.resolve(`@focus-mcp/brick-${brickName}`);
            // Walk up until we find the directory that contains mcp-brick.json
            // (handles src/index.ts as main, dist/index.js, etc.)
            let dir = dirname(pkgMain);
            while (true) {
                const candidate = join(dir, 'mcp-brick.json');
                try {
                    await readFile(candidate, 'utf-8');
                    manifestPath = candidate;
                    break;
                } catch {
                    const parent = dirname(dir);
                    if (parent === dir) {
                        throw new Error(
                            `Cannot find mcp-brick.json for @focus-mcp/brick-${brickName}`,
                        );
                    }
                    dir = parent;
                }
            }
        }
        assertWithinBricksDir(manifestPath, this.#bricksDir);
        const raw = await readFile(manifestPath, 'utf-8');
        return JSON.parse(raw);
    }

    async loadModule(name: string): Promise<unknown> {
        const brickName = safeBrickName(name);
        // Use Node's module resolution: honours package.json exports/main for both
        // flat and npm-nested layouts.
        const require = createRequire(pathToFileURL(`${this.#bricksDir}/`).href);
        const entry = require.resolve(`@focus-mcp/brick-${brickName}`);
        assertWithinBricksDir(entry, this.#bricksDir);
        const cacheBuster = `?t=${Date.now()}`;
        return import(`${pathToFileURL(entry).href}${cacheBuster}`);
    }
}
