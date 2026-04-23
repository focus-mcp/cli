// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * BrickDetailsScreen — full information about a selected brick.
 * Shows name, version, description, catalog, tags, and install status.
 * Supports i (install) and u (uninstall) keyboard actions.
 */

import { Box, Text, useInput } from 'ink';
import type React from 'react';
import { useState } from 'react';
import { FilesystemCatalogStoreAdapter } from '../../adapters/catalog-store-adapter.ts';
import { HttpFetchAdapter } from '../../adapters/http-fetch-adapter.ts';
import { NpmInstallerAdapter } from '../../adapters/npm-installer-adapter.ts';
import { addCommand } from '../../commands/add.ts';
import { removeCommand } from '../../commands/remove.ts';
import { useBricks } from '../hooks/useBricks.tsx';
import { useInstalled } from '../hooks/useInstalled.tsx';

interface BrickDetailsScreenProps {
    readonly brickName: string;
    readonly catalogUrl: string;
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

export function BrickDetailsScreen({
    brickName,
    catalogUrl,
    onBack,
}: BrickDetailsScreenProps): React.ReactElement {
    const { bricks, loading } = useBricks(catalogUrl);
    const { installed, refresh } = useInstalled();
    const [actionStatus, setActionStatus] = useState<ActionStatus>({ state: 'idle' });

    async function performInstall(): Promise<void> {
        setActionStatus({ state: 'installing' });
        try {
            const message = await addCommand({ brickName, io: buildIO() });
            setActionStatus({ state: 'success', message });
            setTimeout(() => {
                refresh();
                setActionStatus({ state: 'idle' });
            }, 1500);
        } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            setActionStatus({ state: 'error', error });
        }
    }

    async function performUninstall(): Promise<void> {
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
            const error = err instanceof Error ? err.message : String(err);
            setActionStatus({ state: 'error', error });
        }
    }

    useInput((input, key) => {
        if (key.escape) onBack();
        if (actionStatus.state !== 'idle') return;
        const isInstalled = installed.has(brickName);
        if (input === 'i' && !isInstalled) {
            void performInstall();
        }
        if (input === 'u' && isInstalled) {
            void performUninstall();
        }
    });

    if (loading) return <Text>Loading...</Text>;

    const brick = bricks.find((b) => b.name === brickName);
    if (brick === undefined) {
        return (
            <Box flexDirection="column">
                <Text color="red">{`Brick "${brickName}" not found.`}</Text>
                <Text dimColor>Press Esc to go back</Text>
            </Box>
        );
    }

    const isInstalled = installed.has(brickName);

    return (
        <Box flexDirection="column" paddingX={1}>
            <Box marginBottom={1}>
                <Text bold color="cyan">
                    {brick.name}
                </Text>
                <Text>{'  '}</Text>
                <Text color="yellow">{`v${brick.version}`}</Text>
                {isInstalled ? <Text color="green">{'  ✓ installed'}</Text> : <Text>{''}</Text>}
            </Box>
            <Text>{brick.description}</Text>
            <Box marginTop={1} flexDirection="column">
                <Text bold>Catalog:</Text>
                <Text dimColor>{brick.catalogUrl}</Text>
            </Box>
            {brick.tags !== undefined && brick.tags.length > 0 ? (
                <Box marginTop={1}>
                    <Text bold>Tags: </Text>
                    <Text color="magenta">{brick.tags.join(', ')}</Text>
                </Box>
            ) : (
                <Box />
            )}
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
            <Box marginTop={2}>
                <Text dimColor>
                    {isInstalled
                        ? 'Press Esc to go back  |  u: uninstall'
                        : 'Press Esc to go back  |  i: install'}
                </Text>
            </Box>
        </Box>
    );
}
