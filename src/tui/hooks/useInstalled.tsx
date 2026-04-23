// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * useInstalled — reads the set of installed brick names from ~/.focus/center.json.
 */

import { parseCenterJson } from '@focus-mcp/core';
import { useEffect, useState } from 'react';
import { NpmInstallerAdapter } from '../../adapters/npm-installer-adapter.ts';

export function useInstalled(): {
    readonly installed: Set<string>;
    readonly loading: boolean;
} {
    const [installed, setInstalled] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const adapter = new NpmInstallerAdapter();
        adapter
            .readCenterJson()
            .then((raw) => {
                try {
                    const center = parseCenterJson(raw);
                    setInstalled(new Set(Object.keys(center.bricks)));
                } catch {
                    setInstalled(new Set());
                }
            })
            .catch(() => setInstalled(new Set()))
            .finally(() => setLoading(false));
    }, []);

    return { installed, loading };
}
