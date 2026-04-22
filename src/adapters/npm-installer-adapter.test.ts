// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { EventEmitter } from 'node:events';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', () => ({
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
}));

vi.mock('node:child_process', () => ({
    spawn: vi.fn(),
}));

import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { NpmInstallerAdapter } from './npm-installer-adapter.ts';

const FOCUS_DIR = join(homedir(), '.focus');
const CENTER_JSON_PATH = join(FOCUS_DIR, 'center.json');
const CENTER_LOCK_PATH = join(FOCUS_DIR, 'center.lock');
const BRICKS_DIR = join(FOCUS_DIR, 'bricks');

function makeChildProcess(exitCode: number | null = 0): EventEmitter {
    const child = new EventEmitter();
    // Emit close asynchronously so the Promise can be set up first
    setTimeout(() => {
        child.emit('close', exitCode);
    }, 0);
    return child;
}

describe('NpmInstallerAdapter', () => {
    let adapter: NpmInstallerAdapter;

    beforeEach(() => {
        adapter = new NpmInstallerAdapter();
        vi.clearAllMocks();
    });

    describe('readCenterJson()', () => {
        it('returns { bricks: {} } when file does not exist (ENOENT)', async () => {
            const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
            vi.mocked(readFile).mockRejectedValue(err);

            const result = await adapter.readCenterJson();

            expect(result).toEqual({ bricks: {} });
        });

        it('parses and returns valid JSON content', async () => {
            const data = { bricks: { 'official/echo': { version: '^1.0.0', enabled: true } } };
            vi.mocked(readFile).mockResolvedValue(JSON.stringify(data));

            const result = await adapter.readCenterJson();

            expect(result).toEqual(data);
            expect(readFile).toHaveBeenCalledWith(CENTER_JSON_PATH, 'utf-8');
        });

        it('re-throws non-ENOENT errors', async () => {
            const err = Object.assign(new Error('Permission denied'), { code: 'EACCES' });
            vi.mocked(readFile).mockRejectedValue(err);

            await expect(adapter.readCenterJson()).rejects.toThrow('Permission denied');
        });
    });

    describe('readCenterLock()', () => {
        it('returns { bricks: {} } when file does not exist (ENOENT)', async () => {
            const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
            vi.mocked(readFile).mockRejectedValue(err);

            const result = await adapter.readCenterLock();

            expect(result).toEqual({ bricks: {} });
        });

        it('parses and returns valid JSON content', async () => {
            const lockData = {
                bricks: {
                    'official/echo': {
                        version: '1.0.0',
                        catalogUrl: 'https://example.com/catalog.json',
                        npmPackage: '@focusmcp/brick-echo',
                        installedAt: '2026-01-01T00:00:00Z',
                    },
                },
            };
            vi.mocked(readFile).mockResolvedValue(JSON.stringify(lockData));

            const result = await adapter.readCenterLock();

            expect(result).toEqual(lockData);
            expect(readFile).toHaveBeenCalledWith(CENTER_LOCK_PATH, 'utf-8');
        });

        it('re-throws non-ENOENT errors', async () => {
            const err = Object.assign(new Error('Permission denied'), { code: 'EACCES' });
            vi.mocked(readFile).mockRejectedValue(err);

            await expect(adapter.readCenterLock()).rejects.toThrow('Permission denied');
        });
    });

    describe('writeCenterJson()', () => {
        it('creates the directory and writes the file', async () => {
            vi.mocked(mkdir).mockResolvedValue(undefined);
            vi.mocked(writeFile).mockResolvedValue(undefined);

            const data = { bricks: { 'official/echo': { version: '^1.0.0', enabled: true } } };
            await adapter.writeCenterJson(data);

            expect(mkdir).toHaveBeenCalledWith(FOCUS_DIR, { recursive: true });
            expect(writeFile).toHaveBeenCalledWith(
                CENTER_JSON_PATH,
                JSON.stringify(data, null, 4),
                'utf-8',
            );
        });
    });

    describe('writeCenterLock()', () => {
        it('creates the directory and writes the file', async () => {
            vi.mocked(mkdir).mockResolvedValue(undefined);
            vi.mocked(writeFile).mockResolvedValue(undefined);

            const lockData = {
                bricks: {
                    'official/echo': {
                        version: '1.0.0',
                        catalogUrl: 'https://example.com/catalog.json',
                        npmPackage: '@focusmcp/brick-echo',
                        installedAt: '2026-01-01T00:00:00Z',
                    },
                },
            };
            await adapter.writeCenterLock(lockData);

            expect(mkdir).toHaveBeenCalledWith(FOCUS_DIR, { recursive: true });
            expect(writeFile).toHaveBeenCalledWith(
                CENTER_LOCK_PATH,
                JSON.stringify(lockData, null, 4),
                'utf-8',
            );
        });
    });

    describe('npmInstall()', () => {
        it('calls spawn with correct install args', async () => {
            vi.mocked(mkdir).mockResolvedValue(undefined);
            vi.mocked(spawn).mockReturnValue(
                makeChildProcess(0) as unknown as ReturnType<typeof spawn>,
            );

            await adapter.npmInstall('@focusmcp/brick-echo', '1.0.0');

            expect(mkdir).toHaveBeenCalledWith(BRICKS_DIR, { recursive: true });
            expect(spawn).toHaveBeenCalledWith(
                'npm',
                ['install', '--prefix', BRICKS_DIR, '@focusmcp/brick-echo@1.0.0'],
                expect.objectContaining({ stdio: 'inherit', shell: false }),
            );
        });

        it('calls spawn with registry arg when registry option provided', async () => {
            vi.mocked(mkdir).mockResolvedValue(undefined);
            vi.mocked(spawn).mockReturnValue(
                makeChildProcess(0) as unknown as ReturnType<typeof spawn>,
            );

            await adapter.npmInstall('@focusmcp/brick-echo', '1.0.0', {
                registry: 'https://registry.example.com',
            });

            expect(spawn).toHaveBeenCalledWith(
                'npm',
                [
                    'install',
                    '--prefix',
                    BRICKS_DIR,
                    '--registry',
                    'https://registry.example.com',
                    '@focusmcp/brick-echo@1.0.0',
                ],
                expect.objectContaining({ stdio: 'inherit', shell: false }),
            );
        });

        it('rejects when spawn exits with non-zero code', async () => {
            vi.mocked(mkdir).mockResolvedValue(undefined);
            vi.mocked(spawn).mockReturnValue(
                makeChildProcess(1) as unknown as ReturnType<typeof spawn>,
            );

            await expect(adapter.npmInstall('@focusmcp/brick-echo', '1.0.0')).rejects.toThrow(
                'npm install exited with code 1',
            );
        });
    });

    describe('npmUninstall()', () => {
        it('calls spawn with correct uninstall args', async () => {
            vi.mocked(spawn).mockReturnValue(
                makeChildProcess(0) as unknown as ReturnType<typeof spawn>,
            );

            await adapter.npmUninstall('@focusmcp/brick-echo');

            expect(spawn).toHaveBeenCalledWith(
                'npm',
                ['uninstall', '--prefix', BRICKS_DIR, '@focusmcp/brick-echo'],
                expect.objectContaining({ stdio: 'inherit', shell: false }),
            );
        });

        it('calls spawn with registry arg when registry option provided', async () => {
            vi.mocked(spawn).mockReturnValue(
                makeChildProcess(0) as unknown as ReturnType<typeof spawn>,
            );

            await adapter.npmUninstall('@focusmcp/brick-echo', {
                registry: 'https://registry.example.com',
            });

            expect(spawn).toHaveBeenCalledWith(
                'npm',
                [
                    'uninstall',
                    '--prefix',
                    BRICKS_DIR,
                    '--registry',
                    'https://registry.example.com',
                    '@focusmcp/brick-echo',
                ],
                expect.objectContaining({ stdio: 'inherit', shell: false }),
            );
        });

        it('rejects when spawn exits with non-zero code', async () => {
            vi.mocked(spawn).mockReturnValue(
                makeChildProcess(2) as unknown as ReturnType<typeof spawn>,
            );

            await expect(adapter.npmUninstall('@focusmcp/brick-echo')).rejects.toThrow(
                'npm uninstall exited with code 2',
            );
        });
    });
});
