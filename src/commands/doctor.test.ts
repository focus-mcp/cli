// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { DEFAULT_CATALOG_URL } from '@focus-mcp/core';
import { describe, expect, it, vi } from 'vitest';
import type { CatalogStoreIO } from '../adapters/catalog-store-adapter.ts';
import type { FetchIO } from '../adapters/http-fetch-adapter.ts';
import type { InstallerIO } from '../adapters/npm-installer-adapter.ts';
import type { DoctorIO } from './doctor.ts';
import { doctorCommand, formatDoctorOutput } from './doctor.ts';

// ---------- helpers ----------

const DEFAULT_URL = DEFAULT_CATALOG_URL;

function makeFetchIO(overrides: Partial<FetchIO> = {}): FetchIO {
    return {
        fetchJson: vi.fn().mockResolvedValue(validCatalog([validCatalogBrick()])),
        ...overrides,
    };
}

function makeStoreIO(): CatalogStoreIO {
    return {
        readStore: vi.fn().mockResolvedValue({
            sources: [
                {
                    url: DEFAULT_URL,
                    name: 'FocusMCP Marketplace',
                    enabled: true,
                    addedAt: '2026-01-01T00:00:00Z',
                },
            ],
        }),
        writeStore: vi.fn().mockResolvedValue(undefined),
    };
}

function makeInstallerIO(overrides: Partial<InstallerIO> = {}): InstallerIO {
    return {
        npmInstall: vi.fn().mockResolvedValue(undefined),
        npmUninstall: vi.fn().mockResolvedValue(undefined),
        writeCenterJson: vi.fn().mockResolvedValue(undefined),
        writeCenterLock: vi.fn().mockResolvedValue(undefined),
        readCenterJson: vi.fn().mockResolvedValue({ bricks: {} }),
        readCenterLock: vi.fn().mockResolvedValue({ bricks: {} }),
        ...overrides,
    };
}

function makeDoctorIO(overrides: Partial<DoctorIO> = {}): DoctorIO {
    return {
        fetch: makeFetchIO(),
        store: makeStoreIO(),
        installer: makeInstallerIO(),
        fileExists: vi.fn().mockResolvedValue(true),
        readJsonFile: vi.fn().mockResolvedValue(validManifest()),
        getBricksDir: vi.fn().mockReturnValue('/home/user/.focus/bricks'),
        getCliVersion: vi.fn().mockReturnValue('1.5.0'),
        getCoreVersion: vi.fn().mockReturnValue('1.1.0'),
        getFocusDir: vi.fn().mockReturnValue('/home/user/.focus'),
        ...overrides,
    };
}

function validCatalog(bricks: unknown[]) {
    return {
        name: 'Test Catalog',
        owner: { name: 'FocusMCP' },
        updated: '2026-01-01',
        bricks,
    };
}

function validCatalogBrick(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        name: 'echo',
        version: '1.0.0',
        description: 'Echo brick',
        dependencies: [],
        tools: [{ name: 'say', description: 'Echo text' }],
        source: { type: 'npm', package: '@focus-mcp/brick-echo' },
        ...overrides,
    };
}

function validManifest(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        name: 'echo',
        version: '1.0.0',
        tools: [{ name: 'say', description: 'Echo text' }],
        ...overrides,
    };
}

function installedCenterJson(bricks: Record<string, unknown>) {
    return { bricks };
}

function installedCenterLock(bricks: Record<string, unknown>) {
    return { bricks };
}

function lockEntry(name: string, pkg?: string) {
    return {
        version: '1.0.0',
        catalogUrl: DEFAULT_URL,
        npmPackage: pkg ?? `@focus-mcp/brick-${name}`,
        installedAt: '2026-01-01T00:00:00Z',
    };
}

// ---------- install integrity checks ----------

