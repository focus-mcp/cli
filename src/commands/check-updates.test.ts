// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    formatUpdateWarning,
    runUpdateCheck,
    shouldSkipUpdateCheck,
    type CheckUpdatesInput,
    checkUpdatesCommand,
} from './check-updates.ts';

// Mock @focus-mcp/core checkForUpdates
vi.mock('@focus-mcp/core', () => ({
    checkForUpdates: vi.fn(),
}));

import { checkForUpdates } from '@focus-mcp/core';

const mockCheckForUpdates = vi.mocked(checkForUpdates);

// ---------- shouldSkipUpdateCheck ----------

describe('shouldSkipUpdateCheck', () => {
    const origEnv = process.env;
    const origIsTTY = process.stdout.isTTY;

    beforeEach(() => {
        process.env = { ...origEnv };
        // Simulate TTY by default
        Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
    });

    afterEach(() => {
        process.env = origEnv;
        Object.defineProperty(process.stdout, 'isTTY', { value: origIsTTY, configurable: true });
    });

    it('returns false when nothing special is set', () => {
        expect(shouldSkipUpdateCheck(['list'])).toBe(false);
    });

    it('returns true when FOCUS_NO_UPDATE_NOTIFY=1', () => {
        process.env['FOCUS_NO_UPDATE_NOTIFY'] = '1';
        expect(shouldSkipUpdateCheck(['list'])).toBe(true);
    });

    it('returns true when stdout is not a TTY', () => {
        Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
        expect(shouldSkipUpdateCheck(['list'])).toBe(true);
    });

    it('returns true when --no-update-check flag is present', () => {
        expect(shouldSkipUpdateCheck(['list', '--no-update-check'])).toBe(true);
    });

    it('returns true for update command', () => {
        expect(shouldSkipUpdateCheck(['update'])).toBe(true);
    });

    it('returns true for upgrade command', () => {
        expect(shouldSkipUpdateCheck(['upgrade'])).toBe(true);
    });

    it('returns true for self-update command', () => {
        expect(shouldSkipUpdateCheck(['self-update'])).toBe(true);
    });

    it('returns false for add command (not in skip list)', () => {
        expect(shouldSkipUpdateCheck(['add', 'treesitter'])).toBe(false);
    });
});

// ---------- formatUpdateWarning ----------

describe('formatUpdateWarning', () => {
    it('returns empty string when no updates', () => {
        expect(formatUpdateWarning({ fromCache: true })).toBe('');
    });

    it('formats cli update warning', () => {
        const result = formatUpdateWarning({
            cliUpdate: {
                current: '2.0.0',
                latest: '2.1.0',
                command: 'npm install -g @focus-mcp/cli@latest',
            },
            fromCache: false,
        });
        expect(result).toContain('⚠ Update available: focus 2.0.0 → 2.1.0');
        expect(result).toContain('npm install -g @focus-mcp/cli@latest');
    });

    it('formats single brick update warning', () => {
        const result = formatUpdateWarning({
            bricksUpdates: [{ name: 'treesitter', current: '0.5.1', latest: '0.6.0' }],
            fromCache: false,
        });
        expect(result).toContain('1 brick has an update');
        expect(result).toContain('treesitter (0.5.1 → 0.6.0)');
        expect(result).toContain('focus bricks:update --all');
    });

    it('formats plural bricks update warning', () => {
        const result = formatUpdateWarning({
            bricksUpdates: [
                { name: 'treesitter', current: '0.5.1', latest: '0.6.0' },
                { name: 'refs', current: '0.3.2', latest: '0.4.0' },
                { name: 'smartread', current: '0.2.0', latest: '0.3.0' },
            ],
            fromCache: false,
        });
        expect(result).toContain('3 bricks have updates');
        expect(result).toContain('treesitter');
        expect(result).toContain('refs');
        expect(result).toContain('smartread');
    });

    it('formats both cli and bricks warning together', () => {
        const result = formatUpdateWarning({
            cliUpdate: {
                current: '2.0.0',
                latest: '2.1.0',
                command: 'npm install -g @focus-mcp/cli@latest',
            },
            bricksUpdates: [{ name: 'treesitter', current: '0.5.1', latest: '0.6.0' }],
            fromCache: false,
        });
        expect(result).toContain('Update available');
        expect(result).toContain('brick has an update');
    });
});

