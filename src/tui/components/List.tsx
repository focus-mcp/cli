// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * List — keyboard-navigable list component.
 * ↑↓ to move cursor, Enter to select.
 */

import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';

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
        return React.createElement(Text, { dimColor: true }, '(empty)');
    }

    return React.createElement(
        Box,
        { flexDirection: 'column' },
        ...items.map((item, i) => {
            const isSelected = i === cursor;
            const props = isSelected
                ? { key: item.value, color: 'cyan' as const }
                : { key: item.value };
            return React.createElement(Text, props, `${isSelected ? '> ' : '  '}${item.label}`);
        }),
    );
}
