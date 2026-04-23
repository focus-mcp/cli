// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * CatalogsScreen — lists all registered catalog sources plus an aggregate view entry.
 */

import { Box, Text } from 'ink';
import React from 'react';
import { List } from '../components/List.tsx';
import { useCatalogs } from '../hooks/useCatalogs.tsx';

interface CatalogsScreenProps {
    readonly onOpen: (catalogUrl?: string) => void;
}

export function CatalogsScreen({ onOpen }: CatalogsScreenProps): React.ReactElement {
    const { catalogs, loading } = useCatalogs();

    if (loading) {
        return React.createElement(Text, null, 'Loading catalogs...');
    }

    const totalBricks = catalogs.reduce((sum, c) => sum + (c.brickCount ?? 0), 0);

    const items = [
        ...catalogs.map((c) => ({
            label: `${c.enabled ? '🟢' : '🔴'} ${c.name.padEnd(30)} ${String(c.brickCount ?? 0).padEnd(6)} bricks    ${c.enabled ? 'active' : 'disabled'}`,
            value: c.url,
        })),
        {
            label: `📊 Aggregate view             ${String(totalBricks).padEnd(6)} bricks    all active`,
            value: '__aggregate__',
        },
    ];

    return React.createElement(
        Box,
        { flexDirection: 'column' },
        React.createElement(
            Box,
            { marginBottom: 1 },
            React.createElement(Text, { bold: true, color: 'cyan' }, 'Catalog Sources'),
        ),
        React.createElement(List, {
            items,
            onSelect: (value: string) => onOpen(value === '__aggregate__' ? undefined : value),
        }),
        React.createElement(
            Box,
            { marginTop: 1 },
            React.createElement(
                Text,
                { dimColor: true },
                `${String(catalogs.length)} catalog(s) registered`,
            ),
        ),
    );
}