describe('doctorCommand — install integrity', () => {
    it('reports no errors when everything is healthy', async () => {
        const io = makeDoctorIO({
            installer: makeInstallerIO({
                readCenterJson: vi
                    .fn()
                    .mockResolvedValue(
                        installedCenterJson({ echo: { version: '1.0.0', enabled: true } }),
                    ),
                readCenterLock: vi
                    .fn()
                    .mockResolvedValue(installedCenterLock({ echo: lockEntry('echo') })),
            }),
        });
        const result = await doctorCommand({ io });
        const errors = result.findings.filter((f) => f.severity === 'error');
        expect(errors).toHaveLength(0);
    });

    it('reports error when package directory is missing', async () => {
        const io = makeDoctorIO({
            installer: makeInstallerIO({
                readCenterJson: vi
                    .fn()
                    .mockResolvedValue(
                        installedCenterJson({ echo: { version: '1.0.0', enabled: true } }),
                    ),
                readCenterLock: vi
                    .fn()
                    .mockResolvedValue(installedCenterLock({ echo: lockEntry('echo') })),
            }),
            fileExists: vi.fn().mockResolvedValue(false),
        });
        const result = await doctorCommand({ io });
        const errors = result.findings.filter((f) => f.severity === 'error');
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0]?.message).toMatch(/missing/i);
        expect(errors[0]?.fix).toMatch(/focus add echo/);
    });

    it('reports warning when dist/index.js is missing', async () => {
        const io = makeDoctorIO({
            installer: makeInstallerIO({
                readCenterJson: vi
                    .fn()
                    .mockResolvedValue(
                        installedCenterJson({ echo: { version: '1.0.0', enabled: true } }),
                    ),
                readCenterLock: vi
                    .fn()
                    .mockResolvedValue(installedCenterLock({ echo: lockEntry('echo') })),
            }),
            // pkg dir exists, but dist/index.js doesn't
            fileExists: vi.fn().mockImplementation(async (path: string) => {
                return !path.endsWith('dist/index.js');
            }),
        });
        const result = await doctorCommand({ io });
        const warnings = result.findings.filter((f) => f.severity === 'warning');
        expect(warnings.some((w) => w.message.includes('dist/index.js'))).toBe(true);
    });

    it('reports warning when mcp-brick.json is missing', async () => {
        const io = makeDoctorIO({
            installer: makeInstallerIO({
                readCenterJson: vi
                    .fn()
                    .mockResolvedValue(
                        installedCenterJson({ echo: { version: '1.0.0', enabled: true } }),
                    ),
                readCenterLock: vi
                    .fn()
                    .mockResolvedValue(installedCenterLock({ echo: lockEntry('echo') })),
            }),
            readJsonFile: vi.fn().mockResolvedValue(null),
        });
        const result = await doctorCommand({ io });
        const warnings = result.findings.filter((f) => f.severity === 'warning');
        expect(warnings.some((w) => w.message.includes('mcp-brick.json missing'))).toBe(true);
    });
});

// ---------- manifest validity checks ----------

describe('doctorCommand — manifest validity', () => {
    it('reports warning when mcp-brick.json has invalid name', async () => {
        const io = makeDoctorIO({
            installer: makeInstallerIO({
                readCenterJson: vi
                    .fn()
                    .mockResolvedValue(
                        installedCenterJson({ echo: { version: '1.0.0', enabled: true } }),
                    ),
                readCenterLock: vi
                    .fn()
                    .mockResolvedValue(installedCenterLock({ echo: lockEntry('echo') })),
            }),
            readJsonFile: vi
                .fn()
                .mockResolvedValue(validManifest({ name: 'INVALID NAME', version: '1.0.0' })),
        });
        const result = await doctorCommand({ io });
        const warnings = result.findings.filter((f) => f.severity === 'warning');
        expect(warnings.some((w) => w.message.includes('invalid'))).toBe(true);
    });
});

// ---------- dependency completeness ----------

describe('doctorCommand — dependency completeness', () => {
    it('reports warning when a dependency is missing', async () => {
        const io = makeDoctorIO({
            installer: makeInstallerIO({
                readCenterJson: vi
                    .fn()
                    .mockResolvedValue(
                        installedCenterJson({ codebase: { version: '1.0.0', enabled: true } }),
                    ),
                readCenterLock: vi
                    .fn()
                    .mockResolvedValue(installedCenterLock({ codebase: lockEntry('codebase') })),
            }),
            // Catalog says codebase depends on fileread, but fileread not installed
            fetch: makeFetchIO({
                fetchJson: vi
                    .fn()
                    .mockResolvedValue(
                        validCatalog([
                            validCatalogBrick({ name: 'codebase', dependencies: ['fileread'] }),
                            validCatalogBrick({ name: 'fileread', dependencies: [] }),
                        ]),
                    ),
            }),
        });
        const result = await doctorCommand({ io });
        const warnings = result.findings.filter((f) => f.severity === 'warning');
        expect(warnings.some((w) => w.message.includes('fileread'))).toBe(true);
        expect(warnings.some((w) => w.fix?.includes('focus add fileread'))).toBe(true);
    });
});

// ---------- version drift ----------

describe('doctorCommand — version drift', () => {
    it('reports info when an update is available', async () => {
        const io = makeDoctorIO({
            installer: makeInstallerIO({
                readCenterJson: vi
                    .fn()
                    .mockResolvedValue(
                        installedCenterJson({ echo: { version: '1.0.0', enabled: true } }),
                    ),
                readCenterLock: vi
                    .fn()
                    .mockResolvedValue(installedCenterLock({ echo: lockEntry('echo') })),
            }),
            // Catalog has 1.1.0 but installed is 1.0.0
            fetch: makeFetchIO({
                fetchJson: vi
                    .fn()
                    .mockResolvedValue(
                        validCatalog([validCatalogBrick({ name: 'echo', version: '1.1.0' })]),
                    ),
            }),
        });
        const result = await doctorCommand({ io });
        const infos = result.findings.filter((f) => f.severity === 'info');
        // At least the update info (catalog reachable is also info)
        const updateInfo = infos.find((f) => f.message.includes('update available'));
        expect(updateInfo).toBeDefined();
        expect(updateInfo?.fix).toMatch(/focus upgrade echo/);
    });
});

