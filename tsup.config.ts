// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const cliPkg = JSON.parse(readFileSync('package.json', 'utf-8')) as { version: string };
const corePkg = JSON.parse(readFileSync('../core/packages/core/package.json', 'utf-8')) as {
    version: string;
};

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        'bin/focus': 'src/bin/focus.ts',
    },
    format: ['esm'],
    target: 'node22',
    platform: 'node',
    // @focusmcp/core is consumed locally via a file: dep at build time.
    // We bundle it into dist so the published tarball is self-contained
    // and end users don't have to install @focusmcp/core themselves.
    noExternal: ['@focusmcp/core'],
    // Only the programmatic API emits .d.ts; the binary doesn't need types.
    dts: {
        entry: { index: 'src/index.ts' },
    },
    define: {
        'process.env.CLI_VERSION': JSON.stringify(cliPkg.version),
        'process.env.CORE_VERSION': JSON.stringify(corePkg.version),
    },
    sourcemap: true,
    clean: true,
    splitting: false,
    treeshake: true,
    minify: false,
    outDir: 'dist',
});
