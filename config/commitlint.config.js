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
                'release',
            ],
        ],
        'subject-case': [2, 'never', ['upper-case', 'pascal-case', 'start-case']],
        'header-max-length': [2, 'always', 100],
        'body-leading-blank': [2, 'always'],
        'footer-leading-blank': [2, 'always'],
        // Squash-merge bodies can embed PR descriptions with long lines; disable the limit.
        'body-max-line-length': [0],
    },
};
