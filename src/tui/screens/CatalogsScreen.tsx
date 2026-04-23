// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * CatalogsScreen — lists all registered catalog sources plus an aggregate view entry.
 */

import { Box, Text } from 'ink';
import type React from 'react';
import { List } from '../components/List.tsx';
import { useCatalogs } from '../hooks/useCatalogs.tsx';

interface CatalogsScreenProps {
    readonly onOpen: (catalogUrl?: string) => void;
}

export function CatalogsScreen({ onOpen }: CatalogsScreenProps): React.ReactElement {
    const { catalogs, loading, error } = useCatalogs();

    if (loading) {
        return <Text>Loading catalogs...</Text>;
    }

    if (error !== null) {
        return <Text color="red">Error: {error}</Text>;
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

    return (
        <Box flexDirection="column">
            <Box marginBottom={1}>
                <Text bold color="cyan">
                    Catalog Sources
                </Text>
            </Box>
            <List
                items={items}
                onSelect={(value: string) => onOpen(value === '__aggregate__' ? undefined : value)}
            />
            <Box marginTop={1}>
                <Text dimColor>{`${String(catalogs.length)} catalog(s) registered`}</Text>
            </Box>
        </Box>
    );
}
