// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * focus browse
 *
 * Launches an interactive TUI to browse catalogs and bricks.
 * Uses ink (React for terminals) to render the UI.
 */

import { render } from 'ink';
import React from 'react';
import { App } from '../tui/App.tsx';

export async function browseCommand(): Promise<void> {
    const { waitUntilExit } = render(React.createElement(App));
    await waitUntilExit();
}
