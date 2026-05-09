// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createNodeProjectFiles } from './project-files-adapter.ts';

describe('createNodeProjectFiles', () => {
    let rootDir: string;

    beforeEach(() => {
        rootDir = mkdtempSync(join(tmpdir(), 'focus-pf-'));
    });

    afterEach(() => {
        rmSync(rootDir, { recursive: true, force: true });
    });

    describe('hasFile', () => {
        it('returns true for an existing file inside the root', () => {
            writeFileSync(join(rootDir, 'package.json'), '{}', 'utf-8');
            const pf = createNodeProjectFiles(rootDir);
            expect(pf.hasFile('package.json')).toBe(true);
        });

        it('returns false for a missing file', () => {
            const pf = createNodeProjectFiles(rootDir);
            expect(pf.hasFile('does-not-exist.txt')).toBe(false);
        });

        it('returns false on path traversal (../../etc/passwd)', () => {
            const pf = createNodeProjectFiles(rootDir);
            expect(pf.hasFile('../../etc/passwd')).toBe(false);
        });

        it('returns false on absolute paths (treated as escaping containment)', () => {
            const pf = createNodeProjectFiles(rootDir);
            // join(root, '/etc/passwd') normalizes to '/etc/passwd' on POSIX,
            // which fails the containment check and returns null.
            expect(pf.hasFile('/etc/passwd')).toBe(false);
        });

        it('returns true for nested files inside the root', () => {
            const nestedDir = join(rootDir, 'src', 'commands');
            mkdirSync(nestedDir, { recursive: true });
            writeFileSync(join(nestedDir, 'foo.ts'), 'x', 'utf-8');
            const pf = createNodeProjectFiles(rootDir);
            expect(pf.hasFile('src/commands/foo.ts')).toBe(true);
        });
    });

    describe('readFileText', () => {
        it('returns the file contents for an existing file', () => {
            writeFileSync(join(rootDir, 'README.md'), '# hello\n', 'utf-8');
            const pf = createNodeProjectFiles(rootDir);
            expect(pf.readFileText('README.md')).toBe('# hello\n');
        });

        it('returns null for a missing file', () => {
            const pf = createNodeProjectFiles(rootDir);
            expect(pf.readFileText('missing.txt')).toBeNull();
        });

        it('returns null on path traversal', () => {
            const pf = createNodeProjectFiles(rootDir);
            expect(pf.readFileText('../../etc/passwd')).toBeNull();
        });

        it('returns null on absolute paths (containment check fails)', () => {
            const pf = createNodeProjectFiles(rootDir);
            expect(pf.readFileText('/etc/passwd')).toBeNull();
        });

        it('returns null when readFileSync throws (e.g. directory passed as file)', () => {
            // Create a directory at "weird"; readFileSync on a dir throws EISDIR.
            mkdirSync(join(rootDir, 'weird'), { recursive: true });
            const pf = createNodeProjectFiles(rootDir);
            expect(pf.readFileText('weird')).toBeNull();
        });
    });

    describe('root path normalization', () => {
        it('handles a root with trailing separator', () => {
            writeFileSync(join(rootDir, 'a.txt'), 'A', 'utf-8');
            const pf = createNodeProjectFiles(rootDir + sep);
            expect(pf.hasFile('a.txt')).toBe(true);
            expect(pf.readFileText('a.txt')).toBe('A');
        });

        it('handles a root without trailing separator', () => {
            writeFileSync(join(rootDir, 'b.txt'), 'B', 'utf-8');
            const pf = createNodeProjectFiles(rootDir);
            expect(pf.hasFile('b.txt')).toBe(true);
            expect(pf.readFileText('b.txt')).toBe('B');
        });

        it('returns true for the root itself when relativePath is empty (target === root branch)', () => {
            // join(root, '') → root; resolves to normalizedRoot, containment ok.
            const pf = createNodeProjectFiles(rootDir);
            // The root dir itself exists.
            expect(pf.hasFile('')).toBe(true);
        });
    });
});
