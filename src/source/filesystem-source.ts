// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BrickSource } from '@focusmcp/core';
import type { CenterJson } from '../center.ts';

export interface FilesystemSourceOptions {
    readonly centerJson: CenterJson;
    readonly bricksDir: string;
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
        const brickName = name.split('/').pop() ?? name;
        const manifestPath = join(this.#bricksDir, brickName, 'mcp-brick.json');
        const raw = await readFile(manifestPath, 'utf-8');
        return JSON.parse(raw);
    }

    async loadModule(name: string): Promise<unknown> {
        const brickName = name.split('/').pop() ?? name;
        const entryPath = join(this.#bricksDir, brickName, 'src', 'index.ts');
        return import(entryPath);
    }
}
