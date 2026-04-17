// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from 'vitest';
import { parseCenterJson, parseCenterLock } from './center.ts';

describe('parseCenterJson', () => {
    it('parses an empty bricks map', () => {
        const result = parseCenterJson({ bricks: {} });
        expect(result.bricks).toEqual({});
    });

    it('parses a single brick entry with required fields', () => {
        const result = parseCenterJson({
            bricks: {
                'official/echo': { version: '^1.0.0', enabled: true },
            },
        });
        expect(result.bricks['official/echo']).toEqual({
            version: '^1.0.0',
            enabled: true,
        });
    });

    it('parses an entry with a config object', () => {
        const result = parseCenterJson({
            bricks: {
                'official/indexer': {
                    version: '^0.2.0',
                    enabled: true,
                    config: { root: '/src', depth: 3 },
                },
            },
        });
        expect(result.bricks['official/indexer']?.config).toEqual({ root: '/src', depth: 3 });
    });

    it('rejects a non-object root', () => {
        expect(() => parseCenterJson(null)).toThrow(/center\.json/i);
        expect(() => parseCenterJson('bad')).toThrow(/center\.json/i);
    });

    it('rejects a bricks map that is not an object', () => {
        expect(() => parseCenterJson({ bricks: [] })).toThrow(/bricks/i);
    });

    it('rejects an entry without `version`', () => {
        expect(() => parseCenterJson({ bricks: { 'official/echo': { enabled: true } } })).toThrow(
            /version/i,
        );
    });

    it('rejects an entry without `enabled`', () => {
        expect(() =>
            parseCenterJson({ bricks: { 'official/echo': { version: '^1.0.0' } } }),
        ).toThrow(/enabled/i);
    });

    it('rejects a non-object entry', () => {
        expect(() => parseCenterJson({ bricks: { 'official/echo': 'bad' } })).toThrow(
            /must be an object/i,
        );
    });

    it('rejects a non-object config', () => {
        expect(() =>
            parseCenterJson({
                bricks: { 'official/echo': { version: '^1.0.0', enabled: true, config: 42 } },
            }),
        ).toThrow(/config/i);
    });
});

describe('parseCenterLock', () => {
    it('parses an empty lock', () => {
        expect(parseCenterLock({})).toEqual({});
    });

    it('parses a minimal entry', () => {
        const result = parseCenterLock({
            'official/echo': { version: '1.0.0' },
        });
        expect(result['official/echo']?.version).toBe('1.0.0');
    });

    it('parses a rich entry', () => {
        const result = parseCenterLock({
            'official/echo': {
                version: '1.0.0',
                catalog_url: 'https://marketplace.focusmcp.dev/catalog.json',
                catalog_id: 'official',
                integrity: 'sha256-abc',
                tarballUrl: 'https://example.com/echo-1.0.0.tgz',
            },
        });
        const entry = result['official/echo'];
        expect(entry?.catalog_url).toBe('https://marketplace.focusmcp.dev/catalog.json');
        expect(entry?.catalog_id).toBe('official');
        expect(entry?.integrity).toBe('sha256-abc');
        expect(entry?.tarballUrl).toBe('https://example.com/echo-1.0.0.tgz');
    });

    it('rejects a non-object lock', () => {
        expect(() => parseCenterLock(null)).toThrow(/center\.lock/i);
    });

    it('rejects a non-object entry', () => {
        expect(() => parseCenterLock({ 'official/echo': 'bad' })).toThrow(/must be an object/i);
    });

    it('rejects an entry without a resolved version', () => {
        expect(() => parseCenterLock({ 'official/echo': { integrity: 'sha256-x' } })).toThrow(
            /version/i,
        );
    });
});
