// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * HelpOverlay — modal overlay showing keyboard shortcuts for the current screen.
 * Press ? or Esc to dismiss.
 */

import { Box, Text } from 'ink';
import type React from 'react';

interface KeyBinding {
    readonly key: string;
    readonly label: string;
}

const COMMON_BINDINGS: readonly KeyBinding[] = [
    { key: '↑↓', label: 'Navigate' },
    { key: 'q', label: 'Quit' },
    { key: '?', label: 'Toggle this help' },
    { key: 'Esc', label: 'Back' },
];

const SCREEN_BINDINGS: Record<string, readonly KeyBinding[]> = {
    catalogs: [{ key: 'Enter', label: 'Open catalog' }],
    bricks: [
        { key: 'Enter', label: 'Focus details' },
        { key: '/', label: 'Search' },
        { key: 'i', label: 'Install brick' },
        { key: 'u', label: 'Uninstall brick' },
        { key: 'PgUp/Dn', label: 'Page navigation' },
    ],
    details: [
        { key: 'i', label: 'Install brick' },
        { key: 'u', label: 'Uninstall brick' },
    ],
};

interface HelpOverlayProps {
    readonly screen: 'catalogs' | 'bricks' | 'details';
}

function KeyRow({ binding }: { readonly binding: KeyBinding }): React.ReactElement {
    return (
        <Box key={binding.key}>
            <Text color="cyan">{binding.key.padEnd(12)}</Text>
            <Text>{binding.label}</Text>
        </Box>
    );
}

export function HelpOverlay({ screen }: HelpOverlayProps): React.ReactElement {
    const screenBindings = SCREEN_BINDINGS[screen] ?? [];
    const allBindings = [...screenBindings, ...COMMON_BINDINGS];

    return (
        <Box
            flexDirection="column"
            borderStyle="round"
            borderColor="cyan"
            paddingX={2}
            paddingY={1}
            marginTop={1}
        >
            <Box marginBottom={1}>
                <Text bold color="cyan">
                    Keyboard shortcuts
                </Text>
            </Box>
            {allBindings.map((binding) => (
                <KeyRow key={binding.key} binding={binding} />
            ))}
        </Box>
    );
}
