// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * SearchBar — text input activated by / key.
 * Enter to confirm, Esc to cancel.
 */

import { Box, Text, useInput } from 'ink';
import type React from 'react';

interface SearchBarProps {
    readonly query: string;
    readonly onChange: (q: string) => void;
    readonly onSubmit: () => void;
    readonly onCancel: () => void;
}

export function SearchBar({
    query,
    onChange,
    onSubmit,
    onCancel,
}: SearchBarProps): React.ReactElement {
    useInput((input, key) => {
        if (key.escape) {
            onCancel();
            return;
        }
        if (key.return) {
            onSubmit();
            return;
        }
        if (key.backspace === true || key.delete === true) {
            onChange(query.slice(0, -1));
            return;
        }
        if (input.length > 0 && key.ctrl !== true && key.meta !== true) {
            onChange(query + input);
        }
    });

    return (
        <Box borderStyle="single" borderColor="cyan" paddingX={1} marginBottom={1}>
            <Text color="cyan">{'/ '}</Text>
            <Text>{query}</Text>
            <Text color="cyan">{'█'}</Text>
        </Box>
    );
}
