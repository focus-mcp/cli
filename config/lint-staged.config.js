// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/** @type {import('lint-staged').Configuration} */
export default {
    '*.{ts,tsx,js,jsx,json,md}': ['biome check --write --no-errors-on-unmatched'],
    '*.{ts,tsx}': () => 'pnpm typecheck',
};
