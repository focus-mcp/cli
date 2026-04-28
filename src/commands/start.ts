// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { Brick } from '@focus-mcp/core';
import { createFocusMcp, loadBricks } from '@focus-mcp/core';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { FilesystemCatalogStoreAdapter } from '../adapters/catalog-store-adapter.ts';
import { HttpFetchAdapter } from '../adapters/http-fetch-adapter.ts';
import { NpmInstallerAdapter } from '../adapters/npm-installer-adapter.ts';
import { parseCenterJson } from '../center.ts';
import { FilesystemBrickSource } from '../source/filesystem-source.ts';
import { addCommand } from './add.ts';
import { catalogCommand } from './catalog.ts';
import {
    configToolsClearCommand,
    configToolsHideCommand,
    configToolsListCommand,
    configToolsPinCommand,
    configToolsShowCommand,
    configToolsUnpinCommand,
} from './config.ts';
import { removeCommand } from './remove.ts';
import { searchCommand } from './search.ts';
import { upgradeCommand } from './upgrade.ts';

/**
 * Enrich a start-time error message with actionable suggestions.
 * When the registry reports "Missing dependency X", we hint at the
 * three most useful recovery commands.
 */
function enrichStartError(message: string, brickName: string): string {
    const match = message.match(/^Missing dependency "([^"]+)"/);
    if (match === null) return message;
    const dep = match[1] ?? '';
    return [
        `Missing dependency "${dep}" (required by brick "${brickName}")`,
        'Possible fixes:',
        `  focus add ${dep}                  # install the missing dep`,
        `  focus reinstall ${brickName}      # if ${brickName}'s install is corrupted`,
        '  focus doctor                 # full diagnostic',
    ].join('\n');
}

export const minimalLogger = {
    trace() {},
    debug() {},
    info() {},
    warn() {},
    error() {},
};

async function loadSingleBrick(brickName: string, bricksDir: string): Promise<Brick> {
    const source = new FilesystemBrickSource({
        centerJson: { bricks: { [brickName]: { version: '*', enabled: true } } },
        bricksDir,
    });
    const result = await loadBricks({ source });
    if (result.failures.length > 0) {
        throw result.failures[0]?.error;
    }
    const first = result.bricks[0];
    if (!first) {
        throw new Error(`No brick loaded for "${brickName}"`);
    }
    return first;
}

/**
 * Returns true if `toolName` matches the given glob pattern.
 * Supports a single trailing `*` wildcard (e.g. `focus_*`).
 * Falls back to exact equality for patterns without `*`.
 */
export function matchesPattern(toolName: string, pattern: string): boolean {
    if (pattern.endsWith('*')) {
        return toolName.startsWith(pattern.slice(0, -1));
    }
    return toolName === pattern;
}

/**
 * Returns true when `toolName` is hidden by the given hidden-patterns list.
 *
 * Special case: `focus_config` is always visible regardless of the hidden list,
 * so the agent can always re-manage the config (avoids a deadlock situation).
 *
 * When `hiddenPatterns` is null (no filter configured), no tools are hidden.
 */
