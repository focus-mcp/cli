// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { existsSync, readFileSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import type { ProjectFiles } from '@focus-mcp/core';

/**
 * Filesystem-backed ProjectFiles for `focus_init`.
 *
 * Reads files relative to the resolved root, with strict path containment
 * to prevent traversal beyond root. Used by the CLI to feed `detectStack`
 * / `initProject` from `@focus-mcp/core` (which is browser-safe and does
 * not perform any IO itself).
 */
export function createNodeProjectFiles(rootPath: string): ProjectFiles {
    const normalizedRoot = normalize(rootPath);

    function resolve(relativePath: string): string | null {
        const target = normalize(join(normalizedRoot, relativePath));
        // Containment check: target must be within normalizedRoot.
        const rootWithSep = normalizedRoot.endsWith(sep) ? normalizedRoot : normalizedRoot + sep;
        if (target !== normalizedRoot && !target.startsWith(rootWithSep)) {
            return null; // path traversal attempt
        }
        return target;
    }

    return {
        hasFile(relativePath: string): boolean {
            const abs = resolve(relativePath);
            return abs !== null && existsSync(abs);
        },
        readFileText(relativePath: string): string | null {
            const abs = resolve(relativePath);
            if (abs === null || !existsSync(abs)) return null;
            try {
                return readFileSync(abs, 'utf-8');
            } catch {
                return null;
            }
        },
    };
}
