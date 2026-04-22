// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * Node.js implementation of InstallerIO using child_process and the
 * ~/.focus/ filesystem layout.
 *
 * Conforms to the InstallerIO interface expected by @focusmcp/core
 * marketplace/installer pure functions.
 */

import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

// ---------- local IO interface (mirrors core InstallerIO) ----------

export interface CenterEntry {
    readonly version: string;
    readonly enabled: boolean;
    readonly config?: Record<string, unknown>;
}

export interface CenterLockEntry {
    readonly version: string;
    readonly catalogUrl: string;
    readonly npmPackage: string;
    readonly installedAt: string;
}

export interface CenterJson {
    readonly bricks: Record<string, CenterEntry>;
}

export interface CenterLock {
    readonly bricks: Record<string, CenterLockEntry>;
}

export interface InstallerIO {
    npmInstall(pkg: string, version: string, opts?: { registry?: string }): Promise<void>;
    npmUninstall(pkg: string, opts?: { registry?: string }): Promise<void>;
    writeCenterJson(data: CenterJson): Promise<void>;
    writeCenterLock(data: CenterLock): Promise<void>;
    readCenterJson(): Promise<unknown>;
    readCenterLock(): Promise<unknown>;
}

// ---------- paths ----------

const FOCUS_DIR = join(homedir(), '.focus');
const CENTER_JSON_PATH = join(FOCUS_DIR, 'center.json');
const CENTER_LOCK_PATH = join(FOCUS_DIR, 'center.lock');
const BRICKS_DIR = join(FOCUS_DIR, 'bricks');

// ---------- helpers ----------

function runNpm(args: string[], opts?: { cwd?: string }): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn('npm', args, {
            stdio: 'inherit',
            shell: false,
            ...(opts?.cwd !== undefined ? { cwd: opts.cwd } : {}),
        });
        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`npm ${args[0] ?? ''} exited with code ${String(code)}`));
            }
        });
        child.on('error', reject);
    });
}

// ---------- NpmInstallerAdapter ----------

export class NpmInstallerAdapter implements InstallerIO {
    readonly #bricksDir: string;

    constructor(bricksDir: string = BRICKS_DIR) {
        this.#bricksDir = bricksDir;
    }

    async npmInstall(pkg: string, version: string, opts?: { registry?: string }): Promise<void> {
        await mkdir(this.#bricksDir, { recursive: true });
        const args = ['install', '--prefix', this.#bricksDir];
        if (opts?.registry !== undefined) {
            args.push('--registry', opts.registry);
        }
        args.push(`${pkg}@${version}`);
        await runNpm(args);
    }

    async npmUninstall(pkg: string, opts?: { registry?: string }): Promise<void> {
        const args = ['uninstall', '--prefix', this.#bricksDir];
        if (opts?.registry !== undefined) {
            args.push('--registry', opts.registry);
        }
        args.push(pkg);
        await runNpm(args);
    }

    async readCenterJson(): Promise<unknown> {
        try {
            const raw = await readFile(CENTER_JSON_PATH, 'utf-8');
            return JSON.parse(raw) as unknown;
        } catch (err: unknown) {
            const isNotFound =
                err instanceof Error &&
                'code' in err &&
                (err as { code: string }).code === 'ENOENT';
            if (isNotFound) {
                return { bricks: {} };
            }
            throw err;
        }
    }

    async readCenterLock(): Promise<unknown> {
        try {
            const raw = await readFile(CENTER_LOCK_PATH, 'utf-8');
            return JSON.parse(raw) as unknown;
        } catch (err: unknown) {
            const isNotFound =
                err instanceof Error &&
                'code' in err &&
                (err as { code: string }).code === 'ENOENT';
            if (isNotFound) {
                return { bricks: {} };
            }
            throw err;
        }
    }

    async writeCenterJson(data: CenterJson): Promise<void> {
        await mkdir(FOCUS_DIR, { recursive: true });
        await writeFile(CENTER_JSON_PATH, JSON.stringify(data, null, 4), 'utf-8');
    }

    async writeCenterLock(data: CenterLock): Promise<void> {
        await mkdir(FOCUS_DIR, { recursive: true });
        await writeFile(CENTER_LOCK_PATH, JSON.stringify(data, null, 4), 'utf-8');
    }
}
