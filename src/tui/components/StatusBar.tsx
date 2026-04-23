// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * StatusBar — bottom bar displaying keyboard shortcut hints.
 */

import { Box, Text } from 'ink';
import React from 'react';

interface StatusBarProps {
    readonly screen: 'catalogs' | 'bricks' | 'details';
}

const HINTS: Record<string, string> = {
    catalogs: '↑↓ navigate  Enter open  q quit',
    bricks: '↑↓ navigate  Enter details  / search  Esc back  q quit',
    details: 'i install  u uninstall  Esc back  q quit',
};

export function StatusBar({ screen }: StatusBarProps): React.ReactElement {
    return React.createElement(
        Box,
        { borderStyle: 'single', borderColor: 'gray', paddingX: 1, marginTop: 1 },
        React.createElement(Text, { dimColor: true }, HINTS[screen] ?? ''),
    );
}