// ---------- catalog sources ----------

describe('doctorCommand — catalog sources', () => {
    it('reports warning when catalog is unreachable', async () => {
        const io = makeDoctorIO({
            fetch: makeFetchIO({
                fetchJson: vi.fn().mockRejectedValue(new Error('network down')),
            }),
        });
        const result = await doctorCommand({ io });
        const warnings = result.findings.filter((f) => f.severity === 'warning');
        expect(warnings.some((w) => w.message.includes('unreachable'))).toBe(true);
    });

    it('reports info when catalog is reachable', async () => {
        const io = makeDoctorIO();
        const result = await doctorCommand({ io });
        const infos = result.findings.filter((f) => f.severity === 'info');
        expect(infos.some((f) => f.message.includes('reachable'))).toBe(true);
    });
});

// ---------- output formatting ----------

describe('formatDoctorOutput', () => {
    it('outputs JSON when json flag is set', async () => {
        const io = makeDoctorIO();
        const result = await doctorCommand({ io });
        const out = formatDoctorOutput(result, true);
        const parsed = JSON.parse(out) as typeof result;
        expect(parsed.cliVersion).toBe('1.5.0');
    });

    it('outputs text summary by default', async () => {
        const io = makeDoctorIO();
        const result = await doctorCommand({ io });
        const out = formatDoctorOutput(result, false);
        expect(out).toMatch(/FocusMCP Doctor/);
        expect(out).toMatch(/Summary/);
    });

    it('appends fixLog to output when fixLog is present', () => {
        const result = {
            findings: [],
            bricksInstalled: 1,
            cliVersion: '1.8.0',
            coreVersion: '1.2.0',
            focusDir: '/home/user/.focus',
            errors: 0,
            warnings: 0,
            infos: 0,
            fixLog: ['  → focus reinstall echo', '  → focus add dep'],
        };
        const out = formatDoctorOutput(result, false);
        expect(out).toMatch(/Actions taken/);
        expect(out).toMatch(/focus reinstall echo/);
        expect(out).toMatch(/focus add dep/);
    });
});

// ---------- doctor --fix flag ----------

describe('doctorCommand --fix', () => {
    it('includes fixLog in result when fix=true and there are corrupted installs', async () => {
        // Simulate a missing package dir (error finding)
        const io = makeDoctorIO({
            installer: makeInstallerIO({
                readCenterJson: vi
                    .fn()
                    .mockResolvedValue(
                        installedCenterJson({ echo: { version: '1.0.0', enabled: true } }),
                    ),
                readCenterLock: vi
                    .fn()
                    .mockResolvedValue(installedCenterLock({ echo: lockEntry('echo') })),
            }),
            fileExists: vi.fn().mockResolvedValue(false), // triggers package dir missing error
        });

        const result = await doctorCommand({ io, fix: true });
        expect(result.fixLog).toBeDefined();
        expect(Array.isArray(result.fixLog)).toBe(true);
        // Should attempt to reinstall echo
        expect(result.fixLog?.some((line) => line.includes('echo'))).toBe(true);
    });

    it('includes fixLog for missing deps when fix=true', async () => {
        const io = makeDoctorIO({
            installer: makeInstallerIO({
                readCenterJson: vi
                    .fn()
                    .mockResolvedValue(
                        installedCenterJson({ codebase: { version: '1.0.0', enabled: true } }),
                    ),
                readCenterLock: vi
                    .fn()
                    .mockResolvedValue(installedCenterLock({ codebase: lockEntry('codebase') })),
            }),
            fetch: makeFetchIO({
                fetchJson: vi
                    .fn()
                    .mockResolvedValue(
                        validCatalog([
                            validCatalogBrick({ name: 'codebase', dependencies: ['fileread'] }),
                            validCatalogBrick({ name: 'fileread', dependencies: [] }),
                        ]),
                    ),
            }),
        });

        const result = await doctorCommand({ io, fix: true });
        expect(result.fixLog).toBeDefined();
        expect(result.fixLog?.some((line) => line.includes('fileread'))).toBe(true);
    });

    it('returns undefined fixLog when fix=false', async () => {
        const io = makeDoctorIO();
        const result = await doctorCommand({ io, fix: false });
        expect(result.fixLog).toBeUndefined();
    });

    it('returns empty fixLog when fix=true and no actionable issues', async () => {
        // No installed bricks, no issues to fix
        const io = makeDoctorIO();
        const result = await doctorCommand({ io, fix: true });
        expect(result.fixLog).toBeDefined();
        expect(result.fixLog).toHaveLength(0);
    });
});
