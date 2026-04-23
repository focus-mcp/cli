// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * useInstalled — reads the set of installed brick names from ~/.focus/center.json.
 * Exposes a `refresh()` method to trigger a reload.
 */

import { parseCenterJson } from '@focus-mcp/core';
import { useCallback, useEffect, useState } from 'react';
import { NpmInstallerAdapter } from '../../adapters/npm-installer-adapter.ts';

export function useInstalled(): {
    readonly installed: Set<string>;
    readonly loading: boolean;
    readonly refresh: () => void;
} {
    const [installed, setInstalled] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [version, setVersion] = useState(0);

    // biome-ignore lint/correctness/useExhaustiveDependencies: version is an intentional refresh trigger
    useEffect(() => {
        setLoading(true);
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
    }, [version]);

    const refresh = useCallback(() => setVersion((v) => v + 1), []);

    return { installed, loading, refresh };
}
