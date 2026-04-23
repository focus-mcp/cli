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
    readonly onOpen: (catalogUrl?: string, catalogName?: string) => void;
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
            value: `${c.url}::${c.name}`,
        })),
        {
            label: `📊 Aggregate view             ${String(totalBricks).padEnd(6)} bricks    all active`,
            value: '__aggregate__',
        },
    ];

    return (
        <Box flexDirection="column">
            <List
                items={items}
                onSelect={(value: string) => {
                    if (value === '__aggregate__') {
                        onOpen(undefined, 'All Catalogs');
                        return;
                    }
                    const sepIdx = value.indexOf('::');
                    if (sepIdx === -1) {
                        onOpen(value, undefined);
                        return;
                    }
                    const url = value.slice(0, sepIdx);
                    const name = value.slice(sepIdx + 2);
                    onOpen(url, name.length > 0 ? name : undefined);
                }}
            />
            <Box marginTop={1}>
                <Text dimColor>{`${String(catalogs.length)} catalog(s) registered`}</Text>
            </Box>
        </Box>
    );
}
