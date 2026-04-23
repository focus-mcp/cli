// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * StatusBar — bottom bar with context-aware action hints.
 * Shows different hints based on screen, install status, and current action.
 */

import { Box, Text } from 'ink';
import type React from 'react';

type ActionState = 'idle' | 'installing' | 'uninstalling' | 'success' | 'error';

interface StatusBarProps {
    readonly screen: 'catalogs' | 'bricks' | 'details';
    /** Whether the currently highlighted brick is installed (bricks/details screens). */
    readonly isInstalled?: boolean;
    /** Name of the brick being acted on (for in-progress messages). */
    readonly activeBrickName?: string;
    /** Current action state (for in-progress messages). */
    readonly actionState?: ActionState;
}

function buildHint(
    screen: 'catalogs' | 'bricks' | 'details',
    isInstalled: boolean,
    actionState: ActionState,
    activeBrickName: string,
): string {
    if (actionState === 'installing') {
        return `Installing... @focus-mcp/brick-${activeBrickName}`;
    }
    if (actionState === 'uninstalling') {
        return `Uninstalling... @focus-mcp/brick-${activeBrickName}`;
    }

    if (screen === 'catalogs') {
        return '↑↓ navigate  Enter open  q quit  ? help';
    }
    if (screen === 'bricks') {
        const action = isInstalled ? '[u] uninstall' : '[i] install';
        return `${action}  [Enter] details  [/] search  Esc back  ? help`;
    }
    // details screen
    const action = isInstalled ? '[u] uninstall' : '[i] install';
    return `${action}  Esc back  ? help`;
}

export function StatusBar({
    screen,
    isInstalled = false,
    activeBrickName = '',
    actionState = 'idle',
}: StatusBarProps): React.ReactElement {
    const isActive = actionState === 'installing' || actionState === 'uninstalling';
    const hint = buildHint(screen, isInstalled, actionState, activeBrickName);

    return (
        <Box borderStyle="single" borderColor="gray" paddingX={1} marginTop={1}>
            <Text dimColor={!isActive} {...(isActive ? { color: 'yellow' } : {})}>
                {hint}
            </Text>
        </Box>
    );
}
