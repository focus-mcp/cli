// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { access, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
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

function safeBrickPath(bricksDir: string, brickName: string, ...rest: string[]): string {
    return resolve(join(bricksDir, brickName, ...rest));
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
        const manifestPath = safeBrickPath(this.#bricksDir, brickName, 'mcp-brick.json');
        const raw = await readFile(manifestPath, 'utf-8');
        return JSON.parse(raw);
    }

    async loadModule(name: string): Promise<unknown> {
        const brickName = safeBrickName(name);
        const distPath = safeBrickPath(this.#bricksDir, brickName, 'dist', 'index.js');
        const cacheBuster = `?t=${Date.now()}`;
        try {
            await access(distPath);
            return import(`${distPath}${cacheBuster}`);
        } catch {
            const srcPath = safeBrickPath(this.#bricksDir, brickName, 'src', 'index.ts');
            return import(`${srcPath}${cacheBuster}`);
        }
    }
}
