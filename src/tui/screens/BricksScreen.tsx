// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * BricksScreen — displays bricks from the selected catalog or aggregate.
 * Supports live search via / key.
 */

import { Box, Text, useInput } from 'ink';
import React, { useState } from 'react';
import { List } from '../components/List.tsx';
import { SearchBar } from '../components/SearchBar.tsx';
import { useBricks } from '../hooks/useBricks.tsx';
import { useInstalled } from '../hooks/useInstalled.tsx';

interface BricksScreenProps {
    readonly catalogUrl?: string;
    readonly onOpen: (brickName: string, catalogUrl: string) => void;
    readonly onBack: () => void;
}

export function BricksScreen({
    catalogUrl,
    onOpen,
    onBack,
}: BricksScreenProps): React.ReactElement {
    const [query, setQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const { bricks, loading, error } = useBricks(catalogUrl);
    const { installed } = useInstalled();

    useInput((input, key) => {
        if (searching) return;
        if (input === '/') {
            setSearching(true);
            return;
        }
        if (key.escape) onBack();
    });

    if (loading) return React.createElement(Text, null, 'Loading bricks...');
    if (error !== null) return React.createElement(Text, { color: 'red' }, `Error: ${error}`);

    const filtered =
        query.trim().length === 0
            ? bricks
            : bricks.filter(
                  (b) =>
                      b.name.toLowerCase().includes(query.toLowerCase()) ||
                      b.description.toLowerCase().includes(query.toLowerCase()),
              );

    const items = filtered.map((b) => {
        const isInstalled = installed.has(b.name);
        const badge = isInstalled ? ' installed ✓' : '';
        const desc = b.description.length > 40 ? `${b.description.slice(0, 40)}...` : b.description;
        return {
            label: `${isInstalled ? '🔴' : '⚪'} ${b.name.padEnd(25)} ${b.version.padEnd(8)}${badge.padEnd(14)} ${desc}`,
            value: `${b.name}::${b.catalogUrl}`,
        };
    });

    return React.createElement(
        Box,
        { flexDirection: 'column' },
        React.createElement(
            Box,
            { marginBottom: 1 },
            React.createElement(
                Text,
                { bold: true, color: 'cyan' },
                catalogUrl !== undefined ? `Bricks — ${catalogUrl}` : 'Bricks — Aggregate View',
            ),
        ),
        searching &&
            React.createElement(SearchBar, {
                query,
                onChange: setQuery,
                onSubmit: () => setSearching(false),
                onCancel: () => {
                    setSearching(false);
                    setQuery('');
                },
            }),
        React.createElement(List, {
            items,
            onSelect: (value: string) => {
                const sepIdx = value.indexOf('::');
                if (sepIdx === -1) return;
                const name = value.slice(0, sepIdx);
                const url = value.slice(sepIdx + 2);
                if (name.length > 0 && url.length > 0) onOpen(name, url);
            },
        }),
        React.createElement(
            Box,
            { marginTop: 1 },
            React.createElement(
                Text,
                { dimColor: true },
                `${String(filtered.length)} brick(s)${query.length > 0 ? ` matching "${query}"` : ''}`,
            ),
        ),
    );
}