// ---------- runUpdateCheck ----------

describe('runUpdateCheck', () => {
    const origEnv = process.env;
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    beforeEach(() => {
        process.env = { ...origEnv };
        Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
        vi.clearAllMocks();
    });

    afterEach(() => {
        process.env = origEnv;
    });

    it('does not call checkForUpdates when FOCUS_NO_UPDATE_NOTIFY=1', async () => {
        process.env['FOCUS_NO_UPDATE_NOTIFY'] = '1';
        runUpdateCheck(['list'], '2.0.0');
        // Wait for any pending microtasks
        await new Promise((r) => setTimeout(r, 0));
        expect(mockCheckForUpdates).not.toHaveBeenCalled();
    });

    it('does not call checkForUpdates for update command', async () => {
        runUpdateCheck(['update'], '2.0.0');
        await new Promise((r) => setTimeout(r, 0));
        expect(mockCheckForUpdates).not.toHaveBeenCalled();
    });

    it('calls checkForUpdates and writes warning to stderr', async () => {
        mockCheckForUpdates.mockResolvedValue({
            cliUpdate: {
                current: '2.0.0',
                latest: '2.1.0',
                command: 'npm install -g @focus-mcp/cli@latest',
            },
            fromCache: false,
        });

        runUpdateCheck(['list'], '2.0.0');
        await new Promise((r) => setTimeout(r, 10));

        expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Update available'));
    });

    it('does not write to stderr when no updates available', async () => {
        mockCheckForUpdates.mockResolvedValue({ fromCache: true });

        runUpdateCheck(['list'], '2.0.0');
        await new Promise((r) => setTimeout(r, 10));

        // No write call with update content
        const calls = stderrSpy.mock.calls.map((c) => String(c[0]));
        expect(calls.every((c) => !c.includes('Update available'))).toBe(true);
    });

    it('does not throw when checkForUpdates rejects', async () => {
        mockCheckForUpdates.mockRejectedValue(new Error('network error'));

        // Should not throw
        expect(() => runUpdateCheck(['list'], '2.0.0')).not.toThrow();
        await new Promise((r) => setTimeout(r, 10));
    });
});

// ---------- checkUpdatesCommand (MCP tool) ----------

describe('checkUpdatesCommand', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns full result from checkForUpdates', async () => {
        mockCheckForUpdates.mockResolvedValue({
            cliUpdate: { current: '2.0.0', latest: '2.1.0', command: 'npm i -g @focus-mcp/cli@latest' },
            bricksUpdates: [{ name: 'treesitter', current: '0.5.1', latest: '0.6.0' }],
            fromCache: false,
        });

        const result = await checkUpdatesCommand({ include_cli: true, include_bricks: true }, '2.0.0');

        expect(result.cliUpdate).toMatchObject({ current: '2.0.0', latest: '2.1.0' });
        expect(result.bricksUpdates).toHaveLength(1);
        expect(result.fromCache).toBe(false);
    });

    it('returns null cliUpdate when no cli update', async () => {
        mockCheckForUpdates.mockResolvedValue({ fromCache: true });

        const result = await checkUpdatesCommand({}, '2.0.0');

        expect(result.cliUpdate).toBeNull();
        expect(result.bricksUpdates).toHaveLength(0);
        expect(result.fromCache).toBe(true);
    });

    it('returns empty result when checkForUpdates throws', async () => {
        mockCheckForUpdates.mockRejectedValue(new Error('fail'));

        const result = await checkUpdatesCommand({}, '2.0.0');

        expect(result.cliUpdate).toBeNull();
        expect(result.bricksUpdates).toHaveLength(0);
        expect(result.fromCache).toBe(false);
    });

    it('passes include_cli and include_bricks to checkForUpdates', async () => {
        mockCheckForUpdates.mockResolvedValue({ fromCache: false });

        await checkUpdatesCommand({ include_cli: false, include_bricks: true }, '2.0.0');

        expect(mockCheckForUpdates).toHaveBeenCalledWith(
            expect.objectContaining({ includeCli: false, includeBricks: true }),
        );
    });
});
