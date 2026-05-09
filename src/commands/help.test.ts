// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { getHelpIndex } from '@focus-mcp/core';
import { describe, expect, it } from 'vitest';

import { focusHelp } from './help.ts';

describe('focusHelp', () => {
    it('returns the index when topic is undefined', () => {
        const result = focusHelp({});

        expect(result.kind).toBe('index');
        if (result.kind !== 'index') throw new Error('unreachable');
        expect(result.index).toEqual(getHelpIndex());
        expect(result.index.concepts.length).toBeGreaterThan(0);
        expect(typeof result.index.agent_guide_url).toBe('string');
        expect(typeof result.index.readme_url).toBe('string');
    });

    it('returns the index when topic is an empty string', () => {
        const result = focusHelp({ topic: '' });
        expect(result.kind).toBe('index');
    });

    it('returns the matching concept when topic is a known key', () => {
        const firstKey = getHelpIndex().concepts[0]?.key;
        if (firstKey === undefined) {
            throw new Error('Expected at least one concept in the help index');
        }

        const result = focusHelp({ topic: firstKey });

        expect(result.kind).toBe('concept');
        if (result.kind !== 'concept') throw new Error('unreachable');
        expect(result.key).toBe(firstKey);
        expect(typeof result.concept.title).toBe('string');
        expect(typeof result.concept.description).toBe('string');
    });

    it('returns not_found with available_topics for an unknown topic', () => {
        const result = focusHelp({ topic: '__no_such_topic__' });

        expect(result.kind).toBe('not_found');
        if (result.kind !== 'not_found') throw new Error('unreachable');
        expect(result.key).toBe('__no_such_topic__');
        expect(result.available_topics.length).toBeGreaterThan(0);
        // Available topics should match the index keys.
        expect(result.available_topics).toEqual(getHelpIndex().concepts.map((c) => c.key));
    });
});
