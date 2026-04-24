// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * focus doctor
 *
 * Audits the local FocusMCP state and reports actionable issues.
 * Pure function: all I/O is injected via DoctorIO.
 */

import {
    type AggregatedCatalog,
    aggregateCatalogs,
    type CenterJson,
    type CenterLock,
    compareSemver,
    createDefaultStore,
    fetchAllCatalogs,
    findBrickAcrossCatalogs,
    getEnabledSources,
    parseCatalogStore,
    parseCenterJson,
    parseCenterLock,
} from '@focus-mcp/core';
import type { CatalogStoreIO } from '../adapters/catalog-store-adapter.ts';
import type { FetchIO } from '../adapters/http-fetch-adapter.ts';
import type { InstallerIO } from '../adapters/npm-installer-adapter.ts';

// ---------- interfaces ----------

export interface DoctorIO {
    readonly fetch: FetchIO;
    readonly store: CatalogStoreIO;
    readonly installer: InstallerIO;
    /** Check if a file exists and is readable */
    fileExists(path: string): Promise<boolean>;
    /** Read JSON from a file path, return null on missing */
    readJsonFile(path: string): Promise<unknown>;
    /** Resolve the bricks node_modules directory path */
    getBricksDir(): string;
    /** Get CLI version string */
    getCliVersion(): string;
    /** Get core version string */
    getCoreVersion(): string;
    /** Get the focus home directory */
    getFocusDir(): string;
}

export interface DoctorFinding {
    readonly severity: 'error' | 'warning' | 'info';
    readonly message: string;
    readonly fix?: string;
}

export interface DoctorResult {
    readonly findings: readonly DoctorFinding[];
    readonly bricksInstalled: number;
    readonly cliVersion: string;
    readonly coreVersion: string;
    readonly focusDir: string;
    readonly errors: number;
    readonly warnings: number;
    readonly infos: number;
}

export interface DoctorCommandInput {
    readonly io: DoctorIO;
    readonly json?: boolean;
}

// ---------- check helpers ----------

function isMcpBrickJsonValid(manifest: unknown): boolean {
    if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) return false;
    const obj = manifest as Record<string, unknown>;
    const KEBAB = /^[a-z][a-z0-9-]*$/;
    const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)/;
    if (typeof obj['name'] !== 'string' || !KEBAB.test(obj['name'])) return false;
    if (typeof obj['version'] !== 'string' || !SEMVER.test(obj['version'])) return false;
    return Array.isArray(obj['tools']);
}

