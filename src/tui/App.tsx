// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * App — root TUI component. Routes between the three screens:
 *   catalogs → bricks → details
 * Global keybindings: q to quit, Esc to navigate back.
 */

import { Box, useInput } from 'ink';
import { useState } from 'react';
import { StatusBar } from './components/StatusBar.tsx';
import { BrickDetailsScreen } from './screens/BrickDetailsScreen.tsx';
import { BricksScreen } from './screens/BricksScreen.tsx';
import { CatalogsScreen } from './screens/CatalogsScreen.tsx';

type Screen =
    | { readonly type: 'catalogs' }
    | { readonly type: 'bricks'; readonly catalogUrl?: string }
    | { readonly type: 'details'; readonly brickName: string; readonly catalogUrl: string };

export function App() {
    const [screen, setScreen] = useState<Screen>({ type: 'catalogs' });

    useInput((input, key) => {
        if (input === 'q') process.exit(0);
        if (key.escape) {
            if (screen.type === 'bricks') setScreen({ type: 'catalogs' });
            else if (screen.type === 'details') {
                setScreen({ type: 'bricks', catalogUrl: screen.catalogUrl });
            }
        }
    });

    return (
        <Box flexDirection="column">
            {screen.type === 'catalogs' && (
                <CatalogsScreen
                    onOpen={(url) =>
                        setScreen(
                            url !== undefined
                                ? { type: 'bricks', catalogUrl: url }
                                : { type: 'bricks' },
                        )
                    }
                />
            )}
            {screen.type === 'bricks' && (
                <BricksScreen
                    {...(screen.catalogUrl !== undefined ? { catalogUrl: screen.catalogUrl } : {})}
                    onOpen={(name, url) =>
                        setScreen({ type: 'details', brickName: name, catalogUrl: url })
                    }
                    onBack={() => setScreen({ type: 'catalogs' })}
                />
            )}
            {screen.type === 'details' && (
                <BrickDetailsScreen
                    brickName={screen.brickName}
                    catalogUrl={screen.catalogUrl}
                    onBack={() => setScreen({ type: 'bricks', catalogUrl: screen.catalogUrl })}
                />
            )}
            <StatusBar screen={screen.type} />
        </Box>
    );
}
