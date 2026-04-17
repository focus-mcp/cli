// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import type { CenterJson, CenterLock } from '../center.ts';
import { infoCommand } from './info.ts';

describe('infoCommand', () => {
    it('reports name, requested version, resolved version and status when the brick exists', () => {
        const center: CenterJson = {
            bricks: {
                'official/echo': { version: '^1.0.0', enabled: true },
            },
        };
        const lock: CenterLock = {
            'official/echo': { version: '1.0.0' },
        };

        const output = infoCommand({ name: 'official/echo', center, lock });
        expect(output).toMatch(/official\/echo/);
        expect(output).toMatch(/\^1\.0\.0/);
        expect(output).toMatch(/1\.0\.0/);
        expect(output).toMatch(/enabled/);
    });

    it('reports "unresolved" when the brick is declared but missing from the lock', () => {
        const center: CenterJson = {
            bricks: {
                'official/echo': { version: '^1.0.0', enabled: true },
            },
        };
        const output = infoCommand({ name: 'official/echo', center, lock: {} });
        expect(output).toMatch(/unresolved/i);
    });

    it('shows disabled when the brick is turned off', () => {
        const center: CenterJson = {
            bricks: {
                'official/echo': { version: '^1.0.0', enabled: false },
            },
        };
        const lock: CenterLock = { 'official/echo': { version: '1.0.0' } };
        const output = infoCommand({ name: 'official/echo', center, lock });
        expect(output).toMatch(/disabled/i);
    });

    it('exposes the catalog, tarball and integrity metadata when available', () => {
        const center: CenterJson = {
            bricks: {
                'official/echo': { version: '^1.0.0', enabled: true },
            },
        };
        const lock: CenterLock = {
            'official/echo': {
                version: '1.0.0',
                catalog_id: 'official',
                catalog_url: 'https://marketplace.focusmcp.dev/catalog.json',
                tarballUrl: 'https://example.com/echo-1.0.0.tgz',
                integrity: 'sha256-abc',
            },
        };
        const output = infoCommand({ name: 'official/echo', center, lock });
        expect(output).toMatch(/official/);
        expect(output).toMatch(/marketplace\.focusmcp\.dev/);
        expect(output).toMatch(/echo-1\.0\.0\.tgz/);
        expect(output).toMatch(/sha256-abc/);
    });

    it('includes the serialized brick config when it is non-empty', () => {
        const center: CenterJson = {
            bricks: {
                'official/indexer': {
                    version: '^0.2.0',
                    enabled: true,
                    config: { root: '/src' },
                },
            },
        };
        const output = infoCommand({ name: 'official/indexer', center, lock: {} });
        expect(output).toMatch(/Config:/);
        expect(output).toMatch(/"root": "\/src"/);
    });

    it('throws a clear error when the brick is not declared', () => {
        expect(() =>
            infoCommand({ name: 'official/ghost', center: { bricks: {} }, lock: {} }),
        ).toThrow(/not declared/i);
    });
});
