// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * `focus config` — manage ~/.focus/config.json.
 *
 * Currently exposes the `tools` subsection:
 *   - tools.hidden    : blacklist (tools hidden from the AI client)
 *   - tools.alwaysLoad: always-load list (tools marked alwaysLoad in tools/list responses)
 *
 * Usage:
 *   focus config tools hide <pattern>
 *   focus config tools show <pattern>
 *   focus config tools pin <pattern>      (alwaysLoad = true)
 *   focus config tools unpin <pattern>    (remove from alwaysLoad list)
 *   focus config tools list
 *   focus config tools clear
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const FOCUS_DIR = join(homedir(), '.focus');
const CONFIG_PATH = join(FOCUS_DIR, 'config.json');

/** Read ~/.focus/config.json, return {} if absent or malformed. */
export async function readConfig(): Promise<Record<string, unknown>> {
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

export async function writeConfig(config: Record<string, unknown>): Promise<void> {
    await mkdir(FOCUS_DIR, { recursive: true });
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 4), 'utf-8');
}

function getToolsSection(config: Record<string, unknown>): Record<string, unknown> {
    const tools = config['tools'];
    if (tools !== null && typeof tools === 'object' && !Array.isArray(tools)) {
        return tools as Record<string, unknown>;
    }
    return {};
}

function getStringArray(section: Record<string, unknown>, key: string): string[] {
    const val = section[key];
    if (!Array.isArray(val)) return [];
    return val.filter((s): s is string => typeof s === 'string' && s.length > 0);
}

// ---------- tools.hidden ----------

export async function configToolsHideCommand(pattern: string): Promise<string> {
    const config = await readConfig();
    const section = getToolsSection(config);
    const hidden = getStringArray(section, 'hidden');
    if (hidden.includes(pattern)) {
        return `Pattern "${pattern}" is already in the hidden list.`;
    }
    section['hidden'] = [...hidden, pattern];
    config['tools'] = section;
    await writeConfig(config);
    return `Pattern "${pattern}" added to hidden list.\nRestart \`focus start\` to apply.`;
}

export async function configToolsShowCommand(pattern: string): Promise<string> {
    const config = await readConfig();
    const section = getToolsSection(config);
    const hidden = getStringArray(section, 'hidden');
    const updated = hidden.filter((p) => p !== pattern);
    if (updated.length === hidden.length) {
        return `Pattern "${pattern}" was not in the hidden list.`;
    }
    section['hidden'] = updated;
    config['tools'] = section;
    await writeConfig(config);
    return `Pattern "${pattern}" removed from hidden list.\nRestart \`focus start\` to apply.`;
}

// ---------- tools.alwaysLoad ----------

export async function configToolsPinCommand(pattern: string): Promise<string> {
    const config = await readConfig();
    const section = getToolsSection(config);
    const alwaysLoad = getStringArray(section, 'alwaysLoad');
    if (alwaysLoad.includes(pattern)) {
        return `Pattern "${pattern}" is already in the alwaysLoad list.`;
    }
    section['alwaysLoad'] = [...alwaysLoad, pattern];
    config['tools'] = section;
    await writeConfig(config);
    return `Pattern "${pattern}" added to alwaysLoad list.\nRestart \`focus start\` to apply.`;
}

export async function configToolsUnpinCommand(pattern: string): Promise<string> {
    const config = await readConfig();
    const section = getToolsSection(config);
    const alwaysLoad = getStringArray(section, 'alwaysLoad');
    const updated = alwaysLoad.filter((p) => p !== pattern);
    if (updated.length === alwaysLoad.length) {
        return `Pattern "${pattern}" was not in the alwaysLoad list.`;
    }
    section['alwaysLoad'] = updated;
    config['tools'] = section;
    await writeConfig(config);
    return `Pattern "${pattern}" removed from alwaysLoad list.\nRestart \`focus start\` to apply.`;
}

// ---------- list + clear ----------

export async function configToolsListCommand(): Promise<string> {
    const config = await readConfig();
    const section = getToolsSection(config);
    const hidden = getStringArray(section, 'hidden');
    const alwaysLoad = getStringArray(section, 'alwaysLoad');

    const lines: string[] = [];
    if (hidden.length === 0) {
        lines.push('hidden:     (none)');
    } else {
        lines.push(`hidden (${hidden.length}):`);
        for (const p of hidden) lines.push(`  - ${p}`);
    }
    if (alwaysLoad.length === 0) {
        lines.push('alwaysLoad: (none)');
    } else {
        lines.push(`alwaysLoad (${alwaysLoad.length}):`);
        for (const p of alwaysLoad) lines.push(`  - ${p}`);
    }
    return lines.join('\n');
}

export async function configToolsClearCommand(): Promise<string> {
    const config = await readConfig();
    const section = getToolsSection(config);
    section['hidden'] = [];
    section['alwaysLoad'] = [];
    config['tools'] = section;
    await writeConfig(config);
    return 'tools.hidden and tools.alwaysLoad cleared.\nRestart `focus start` to apply.';
}
