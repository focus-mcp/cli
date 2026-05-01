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
    esbuildOptions(options) {
        options.jsx = 'automatic';
        options.jsxImportSource = 'react';
    },
    // @focus-mcp/core (and MCP SDK) are runtime npm dependencies — do NOT bundle
    // them into the cli dist. They will be resolved from node_modules at runtime.
    // This allows consumers to update @focus-mcp/core independently without
    // re-releasing @focus-mcp/cli.
    external: ['@focus-mcp/core'],
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
