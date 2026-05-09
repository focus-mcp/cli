// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { type Concept, getConcept, getHelpIndex, type HelpIndex } from '@focus-mcp/core';

export interface FocusHelpInput {
    /** Optional concept key to look up (e.g. 'brick', 'catalog'). If omitted, returns the index. */
    topic?: string;
}

export type FocusHelpOutput =
    | { kind: 'index'; index: HelpIndex }
    | { kind: 'concept'; key: string; concept: Concept }
    | { kind: 'not_found'; key: string; available_topics: readonly string[] };

/**
 * Implements the `focus_help` MCP tool: returns FocusMCP concepts and
 * pointers to docs. With no topic, returns the index. With a topic,
 * returns the matching concept or a `not_found` response listing the
 * available topics.
 */
export function focusHelp(input: FocusHelpInput): FocusHelpOutput {
    if (input.topic === undefined || input.topic === '') {
        return { kind: 'index', index: getHelpIndex() };
    }
    const concept = getConcept(input.topic);
    if (concept === null) {
        return {
            kind: 'not_found',
            key: input.topic,
            available_topics: getHelpIndex().concepts.map((c) => c.key),
        };
    }
    return { kind: 'concept', key: input.topic, concept };
}
