// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * BrickDetailsScreen — full information about a selected brick.
 * Shows name, version, description, catalog, tags, and install status.
 */

import { Box, Text, useInput } from 'ink';
import React from 'react';
import { useBricks } from '../hooks/useBricks.tsx';
import { useInstalled } from '../hooks/useInstalled.tsx';

interface BrickDetailsScreenProps {
    readonly brickName: string;
    readonly catalogUrl: string;
    readonly onBack: () => void;
}

export function BrickDetailsScreen({
    brickName,
    catalogUrl,
    onBack,
}: BrickDetailsScreenProps): React.ReactElement {
    const { bricks, loading } = useBricks(catalogUrl);
    const { installed } = useInstalled();

    useInput((_input, key) => {
        if (key.escape) onBack();
    });

    if (loading) return React.createElement(Text, null, 'Loading...');

    const brick = bricks.find((b) => b.name === brickName);
    if (brick === undefined) {
        return React.createElement(
            Box,
            { flexDirection: 'column' },
            React.createElement(Text, { color: 'red' }, `Brick "${brickName}" not found.`),
            React.createElement(Text, { dimColor: true }, 'Press Esc to go back'),
        );
    }

    const isInstalled = installed.has(brickName);

    return React.createElement(
        Box,
        { flexDirection: 'column', paddingX: 1 },
        React.createElement(
            Box,
            { marginBottom: 1 },
            React.createElement(Text, { bold: true, color: 'cyan' }, brick.name),
            React.createElement(Text, null, '  '),
            React.createElement(Text, { color: 'yellow' }, `v${brick.version}`),
            isInstalled
                ? React.createElement(Text, { color: 'green' }, '  ✓ installed')
                : React.createElement(Text, null, ''),
        ),
        React.createElement(Text, null, brick.description),
        React.createElement(
            Box,
            { marginTop: 1, flexDirection: 'column' },
            React.createElement(Text, { bold: true }, 'Catalog:'),
            React.createElement(Text, { dimColor: true }, brick.catalogUrl),
        ),
        brick.tags !== undefined && brick.tags.length > 0
            ? React.createElement(
                  Box,
                  { marginTop: 1 },
                  React.createElement(Text, { bold: true }, 'Tags: '),
                  React.createElement(Text, { color: 'magenta' }, brick.tags.join(', ')),
              )
            : React.createElement(Box, null),
        React.createElement(
            Box,
            { marginTop: 2 },
            React.createElement(
                Text,
                { dimColor: true },
                isInstalled
                    ? 'Press Esc to go back  |  u: uninstall'
                    : 'Press Esc to go back  |  i: install',
            ),
        ),
    );
}
