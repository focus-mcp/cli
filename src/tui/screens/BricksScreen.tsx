// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * BricksScreen — displays bricks from the selected catalog or aggregate.
 * Supports live search via / key.
 * Supports i (install) and u (uninstall) on the highlighted brick.
 */

import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useState } from 'react';
import { FilesystemCatalogStoreAdapter } from '../../adapters/catalog-store-adapter.ts';
import { HttpFetchAdapter } from '../../adapters/http-fetch-adapter.ts';
import { NpmInstallerAdapter } from '../../adapters/npm-installer-adapter.ts';
import { addCommand } from '../../commands/add.ts';
import { removeCommand } from '../../commands/remove.ts';
import { List } from '../components/List.tsx';
import { SearchBar } from '../components/SearchBar.tsx';
import { useBricks } from '../hooks/useBricks.tsx';
import { useInstalled } from '../hooks/useInstalled.tsx';

interface BricksScreenProps {
    readonly catalogUrl?: string;
    readonly onOpen: (brickName: string, catalogUrl: string) => void;
    readonly onBack: () => void;
}

type ActionStatus =
    | { state: 'idle' }
    | { state: 'installing' }
    | { state: 'uninstalling' }
    | { state: 'success'; message: string }
    | { state: 'error'; error: string };

function buildIO() {
    return {
        fetch: new HttpFetchAdapter(),
        store: new FilesystemCatalogStoreAdapter(),
        installer: new NpmInstallerAdapter(),
    };
}

export function BricksScreen({
    catalogUrl,
    onOpen,
    onBack,
}: BricksScreenProps): React.ReactElement {
    const [query, setQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [cursor, setCursor] = useState(0);
    const [actionStatus, setActionStatus] = useState<ActionStatus>({ state: 'idle' });
    const { bricks, loading, error } = useBricks(catalogUrl);
    const { installed, refresh } = useInstalled();

    const filtered =
        query.trim().length === 0
            ? bricks
            : bricks.filter(
                  (b) =>
                      b.name.toLowerCase().includes(query.toLowerCase()) ||
                      b.description.toLowerCase().includes(query.toLowerCase()),
              );

    async function performInstall(brickName: string): Promise<void> {
        setActionStatus({ state: 'installing' });
        try {
            const message = await addCommand({ brickName, io: buildIO() });
            setActionStatus({ state: 'success', message });
            setTimeout(() => {
                refresh();
                setActionStatus({ state: 'idle' });
            }, 1500);
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            setActionStatus({ state: 'error', error: errMsg });
        }
    }

    async function performUninstall(brickName: string): Promise<void> {
        setActionStatus({ state: 'uninstalling' });
        try {
            const message = await removeCommand({
                brickName,
                io: { installer: new NpmInstallerAdapter() },
            });
            setActionStatus({ state: 'success', message });
            setTimeout(() => {
                refresh();
                setActionStatus({ state: 'idle' });
            }, 1500);
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            setActionStatus({ state: 'error', error: errMsg });
        }
    }

    function handleBrickAction(input: string): void {
        if (actionStatus.state !== 'idle') return;
        const currentBrick = filtered[cursor];
        if (currentBrick === undefined) return;
        const isInstalled = installed.has(currentBrick.name);
        if (input === 'i' && !isInstalled) void performInstall(currentBrick.name);
        if (input === 'u' && isInstalled) void performUninstall(currentBrick.name);
    }

    useInput((input, key) => {
        if (searching) return;
        if (input === '/') {
            setSearching(true);
            return;
        }
        if (key.escape) {
            onBack();
            return;
        }
        handleBrickAction(input);
    });

    if (loading) return <Text>Loading bricks...</Text>;
    if (error !== null) return <Text color="red">{`Error: ${error}`}</Text>;

    const items = filtered.map((b) => {
        const isInstalled = installed.has(b.name);
        const badge = isInstalled ? ' installed ✓' : '';
        const desc = b.description.length > 40 ? `${b.description.slice(0, 40)}...` : b.description;
        return {
            label: `${isInstalled ? '🟢' : '⚪'} ${b.name.padEnd(25)} ${b.version.padEnd(8)}${badge.padEnd(14)} ${desc}`,
            value: `${b.name}::${b.catalogUrl}`,
        };
    });

    return (
        <Box flexDirection="column">
            <Box marginBottom={1}>
                <Text bold color="cyan">
                    {catalogUrl !== undefined
                        ? `Bricks — ${catalogUrl}`
                        : 'Bricks — Aggregate View'}
                </Text>
            </Box>
            {searching && (
                <SearchBar
                    query={query}
                    onChange={setQuery}
                    onSubmit={() => setSearching(false)}
                    onCancel={() => {
                        setSearching(false);
                        setQuery('');
                    }}
                />
            )}
            <List
                items={items}
                cursor={cursor}
                onCursorChange={setCursor}
                onSelect={(value: string) => {
                    const sepIdx = value.indexOf('::');
                    if (sepIdx === -1) return;
                    const name = value.slice(0, sepIdx);
                    const url = value.slice(sepIdx + 2);
                    if (name.length > 0 && url.length > 0) onOpen(name, url);
                }}
            />
            {actionStatus.state === 'installing' && (
                <Box marginTop={1}>
                    <Text color="yellow">Installing...</Text>
                </Box>
            )}
            {actionStatus.state === 'uninstalling' && (
                <Box marginTop={1}>
                    <Text color="yellow">Uninstalling...</Text>
                </Box>
            )}
            {actionStatus.state === 'success' && (
                <Box marginTop={1}>
                    <Text color="green">{`✓ ${actionStatus.message}`}</Text>
                </Box>
            )}
            {actionStatus.state === 'error' && (
                <Box marginTop={1}>
                    <Text color="red">{`✗ ${actionStatus.error}`}</Text>
                </Box>
            )}
            <Box marginTop={1}>
                <Text
                    dimColor
                >{`${String(filtered.length)} brick(s)${query.length > 0 ? ` matching "${query}"` : ''}`}</Text>
            </Box>
        </Box>
    );
}
