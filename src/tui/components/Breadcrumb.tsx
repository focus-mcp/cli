// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * Breadcrumb — displays the current navigation path.
 * Active (last) segment is highlighted in cyan.
 *
 * Examples:
 *   FocusMCP › Catalogs
 *   FocusMCP › FocusMCP Official › Bricks
 *   FocusMCP › FocusMCP Official › echo
 */

import { Box, Text } from 'ink';
import type React from 'react';

interface BreadcrumbProps {
    readonly segments: readonly string[];
}

export function Breadcrumb({ segments }: BreadcrumbProps): React.ReactElement {
    return (
        <Box marginBottom={1}>
            {segments.map((seg, i) => {
                const isLast = i === segments.length - 1;
                const isFirst = i === 0;
                return (
                    <Box key={`${seg}-${String(i)}`}>
                        {!isFirst && <Text dimColor>{' › '}</Text>}
                        {isLast ? (
                            <Text bold color="cyan">
                                {seg}
                            </Text>
                        ) : (
                            <Text color="blue">{seg}</Text>
                        )}
                    </Box>
                );
            })}
        </Box>
    );
}