async function checkInstallIntegrity(
    centerJson: CenterJson,
    centerLock: CenterLock,
    io: DoctorIO,
    findings: DoctorFinding[],
): Promise<void> {
    for (const name of Object.keys(centerJson.bricks)) {
        const lock = centerLock.bricks[name];
        if (lock === undefined) {
            findings.push({
                severity: 'error',
                message: `${name}: lock entry missing`,
                fix: `focus remove ${name} && focus add ${name}`,
            });
            continue;
        }

        const pkg = lock.npmPackage.replace(/\//g, '+').replace(/@/g, '');
        const pkgDir = `${io.getBricksDir()}/node_modules/${lock.npmPackage}`;
        const distIndex = `${pkgDir}/dist/index.js`;
        const brickJson = `${pkgDir}/mcp-brick.json`;

        const dirExists = await io.fileExists(pkgDir);
        if (!dirExists) {
            findings.push({
                severity: 'error',
                message: `${name}: package directory missing (${lock.npmPackage})`,
                fix: `focus add ${name}`,
            });
            continue;
        }

        void pkg;

        const distExists = await io.fileExists(distIndex);
        if (!distExists) {
            findings.push({
                severity: 'warning',
                message: `${name}: dist/index.js missing — possibly corrupted`,
                fix: `focus remove ${name} && focus add ${name}`,
            });
        }

        const manifestRaw = await io.readJsonFile(brickJson);
        if (manifestRaw === null) {
            findings.push({
                severity: 'warning',
                message: `${name}: mcp-brick.json missing`,
                fix: `focus remove ${name} && focus add ${name}`,
            });
        } else if (!isMcpBrickJsonValid(manifestRaw)) {
            findings.push({
                severity: 'warning',
                message: `${name}: mcp-brick.json is invalid (name/version/tools check failed)`,
                fix: `focus remove ${name} && focus add ${name}`,
            });
        }
    }
}

function checkDependencyCompleteness(
    centerJson: CenterJson,
    catalog: AggregatedCatalog | null,
    findings: DoctorFinding[],
): void {
    if (catalog === null) return;
    for (const name of Object.keys(centerJson.bricks)) {
        const brick = findBrickAcrossCatalogs(catalog, name);
        if (brick === undefined) continue;
        for (const dep of brick.dependencies) {
            if (!(dep in centerJson.bricks)) {
                findings.push({
                    severity: 'warning',
                    message: `${name}: missing declared dependency "${dep}"`,
                    fix: `focus add ${dep}`,
                });
            }
        }
    }
}

function checkVersionDrift(
    centerJson: CenterJson,
    catalog: AggregatedCatalog | null,
    findings: DoctorFinding[],
): void {
    if (catalog === null) return;
    for (const [name, entry] of Object.entries(centerJson.bricks)) {
        const brick = findBrickAcrossCatalogs(catalog, name);
        if (brick === undefined) continue;
        try {
            if (compareSemver(brick.version, entry.version) === 1) {
                findings.push({
                    severity: 'info',
                    message: `${name}: update available ${entry.version} → ${brick.version}`,
                    fix: `focus upgrade ${name}`,
                });
            }
        } catch {
            // Ignore malformed semver
        }
    }
}

async function checkCatalogSources(
    io: DoctorIO,
    findings: DoctorFinding[],
): Promise<{ catalog: AggregatedCatalog | null }> {
    try {
        const rawStore = await io.store.readStore();
        let store = parseCatalogStore(rawStore);
        if (store.sources.length === 0) {
            store = createDefaultStore();
        }

        const enabled = getEnabledSources(store);
        if (enabled.length === 0) {
            findings.push({
                severity: 'warning',
                message: 'No enabled catalog sources',
                fix: 'focus catalog add <url> <name>',
            });
            return { catalog: null };
        }

        const urls = enabled.map((s) => s.url);
        const { results, errors: fetchErrors } = await fetchAllCatalogs(io.fetch, urls);

        for (const fe of fetchErrors) {
            findings.push({
                severity: 'warning',
                message: `Catalog unreachable: ${fe.url}`,
            });
        }

        for (const r of results) {
            findings.push({
                severity: 'info',
                message: `Catalog reachable: ${r.url}`,
            });
        }

        if (results.length === 0) return { catalog: null };
        return { catalog: aggregateCatalogs(results) };
    } catch {
        return { catalog: null };
    }
}

// ---------- output formatting ----------

function findingLine(f: DoctorFinding): string {
    return `   - ${f.message}${f.fix !== undefined ? ` → ${f.fix}` : ''}`;
}

function formatSection(
    findings: readonly DoctorFinding[],
    severity: 'error' | 'warning',
): string[] {
    if (findings.length === 0) return [];
    const icon = severity === 'error' ? '✗' : '⚠ ';
    const label = severity === 'error' ? 'error(s)' : 'warning(s)';
    return [`${icon} ${findings.length} ${label}:`, ...findings.map(findingLine), ''];
}

function formatText(result: DoctorResult): string {
    const errors = result.findings.filter((f) => f.severity === 'error');
    const warnings = result.findings.filter((f) => f.severity === 'warning');
    const infos = result.findings.filter((f) => f.severity === 'info');

    const header = [
        `FocusMCP Doctor — ${result.focusDir}`,
        `cli: ${result.cliVersion}  |  core: ${result.coreVersion}` +
            `  |  bricks installed: ${result.bricksInstalled}`,
        '',
        ...(errors.length === 0 && warnings.length === 0 ? ['✓ No issues found'] : []),
        ...formatSection(errors, 'error'),
        ...formatSection(warnings, 'warning'),
        ...infos.map((f) => `   ${f.message}`),
        '',
        `Summary: ${result.errors} error(s), ${result.warnings} warning(s), ${result.infos} info.` +
            (result.errors > 0 ? ' Fix errors before starting the server.' : ''),
    ];

    return header.join('\n');
}

// ---------- public API ----------

export async function doctorCommand({ io }: DoctorCommandInput): Promise<DoctorResult> {
    const rawCenter = await io.installer.readCenterJson();
    const rawLock = await io.installer.readCenterLock();
    const centerJson = parseCenterJson(rawCenter);
    const centerLock = parseCenterLock(rawLock);

    const findings: DoctorFinding[] = [];

    await checkInstallIntegrity(centerJson, centerLock, io, findings);
    const { catalog } = await checkCatalogSources(io, findings);
    checkDependencyCompleteness(centerJson, catalog, findings);
    checkVersionDrift(centerJson, catalog, findings);

    const errors = findings.filter((f) => f.severity === 'error').length;
    const warnings = findings.filter((f) => f.severity === 'warning').length;
    const infos = findings.filter((f) => f.severity === 'info').length;

    return {
        findings,
        bricksInstalled: Object.keys(centerJson.bricks).length,
        cliVersion: io.getCliVersion(),
        coreVersion: io.getCoreVersion(),
        focusDir: io.getFocusDir(),
        errors,
        warnings,
        infos,
    };
}

export function formatDoctorOutput(result: DoctorResult, json: boolean): string {
    if (json) {
        return JSON.stringify(result, null, 2);
    }
    return formatText(result);
}
