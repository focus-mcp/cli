// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * BricksScreen — split-panel view: left list (60%) + right preview (40%).
 * Real-time preview updates as user navigates.
 * Supports / (search), i (install), u (uninstall), ? (help), Enter (focus details).
 */

import type { AggregatedBrick } from '@focus-mcp/core';
import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useState } from 'react';
import { FilesystemCatalogStoreAdapter } from '../../adapters/catalog-store-adapter.ts';
import { HttpFetchAdapter } from '../../adapters/http-fetch-adapter.ts';
import { NpmInstallerAdapter } from '../../adapters/npm-installer-adapter.ts';
import { addCommand } from '../../commands/add.ts';
import { removeCommand } from '../../commands/remove.ts';
import { BrickPreview } from '../components/BrickPreview.tsx';
import { HelpOverlay } from '../components/HelpOverlay.tsx';
import { List } from '../components/List.tsx';
import { SearchBar } from '../components/SearchBar.tsx';
import { useBricks } from '../hooks/useBricks.tsx';
import { useInstalled } from '../hooks/useInstalled.tsx';

interface BricksScreenProps {
    readonly catalogUrl?: string;
    readonly onOpen: (brickName: string, catalogUrl: string) => void;
    readonly onBack: () => void;
    readonly showHelp: boolean;
}

type ActionStatus =
    | { state: 'idle' }
    | { state: 'installing'; brickName: string }
    | { state: 'uninstalling'; brickName: string }
    | { state: 'success'; message: string }
    | { state: 'error'; error: string };

function buildIO() {
    return {
        fetch: new HttpFetchAdapter(),
        store: new FilesystemCatalogStoreAdapter(),
        installer: new NpmInstallerAdapter(),
    };
}

function filterBricks<T extends { readonly name: string; readonly description: string }>(
    bricks: readonly T[],
    query: string,
): T[] {
    if (query.trim().length === 0) return [...bricks];
    const q = query.toLowerCase();
    return bricks.filter(
        (b) => b.name.toLowerCase().includes(q) || b.description.toLowerCase().includes(q),
    );
}

function buildListItem(b: AggregatedBrick, isInstalled: boolean) {
    const indicator = isInstalled ? '● installed' : '○          ';
    const desc = b.description.length > 35 ? `${b.description.slice(0, 35)}…` : b.description;
    return {
        label: `${indicator} ${b.name.padEnd(22)} ${b.version.padEnd(7)} ${desc}`,
        value: `${b.name}::${b.catalogUrl}`,
    };
}

interface ActionFeedbackProps {
    readonly actionStatus: ActionStatus;
}

function ActionFeedback({ actionStatus }: ActionFeedbackProps): React.ReactElement | null {
    if (actionStatus.state === 'installing') {
        return (
            <Box marginTop={1}>
                <Text color="yellow">{`Installing... @focus-mcp/brick-${actionStatus.brickName}`}</Text>
            </Box>
        );
    }
    if (actionStatus.state === 'uninstalling') {
        return (
            <Box marginTop={1}>
                <Text color="yellow">{`Uninstalling... @focus-mcp/brick-${actionStatus.brickName}`}</Text>
            </Box>
        );
    }
    if (actionStatus.state === 'success') {
        return (
            <Box marginTop={1}>
                <Text color="green">{`✓ ${actionStatus.message}`}</Text>
            </Box>
        );
    }
    if (actionStatus.state === 'error') {
        return (
            <Box marginTop={1}>
                <Text color="red">{`✗ ${actionStatus.error}`}</Text>
            </Box>
        );
    }
    return null;
}

function parseListValue(value: string): { name: string; url: string } | undefined {
    const sepIdx = value.indexOf('::');
    if (sepIdx === -1) return undefined;
    const name = value.slice(0, sepIdx);
    const url = value.slice(sepIdx + 2);
    if (name.length === 0 || url.length === 0) return undefined;
    return { name, url };
}

export function BricksScreen({
    catalogUrl,
    onOpen,
    onBack,
    showHelp,
}: BricksScreenProps): React.ReactElement {
    const [query, setQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [cursor, setCursor] = useState(0);
    const [actionStatus, setActionStatus] = useState<ActionStatus>({ state: 'idle' });
    const { bricks, loading, error } = useBricks(catalogUrl);
    const { installed, refresh } = useInstalled();

    const filtered = filterBricks(bricks, query);
    const currentBrick = filtered[cursor];
    const currentIsInstalled = currentBrick !== undefined && installed.has(currentBrick.name);

    async function performInstall(brickName: string): Promise<void> {
        setActionStatus({ state: 'installing', brickName });
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
        setActionStatus({ state: 'uninstalling', brickName });
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
        if (actionStatus.state !== 'idle' || currentBrick === undefined) return;
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

    const items = filtered.map((b) => buildListItem(b, installed.has(b.name)));

    return (
        <Box flexDirection="column" flexGrow={1}>
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
            <Box flexDirection="row" flexGrow={1}>
                <Box flexDirection="column" width="60%">
                    <List
                        items={items}
                        cursor={cursor}
                        onCursorChange={setCursor}
                        onSelect={(value: string) => {
                            const parsed = parseListValue(value);
                            if (parsed !== undefined) onOpen(parsed.name, parsed.url);
                        }}
                    />
                    <ActionFeedback actionStatus={actionStatus} />
                    <Box marginTop={1}>
                        <Text
                            dimColor
                        >{`${String(filtered.length)} brick(s)${query.length > 0 ? ` matching "${query}"` : ''}`}</Text>
                    </Box>
                </Box>
                <Box width="40%" paddingLeft={1}>
                    <BrickPreview brick={currentBrick} isInstalled={currentIsInstalled} />
                </Box>
            </Box>
            {showHelp && <HelpOverlay screen="bricks" />}
            <Box marginTop={1} flexDirection="row" gap={2}>
                <Text dimColor>{currentIsInstalled ? '[u] uninstall' : '[i] install'}</Text>
                <Text dimColor>{'[Enter] details  [/] search  Esc back  ? help'}</Text>
            </Box>
        </Box>
    );
}
