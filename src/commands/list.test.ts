// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import type { CenterJson, CenterLock } from '../center.ts';
import { listCommand } from './list.ts';

describe('listCommand', () => {
    it('reports no bricks when center.json is empty', () => {
        const output = listCommand({ center: { bricks: {} }, lock: {} });
        expect(output).toMatch(/no bricks installed/i);
    });

    it('lists installed bricks with their resolved versions and status', () => {
        const center: CenterJson = {
            bricks: {
                'official/echo': { version: '^1.0.0', enabled: true },
                'official/indexer': { version: '^0.2.0', enabled: false },
            },
        };
        const lock: CenterLock = {
            'official/echo': { version: '1.0.0' },
            'official/indexer': { version: '0.2.1' },
        };

        const output = listCommand({ center, lock });
        expect(output).toMatch(/official\/echo/);
        expect(output).toMatch(/1\.0\.0/);
        expect(output).toMatch(/enabled/);
        expect(output).toMatch(/official\/indexer/);
        expect(output).toMatch(/0\.2\.1/);
        expect(output).toMatch(/disabled/);
    });

    it('flags bricks declared in center.json but missing from the lock', () => {
        const output = listCommand({
            center: { bricks: { 'official/echo': { version: '^1.0.0', enabled: true } } },
            lock: {},
        });
        expect(output).toMatch(/unresolved/i);
    });

    it('sorts bricks alphabetically by key', () => {
        const output = listCommand({
            center: {
                bricks: {
                    'official/zeta': { version: '^1.0.0', enabled: true },
                    'official/alpha': { version: '^1.0.0', enabled: true },
                },
            },
            lock: {
                'official/alpha': { version: '1.0.0' },
                'official/zeta': { version: '1.0.0' },
            },
        });
        const alphaIdx = output.indexOf('official/alpha');
        const zetaIdx = output.indexOf('official/zeta');
        expect(alphaIdx).toBeGreaterThanOrEqual(0);
        expect(zetaIdx).toBeGreaterThan(alphaIdx);
    });
});
