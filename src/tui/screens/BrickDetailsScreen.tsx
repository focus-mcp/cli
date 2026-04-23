// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * BrickDetailsScreen — full information about a selected brick.
 * Shows name, version, description, catalog, tags, and install status.
 */

import { Box, Text, useInput } from 'ink';
import type React from 'react';
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

    if (loading) return <Text>Loading...</Text>;

    const brick = bricks.find((b) => b.name === brickName);
    if (brick === undefined) {
        return (
            <Box flexDirection="column">
                <Text color="red">{`Brick "${brickName}" not found.`}</Text>
                <Text dimColor>Press Esc to go back</Text>
            </Box>
        );
    }

    const isInstalled = installed.has(brickName);

    return (
        <Box flexDirection="column" paddingX={1}>
            <Box marginBottom={1}>
                <Text bold color="cyan">
                    {brick.name}
                </Text>
                <Text>{'  '}</Text>
                <Text color="yellow">{`v${brick.version}`}</Text>
                {isInstalled ? <Text color="green">{'  ✓ installed'}</Text> : <Text>{''}</Text>}
            </Box>
            <Text>{brick.description}</Text>
            <Box marginTop={1} flexDirection="column">
                <Text bold>Catalog:</Text>
                <Text dimColor>{brick.catalogUrl}</Text>
            </Box>
            {brick.tags !== undefined && brick.tags.length > 0 ? (
                <Box marginTop={1}>
                    <Text bold>Tags: </Text>
                    <Text color="magenta">{brick.tags.join(', ')}</Text>
                </Box>
            ) : (
                <Box />
            )}
            <Box marginTop={2}>
                <Text dimColor>
                    {isInstalled
                        ? 'Press Esc to go back  |  u: uninstall'
                        : 'Press Esc to go back  |  i: install'}
                </Text>
            </Box>
        </Box>
    );
}
