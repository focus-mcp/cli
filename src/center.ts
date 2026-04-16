// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * Parser and types for FocusMCP's two state files:
 *
 * - `center.json` — the user-editable declaration of installed bricks
 *   (`<catalog>/<name>` → { version, enabled, config? }). The `version`
 *   field is a semver range the user wishes to pin to.
 *
 * - `center.lock` — the machine-maintained resolution of every entry
 *   in `center.json` (resolved version, catalog metadata, integrity).
 *
 * Both files live under `~/.focus/` and are read by every CLI command.
 * These parsers perform structural validation only — semver validity,
 * catalog URLs, and signatures are checked by `@focusmcp/core`.
 */

export interface CenterJsonEntry {
  /** Semver range the user wants to pin to (e.g. `^1.0.0`). */
  version: string;
  /** Whether the brick is currently active. */
  enabled: boolean;
  /** Optional brick-specific configuration, forwarded to the brick at boot. */
  config?: Record<string, unknown>;
}

export interface CenterJson {
  bricks: Record<string, CenterJsonEntry>;
}

export interface CenterLockEntry {
  /** The resolved version (exact semver, no range). */
  version: string;
  /** URL of the catalog that resolved this brick, if tracked. */
  catalog_url?: string;
  /** Identifier of the catalog (e.g. `official`). */
  catalog_id?: string;
  /** SRI-style integrity hash of the tarball. */
  integrity?: string;
  /** URL to download the tarball from. */
  tarballUrl?: string;
}

export type CenterLock = Record<string, CenterLockEntry>;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parses a `center.json` payload. Throws on any structural violation.
 */
export function parseCenterJson(raw: unknown): CenterJson {
  if (!isObject(raw)) {
    throw new Error('Invalid center.json: root must be an object.');
  }
  const bricksRaw = raw['bricks'];
  if (!isObject(bricksRaw)) {
    throw new Error('Invalid center.json: `bricks` must be an object.');
  }

  const bricks: Record<string, CenterJsonEntry> = {};
  for (const [key, value] of Object.entries(bricksRaw)) {
    if (!isObject(value)) {
      throw new Error(`Invalid center.json entry for "${key}": must be an object.`);
    }
    const version = value['version'];
    if (typeof version !== 'string' || version.length === 0) {
      throw new Error(`Invalid center.json entry for "${key}": missing \`version\`.`);
    }
    const enabled = value['enabled'];
    if (typeof enabled !== 'boolean') {
      throw new Error(`Invalid center.json entry for "${key}": missing \`enabled\`.`);
    }

    const entry: CenterJsonEntry = { version, enabled };
    const config = value['config'];
    if (config !== undefined) {
      if (!isObject(config)) {
        throw new Error(`Invalid center.json entry for "${key}": \`config\` must be an object.`);
      }
      entry.config = config;
    }
    bricks[key] = entry;
  }

  return { bricks };
}

/**
 * Parses a `center.lock` payload. Throws on any structural violation.
 */
export function parseCenterLock(raw: unknown): CenterLock {
  if (!isObject(raw)) {
    throw new Error('Invalid center.lock: root must be an object.');
  }

  const lock: CenterLock = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isObject(value)) {
      throw new Error(`Invalid center.lock entry for "${key}": must be an object.`);
    }
    const version = value['version'];
    if (typeof version !== 'string' || version.length === 0) {
      throw new Error(`Invalid center.lock entry for "${key}": missing resolved \`version\`.`);
    }

    const entry: CenterLockEntry = { version };
    const catalogUrl = value['catalog_url'];
    if (typeof catalogUrl === 'string') entry.catalog_url = catalogUrl;
    const catalogId = value['catalog_id'];
    if (typeof catalogId === 'string') entry.catalog_id = catalogId;
    const integrity = value['integrity'];
    if (typeof integrity === 'string') entry.integrity = integrity;
    const tarballUrl = value['tarballUrl'];
    if (typeof tarballUrl === 'string') entry.tarballUrl = tarballUrl;

    lock[key] = entry;
  }

  return lock;
}
