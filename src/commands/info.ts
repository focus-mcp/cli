// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import type { CenterJson, CenterLock } from '../center.ts';

export interface InfoCommandInput {
  name: string;
  center: CenterJson;
  lock: CenterLock;
}

/**
 * Formats a detailed view for a single brick. Pure function that throws a
 * clear error when the brick is unknown so the calling binary can translate
 * it into a non-zero exit code.
 */
export function infoCommand({ name, center, lock }: InfoCommandInput): string {
  const entry = center.bricks[name];
  if (!entry) {
    throw new Error(`Brick "${name}" is not declared in center.json.`);
  }

  const resolved = lock[name];
  const lines: string[] = [];
  lines.push(`Name:       ${name}`);
  lines.push(`Requested:  ${entry.version}`);
  lines.push(`Installed:  ${resolved ? resolved.version : 'unresolved'}`);
  lines.push(`Status:     ${entry.enabled ? 'enabled' : 'disabled'}`);

  if (resolved?.catalog_id) {
    lines.push(`Catalog:    ${resolved.catalog_id}`);
  }
  if (resolved?.catalog_url) {
    lines.push(`Catalog URL: ${resolved.catalog_url}`);
  }
  if (resolved?.tarballUrl) {
    lines.push(`Tarball:    ${resolved.tarballUrl}`);
  }
  if (resolved?.integrity) {
    lines.push(`Integrity:  ${resolved.integrity}`);
  }

  if (entry.config && Object.keys(entry.config).length > 0) {
    lines.push('Config:');
    lines.push(JSON.stringify(entry.config, null, 2));
  }

  return lines.join('\n');
}
