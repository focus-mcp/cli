// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * List — keyboard-navigable list component.
 * ↑↓ to move cursor, Enter to select.
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
}

export function List({ items, onSelect }: ListProps): React.ReactElement {
    const [cursor, setCursor] = useState(0);

    useInput((_input, key) => {
        if (key.upArrow) {
            setCursor((c) => Math.max(0, c - 1));
        } else if (key.downArrow) {
            setCursor((c) => Math.min(items.length - 1, c + 1));
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

    return (
        <Box flexDirection="column">
            {items.map((item, i) => {
                const isSelected = i === cursor;
                const label = `${isSelected ? '> ' : '  '}${item.label}`;
                return isSelected ? (
                    <Text key={item.value} color="cyan">
                        {label}
                    </Text>
                ) : (
                    <Text key={item.value}>{label}</Text>
                );
            })}
        </Box>
    );
}
