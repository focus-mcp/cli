// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    buildUpdateCommand,
    cliUpdater,
    detectPackageManager,
} from './cli-updater.ts';

describe('detectPackageManager', () => {
    const originalExecPath = process.env['npm_execpath'];

    afterEach(() => {
        if (originalExecPath === undefined) {
            delete process.env['npm_execpath'];
        } else {
            process.env['npm_execpath'] = originalExecPath;
        }
    });

    it('detects pnpm when npm_execpath contains "pnpm"', () => {
        process.env['npm_execpath'] = '/usr/local/lib/node_modules/pnpm/bin/pnpm.js';
        expect(detectPackageManager()).toBe('pnpm');
    });

    it('detects yarn when npm_execpath contains "yarn"', () => {
        process.env['npm_execpath'] = '/usr/local/lib/node_modules/yarn/bin/yarn.js';
        expect(detectPackageManager()).toBe('yarn');
    });

    it('detects npm for any other npm_execpath', () => {
        process.env['npm_execpath'] = '/usr/lib/nodejs/npm/bin/npm-cli.js';
        expect(detectPackageManager()).toBe('npm');
    });

    it('returns "unknown" when npm_execpath is absent', () => {
        delete process.env['npm_execpath'];
        expect(detectPackageManager()).toBe('unknown');
    });

    it('returns "unknown" when npm_execpath is empty string', () => {
        process.env['npm_execpath'] = '';
        expect(detectPackageManager()).toBe('unknown');
    });
});

describe('buildUpdateCommand', () => {
    it('returns pnpm command for pnpm', () => {
        expect(buildUpdateCommand('pnpm')).toBe('pnpm add -g @focus-mcp/cli@latest');
    });

    it('returns yarn command for yarn', () => {
        expect(buildUpdateCommand('yarn')).toBe('yarn global add @focus-mcp/cli@latest');
    });

    it('returns npm command for npm', () => {
        expect(buildUpdateCommand('npm')).toBe('npm install -g @focus-mcp/cli@latest');
    });

    it('returns npm command for unknown manager', () => {
        expect(buildUpdateCommand('unknown')).toBe('npm install -g @focus-mcp/cli@latest');
    });
});

describe('cliUpdater', () => {
    afterEach(() => {
        delete process.env['npm_execpath'];
    });

    it('returns command and manager without bricks by default', () => {
        process.env['npm_execpath'] = '/path/to/npm/cli.js';
        const result = cliUpdater();
        expect(result.manager).toBe('npm');
        expect(result.command).toBe('npm install -g @focus-mcp/cli@latest');
        expect(result.bricksToUpdate).toBeUndefined();
    });

    it('includes empty bricksToUpdate when includeBricks=true and no bricks given', () => {
        process.env['npm_execpath'] = '/path/to/npm/cli.js';
        const result = cliUpdater({ includeBricks: true });
        expect(result.bricksToUpdate).toEqual([]);
    });

    it('includes brick names when includeBricks=true and installedBricks provided', () => {
        process.env['npm_execpath'] = '/path/to/npm/cli.js';
        const result = cliUpdater({
            includeBricks: true,
            installedBricks: ['echo', 'shell', 'git'],
        });
        expect(result.bricksToUpdate).toEqual(['echo', 'shell', 'git']);
    });

    it('does not include bricksToUpdate when includeBricks=false', () => {
        process.env['npm_execpath'] = '/path/to/npm/cli.js';
        const result = cliUpdater({ includeBricks: false, installedBricks: ['echo'] });
        expect(result.bricksToUpdate).toBeUndefined();
    });

    it('uses pnpm command when detected', () => {
        process.env['npm_execpath'] = '/usr/local/pnpm/pnpm.js';
        const result = cliUpdater();
        expect(result.manager).toBe('pnpm');
        expect(result.command).toBe('pnpm add -g @focus-mcp/cli@latest');
    });
});
