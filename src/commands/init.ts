// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { type InitResult, initProject } from '@focus-mcp/core';
import { createNodeProjectFiles } from '../adapters/project-files-adapter.ts';

export interface FocusInitInput {
    /** Project path to scan. Defaults to opts.cwd or process.cwd(). */
    project_path?: string;
}

export interface FocusInitOutput {
    detected_stack: InitResult['stack'];
    recommended_bricks: readonly { name: string; reason: string }[];
    install_commands: readonly string[];
    agent_next_step: string;
}

/**
 * Implements the `focus_init` MCP tool: detects the project stack and
 * returns a list of recommended bricks plus shell install commands.
 *
 * Read-only: never writes to disk and never installs anything.
 */
export function focusInit(input: FocusInitInput, opts?: { cwd?: string }): FocusInitOutput {
    const root = input.project_path ?? opts?.cwd ?? process.cwd();
    const files = createNodeProjectFiles(root);
    const result = initProject(files);

    const install_commands = result.recommendations.map((r) => `focus add ${r.name}`);

    const agent_next_step =
        result.recommendations.length > 0
            ? 'Call focus_bricks_install for each recommended brick (or run the install_commands), then focus_tools_list to verify the toolset matches your workflow.'
            : 'No specific recommendations for this project. Use focus_bricks_search to explore the catalog.';

    return {
        detected_stack: result.stack,
        recommended_bricks: result.recommendations.map(({ name, reason }) => ({
            name,
            reason,
        })),
        install_commands,
        agent_next_step,
    };
}
