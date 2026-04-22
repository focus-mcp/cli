// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { Brick } from '@focusmcp/core';
import { createFocusMcp, loadBricks } from '@focusmcp/core';
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

export async function startCommand(argv: string[] = []): Promise<void> {
    const { values } = parseArgs({
        args: argv,
        allowPositionals: false,
        strict: false,
        options: {
            http: { type: 'boolean', default: false },
            port: { type: 'string', default: '3000' },
        },
    });

    const useHttp = values['http'] === true;
    const port = Number(values['port']);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid port: ${values['port']}. Must be 1-65535.`);
    }

    const focusDir = join(homedir(), '.focus');
    let bricks: Brick[] = [];
    const activeBricksDir = process.env['FOCUSMCP_BRICKS_DIR'] ?? join(focusDir, 'bricks');

    try {
        const raw = await readFile(join(focusDir, 'center.json'), 'utf-8');
        const centerJson = parseCenterJson(JSON.parse(raw));

        const source = new FilesystemBrickSource({ centerJson, bricksDir: activeBricksDir });
        const result = await loadBricks({ source });

        bricks = [...result.bricks];

        for (const failure of result.failures) {
            process.stderr.write(
                `⚠ Failed to load brick "${failure.name}": ${failure.error.message}\n`,
            );
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
        { name: '@focusmcp/cli', version: '0.0.0' },
        { capabilities: { tools: {} } },
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
            ...focusMcp.router.listTools().map((t) => ({
                name: t.name,
                description: t.description,
                inputSchema: t.inputSchema,
            })),
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
                    properties: { name: { type: 'string', description: 'Brick name to unload' } },
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
                    properties: { name: { type: 'string', description: 'Brick name to reload' } },
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
                        version: { type: 'string', description: 'Version to install (optional)' },
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
                    properties: { name: { type: 'string', description: 'Brick name to remove' } },
                    required: ['name'],
                    additionalProperties: false,
                },
            },
            {
                name: 'focus_update',
                description: 'Update an installed brick to the latest version',
                inputSchema: {
                    type: 'object',
                    properties: {
                        name: {
                            type: 'string',
                            description: 'Brick name to update (optional, updates all if omitted)',
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
        ],
    }));

    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: internal tool dispatch with multiple branches
    server.setRequestHandler(CallToolRequestSchema, async (req) => {
        const { name, arguments: args } = req.params;

        // Internal tools — handled before dispatching to brick router
        if (name === 'focus_list') {
            const bricks = focusMcp.registry.getBricks();
            if (bricks.length === 0) {
                return { content: [{ type: 'text' as const, text: 'No bricks loaded.' }] };
            }
            const lines = bricks.map((b) => {
                const status = focusMcp.registry.getStatus(b.manifest.name);
                const toolNames = b.manifest.tools.map((t) => t.name).join(', ') || '(no tools)';
                return `- ${b.manifest.name} [${status}]: ${toolNames}`;
            });
            return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
        }

        if (name === 'focus_load') {
            const brickName = (args as Record<string, unknown>)?.['name'];
            if (typeof brickName !== 'string' || brickName.trim() === '') {
                return {
                    content: [{ type: 'text' as const, text: 'Missing or invalid brick name.' }],
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
                    content: [{ type: 'text' as const, text: 'Missing or invalid brick name.' }],
                    isError: true,
                };
            }
            const brick = focusMcp.registry.getBrick(brickName);
            if (!brick) {
                return {
                    content: [{ type: 'text' as const, text: `Brick "${brickName}" not found.` }],
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
                    content: [{ type: 'text' as const, text: 'Missing or invalid brick name.' }],
                    isError: true,
                };
            }
            const existing = focusMcp.registry.getBrick(brickName);
            if (!existing) {
                return {
                    content: [{ type: 'text' as const, text: `Brick "${brickName}" not found.` }],
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
                    content: [{ type: 'text' as const, text: 'Missing or invalid brick name.' }],
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
                    content: [{ type: 'text' as const, text: 'Missing or invalid brick name.' }],
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

        if (name === 'focus_update') {
            return {
                content: [{ type: 'text' as const, text: 'focus_update: not yet implemented' }],
            };
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
        }

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
