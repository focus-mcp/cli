// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { access, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { BrickSource } from '@focusmcp/core';
import type { CenterJson } from '../center.ts';

export interface FilesystemSourceOptions {
    readonly centerJson: CenterJson;
    readonly bricksDir: string;
}

function safeBrickName(name: string): string {
    const segment = name.split('/').pop() ?? name;
    if (!segment || segment === '.' || segment === '..' || segment.includes('/')) {
        throw new Error(`Invalid brick name: "${name}"`);
    }
    return segment;
}

function safeBrickPath(bricksDir: string, brickName: string, ...rest: string[]): string {
    const resolved = resolve(join(bricksDir, brickName, ...rest));
    const base = resolve(bricksDir);
    if (!resolved.startsWith(base)) {
        throw new Error(`Path traversal detected for brick "${brickName}"`);
    }
    return resolved;
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
        try {
            await access(distPath);
            return import(distPath);
        } catch {
            const srcPath = safeBrickPath(this.#bricksDir, brickName, 'src', 'index.ts');
            return import(srcPath);
        }
    }
}
