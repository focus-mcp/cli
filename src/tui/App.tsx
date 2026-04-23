// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * App — root TUI component. Routes between screens:
 *   catalogs → bricks → details
 * Global keybindings: q to quit, Esc to navigate back, ? to toggle help.
 */

import { Box, useInput } from 'ink';
import { useState } from 'react';
import { Breadcrumb } from './components/Breadcrumb.tsx';
import { HelpOverlay } from './components/HelpOverlay.tsx';
import { StatusBar } from './components/StatusBar.tsx';
import { BrickDetailsScreen } from './screens/BrickDetailsScreen.tsx';
import { BricksScreen } from './screens/BricksScreen.tsx';
import { CatalogsScreen } from './screens/CatalogsScreen.tsx';

type Screen =
    | { readonly type: 'catalogs' }
    | { readonly type: 'bricks'; readonly catalogUrl?: string; readonly catalogName?: string }
    | {
          readonly type: 'details';
          readonly brickName: string;
          readonly catalogUrl: string;
          readonly catalogName?: string;
      };

function buildBreadcrumb(screen: Screen): string[] {
    if (screen.type === 'catalogs') return ['FocusMCP', 'Catalogs'];
    if (screen.type === 'bricks') {
        return ['FocusMCP', screen.catalogName ?? 'Bricks', 'Bricks'];
    }
    return ['FocusMCP', screen.catalogName ?? 'Bricks', screen.brickName];
}

function navigateBack(screen: Screen): Screen {
    if (screen.type === 'bricks') return { type: 'catalogs' };
    if (screen.type === 'details') {
        return {
            type: 'bricks',
            ...(screen.catalogUrl !== undefined ? { catalogUrl: screen.catalogUrl } : {}),
            ...(screen.catalogName !== undefined ? { catalogName: screen.catalogName } : {}),
        };
    }
    return screen;
}

function openBricksScreen(url: string | undefined, name: string | undefined): Screen {
    if (url !== undefined) {
        return {
            type: 'bricks',
            catalogUrl: url,
            ...(name !== undefined ? { catalogName: name } : {}),
        };
    }
    return { type: 'bricks' };
}

export function App() {
    const [screen, setScreen] = useState<Screen>({ type: 'catalogs' });
    const [showHelp, setShowHelp] = useState(false);

    useInput((input, key) => {
        if (input === 'q') process.exit(0);
        if (input === '?') {
            setShowHelp((v) => !v);
            return;
        }
        if (key.escape) {
            if (showHelp) {
                setShowHelp(false);
            } else {
                setScreen(navigateBack(screen));
            }
        }
    });

    const breadcrumb = buildBreadcrumb(screen);

    return (
        <Box flexDirection="column">
            <Breadcrumb segments={breadcrumb} />
            {screen.type === 'catalogs' && (
                <CatalogsScreen onOpen={(url, name) => setScreen(openBricksScreen(url, name))} />
            )}
            {screen.type === 'bricks' && (
                <BricksScreen
                    {...(screen.catalogUrl !== undefined ? { catalogUrl: screen.catalogUrl } : {})}
                    onOpen={(name, url) =>
                        setScreen({
                            type: 'details',
                            brickName: name,
                            catalogUrl: url,
                            ...(screen.catalogName !== undefined
                                ? { catalogName: screen.catalogName }
                                : {}),
                        })
                    }
                    onBack={() => setScreen({ type: 'catalogs' })}
                    showHelp={showHelp}
                />
            )}
            {screen.type === 'details' && (
                <BrickDetailsScreen
                    brickName={screen.brickName}
                    catalogUrl={screen.catalogUrl}
                    onBack={() => setScreen(navigateBack(screen))}
                    showHelp={showHelp}
                />
            )}
            {showHelp && screen.type !== 'bricks' && <HelpOverlay screen={screen.type} />}
            <StatusBar screen={screen.type} />
        </Box>
    );
}