export function isHiddenTool(toolName: string, hiddenPatterns: string[] | null): boolean {
    // focus_config is immune — always visible
    if (toolName === 'focus_config') return false;
    if (!hiddenPatterns) return false;
    return hiddenPatterns.some((p) => matchesPattern(toolName, p));
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: startup wiring with multiple mode branches
export async function startCommand(argv: string[] = []): Promise<void> {
    const { values } = parseArgs({
        args: argv,
        allowPositionals: false,
        strict: false,
        options: {
            http: { type: 'boolean', default: false },
            port: { type: 'string', default: '3000' },
            hide: { type: 'string' },
            pin: { type: 'string' },
        },
    });

    const useHttp = values['http'] === true;
    const port = Number(values['port']);

    if (!Number.isFinite(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid port: ${values['port']}. Must be 1-65535.`);
    }

    const focusDir = join(homedir(), '.focus');

    // ------------------------------------------------------------------
    // Resolve tool visibility lists: CLI args take priority over config file
    // Precedence (per list): CLI arg > ~/.focus/config.json tools.<list> > null
    // ------------------------------------------------------------------

    /** Parse a comma-separated patterns string into a non-empty array, or null. */
    function parsePatternArg(raw: string | undefined): string[] | null {
        if (typeof raw !== 'string') return null;
        const parts = raw
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        return parts.length > 0 ? parts : null;
    }

    const cliHidden = parsePatternArg(
        typeof values['hide'] === 'string' ? values['hide'] : undefined,
    );
    const cliAlwaysLoad = parsePatternArg(
        typeof values['pin'] === 'string' ? values['pin'] : undefined,
    );

    let fileHidden: string[] | null = null;
    let fileAlwaysLoad: string[] | null = null;
    let filterSource = 'none';

    if (cliHidden === null && cliAlwaysLoad === null) {
        // No CLI args — try ~/.focus/config.json
        try {
            const configRaw = await readFile(join(focusDir, 'config.json'), 'utf-8');
            const configData = JSON.parse(configRaw) as unknown;
            if (
                configData !== null &&
                typeof configData === 'object' &&
                'tools' in configData &&
                configData['tools'] !== null &&
                typeof configData['tools'] === 'object'
            ) {
                const toolsSection = configData['tools'] as Record<string, unknown>;

                const parseArr = (key: string): string[] | null => {
                    if (!Array.isArray(toolsSection[key])) return null;
                    const arr = (toolsSection[key] as unknown[]).filter(
                        (s): s is string => typeof s === 'string' && s.length > 0,
                    );
                    return arr.length > 0 ? arr : null;
                };

                fileHidden = parseArr('hidden');
                fileAlwaysLoad = parseArr('alwaysLoad');
                if (fileHidden !== null || fileAlwaysLoad !== null) {
                    filterSource = join(focusDir, 'config.json');
                }
            }
        } catch {
            // config.json absent or malformed — silently ignore
        }
    } else {
        filterSource = 'CLI args';
    }

    const hiddenPatterns: string[] | null = cliHidden ?? fileHidden;
    const alwaysLoadPatterns: string[] | null = cliAlwaysLoad ?? fileAlwaysLoad;
    let bricks: Brick[] = [];
    const activeBricksDir = process.env['FOCUSMCP_BRICKS_DIR'] ?? join(focusDir, 'bricks');

    try {
        const raw = await readFile(join(focusDir, 'center.json'), 'utf-8');
        const centerJson = parseCenterJson(JSON.parse(raw));

        const source = new FilesystemBrickSource({ centerJson, bricksDir: activeBricksDir });
        const result = await loadBricks({ source });

        bricks = [...result.bricks];

        for (const failure of result.failures) {
            const errMsg = enrichStartError(failure.error.message, failure.name);
            process.stderr.write(`⚠ Failed to load brick "${failure.name}": ${errMsg}\n`);
        }

        process.stderr.write(`Loaded ${bricks.length} brick(s)\n`);
    } catch (err: unknown) {
        const isNotFound =
            err instanceof Error && 'code' in err && (err as { code: string }).code === 'ENOENT';
        if (isNotFound) {
            process.stderr.write('No center.json found — starting with 0 bricks\n');
        } else {
            process.stderr.write(
                `Failed to load bricks: ${err instanceof Error ? err.message : String(err)}\n`,
            );
        }
    }

    const focusMcp = createFocusMcp({ bricks });
    await focusMcp.start();

    const server = new Server(
        { name: '@focus-mcp/cli', version: '0.0.0' },
        { capabilities: { tools: {} } },
    );

    // When FOCUS_BENCH_MODE=true (or 1), skip all meta tools so bench agents see
    // only the brick tools they are supposed to measure.
    const isBenchMode =
        process.env['FOCUS_BENCH_MODE'] === 'true' || process.env['FOCUS_BENCH_MODE'] === '1';

    // Log filter details when any filter is active
    if (hiddenPatterns !== null || alwaysLoadPatterns !== null) {
        const hiddenLine = hiddenPatterns?.join(', ') ?? '(none)';
        const alwaysLoadLine = alwaysLoadPatterns?.join(', ') ?? '(none)';
        process.stderr.write(
            `FocusMCP tool filter:\n  source:     ${filterSource}\n  hidden:     ${hiddenLine}\n  alwaysLoad: ${alwaysLoadLine}\n`,
        );
    }

    /**
     * Build a tool descriptor, optionally injecting _meta.anthropic/alwaysLoad.
     * The _meta annotation is a hint to MCP clients (e.g. Claude Code) to keep
     * this tool always loaded regardless of their deferred-loading strategy.
     */
    function metaTool(
        name: string,
        description: string,
        inputSchema: Record<string, unknown>,
        alwaysLoadHint = false,
    ): Record<string, unknown> {
        const base: Record<string, unknown> = { name, description, inputSchema };
        if (alwaysLoadHint) {
            base['_meta'] = { 'anthropic/alwaysLoad': true };
        }
        return base;
    }

    const metaTools = isBenchMode
        ? []
        : [
              metaTool(
                  'focus_list',
                  'List all loaded bricks and their tools',
                  { type: 'object', properties: {}, additionalProperties: false },
                  true,
              ),
              metaTool(
                  'focus_load',
                  'Load (activate) an installed brick — its tools become available immediately',
                  {
                      type: 'object',
                      properties: { name: { type: 'string', description: 'Brick name to load' } },
                      required: ['name'],
                      additionalProperties: false,
                  },
                  true,
              ),
              metaTool(
                  'focus_unload',
                  'Unload (deactivate) a running brick — its tools are removed immediately',
                  {
                      type: 'object',
                      properties: {
                          name: { type: 'string', description: 'Brick name to unload' },
                      },
                      required: ['name'],
                      additionalProperties: false,
                  },
              ),
              metaTool(
                  'focus_reload',
                  'Reload a brick — stop, reimport from disk, restart. Tools are updated immediately.',
                  {
                      type: 'object',
                      properties: {
                          name: { type: 'string', description: 'Brick name to reload' },
                      },
                      required: ['name'],
                      additionalProperties: false,
                  },
              ),
              metaTool(
                  'focus_search',
                  'Search the marketplace catalog for available bricks',
                  {
                      type: 'object',
                      properties: { query: { type: 'string', description: 'Search query' } },
                      required: ['query'],
                      additionalProperties: false,
                  },
                  true,
              ),
              metaTool(
                  'focus_install',
                  'Install a brick from the marketplace catalog',
                  {
                      type: 'object',
                      properties: {
                          name: { type: 'string', description: 'Brick name to install' },
                          version: {
                              type: 'string',
                              description: 'Version to install (optional)',
                          },
                      },
                      required: ['name'],
                      additionalProperties: false,
                  },
                  true,
              ),
              metaTool('focus_remove', 'Remove an installed brick', {
                  type: 'object',
                  properties: {
                      name: { type: 'string', description: 'Brick name to remove' },
                  },
                  required: ['name'],
                  additionalProperties: false,
              }),
              metaTool(
                  'focus_update',
                  'Update one or all installed bricks to their latest catalog version',
                  {
                      type: 'object',
                      properties: {
                          brick: {
                              type: 'string',
                              description:
                                  'Brick name to update (optional — updates all if omitted)',
                          },
                          all: {
                              type: 'boolean',
                              description:
                                  'Update all installed bricks (default when brick is omitted)',
                          },
                          check: {
                              type: 'boolean',
                              description:
                                  'Dry-run: list upgradable bricks without applying changes',
                          },
                      },
                      additionalProperties: false,
                  },
              ),
              metaTool(
                  'focus_upgrade',
                  'Upgrade one or all installed bricks to their latest catalog version (alias for focus_update)',
                  {
                      type: 'object',
                      properties: {
                          brick: {
                              type: 'string',
                              description:
                                  'Brick name to upgrade (optional — upgrades all if omitted)',
                          },
                          all: {
                              type: 'boolean',
                              description:
                                  'Upgrade all installed bricks (default when brick is omitted)',
                          },
                          check: {
                              type: 'boolean',
                              description:
                                  'Dry-run: list upgradable bricks without applying changes',
                          },
                      },
                      additionalProperties: false,
                  },
              ),
              metaTool('focus_catalog_add', 'Add a catalog source URL', {
                  type: 'object',
                  properties: {
                      url: { type: 'string', description: 'Catalog source URL to add' },
                  },
                  required: ['url'],
                  additionalProperties: false,
              }),
              metaTool('focus_catalog_list', 'List all configured catalog sources', {
                  type: 'object',
                  properties: {},
                  additionalProperties: false,
              }),
              metaTool('focus_catalog_remove', 'Remove a catalog source URL', {
                  type: 'object',
                  properties: {
                      url: { type: 'string', description: 'Catalog source URL to remove' },
                  },
                  required: ['url'],
                  additionalProperties: false,
              }),
              // focus_config: always visible regardless of hidden list (immune to filtering)
              // alwaysLoad hint ensures the agent never loses access to tool management
              metaTool(
                  'focus_config',
                  'Manage FocusMCP tool visibility. Hide/show tools by name or glob, pin tools as ' +
                      'alwaysLoad, or list/clear the config. Note: focus_config itself is always ' +
                      'visible regardless of the hidden list.',
                  {
                      type: 'object',
                      properties: {
                          action: {
                              type: 'string',
                              enum: ['hide', 'show', 'pin', 'unpin', 'list', 'clear'],
                              description:
                                  'hide: add to hidden list; show: remove from hidden; ' +
                                  'pin: add to alwaysLoad; unpin: remove from alwaysLoad; ' +
                                  'list: show both lists; clear: reset both lists',
                          },
                          pattern: {
                              type: 'string',
                              description:
                                  'Tool name or glob pattern (e.g. "sym_get" or "focus_*"). ' +
                                  'Required for hide / show / pin / unpin.',
                          },
                      },
                      required: ['action'],
                      additionalProperties: false,
                  },
                  true,
              ),
          ];

    server.setRequestHandler(ListToolsRequestSchema, async () => {
        const allTools = [
            ...focusMcp.router.listTools().map((t) => ({
                name: t.name,
                description: t.description,
                inputSchema: t.inputSchema,
            })),
            ...metaTools,
        ];
        const filteredTools = allTools
            .filter(
                (t) =>
                    !isHiddenTool(String((t as Record<string, unknown>)['name']), hiddenPatterns),
            )
            .map((t) => {
                const record = t as Record<string, unknown>;
                const toolName = String(record['name']);
                // Apply alwaysLoad hint from the user's pin list
                if (alwaysLoadPatterns?.some((p) => matchesPattern(toolName, p))) {
                    const existing = record['_meta'];
                    const merged =
                        existing !== null &&
                        typeof existing === 'object' &&
                        !Array.isArray(existing)
                            ? {
                                  ...(existing as Record<string, unknown>),
                                  'anthropic/alwaysLoad': true,
                              }
                            : { 'anthropic/alwaysLoad': true };
                    return { ...record, _meta: merged };
                }
                return t;
            });
        // Log the count once (only when a filter is active)
        if (hiddenPatterns !== null || alwaysLoadPatterns !== null) {
            process.stderr.write(`  exposed: ${filteredTools.length} / ${allTools.length} tools\n`);
        }
        return { tools: filteredTools };
    });

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: internal tool dispatch with multiple branches
    server.setRequestHandler(CallToolRequestSchema, async (req) => {
        const { name, arguments: args } = req.params;

        // Reject calls to tools that are in the hidden list
        if (isHiddenTool(name, hiddenPatterns)) {
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: `Tool "${name}" is not available (hidden by tool filter). Use focus_config to manage the hidden list.`,
                    },
                ],
                isError: true,
            };
        }

        // Meta tools are disabled in bench mode — skip all focus_* handlers and
        // fall through to the brick router (which will return an unknown-tool error).
        if (!isBenchMode) {
            // Internal tools — handled before dispatching to brick router
            if (name === 'focus_list') {
                const bricks = focusMcp.registry.getBricks();
                if (bricks.length === 0) {
                    return { content: [{ type: 'text' as const, text: 'No bricks loaded.' }] };
                }
                const lines = bricks.map((b) => {
                    const status = focusMcp.registry.getStatus(b.manifest.name);
                    const toolNames =
                        b.manifest.tools.map((t) => t.name).join(', ') || '(no tools)';
                    return `- ${b.manifest.name} [${status}]: ${toolNames}`;
                });
                return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
            }

            if (name === 'focus_load') {
                const brickName = (args as Record<string, unknown>)?.['name'];
                if (typeof brickName !== 'string' || brickName.trim() === '') {
                    return {
                        content: [
                            { type: 'text' as const, text: 'Missing or invalid brick name.' },
                        ],
                        isError: true,
                    };
                }
                if (focusMcp.registry.getBrick(brickName)) {
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: `Brick "${brickName}" is already loaded.`,
                            },
                        ],
                        isError: true,
                    };
                }
                try {
                    const brick = await loadSingleBrick(brickName, activeBricksDir);
                    focusMcp.registry.register(brick);
                    const ctx = { bus: focusMcp.bus, config: {}, logger: minimalLogger };
                    await brick.start(ctx);
                    focusMcp.registry.setStatus(brickName, 'running');
                    await server.sendToolListChanged();
                    const toolNames = brick.manifest.tools.map((t) => t.name).join(', ');
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: `Brick "${brickName}" loaded. Tools: ${toolNames}`,
                            },
                        ],
                    };
                } catch (err) {
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: `Failed to load "${brickName}": ${err instanceof Error ? err.message : String(err)}`,
                            },
                        ],
                        isError: true,
                    };
                }
            }

            if (name === 'focus_unload') {
                const brickName = (args as Record<string, unknown>)?.['name'];
                if (typeof brickName !== 'string' || brickName.trim() === '') {
                    return {
                        content: [
                            { type: 'text' as const, text: 'Missing or invalid brick name.' },
                        ],
                        isError: true,
                    };
                }
                const brick = focusMcp.registry.getBrick(brickName);
                if (!brick) {
                    return {
                        content: [
                            { type: 'text' as const, text: `Brick "${brickName}" not found.` },
                        ],
                        isError: true,
                    };
                }
                try {
                    await brick.stop();
                    focusMcp.registry.setStatus(brickName, 'stopped');
                    focusMcp.registry.unregister(brickName);
                    await server.sendToolListChanged();
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: `Brick "${brickName}" unloaded successfully.`,
                            },
                        ],
                    };
                } catch (err) {
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: `Failed to unload "${brickName}": ${err instanceof Error ? err.message : String(err)}`,
                            },
                        ],
                        isError: true,
                    };
                }
            }

            if (name === 'focus_reload') {
                const brickName = (args as Record<string, unknown>)?.['name'];
                if (typeof brickName !== 'string' || brickName.trim() === '') {
                    return {
                        content: [
                            { type: 'text' as const, text: 'Missing or invalid brick name.' },
                        ],
                        isError: true,
                    };
                }
                const existing = focusMcp.registry.getBrick(brickName);
                if (!existing) {
                    return {
                        content: [
                            { type: 'text' as const, text: `Brick "${brickName}" not found.` },
                        ],
                        isError: true,
                    };
                }
                try {
                    await existing.stop();
                    focusMcp.registry.unregister(brickName);
                    const brick = await loadSingleBrick(brickName, activeBricksDir);
                    focusMcp.registry.register(brick);
                    const ctx = { bus: focusMcp.bus, config: {}, logger: minimalLogger };
                    await brick.start(ctx);
                    focusMcp.registry.setStatus(brickName, 'running');
                    await server.sendToolListChanged();
                    const toolNames = brick.manifest.tools.map((t) => t.name).join(', ');
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: `Brick "${brickName}" reloaded. Tools: ${toolNames}`,
                            },
                        ],
                    };
                } catch (err) {
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: `Failed to reload "${brickName}": ${err instanceof Error ? err.message : String(err)}`,
                            },
                        ],
                        isError: true,
                    };
                }
            }

            if (name === 'focus_search') {
                const query = (args as Record<string, unknown>)?.['query'];
                if (typeof query !== 'string') {
                    return {
                        content: [{ type: 'text' as const, text: 'Missing or invalid query.' }],
                        isError: true,
                    };
                }
                try {
                    const io = {
                        fetch: new HttpFetchAdapter(),
                        store: new FilesystemCatalogStoreAdapter(),
                    };
                    const result = await searchCommand({ query, io });
                    const text =
                        result.errors.length > 0
                            ? `${result.output}\n\nWarnings:\n${result.errors.join('\n')}`
                            : result.output;
                    return { content: [{ type: 'text' as const, text }] };
                } catch (err) {
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: `Search failed: ${err instanceof Error ? err.message : String(err)}`,
                            },
                        ],
                        isError: true,
                    };
                }
            }

            if (name === 'focus_install') {
                const brickName = (args as Record<string, unknown>)?.['name'];
                if (typeof brickName !== 'string' || brickName.trim() === '') {
                    return {
                        content: [
                            { type: 'text' as const, text: 'Missing or invalid brick name.' },
                        ],
                        isError: true,
                    };
                }
                try {
                    const io = {
                        fetch: new HttpFetchAdapter(),
                        store: new FilesystemCatalogStoreAdapter(),
                        installer: new NpmInstallerAdapter(),
                    };
                    const result = await addCommand({ brickName, io });
                    return { content: [{ type: 'text' as const, text: result }] };
                } catch (err) {
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: `Install failed: ${err instanceof Error ? err.message : String(err)}`,
                            },
                        ],
                        isError: true,
                    };
                }
            }

            if (name === 'focus_remove') {
                const brickName = (args as Record<string, unknown>)?.['name'];
                if (typeof brickName !== 'string' || brickName.trim() === '') {
                    return {
                        content: [
                            { type: 'text' as const, text: 'Missing or invalid brick name.' },
                        ],
                        isError: true,
                    };
                }
                try {
                    const io = { installer: new NpmInstallerAdapter() };
                    const result = await removeCommand({ brickName, io });
                    return { content: [{ type: 'text' as const, text: result }] };
                } catch (err) {
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: `Remove failed: ${err instanceof Error ? err.message : String(err)}`,
                            },
                        ],
                        isError: true,
                    };
                }
            }

            if (name === 'focus_update' || name === 'focus_upgrade') {
                const rawArgs = args as Record<string, unknown> | undefined;
                const brickName =
                    typeof rawArgs?.['brick'] === 'string' ? rawArgs['brick'] : undefined;
                const all = rawArgs?.['all'] === true;
                const check = rawArgs?.['check'] === true;
                try {
                    const io = {
                        fetch: new HttpFetchAdapter(),
                        store: new FilesystemCatalogStoreAdapter(),
                        installer: new NpmInstallerAdapter(),
                    };
                    const result = await upgradeCommand({
                        ...(brickName !== undefined ? { brickName } : {}),
                        all: all || brickName === undefined,
                        check,
                        io,
                    });
                    return { content: [{ type: 'text' as const, text: result.output }] };
                } catch (err) {
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: `${name === 'focus_upgrade' ? 'Upgrade' : 'Update'} failed: ${err instanceof Error ? err.message : String(err)}`,
                            },
                        ],
                        isError: true,
                    };
                }
            }

            if (name === 'focus_catalog_add') {
                const url = (args as Record<string, unknown>)?.['url'];
                if (typeof url !== 'string' || url.trim() === '') {
                    return {
                        content: [{ type: 'text' as const, text: 'Missing or invalid URL.' }],
                        isError: true,
                    };
                }
                try {
                    const io = { store: new FilesystemCatalogStoreAdapter() };
                    // Derive a name from the URL (last path segment without extension)
                    const urlName =
                        url
                            .split('/')
                            .filter(Boolean)
                            .pop()
                            ?.replace(/\.json$/i, '') ?? url;
                    const result = await catalogCommand({
                        subcommand: 'add',
                        url,
                        name: urlName,
                        io,
                    });
                    return { content: [{ type: 'text' as const, text: result }] };
                } catch (err) {
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: `Catalog add failed: ${err instanceof Error ? err.message : String(err)}`,
                            },
                        ],
                        isError: true,
                    };
                }
            }

            if (name === 'focus_catalog_list') {
                try {
                    const io = { store: new FilesystemCatalogStoreAdapter() };
                    const result = await catalogCommand({ subcommand: 'list', io });
                    return { content: [{ type: 'text' as const, text: result }] };
                } catch (err) {
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: `Catalog list failed: ${err instanceof Error ? err.message : String(err)}`,
                            },
                        ],
                        isError: true,
                    };
                }
            }

            if (name === 'focus_catalog_remove') {
                const url = (args as Record<string, unknown>)?.['url'];
                if (typeof url !== 'string' || url.trim() === '') {
                    return {
                        content: [{ type: 'text' as const, text: 'Missing or invalid URL.' }],
                        isError: true,
                    };
                }
                try {
                    const io = { store: new FilesystemCatalogStoreAdapter() };
                    const result = await catalogCommand({ subcommand: 'remove', url, io });
                    return { content: [{ type: 'text' as const, text: result }] };
                } catch (err) {
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: `Catalog remove failed: ${err instanceof Error ? err.message : String(err)}`,
                            },
                        ],
                        isError: true,
                    };
                }
            } // end focus_catalog_remove
        } // end !isBenchMode

        // focus_config is always handled regardless of bench mode and is immune to the hidden list
        if (name === 'focus_config') {
            const rawArgs = args as Record<string, unknown> | undefined;
            const action = rawArgs?.['action'];
            const pattern =
                typeof rawArgs?.['pattern'] === 'string' ? rawArgs['pattern'] : undefined;

            if (typeof action !== 'string') {
                return {
                    content: [{ type: 'text' as const, text: 'Missing or invalid action.' }],
                    isError: true,
                };
            }

            // Actions that require a pattern
            if (action === 'hide' || action === 'show' || action === 'pin' || action === 'unpin') {
                if (typeof pattern !== 'string' || pattern.trim() === '') {
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: `Missing or invalid pattern for action "${action}".`,
                            },
                        ],
                        isError: true,
                    };
                }
            }

            // At this point, pattern is a validated string for actions that require it
            const safePattern = pattern ?? '';
            try {
                let text: string;
                if (action === 'hide') text = await configToolsHideCommand(safePattern);
                else if (action === 'show') text = await configToolsShowCommand(safePattern);
                else if (action === 'pin') text = await configToolsPinCommand(safePattern);
                else if (action === 'unpin') text = await configToolsUnpinCommand(safePattern);
                else if (action === 'list') text = await configToolsListCommand();
                else if (action === 'clear') text = await configToolsClearCommand();
                else {
                    return {
                        content: [
                            {
                                type: 'text' as const,
                                text: `Unknown action "${action}". Valid actions: hide, show, pin, unpin, list, clear.`,
                            },
                        ],
                        isError: true,
                    };
                }
                return { content: [{ type: 'text' as const, text }] };
            } catch (err) {
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: `focus_config failed: ${err instanceof Error ? err.message : String(err)}`,
                        },
                    ],
                    isError: true,
                };
            }
        } // end focus_config

        // Brick tools (existing dispatch)
        try {
            const result = await focusMcp.router.callTool(name, args ?? {});
            if (
                result &&
                typeof result === 'object' &&
                'content' in result &&
                Array.isArray(result.content)
            ) {
                return {
                    content: result.content.map(
                        (item: { type: string; text?: string; data?: unknown }) =>
                            item.type === 'text'
                                ? { type: 'text' as const, text: item.text ?? '' }
                                : { type: 'text' as const, text: JSON.stringify(item.data) },
                    ),
                };
            }
            return {
                content: [{ type: 'text' as const, text: JSON.stringify(result) }],
            };
        } catch (err) {
            return {
                content: [
                    {
                        type: 'text' as const,
                        text: err instanceof Error ? err.message : String(err),
                    },
                ],
                isError: true,
            };
        }
    });

    const cleanup = async (): Promise<void> => {
        try {
            await focusMcp.stop();
        } catch (err) {
            process.stderr.write(
                `Shutdown error: ${err instanceof Error ? err.message : String(err)}\n`,
            );
        }
        process.exit(0);
    };

    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);

    if (useHttp) {
        const httpTransport = new StreamableHTTPServerTransport({});
        await server.connect(httpTransport as unknown as Transport);

        const MAX_BODY = 1024 * 1024; // 1MB
        const httpServer = createServer(async (req, res) => {
            let body = '';
            for await (const chunk of req) {
                body += chunk;
                if (body.length > MAX_BODY) {
                    res.writeHead(413, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Payload too large' }));
                    return;
                }
            }
            let parsed: unknown;
            try {
                parsed = body.length > 0 ? JSON.parse(body) : undefined;
            } catch {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid JSON' }));
                return;
            }
            await httpTransport.handleRequest(req, res, parsed);
        });

        await new Promise<void>((resolve, reject) => {
            httpServer.listen(port, () => {
                process.stderr.write(`FocusMCP MCP server listening on http://localhost:${port}\n`);
                resolve();
            });
            httpServer.once('error', reject);
        });
    } else {
        const transport = new StdioServerTransport();
        await server.connect(transport);
        process.stderr.write('FocusMCP stdio MCP server started\n');
    }
}
