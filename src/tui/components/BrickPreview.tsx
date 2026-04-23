// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * BrickPreview — right-panel showing details of the highlighted brick.
 * Updates in real-time as the user navigates.
 * Shows: name, version, description, tools (first 5), tags, install status.
 */

import type { AggregatedBrick } from '@focus-mcp/core';
import { Box, Text } from 'ink';
import type React from 'react';

interface BrickPreviewProps {
    readonly brick: AggregatedBrick | undefined;
    readonly isInstalled: boolean;
}

const MAX_TOOLS = 5;

function InstallBadge({ isInstalled }: { readonly isInstalled: boolean }): React.ReactElement {
    return isInstalled ? (
        <Text color="green">{'● installed'}</Text>
    ) : (
        <Text dimColor>{'○ not installed'}</Text>
    );
}

function ToolsList({
    tools,
}: {
    readonly tools: readonly { readonly name: string; readonly description: string }[];
}): React.ReactElement {
    const visible = tools.slice(0, MAX_TOOLS);
    const remaining = tools.length - MAX_TOOLS;
    return (
        <Box flexDirection="column">
            {visible.map((t) => (
                <Text key={t.name} dimColor>{`  • ${t.name}`}</Text>
            ))}
            {remaining > 0 && <Text dimColor>{`  + ${String(remaining)} more…`}</Text>}
        </Box>
    );
}

export function BrickPreview({ brick, isInstalled }: BrickPreviewProps): React.ReactElement {
    if (brick === undefined) {
        return (
            <Box
                flexDirection="column"
                borderStyle="single"
                borderColor="gray"
                paddingX={1}
                paddingY={1}
                flexGrow={1}
            >
                <Text dimColor>Select a brick to preview</Text>
            </Box>
        );
    }

    return (
        <Box
            flexDirection="column"
            borderStyle="single"
            borderColor="cyan"
            paddingX={1}
            paddingY={1}
            flexGrow={1}
        >
            <Box marginBottom={1} flexDirection="row" gap={1}>
                <Text bold color="cyan">
                    {brick.name}
                </Text>
                <Text color="yellow">{`v${brick.version}`}</Text>
            </Box>
            <Box marginBottom={1}>
                <InstallBadge isInstalled={isInstalled} />
            </Box>
            <Box marginBottom={1}>
                <Text wrap="wrap">{brick.description}</Text>
            </Box>
            {brick.tools.length > 0 && (
                <Box flexDirection="column" marginBottom={1}>
                    <Text bold>{'Tools:'}</Text>
                    <ToolsList tools={brick.tools} />
                </Box>
            )}
            {brick.tags !== undefined && brick.tags.length > 0 && (
                <Box marginBottom={1}>
                    <Text bold>{'Tags: '}</Text>
                    <Text color="magenta">{brick.tags.join(', ')}</Text>
                </Box>
            )}
            <Box marginTop={1}>
                <Text dimColor>
                    {isInstalled ? '[u] uninstall  [Enter] focus' : '[i] install  [Enter] focus'}
                </Text>
            </Box>
        </Box>
    );
}
