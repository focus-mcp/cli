// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
 * Special case: `focus_filter` is always visible regardless of the hidden list,
 * so the agent can always re-show hidden tools (avoids a deadlock situation).
 *
 * When `hiddenPatterns` is null (no filter configured), no tools are hidden.
 */
export function isHiddenTool(toolName: string, hiddenPatterns: string[] | null): boolean {
    // focus_filter is immune — always visible
    if (toolName === 'focus_filter') return false;
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
        },
    });

    const useHttp = values['http'] === true;
    const port = Number(values['port']);

    if (!Number.isFinite(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid port: ${values['port']}. Must be 1-65535.`);
    }

    const focusDir = join(homedir(), '.focus');

    // ------------------------------------------------------------------
    // Resolve tool hidden-list: CLI arg takes priority over config file
    // Precedence: --hide CLI arg > ~/.focus/config.json tools.hidden > null (nothing hidden)
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

    let fileHidden: string[] | null = null;
    let filterSource = 'none';

    if (cliHidden !== null) {
        // CLI arg present — it overrides everything
        filterSource = 'CLI args';
    } else {
        // Try ~/.focus/config.json
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
                if (Array.isArray(toolsSection['hidden'])) {
                    const arr = (toolsSection['hidden'] as unknown[]).filter(
                        (s): s is string => typeof s === 'string' && s.length > 0,
                    );
                    if (arr.length > 0) {
                        fileHidden = arr;
                        filterSource = join(focusDir, 'config.json');
                    }
                }
            }
        } catch {
            // config.json absent or malformed — silently ignore
        }
    }

    const hiddenPatterns: string[] | null = cliHidden ?? fileHidden;
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

    // Log hidden-tool filter details when a filter is active
    if (hiddenPatterns !== null) {
        process.stderr.write(
            `FocusMCP tool filter:\n  source:  ${filterSource}\n  hidden:  ${hiddenPatterns.join(', ')}\n`,
        );
    }

    const metaTools = isBenchMode
        ? []
        : [
              {
                  name: 'focus_list',
                  description: 'List all loaded bricks and their tools',
                  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
              },
              {
                  name: 'focus_load',
                  description:
                      'Load (activate) an installed brick — its tools become available immediately',
                  inputSchema: {
                      type: 'object',
                      properties: { name: { type: 'string', description: 'Brick name to load' } },
                      required: ['name'],
                      additionalProperties: false,
                  },
              },
              {
                  name: 'focus_unload',
                  description:
                      'Unload (deactivate) a running brick — its tools are removed immediately',
                  inputSchema: {
                      type: 'object',
                      properties: {
                          name: { type: 'string', description: 'Brick name to unload' },
                      },
                      required: ['name'],
                      additionalProperties: false,
                  },
              },
              {
                  name: 'focus_reload',
                  description:
                      'Reload a brick — stop, reimport from disk, restart. Tools are updated immediately.',
                  inputSchema: {
                      type: 'object',
                      properties: {
                          name: { type: 'string', description: 'Brick name to reload' },
                      },
                      required: ['name'],
                      additionalProperties: false,
                  },
              },
              {
                  name: 'focus_search',
                  description: 'Search the marketplace catalog for available bricks',
                  inputSchema: {
                      type: 'object',
                      properties: { query: { type: 'string', description: 'Search query' } },
                      required: ['query'],
                      additionalProperties: false,
                  },
              },
              {
                  name: 'focus_install',
                  description: 'Install a brick from the marketplace catalog',
                  inputSchema: {
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
              },
              {
                  name: 'focus_remove',
                  description: 'Remove an installed brick',
                  inputSchema: {
                      type: 'object',
                      properties: {
                          name: { type: 'string', description: 'Brick name to remove' },
                      },
                      required: ['name'],
                      additionalProperties: false,
                  },
              },
              {
                  name: 'focus_update',
                  description: 'Update one or all installed bricks to their latest catalog version',
                  inputSchema: {
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
              },
              {
                  name: 'focus_upgrade',
                  description:
                      'Upgrade one or all installed bricks to their latest catalog version (alias for focus_update)',
                  inputSchema: {
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
              },
              {
                  name: 'focus_catalog_add',
                  description: 'Add a catalog source URL',
                  inputSchema: {
                      type: 'object',
                      properties: {
                          url: { type: 'string', description: 'Catalog source URL to add' },
                      },
                      required: ['url'],
                      additionalProperties: false,
                  },
              },
              {
                  name: 'focus_catalog_list',
                  description: 'List all configured catalog sources',
                  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
              },
              {
                  name: 'focus_catalog_remove',
                  description: 'Remove a catalog source URL',
                  inputSchema: {
                      type: 'object',
                      properties: {
                          url: { type: 'string', description: 'Catalog source URL to remove' },
                      },
                      required: ['url'],
                      additionalProperties: false,
                  },
              },
              {
                  name: 'focus_filter',
                  description:
                      'Manage the tool hidden-list. Hide or show tools by name or glob pattern. ' +
                      'Note: focus_filter itself is always visible regardless of the hidden list.',
                  inputSchema: {
                      type: 'object',
                      properties: {
                          action: {
                              type: 'string',
                              enum: ['hide', 'show', 'list', 'clear'],
                              description:
                                  'hide: add pattern to hidden list; show: remove pattern; list: show current hidden list; clear: unhide all tools',
                          },
                          pattern: {
                              type: 'string',
                              description:
                                  'Tool name or glob pattern (e.g. "sym_get" or "focus_*"). Required for hide/show.',
                          },
                      },
                      required: ['action'],
                      additionalProperties: false,
                  },
              },
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
        const filteredTools = allTools.filter((t) => !isHiddenTool(t.name, hiddenPatterns));
        // Log the count once (only when a filter is active)
        if (hiddenPatterns !== null) {
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
                        text: `Tool "${name}" is not available (hidden by tool filter). Use focus_filter to manage the hidden list.`,
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

        // focus_filter is always handled regardless of bench mode and is immune to the hidden list
        if (name === 'focus_filter') {
            const rawArgs = args as Record<string, unknown> | undefined;
            const action = rawArgs?.['action'];
            const pattern = rawArgs?.['pattern'];

            if (typeof action !== 'string') {
                return {
                    content: [{ type: 'text' as const, text: 'Missing or invalid action.' }],
                    isError: true,
                };
            }

            const configPath = join(focusDir, 'config.json');

            /** Read current config, return {} if absent/malformed */
            async function readConfig(): Promise<Record<string, unknown>> {
                try {
                    const raw = await readFile(configPath, 'utf-8');
                    const parsed = JSON.parse(raw) as unknown;
                    return typeof parsed === 'object' && parsed !== null
                        ? (parsed as Record<string, unknown>)
                        : {};
                } catch {
                    return {};
                }
            }

            async function writeConfig(config: Record<string, unknown>): Promise<void> {
                await mkdir(focusDir, { recursive: true });
                await writeFile(configPath, JSON.stringify(config, null, 4), 'utf-8');
            }

            if (action === 'list') {
                const config = await readConfig();
                const toolsSection = config['tools'];
                const hidden =
                    toolsSection !== null &&
                    typeof toolsSection === 'object' &&
                    !Array.isArray(toolsSection) &&
                    Array.isArray((toolsSection as Record<string, unknown>)['hidden'])
                        ? ((toolsSection as Record<string, unknown>)['hidden'] as string[])
                        : [];
                const text =
                    hidden.length === 0
                        ? 'No tools are hidden. All tools are visible.'
                        : `Hidden tools (${hidden.length}):\n${hidden.map((p) => `  - ${p}`).join('\n')}`;
                return { content: [{ type: 'text' as const, text }] };
            }

            if (action === 'clear') {
                const config = await readConfig();
                const toolsSection =
                    config['tools'] !== null &&
                    typeof config['tools'] === 'object' &&
                    !Array.isArray(config['tools'])
                        ? (config['tools'] as Record<string, unknown>)
                        : {};
                toolsSection['hidden'] = [];
                config['tools'] = toolsSection;
                await writeConfig(config);
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: 'Hidden list cleared. All tools are now visible. Restart focus start to apply.',
                        },
                    ],
                };
            }

            if (action === 'hide' || action === 'show') {
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
                const config = await readConfig();
                const toolsSection =
                    config['tools'] !== null &&
                    typeof config['tools'] === 'object' &&
                    !Array.isArray(config['tools'])
                        ? (config['tools'] as Record<string, unknown>)
                        : {};
                const existing = Array.isArray(toolsSection['hidden'])
                    ? (toolsSection['hidden'] as string[])
                    : [];

                let updated: string[];
                let message: string;
                if (action === 'hide') {
                    if (existing.includes(pattern)) {
                        return {
                            content: [
                                {
                                    type: 'text' as const,
                                    text: `Pattern "${pattern}" is already in the hidden list.`,
                                },
                            ],
                        };
                    }
                    updated = [...existing, pattern];
                    message = `Pattern "${pattern}" added to hidden list. Restart focus start to apply.`;
                } else {
                    updated = existing.filter((p) => p !== pattern);
                    if (updated.length === existing.length) {
                        return {
                            content: [
                                {
                                    type: 'text' as const,
                                    text: `Pattern "${pattern}" was not in the hidden list.`,
                                },
                            ],
                        };
                    }
                    message = `Pattern "${pattern}" removed from hidden list. Restart focus start to apply.`;
                }

                toolsSection['hidden'] = updated;
                config['tools'] = toolsSection;
                await writeConfig(config);
                return { content: [{ type: 'text' as const, text: message }] };
            }

            return {
                content: [
                    {
                        type: 'text' as const,
                        text: `Unknown action "${action}". Valid actions: hide, show, list, clear.`,
                    },
                ],
                isError: true,
            };
        } // end focus_filter

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
