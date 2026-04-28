// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * `focus filter` — manage the tool hidden-list stored in ~/.focus/config.json.
 *
 * The hidden-list is a blacklist of tool name patterns (exact or trailing-glob).
 * Hidden tools are not exposed by `focus start`. Modify the list here; restart
 * `focus start` to apply changes.
 *
 * Actions: hide | show | list | clear
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const FOCUS_DIR = join(homedir(), '.focus');
const CONFIG_PATH = join(FOCUS_DIR, 'config.json');

/** Read ~/.focus/config.json, return {} if absent or malformed. */
async function readConfig(): Promise<Record<string, unknown>> {
    try {
        const raw = await readFile(CONFIG_PATH, 'utf-8');
        const parsed = JSON.parse(raw) as unknown;
        return typeof parsed === 'object' && parsed !== null
            ? (parsed as Record<string, unknown>)
            : {};
    } catch {
        return {};
    }
}

async function writeConfig(config: Record<string, unknown>): Promise<void> {
    await mkdir(FOCUS_DIR, { recursive: true });
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 4), 'utf-8');
}

function getHiddenList(config: Record<string, unknown>): string[] {
    const tools = config['tools'];
    if (
        tools !== null &&
        typeof tools === 'object' &&
        !Array.isArray(tools) &&
        Array.isArray((tools as Record<string, unknown>)['hidden'])
    ) {
        return (tools as Record<string, unknown>)['hidden'] as string[];
    }
    return [];
}

function setHiddenList(config: Record<string, unknown>, hidden: string[]): void {
    const tools =
        config['tools'] !== null &&
        typeof config['tools'] === 'object' &&
        !Array.isArray(config['tools'])
            ? (config['tools'] as Record<string, unknown>)
            : {};
    tools['hidden'] = hidden;
    config['tools'] = tools;
}

export async function filterHideCommand(pattern: string): Promise<string> {
    const config = await readConfig();
    const hidden = getHiddenList(config);
    if (hidden.includes(pattern)) {
        return `Pattern "${pattern}" is already in the hidden list.`;
    }
    setHiddenList(config, [...hidden, pattern]);
    await writeConfig(config);
    return `Pattern "${pattern}" added to hidden list.\nRestart \`focus start\` to apply.`;
}

export async function filterShowCommand(pattern: string): Promise<string> {
    const config = await readConfig();
    const hidden = getHiddenList(config);
    const updated = hidden.filter((p) => p !== pattern);
    if (updated.length === hidden.length) {
        return `Pattern "${pattern}" was not in the hidden list.`;
    }
    setHiddenList(config, updated);
    await writeConfig(config);
    return `Pattern "${pattern}" removed from hidden list.\nRestart \`focus start\` to apply.`;
}

export async function filterListCommand(): Promise<string> {
    const config = await readConfig();
    const hidden = getHiddenList(config);
    if (hidden.length === 0) {
        return 'No tools are hidden. All tools are visible.';
    }
    return `Hidden tools (${hidden.length}):\n${hidden.map((p) => `  - ${p}`).join('\n')}`;
}

export async function filterClearCommand(): Promise<string> {
    const config = await readConfig();
    setHiddenList(config, []);
    await writeConfig(config);
    return 'Hidden list cleared. All tools are now visible.\nRestart `focus start` to apply.';
}
