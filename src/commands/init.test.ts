// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { focusInit } from './init.ts';

describe('focusInit', () => {
    let rootDir: string;

    beforeEach(() => {
        rootDir = mkdtempSync(join(tmpdir(), 'focus-init-'));
    });

    afterEach(() => {
        rmSync(rootDir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it('uses input.project_path when provided', () => {
        // Set up a TS project under rootDir.
        writeFileSync(
            join(rootDir, 'package.json'),
            JSON.stringify({ name: 'demo', dependencies: {} }),
            'utf-8',
        );
        writeFileSync(join(rootDir, 'tsconfig.json'), '{}', 'utf-8');

        const result = focusInit({ project_path: rootDir });

        expect(result.detected_stack.primary).toBe('typescript');
        expect(result.detected_stack.detected_files).toEqual(
            expect.arrayContaining(['package.json', 'tsconfig.json']),
        );
    });

    it('uses opts.cwd when project_path is omitted', () => {
        writeFileSync(join(rootDir, 'package.json'), JSON.stringify({ name: 'demo' }), 'utf-8');

        const result = focusInit({}, { cwd: rootDir });

        // package.json without tsconfig and no .ts files → javascript
        expect(['typescript', 'javascript']).toContain(result.detected_stack.primary);
        expect(result.detected_stack.detected_files).toContain('package.json');
    });

    it('falls back to process.cwd() when neither input nor opts provided', () => {
        const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(rootDir);
        writeFileSync(join(rootDir, 'go.mod'), 'module x\n', 'utf-8');

        const result = focusInit({});

        expect(cwdSpy).toHaveBeenCalled();
        expect(result.detected_stack.primary).toBe('go');
    });

    it('produces recommended_bricks + matching install_commands when reco list is non-empty', () => {
        writeFileSync(join(rootDir, 'package.json'), JSON.stringify({ name: 'demo' }), 'utf-8');
        writeFileSync(join(rootDir, 'tsconfig.json'), '{}', 'utf-8');

        const result = focusInit({ project_path: rootDir });

        expect(result.recommended_bricks.length).toBeGreaterThan(0);
        // Shape contract: each entry has a name + reason, snake_case keys at top level.
        for (const r of result.recommended_bricks) {
            expect(typeof r.name).toBe('string');
            expect(typeof r.reason).toBe('string');
        }
        // install_commands must mirror recommended_bricks 1-to-1, prefixed by "focus add ".
        expect(result.install_commands).toEqual(
            result.recommended_bricks.map((r) => `focus add ${r.name}`),
        );
    });

    it('agent_next_step mentions focus_bricks_install when reco list is non-empty', () => {
        writeFileSync(join(rootDir, 'package.json'), JSON.stringify({ name: 'demo' }), 'utf-8');
        writeFileSync(join(rootDir, 'tsconfig.json'), '{}', 'utf-8');

        const result = focusInit({ project_path: rootDir });

        expect(result.recommended_bricks.length).toBeGreaterThan(0);
        expect(result.agent_next_step).toContain('focus_bricks_install');
    });

    it('agent_next_step mentions focus_bricks_search when reco list is empty', async () => {
        // Mock @focus-mcp/core to force an empty recommendations array.
        vi.resetModules();
        vi.doMock('@focus-mcp/core', () => ({
            initProject: () => ({
                stack: {
                    primary: 'generic',
                    detected_files: [],
                    frameworks: [],
                },
                recommendations: [],
            }),
        }));

        const { focusInit: mocked } = await import('./init.ts');
        const result = mocked({ project_path: rootDir });

        expect(result.recommended_bricks).toEqual([]);
        expect(result.install_commands).toEqual([]);
        expect(result.agent_next_step).toContain('focus_bricks_search');
        vi.doUnmock('@focus-mcp/core');
    });

    it('output uses snake_case keys at top level (MCP boundary contract)', () => {
        writeFileSync(join(rootDir, 'package.json'), JSON.stringify({ name: 'demo' }), 'utf-8');

        const result = focusInit({ project_path: rootDir });

        const keys = Object.keys(result).sort();
        expect(keys).toEqual(
            ['agent_next_step', 'detected_stack', 'install_commands', 'recommended_bricks'].sort(),
        );
    });
});
