// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * App — root TUI component. Routes between the three screens:
 *   catalogs → bricks → details
 * Global keybindings: q to quit, Esc to navigate back.
 */

import { Box, useInput } from 'ink';
import React, { useState } from 'react';
import { StatusBar } from './components/StatusBar.tsx';
import { BrickDetailsScreen } from './screens/BrickDetailsScreen.tsx';
import { BricksScreen } from './screens/BricksScreen.tsx';
import { CatalogsScreen } from './screens/CatalogsScreen.tsx';

type Screen =
    | { readonly type: 'catalogs' }
    | { readonly type: 'bricks'; readonly catalogUrl?: string }
    | { readonly type: 'details'; readonly brickName: string; readonly catalogUrl: string };

function goBack(screen: Screen, setScreen: (s: Screen) => void): void {
    if (screen.type === 'details') {
        const url = screen.catalogUrl.length > 0 ? screen.catalogUrl : undefined;
        if (url !== undefined) {
            setScreen({ type: 'bricks', catalogUrl: url });
        } else {
            setScreen({ type: 'bricks' });
        }
    } else if (screen.type === 'bricks') {
        setScreen({ type: 'catalogs' });
    }
}

function openBricks(catalogUrl: string | undefined, setScreen: (s: Screen) => void): void {
    if (catalogUrl !== undefined) {
        setScreen({ type: 'bricks', catalogUrl });
    } else {
        setScreen({ type: 'bricks' });
    }
}

export function App(): React.ReactElement {
    const [screen, setScreen] = useState<Screen>({ type: 'catalogs' });

    useInput((input, key) => {
        if (input === 'q') process.exit(0);
        if (key.escape) goBack(screen, setScreen);
    });

    return React.createElement(
        Box,
        { flexDirection: 'column', height: '100%' },
        screen.type === 'catalogs' &&
            React.createElement(CatalogsScreen, {
                onOpen: (catalogUrl?: string) => openBricks(catalogUrl, setScreen),
            }),
        screen.type === 'bricks' &&
            React.createElement(BricksScreen, {
                ...(screen.catalogUrl !== undefined ? { catalogUrl: screen.catalogUrl } : {}),
                onOpen: (brickName: string, brickCatalogUrl: string) =>
                    setScreen({ type: 'details', brickName, catalogUrl: brickCatalogUrl }),
                onBack: () => setScreen({ type: 'catalogs' }),
            }),
        screen.type === 'details' &&
            React.createElement(BrickDetailsScreen, {
                brickName: screen.brickName,
                catalogUrl: screen.catalogUrl,
                onBack: () => goBack(screen, setScreen),
            }),
        React.createElement(StatusBar, { screen: screen.type }),
    );
}
