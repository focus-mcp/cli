// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import type { CenterJson, CenterLock } from '../center.ts';

export interface ListCommandInput {
  center: CenterJson;
  lock: CenterLock;
}

/**
 * Formats the list of bricks declared in `center.json`, cross-referenced with
 * the `center.lock` resolution. Pure function: takes already-parsed state and
 * returns the string that should be printed.
 */
export function listCommand({ center, lock }: ListCommandInput): string {
  const entries = Object.entries(center.bricks);
  if (entries.length === 0) {
    return 'No bricks installed.';
  }

  entries.sort(([a], [b]) => a.localeCompare(b));

  const lines: string[] = [];
  for (const [key, entry] of entries) {
    const resolved = lock[key];
    const resolvedVersion = resolved ? resolved.version : 'unresolved';
    const status = entry.enabled ? 'enabled' : 'disabled';
    lines.push(`${key}  ${resolvedVersion}  (wants ${entry.version})  [${status}]`);
  }
  return lines.join('\n');
}
