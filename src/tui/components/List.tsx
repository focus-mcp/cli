// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * List — keyboard-navigable list component with viewport scrolling.
 * ↑↓ to move cursor, Enter to select.
 * Only renders items visible in the current viewport for readability.
 *
 * Cursor can be lifted to the parent via `cursor` + `onCursorChange` props.
 */

import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useState } from 'react';

interface ListItem {
    readonly label: string;
    readonly value: string;
}

interface ListProps {
    readonly items: ListItem[];
    readonly onSelect: (value: string) => void;
    readonly pageSize?: number;
    /** Controlled cursor index. When provided, the component is controlled. */
    readonly cursor?: number;
    /** Called when the cursor changes. Required when `cursor` is provided. */
    readonly onCursorChange?: (index: number) => void;
}

const DEFAULT_PAGE_SIZE = 15;

export function List({
    items,
    onSelect,
    pageSize = DEFAULT_PAGE_SIZE,
    cursor: controlledCursor,
    onCursorChange,
}: ListProps): React.ReactElement {
    const [internalCursor, setInternalCursor] = useState(0);

    const isControlled = controlledCursor !== undefined;
    const cursor = isControlled ? controlledCursor : internalCursor;

    function moveCursor(next: number): void {
        if (isControlled) {
            onCursorChange?.(next);
        } else {
            setInternalCursor(next);
        }
    }

    useInput((_input, key) => {
        if (key.upArrow) {
            moveCursor(Math.max(0, cursor - 1));
        } else if (key.downArrow) {
            moveCursor(Math.min(items.length - 1, cursor + 1));
        } else if (key.pageUp) {
            moveCursor(Math.max(0, cursor - pageSize));
        } else if (key.pageDown) {
            moveCursor(Math.min(items.length - 1, cursor + pageSize));
        } else if (key.return) {
            const item = items[cursor];
            if (item !== undefined) {
                onSelect(item.value);
            }
        }
    });

    if (items.length === 0) {
        return <Text dimColor>(empty)</Text>;
    }

    // Compute viewport window around cursor
    const half = Math.floor(pageSize / 2);
    let start = Math.max(0, cursor - half);
    const end = Math.min(items.length, start + pageSize);
    start = Math.max(0, end - pageSize);
    const visible = items.slice(start, end);

    return (
        <Box flexDirection="column">
            {start > 0 && <Text dimColor> ↑ {String(start)} more above</Text>}
            {visible.map((item, i) => {
                const absoluteIndex = start + i;
                const isSelected = absoluteIndex === cursor;
                const label = `${isSelected ? '> ' : '  '}${item.label}`;
                return isSelected ? (
                    <Text key={item.value} color="cyan">
                        {label}
                    </Text>
                ) : (
                    <Text key={item.value}>{label}</Text>
                );
            })}
            {end < items.length && <Text dimColor> ↓ {String(items.length - end)} more below</Text>}
            <Box marginTop={1}>
                <Text dimColor>
                    {String(cursor + 1)} / {String(items.length)}
                </Text>
            </Box>
        </Box>
    );
}
