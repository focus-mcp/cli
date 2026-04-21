// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/** @type {import('@commitlint/types').UserConfig} */
export default {
    extends: ['@commitlint/config-conventional'],
    rules: {
        'type-enum': [
            2,
            'always',
            [
                'feat',
                'fix',
                'docs',
                'style',
                'refactor',
                'perf',
                'test',
                'build',
                'ci',
                'chore',
                'revert',
            ],
        ],
        'subject-case': [2, 'never', ['upper-case', 'pascal-case', 'start-case']],
        'header-max-length': [2, 'always', 100],
        'body-leading-blank': [2, 'always'],
        'footer-leading-blank': [2, 'always'],
    },
};
