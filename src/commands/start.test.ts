// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Use vi.hoisted so variables are available inside vi.mock factories (ESM hoisting)
const {
    mockStop,
    mockStart,
    mockListTools,
    mockCallTool,
    mockConnect,
    mockSetRequestHandler,
    mockSendToolListChanged,
    mockStreamableTransportCtor,
    mockListen,
    mockOnce,
    mockHttpServer,
    mockCreateServer,
    lastTransportInstance,
    mockLoadBricks,
    mockReadFile,
    mockGetBricks,
    mockGetStatus,
    mockGetBrick,
    mockSetStatus,
    mockUnregister,
    mockRegister,
} = vi.hoisted(() => {
    const mockListen = vi.fn();
    const mockOnce = vi.fn();
    const mockHttpServer = { listen: mockListen, once: mockOnce };
    const mockCreateServer = vi.fn().mockReturnValue(mockHttpServer);
    // Mutable container to capture the last created StreamableHTTPServerTransport instance
    const lastTransportInstance: { current: { handleRequest: ReturnType<typeof vi.fn> } | null } = {
        current: null,
    };
    // The constructor mock — exposed so we can restore mockImplementation after vi.restoreAllMocks()
    const mockStreamableTransportCtor = vi.fn();
    const mockLoadBricks = vi.fn().mockResolvedValue({ bricks: [], failures: [] });
    const mockReadFile = vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    return {
        mockStop: vi.fn().mockResolvedValue(undefined),
        mockStart: vi.fn().mockResolvedValue(undefined),
        mockListTools: vi.fn().mockReturnValue([]),
        mockCallTool: vi.fn().mockResolvedValue({ content: [] }),
        mockConnect: vi.fn().mockResolvedValue(undefined),
        mockSetRequestHandler: vi.fn(),
        mockSendToolListChanged: vi.fn().mockResolvedValue(undefined),
        mockStreamableTransportCtor,
        mockListen,
        mockOnce,
        mockHttpServer,
        mockCreateServer,
        lastTransportInstance,
        mockLoadBricks,
        mockReadFile,
        mockGetBricks: vi.fn().mockReturnValue([]),
        mockGetStatus: vi.fn().mockReturnValue('running'),
        mockGetBrick: vi.fn().mockReturnValue(undefined),
        mockSetStatus: vi.fn(),
        mockUnregister: vi.fn(),
        mockRegister: vi.fn(),
    };
});

vi.mock('@focusmcp/core', () => ({
    createFocusMcp: () => ({
        start: mockStart,
        stop: mockStop,
        router: { listTools: mockListTools, callTool: mockCallTool },
        registry: {
            getBricks: mockGetBricks,
            getStatus: mockGetStatus,
            getBrick: mockGetBrick,
            setStatus: mockSetStatus,
            unregister: mockUnregister,
            register: mockRegister,
        },
        bus: {},
    }),
    loadBricks: mockLoadBricks,
}));

vi.mock('node:fs/promises', () => ({
    readFile: mockReadFile,
}));

vi.mock('node:os', () => ({
    homedir: () => '/home/testuser',
}));

vi.mock('../source/filesystem-source.ts', () => ({
    FilesystemBrickSource: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
    Server: class MockServer {
        connect = mockConnect;
        setRequestHandler = mockSetRequestHandler;
        sendToolListChanged = mockSendToolListChanged;
    },
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
    StdioServerTransport: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
    StreamableHTTPServerTransport: mockStreamableTransportCtor,
}));

vi.mock('@modelcontextprotocol/sdk/shared/transport.js', () => ({}));

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
    ListToolsRequestSchema: 'ListToolsRequestSchema',
    CallToolRequestSchema: 'CallToolRequestSchema',
}));

vi.mock('node:http', () => ({
    createServer: mockCreateServer,
}));

/** Re-apply the StreamableHTTPServerTransport mock implementation (lost after vi.restoreAllMocks) */
function setupStreamableTransportMock(): void {
    mockStreamableTransportCtor.mockImplementation(() => {
        const instance = { handleRequest: vi.fn().mockResolvedValue(undefined) };
        lastTransportInstance.current = instance;
        return instance;
    });
}

describe('startCommand', () => {
    beforeEach(() => {
        vi.spyOn(process, 'once').mockReturnValue(process);
        vi.spyOn(process.stderr, 'write').mockReturnValue(true);
        mockStart.mockClear();
        mockStop.mockClear();
        mockConnect.mockClear();
        mockSetRequestHandler.mockClear();
        mockCallTool.mockReset();
        mockCallTool.mockResolvedValue({ content: [] });
        mockListTools.mockClear();
        lastTransportInstance.current = null;
        mockListen.mockReset();
        mockOnce.mockReset();
        mockCreateServer.mockReset();
        mockCreateServer.mockReturnValue(mockHttpServer);
        // Re-apply implementation in case vi.restoreAllMocks() cleared it
        setupStreamableTransportMock();
        mockReadFile.mockReset();
        mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        mockLoadBricks.mockReset();
        mockLoadBricks.mockResolvedValue({ bricks: [], failures: [] });
        mockGetBricks.mockReset();
        mockGetBricks.mockReturnValue([]);
        mockGetStatus.mockReset();
        mockGetStatus.mockReturnValue('running');
        mockGetBrick.mockReset();
        mockGetBrick.mockReturnValue(undefined);
        mockSetStatus.mockReset();
        mockUnregister.mockReset();
        mockRegister.mockReset();
        mockSendToolListChanged.mockReset();
        mockSendToolListChanged.mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
        mockLoadBricks.mockResolvedValue({ bricks: [], failures: [] });
    });

    it('starts FocusMcp, connects transport and registers MCP handlers', async () => {
        const { startCommand } = await import('./start.ts');
        // startCommand in stdio mode blocks forever — run without await
        const promise = startCommand([]);
        await new Promise((r) => setTimeout(r, 10));

        expect(mockStart).toHaveBeenCalledOnce();
        expect(mockConnect).toHaveBeenCalledOnce();
        expect(mockSetRequestHandler).toHaveBeenCalledWith(
            'ListToolsRequestSchema',
            expect.any(Function),
        );
        expect(mockSetRequestHandler).toHaveBeenCalledWith(
            'CallToolRequestSchema',
            expect.any(Function),
        );

        // The promise never resolves (infinite await), which is expected behaviour
        void promise;
    });

    it('registers SIGINT and SIGTERM handlers', async () => {
        const { startCommand } = await import('./start.ts');
        // stdio mode blocks forever — run without await
        const promise = startCommand([]);
        await new Promise((r) => setTimeout(r, 10));

        expect(process.once).toHaveBeenCalledWith('SIGINT', expect.any(Function));
        expect(process.once).toHaveBeenCalledWith('SIGTERM', expect.any(Function));

        void promise;
    });

    it('cleanup handler calls focusMcp.stop() and process.exit(0) on signal', async () => {
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
        // Capture handlers registered via process.once
        const registeredHandlers: Array<[string, () => Promise<void>]> = [];
        // @ts-expect-error — mock overload for process.once signal handlers
        vi.spyOn(process, 'once').mockImplementation((event: string, handler: unknown) => {
            registeredHandlers.push([event, handler as () => Promise<void>]);
            return process;
        });

        const { startCommand } = await import('./start.ts');
        // stdio mode blocks forever — run without await
        const promise = startCommand([]);
        await new Promise((r) => setTimeout(r, 10));

        const sigintEntry = registeredHandlers.find(([ev]) => ev === 'SIGINT');
        if (!sigintEntry) throw new Error('SIGINT handler not registered');
        const cleanup = sigintEntry[1];

        await cleanup();

        expect(mockStop).toHaveBeenCalledOnce();
        expect(exitSpy).toHaveBeenCalledWith(0);

        void promise;
    });

    it('cleanup handler logs error to stderr when focusMcp.stop() throws', async () => {
        const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
        mockStop.mockRejectedValue(new Error('stop failed'));

        const registeredHandlers: Array<[string, () => Promise<void>]> = [];
        // @ts-expect-error — mock overload for process.once signal handlers
        vi.spyOn(process, 'once').mockImplementation((event: string, handler: unknown) => {
            registeredHandlers.push([event, handler as () => Promise<void>]);
            return process;
        });

        const { startCommand } = await import('./start.ts');
        const promise = startCommand([]);
        await new Promise((r) => setTimeout(r, 10));

        const sigintEntry = registeredHandlers.find(([ev]) => ev === 'SIGINT');
        if (!sigintEntry) throw new Error('SIGINT handler not registered');
        const cleanup = sigintEntry[1];

        await cleanup();

        expect(process.stderr.write).toHaveBeenCalledWith(
            expect.stringContaining('Shutdown error: stop failed'),
        );
        expect(exitSpy).toHaveBeenCalledWith(0);

        void promise;
    });

    it('ListTools handler returns mapped tools from router', async () => {
        mockListTools.mockReturnValue([
            {
                name: 'echo_say',
                description: 'Says something',
                inputSchema: { type: 'object', properties: {} },
            },
        ]);

        const { startCommand } = await import('./start.ts');
        // stdio mode blocks forever — run without await
        const promise = startCommand([]);
        await new Promise((r) => setTimeout(r, 10));

        // Find the ListTools handler (first setRequestHandler call)
        const listToolsCall = mockSetRequestHandler.mock.calls.find(
            (call) => call[0] === 'ListToolsRequestSchema',
        );
        if (!listToolsCall) throw new Error('ListTools handler not registered');

        const handler = listToolsCall[1] as () => Promise<{ tools: unknown[] }>;
        const result = await handler();

        // Should include the brick tool + 4 internal tools
        expect(result.tools).toEqual(
            expect.arrayContaining([
                {
                    name: 'echo_say',
                    description: 'Says something',
                    inputSchema: { type: 'object', properties: {} },
                },
                expect.objectContaining({ name: 'focus_list' }),
                expect.objectContaining({ name: 'focus_load' }),
                expect.objectContaining({ name: 'focus_unload' }),
                expect.objectContaining({ name: 'focus_reload' }),
            ]),
        );
        expect((result.tools as unknown[]).length).toBe(5);

        void promise;
    });

    it('CallTool handler dispatches to router.callTool and formats text content', async () => {
        mockCallTool.mockResolvedValue({
            content: [{ type: 'text', text: 'hello' }],
        });

        const { startCommand } = await import('./start.ts');
        // stdio mode blocks forever — run without await
        const promise = startCommand([]);
        await new Promise((r) => setTimeout(r, 10));

        const callToolCall = mockSetRequestHandler.mock.calls.find(
            (call) => call[0] === 'CallToolRequestSchema',
        );
        if (!callToolCall) throw new Error('CallTool handler not registered');

        const handler = callToolCall[1] as (req: {
            params: { name: string; arguments?: Record<string, unknown> };
        }) => Promise<{ content: unknown[] }>;

        const result = await handler({ params: { name: 'echo_say', arguments: { foo: 'bar' } } });

        expect(mockCallTool).toHaveBeenCalledWith('echo_say', { foo: 'bar' });
        expect(result).toEqual({
            content: [{ type: 'text', text: 'hello' }],
        });

        void promise;
    });

    it('CallTool handler formats non-text content as JSON', async () => {
        mockCallTool.mockResolvedValue({
            content: [{ type: 'json', data: { key: 'value' } }],
        });

        const { startCommand } = await import('./start.ts');
        // stdio mode blocks forever — run without await
        const promise = startCommand([]);
        await new Promise((r) => setTimeout(r, 10));

        const callToolCall = mockSetRequestHandler.mock.calls.find(
            (call) => call[0] === 'CallToolRequestSchema',
        );
        if (!callToolCall) throw new Error('CallTool handler not registered');
        const handler = callToolCall[1] as (req: {
            params: { name: string; arguments?: Record<string, unknown> };
        }) => Promise<{ content: unknown[] }>;

        const result = await handler({ params: { name: 'some_tool', arguments: {} } });

        expect(result).toEqual({
            content: [{ type: 'text', text: JSON.stringify({ key: 'value' }) }],
        });

        void promise;
    });

    it('CallTool handler returns isError: true when callTool throws an Error', async () => {
        mockCallTool.mockRejectedValue(new Error('tool failed'));

        const { startCommand } = await import('./start.ts');
        // stdio mode blocks forever — run without await
        const promise = startCommand([]);
        await new Promise((r) => setTimeout(r, 10));

        const callToolCall = mockSetRequestHandler.mock.calls.find(
            (call) => call[0] === 'CallToolRequestSchema',
        );
        if (!callToolCall) throw new Error('CallTool handler not registered');
        const handler = callToolCall[1] as (req: {
            params: { name: string; arguments?: Record<string, unknown> };
        }) => Promise<{ content: unknown[]; isError?: boolean }>;

        const result = await handler({ params: { name: 'bad_tool', arguments: {} } });

        expect(result).toEqual({
            content: [{ type: 'text', text: 'tool failed' }],
            isError: true,
        });

        void promise;
    });

    it('CallTool handler returns isError: true when callTool throws a non-Error', async () => {
        mockCallTool.mockRejectedValue('string error');

        const { startCommand } = await import('./start.ts');
        // stdio mode blocks forever — run without await
        const promise = startCommand([]);
        await new Promise((r) => setTimeout(r, 10));

        const callToolCall = mockSetRequestHandler.mock.calls.find(
            (call) => call[0] === 'CallToolRequestSchema',
        );
        if (!callToolCall) throw new Error('CallTool handler not registered');
        const handler = callToolCall[1] as (req: {
            params: { name: string; arguments?: Record<string, unknown> };
        }) => Promise<{ content: unknown[]; isError?: boolean }>;

        const result = await handler({ params: { name: 'bad_tool', arguments: {} } });

        expect(result).toEqual({
            content: [{ type: 'text', text: 'string error' }],
            isError: true,
        });

        void promise;
    });

    it('uses HTTP transport and creates HTTP server when --http flag is passed', async () => {
        // Simulate server.listen calling the callback (resolves the Promise)
        mockListen.mockImplementation((_port: number, cb: () => void) => {
            cb();
        });
        // httpServer.once('error', reject) — just store it, never call reject
        mockOnce.mockImplementation(() => {});

        const { startCommand } = await import('./start.ts');

        // startCommand will hang at `await new Promise<void>(() => {})` — run without await
        const promise = startCommand(['--http', '--port', '4000']);

        // Let microtasks settle so the async code inside startCommand runs
        await new Promise((r) => setTimeout(r, 10));

        expect(mockCreateServer).toHaveBeenCalledOnce();
        expect(mockListen).toHaveBeenCalledWith(4000, expect.any(Function));
        expect(process.stderr.write).toHaveBeenCalledWith(
            'FocusMCP MCP server listening on http://localhost:4000\n',
        );

        // The promise never resolves (infinite await), which is expected behaviour
        void promise;
    });

    it('HTTP server handler reads body chunks and calls httpTransport.handleRequest', async () => {
        mockListen.mockImplementation((_port: number, cb: () => void) => {
            cb();
        });
        mockOnce.mockImplementation(() => {});

        const { startCommand } = await import('./start.ts');
        startCommand(['--http', '--port', '4000']);
        await new Promise((r) => setTimeout(r, 10));

        // Retrieve the request handler passed to createServer
        const call = mockCreateServer.mock.calls[0];
        if (!call) throw new Error('createServer not called');
        const requestHandler = call[0] as (
            req: AsyncIterable<string>,
            res: unknown,
        ) => Promise<void>;

        // Retrieve the transport instance captured during startCommand execution
        const transport = lastTransportInstance.current;
        expect(transport).not.toBeNull();

        // Build a fake req that yields a JSON body
        const body = JSON.stringify({ jsonrpc: '2.0', method: 'ping' });
        async function* fakeReq(): AsyncGenerator<string> {
            yield body;
        }
        const fakeRes = {};

        await requestHandler(fakeReq() as unknown as AsyncIterable<string>, fakeRes);

        if (!transport) throw new Error('transport not captured');
        expect(transport.handleRequest).toHaveBeenCalledWith(
            expect.anything(),
            fakeRes,
            JSON.parse(body),
        );
    });

    it('HTTP server handler handles empty body and calls httpTransport.handleRequest with undefined', async () => {
        mockListen.mockImplementation((_port: number, cb: () => void) => {
            cb();
        });
        mockOnce.mockImplementation(() => {});

        const { startCommand } = await import('./start.ts');
        startCommand(['--http', '--port', '4000']);
        await new Promise((r) => setTimeout(r, 10));

        const call2 = mockCreateServer.mock.calls[0];
        if (!call2) throw new Error('createServer not called');
        const requestHandler = call2[0] as (
            req: AsyncIterable<string>,
            res: unknown,
        ) => Promise<void>;

        const transport = lastTransportInstance.current;
        expect(transport).not.toBeNull();

        async function* emptyReq(): AsyncGenerator<string> {}
        const fakeRes = {};

        await requestHandler(emptyReq() as unknown as AsyncIterable<string>, fakeRes);

        if (!transport) throw new Error('transport not captured');
        expect(transport.handleRequest).toHaveBeenCalledWith(expect.anything(), fakeRes, undefined);
    });

    it('HTTP server handler returns 400 when body is invalid JSON', async () => {
        mockListen.mockImplementation((_port: number, cb: () => void) => {
            cb();
        });
        mockOnce.mockImplementation(() => {});

        const { startCommand } = await import('./start.ts');
        startCommand(['--http', '--port', '4000']);
        await new Promise((r) => setTimeout(r, 10));

        const call = mockCreateServer.mock.calls[0];
        if (!call) throw new Error('createServer not called');
        const requestHandler = call[0] as (
            req: AsyncIterable<string>,
            res: {
                writeHead: ReturnType<typeof vi.fn>;
                end: ReturnType<typeof vi.fn>;
            },
        ) => Promise<void>;

        async function* invalidJsonReq(): AsyncGenerator<string> {
            yield 'not valid json {{{';
        }
        const fakeRes = {
            writeHead: vi.fn(),
            end: vi.fn(),
        };

        await requestHandler(invalidJsonReq() as unknown as AsyncIterable<string>, fakeRes);

        expect(fakeRes.writeHead).toHaveBeenCalledWith(400, { 'Content-Type': 'application/json' });
        expect(fakeRes.end).toHaveBeenCalledWith(JSON.stringify({ error: 'Invalid JSON' }));
    });

    it('HTTP server handler returns 413 when body exceeds 1MB', async () => {
        mockListen.mockImplementation((_port: number, cb: () => void) => {
            cb();
        });
        mockOnce.mockImplementation(() => {});

        const { startCommand } = await import('./start.ts');
        startCommand(['--http', '--port', '4000']);
        await new Promise((r) => setTimeout(r, 10));

        const call = mockCreateServer.mock.calls[0];
        if (!call) throw new Error('createServer not called');
        const requestHandler = call[0] as (
            req: AsyncIterable<string>,
            res: {
                writeHead: ReturnType<typeof vi.fn>;
                end: ReturnType<typeof vi.fn>;
            },
        ) => Promise<void>;

        // Generate a body larger than 1MB
        const largeChunk = 'x'.repeat(1024 * 1024 + 1);
        async function* largeReq(): AsyncGenerator<string> {
            yield largeChunk;
        }
        const fakeRes = {
            writeHead: vi.fn(),
            end: vi.fn(),
        };

        await requestHandler(largeReq() as unknown as AsyncIterable<string>, fakeRes);

        expect(fakeRes.writeHead).toHaveBeenCalledWith(413, { 'Content-Type': 'application/json' });
        expect(fakeRes.end).toHaveBeenCalledWith(JSON.stringify({ error: 'Payload too large' }));
    });

    it('logs stdio server started message in stdio mode', async () => {
        const { startCommand } = await import('./start.ts');
        const promise = startCommand([]);
        await new Promise((r) => setTimeout(r, 10));

        expect(process.stderr.write).toHaveBeenCalledWith('FocusMCP stdio MCP server started\n');

        void promise;
    });

    it('loadSingleBrick throws when loadBricks returns a failure', async () => {
        mockGetBrick.mockReturnValue(undefined);
        mockLoadBricks.mockResolvedValue({
            bricks: [],
            failures: [{ name: 'my-brick', error: new Error('no brick loaded') }],
        });

        const { startCommand } = await import('./start.ts');
        const promise = startCommand([]);
        await new Promise((r) => setTimeout(r, 10));

        const callToolCall = mockSetRequestHandler.mock.calls.find(
            (call) => call[0] === 'CallToolRequestSchema',
        );
        if (!callToolCall) throw new Error('CallTool handler not registered');
        const handler = callToolCall[1] as (req: {
            params: { name: string; arguments?: Record<string, unknown> };
        }) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

        const result = await handler({
            params: { name: 'focus_load', arguments: { name: 'my-brick' } },
        });

        expect(result.isError).toBe(true);
        expect(result.content[0]?.text).toContain('no brick loaded');

        void promise;
    });

    it('loadSingleBrick throws when loadBricks returns 0 bricks and no failures', async () => {
        mockGetBrick.mockReturnValue(undefined);
        mockLoadBricks.mockResolvedValue({ bricks: [], failures: [] });

        const { startCommand } = await import('./start.ts');
        const promise = startCommand([]);
        await new Promise((r) => setTimeout(r, 10));

        const callToolCall = mockSetRequestHandler.mock.calls.find(
            (call) => call[0] === 'CallToolRequestSchema',
        );
        if (!callToolCall) throw new Error('CallTool handler not registered');
        const handler = callToolCall[1] as (req: {
            params: { name: string; arguments?: Record<string, unknown> };
        }) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

        const result = await handler({
            params: { name: 'focus_load', arguments: { name: 'ghost-brick' } },
        });

        expect(result.isError).toBe(true);
        expect(result.content[0]?.text).toContain('Failed to load');

        void promise;
    });

    it('logs "starting with 0 bricks" when center.json does not exist', async () => {
        mockReadFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

        const { startCommand } = await import('./start.ts');
        const promise = startCommand([]);
        await new Promise((r) => setTimeout(r, 10));

        expect(process.stderr.write).toHaveBeenCalledWith(
            'No center.json found — starting with 0 bricks\n',
        );

        void promise;
    });

    it('logs "Failed to load bricks" when center.json read fails with non-ENOENT error (lines 87-90)', async () => {
        const permError = Object.assign(new Error('Permission denied'), { code: 'EACCES' });
        mockReadFile.mockRejectedValue(permError);

        const { startCommand } = await import('./start.ts');
        const promise = startCommand([]);
        await new Promise((r) => setTimeout(r, 10));

        expect(process.stderr.write).toHaveBeenCalledWith(
            'Failed to load bricks: Permission denied\n',
        );

        void promise;
    });

    it('throws when --port value is out of range (lines 58-59)', async () => {
        const { startCommand } = await import('./start.ts');

        await expect(startCommand(['--http', '--port', '99999'])).rejects.toThrow(/invalid port/i);
    });

    it('loads bricks from center.json and passes them to createFocusMcp', async () => {
        const fakeBrick = { manifest: { name: 'test-brick' }, start: vi.fn(), stop: vi.fn() };
        mockLoadBricks.mockResolvedValue({ bricks: [fakeBrick], failures: [] });

        const centerJson = JSON.stringify({
            bricks: {
                'catalog/test-brick': { version: '^1.0.0', enabled: true },
            },
        });
        mockReadFile.mockResolvedValue(centerJson);

        const { startCommand } = await import('./start.ts');
        const promise = startCommand([]);
        await new Promise((r) => setTimeout(r, 10));

        expect(mockLoadBricks).toHaveBeenCalledOnce();
        expect(process.stderr.write).toHaveBeenCalledWith('Loaded 1 brick(s)\n');

        void promise;
    });

    it('logs brick load failures without stopping', async () => {
        const fakeBrick = { manifest: { name: 'ok-brick' }, start: vi.fn(), stop: vi.fn() };
        const failure = { name: 'catalog/bad-brick', error: new Error('load error') };
        mockLoadBricks.mockResolvedValue({ bricks: [fakeBrick], failures: [failure] });

        const centerJson = JSON.stringify({
            bricks: {
                'catalog/ok-brick': { version: '^1.0.0', enabled: true },
                'catalog/bad-brick': { version: '^1.0.0', enabled: true },
            },
        });
        mockReadFile.mockResolvedValue(centerJson);

        const { startCommand } = await import('./start.ts');
        const promise = startCommand([]);
        await new Promise((r) => setTimeout(r, 10));

        expect(process.stderr.write).toHaveBeenCalledWith(
            '⚠ Failed to load brick "catalog/bad-brick": load error\n',
        );
        expect(process.stderr.write).toHaveBeenCalledWith('Loaded 1 brick(s)\n');

        void promise;
    });

    it('uses FOCUSMCP_BRICKS_DIR env var when set', async () => {
        const { FilesystemBrickSource } = await import('../source/filesystem-source.ts');
        const originalEnv = process.env['FOCUSMCP_BRICKS_DIR'];

        process.env['FOCUSMCP_BRICKS_DIR'] = '/custom/bricks/dir';

        const centerJson = JSON.stringify({ bricks: {} });
        mockReadFile.mockResolvedValue(centerJson);

        const { startCommand } = await import('./start.ts');
        const promise = startCommand([]);
        await new Promise((r) => setTimeout(r, 10));

        expect(FilesystemBrickSource).toHaveBeenCalledWith(
            expect.objectContaining({ bricksDir: '/custom/bricks/dir' }),
        );

        if (originalEnv === undefined) {
            delete process.env['FOCUSMCP_BRICKS_DIR'];
        } else {
            process.env['FOCUSMCP_BRICKS_DIR'] = originalEnv;
        }

        void promise;
    });

    describe('internal tools', () => {
        it('focus_list returns "No bricks loaded." when registry is empty', async () => {
            mockGetBricks.mockReturnValue([]);

            const { startCommand } = await import('./start.ts');
            const promise = startCommand([]);
            await new Promise((r) => setTimeout(r, 10));

            const callToolCall = mockSetRequestHandler.mock.calls.find(
                (call) => call[0] === 'CallToolRequestSchema',
            );
            if (!callToolCall) throw new Error('CallTool handler not registered');
            const handler = callToolCall[1] as (req: {
                params: { name: string; arguments?: Record<string, unknown> };
            }) => Promise<{ content: unknown[] }>;

            const result = await handler({ params: { name: 'focus_list', arguments: {} } });

            expect(result).toEqual({
                content: [{ type: 'text', text: 'No bricks loaded.' }],
            });
            expect(mockCallTool).not.toHaveBeenCalled();

            void promise;
        });

        it('focus_list returns brick names, statuses and tools when bricks are loaded', async () => {
            mockGetBricks.mockReturnValue([
                {
                    manifest: {
                        name: 'echo',
                        tools: [{ name: 'echo_say', description: 'Say something' }],
                    },
                    start: vi.fn(),
                    stop: vi.fn(),
                },
            ]);
            mockGetStatus.mockReturnValue('running');

            const { startCommand } = await import('./start.ts');
            const promise = startCommand([]);
            await new Promise((r) => setTimeout(r, 10));

            const callToolCall = mockSetRequestHandler.mock.calls.find(
                (call) => call[0] === 'CallToolRequestSchema',
            );
            if (!callToolCall) throw new Error('CallTool handler not registered');
            const handler = callToolCall[1] as (req: {
                params: { name: string; arguments?: Record<string, unknown> };
            }) => Promise<{ content: Array<{ type: string; text: string }> }>;

            const result = await handler({ params: { name: 'focus_list', arguments: {} } });

            expect(result.content[0]?.type).toBe('text');
            expect(result.content[0]?.text).toContain('echo');
            expect(result.content[0]?.text).toContain('running');
            expect(result.content[0]?.text).toContain('echo_say');
            expect(mockCallTool).not.toHaveBeenCalled();

            void promise;
        });

        it('focus_load returns error when brick name is missing', async () => {
            const { startCommand } = await import('./start.ts');
            const promise = startCommand([]);
            await new Promise((r) => setTimeout(r, 10));

            const callToolCall = mockSetRequestHandler.mock.calls.find(
                (call) => call[0] === 'CallToolRequestSchema',
            );
            if (!callToolCall) throw new Error('CallTool handler not registered');
            const handler = callToolCall[1] as (req: {
                params: { name: string; arguments?: Record<string, unknown> };
            }) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

            const result = await handler({ params: { name: 'focus_load', arguments: {} } });

            expect(result.isError).toBe(true);
            expect(result.content[0]?.text).toContain('Missing or invalid brick name');
            expect(mockCallTool).not.toHaveBeenCalled();

            void promise;
        });

        it('focus_load returns error when brick is already loaded', async () => {
            const fakeBrick = {
                manifest: { name: 'echo', tools: [{ name: 'echo_say' }] },
                start: vi.fn().mockResolvedValue(undefined),
                stop: vi.fn().mockResolvedValue(undefined),
            };
            mockGetBrick.mockReturnValue(fakeBrick);

            const { startCommand } = await import('./start.ts');
            const promise = startCommand([]);
            await new Promise((r) => setTimeout(r, 10));

            const callToolCall = mockSetRequestHandler.mock.calls.find(
                (call) => call[0] === 'CallToolRequestSchema',
            );
            if (!callToolCall) throw new Error('CallTool handler not registered');
            const handler = callToolCall[1] as (req: {
                params: { name: string; arguments?: Record<string, unknown> };
            }) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

            const result = await handler({
                params: { name: 'focus_load', arguments: { name: 'echo' } },
            });

            expect(result.isError).toBe(true);
            expect(result.content[0]?.text).toContain('already loaded');
            expect(mockCallTool).not.toHaveBeenCalled();

            void promise;
        });

        it('focus_load loads a brick, registers, starts it and sends notification', async () => {
            const fakeBrick = {
                manifest: { name: 'echo', tools: [{ name: 'echo_say' }] },
                start: vi.fn().mockResolvedValue(undefined),
                stop: vi.fn().mockResolvedValue(undefined),
            };
            mockGetBrick.mockReturnValue(undefined);
            mockLoadBricks.mockResolvedValue({ bricks: [fakeBrick], failures: [] });

            const { startCommand } = await import('./start.ts');
            const promise = startCommand([]);
            await new Promise((r) => setTimeout(r, 10));

            const callToolCall = mockSetRequestHandler.mock.calls.find(
                (call) => call[0] === 'CallToolRequestSchema',
            );
            if (!callToolCall) throw new Error('CallTool handler not registered');
            const handler = callToolCall[1] as (req: {
                params: { name: string; arguments?: Record<string, unknown> };
            }) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

            const result = await handler({
                params: { name: 'focus_load', arguments: { name: 'echo' } },
            });

            expect(result.isError).toBeUndefined();
            expect(mockRegister).toHaveBeenCalledWith(fakeBrick);
            expect(fakeBrick.start).toHaveBeenCalledOnce();
            expect(mockSetStatus).toHaveBeenCalledWith('echo', 'running');
            expect(mockSendToolListChanged).toHaveBeenCalledOnce();
            expect(result.content[0]?.text).toContain('echo');
            expect(result.content[0]?.text).toContain('echo_say');
            expect(mockCallTool).not.toHaveBeenCalled();

            void promise;
        });

        it('focus_load returns error when loadSingleBrick fails', async () => {
            mockGetBrick.mockReturnValue(undefined);
            mockLoadBricks.mockResolvedValue({
                bricks: [],
                failures: [{ name: 'echo', error: new Error('disk error') }],
            });

            const { startCommand } = await import('./start.ts');
            const promise = startCommand([]);
            await new Promise((r) => setTimeout(r, 10));

            const callToolCall = mockSetRequestHandler.mock.calls.find(
                (call) => call[0] === 'CallToolRequestSchema',
            );
            if (!callToolCall) throw new Error('CallTool handler not registered');
            const handler = callToolCall[1] as (req: {
                params: { name: string; arguments?: Record<string, unknown> };
            }) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

            const result = await handler({
                params: { name: 'focus_load', arguments: { name: 'echo' } },
            });

            expect(result.isError).toBe(true);
            expect(result.content[0]?.text).toContain('Failed to load');
            expect(result.content[0]?.text).toContain('disk error');

            void promise;
        });

        it('focus_unload returns error when brick not found', async () => {
            mockGetBrick.mockReturnValue(undefined);

            const { startCommand } = await import('./start.ts');
            const promise = startCommand([]);
            await new Promise((r) => setTimeout(r, 10));

            const callToolCall = mockSetRequestHandler.mock.calls.find(
                (call) => call[0] === 'CallToolRequestSchema',
            );
            if (!callToolCall) throw new Error('CallTool handler not registered');
            const handler = callToolCall[1] as (req: {
                params: { name: string; arguments?: Record<string, unknown> };
            }) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

            const result = await handler({
                params: { name: 'focus_unload', arguments: { name: 'unknown-brick' } },
            });

            expect(result.isError).toBe(true);
            expect(result.content[0]?.text).toContain('not found');
            expect(mockCallTool).not.toHaveBeenCalled();

            void promise;
        });

        it('focus_unload stops and unregisters the brick when found', async () => {
            const mockBrickStop = vi.fn().mockResolvedValue(undefined);
            const fakeBrick = {
                manifest: { name: 'echo', tools: [] },
                start: vi.fn(),
                stop: mockBrickStop,
            };
            mockGetBrick.mockReturnValue(fakeBrick);

            const { startCommand } = await import('./start.ts');
            const promise = startCommand([]);
            await new Promise((r) => setTimeout(r, 10));

            const callToolCall = mockSetRequestHandler.mock.calls.find(
                (call) => call[0] === 'CallToolRequestSchema',
            );
            if (!callToolCall) throw new Error('CallTool handler not registered');
            const handler = callToolCall[1] as (req: {
                params: { name: string; arguments?: Record<string, unknown> };
            }) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

            const result = await handler({
                params: { name: 'focus_unload', arguments: { name: 'echo' } },
            });

            expect(result.isError).toBeUndefined();
            expect(mockBrickStop).toHaveBeenCalledOnce();
            expect(mockSetStatus).toHaveBeenCalledWith('echo', 'stopped');
            expect(mockUnregister).toHaveBeenCalledWith('echo');
            expect(mockSendToolListChanged).toHaveBeenCalledOnce();
            expect(result.content[0]?.text).toContain('unloaded successfully');
            expect(mockCallTool).not.toHaveBeenCalled();

            void promise;
        });

        it('focus_unload returns isError when brick name is missing', async () => {
            const { startCommand } = await import('./start.ts');
            const promise = startCommand([]);
            await new Promise((r) => setTimeout(r, 10));

            const callToolCall = mockSetRequestHandler.mock.calls.find(
                (call) => call[0] === 'CallToolRequestSchema',
            );
            if (!callToolCall) throw new Error('CallTool handler not registered');
            const handler = callToolCall[1] as (req: {
                params: { name: string; arguments?: Record<string, unknown> };
            }) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

            const result = await handler({ params: { name: 'focus_unload', arguments: {} } });

            expect(result.isError).toBe(true);
            expect(result.content[0]?.text).toContain('Missing or invalid brick name');

            void promise;
        });

        it('focus_unload returns isError when brick.stop() throws (lines 244-253)', async () => {
            const mockBrickStopFail = vi.fn().mockRejectedValue(new Error('stop error'));
            const existingBrick = {
                manifest: { name: 'echo', tools: [] },
                start: vi.fn().mockResolvedValue(undefined),
                stop: mockBrickStopFail,
            };
            mockGetBrick.mockReturnValue(existingBrick);

            const { startCommand } = await import('./start.ts');
            const promise = startCommand([]);
            await new Promise((r) => setTimeout(r, 10));

            const callToolCall = mockSetRequestHandler.mock.calls.find(
                (call) => call[0] === 'CallToolRequestSchema',
            );
            if (!callToolCall) throw new Error('CallTool handler not registered');
            const handler = callToolCall[1] as (req: {
                params: { name: string; arguments?: Record<string, unknown> };
            }) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

            const result = await handler({
                params: { name: 'focus_unload', arguments: { name: 'echo' } },
            });

            expect(result.isError).toBe(true);
            expect(result.content[0]?.text).toContain('Failed to unload');
            expect(result.content[0]?.text).toContain('stop error');

            void promise;
        });

        it('focus_reload returns error when brick name is missing', async () => {
            const { startCommand } = await import('./start.ts');
            const promise = startCommand([]);
            await new Promise((r) => setTimeout(r, 10));

            const callToolCall = mockSetRequestHandler.mock.calls.find(
                (call) => call[0] === 'CallToolRequestSchema',
            );
            if (!callToolCall) throw new Error('CallTool handler not registered');
            const handler = callToolCall[1] as (req: {
                params: { name: string; arguments?: Record<string, unknown> };
            }) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

            const result = await handler({ params: { name: 'focus_reload', arguments: {} } });

            expect(result.isError).toBe(true);
            expect(result.content[0]?.text).toContain('Missing or invalid brick name');

            void promise;
        });

        it('focus_reload returns error when brick is not found', async () => {
            mockGetBrick.mockReturnValue(undefined);

            const { startCommand } = await import('./start.ts');
            const promise = startCommand([]);
            await new Promise((r) => setTimeout(r, 10));

            const callToolCall = mockSetRequestHandler.mock.calls.find(
                (call) => call[0] === 'CallToolRequestSchema',
            );
            if (!callToolCall) throw new Error('CallTool handler not registered');
            const handler = callToolCall[1] as (req: {
                params: { name: string; arguments?: Record<string, unknown> };
            }) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

            const result = await handler({
                params: { name: 'focus_reload', arguments: { name: 'unknown-brick' } },
            });

            expect(result.isError).toBe(true);
            expect(result.content[0]?.text).toContain('not found');
            expect(mockCallTool).not.toHaveBeenCalled();

            void promise;
        });

        it('focus_reload stops, reimports, restarts and sends notification', async () => {
            const mockBrickStop = vi.fn().mockResolvedValue(undefined);
            const existingBrick = {
                manifest: { name: 'echo', tools: [{ name: 'echo_say' }] },
                start: vi.fn().mockResolvedValue(undefined),
                stop: mockBrickStop,
            };
            const newBrick = {
                manifest: { name: 'echo', tools: [{ name: 'echo_say' }, { name: 'echo_shout' }] },
                start: vi.fn().mockResolvedValue(undefined),
                stop: vi.fn().mockResolvedValue(undefined),
            };
            mockGetBrick.mockReturnValue(existingBrick);
            mockLoadBricks.mockResolvedValue({ bricks: [newBrick], failures: [] });

            const { startCommand } = await import('./start.ts');
            const promise = startCommand([]);
            await new Promise((r) => setTimeout(r, 10));

            const callToolCall = mockSetRequestHandler.mock.calls.find(
                (call) => call[0] === 'CallToolRequestSchema',
            );
            if (!callToolCall) throw new Error('CallTool handler not registered');
            const handler = callToolCall[1] as (req: {
                params: { name: string; arguments?: Record<string, unknown> };
            }) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

            const result = await handler({
                params: { name: 'focus_reload', arguments: { name: 'echo' } },
            });

            expect(result.isError).toBeUndefined();
            expect(mockBrickStop).toHaveBeenCalledOnce();
            expect(mockUnregister).toHaveBeenCalledWith('echo');
            expect(mockRegister).toHaveBeenCalledWith(newBrick);
            expect(newBrick.start).toHaveBeenCalledOnce();
            expect(mockSetStatus).toHaveBeenCalledWith('echo', 'running');
            expect(mockSendToolListChanged).toHaveBeenCalledOnce();
            expect(result.content[0]?.text).toContain('reloaded');
            expect(result.content[0]?.text).toContain('echo_say');
            expect(mockCallTool).not.toHaveBeenCalled();

            void promise;
        });

        it('focus_reload returns isError when reload throws (lines 289-299)', async () => {
            const existingBrick = {
                manifest: { name: 'echo', tools: [] },
                start: vi.fn().mockRejectedValue(new Error('brick start failed')),
                stop: vi.fn().mockResolvedValue(undefined),
            };
            mockGetBrick.mockReturnValue(existingBrick);
            // loadSingleBrick returns a brick whose start() throws
            const failingBrick = {
                manifest: { name: 'echo', tools: [] },
                start: vi.fn().mockRejectedValue(new Error('brick start failed')),
                stop: vi.fn().mockResolvedValue(undefined),
            };
            mockLoadBricks.mockResolvedValue({ bricks: [failingBrick], failures: [] });

            const { startCommand } = await import('./start.ts');
            const promise = startCommand([]);
            await new Promise((r) => setTimeout(r, 10));

            const callToolCall = mockSetRequestHandler.mock.calls.find(
                (call) => call[0] === 'CallToolRequestSchema',
            );
            if (!callToolCall) throw new Error('CallTool handler not registered');
            const handler = callToolCall[1] as (req: {
                params: { name: string; arguments?: Record<string, unknown> };
            }) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

            const result = await handler({
                params: { name: 'focus_reload', arguments: { name: 'echo' } },
            });

            expect(result.isError).toBe(true);
            expect(result.content[0]?.text).toContain('Failed to reload');
            expect(result.content[0]?.text).toContain('brick start failed');

            void promise;
        });

        it('CallTool handler returns JSON-stringified result when callTool returns non-content value (lines 320-322)', async () => {
            mockCallTool.mockResolvedValue('plain string result');

            const { startCommand } = await import('./start.ts');
            const promise = startCommand([]);
            await new Promise((r) => setTimeout(r, 10));

            const callToolCall = mockSetRequestHandler.mock.calls.find(
                (call) => call[0] === 'CallToolRequestSchema',
            );
            if (!callToolCall) throw new Error('CallTool handler not registered');
            const handler = callToolCall[1] as (req: {
                params: { name: string; arguments?: Record<string, unknown> };
            }) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

            const result = await handler({ params: { name: 'some_tool', arguments: {} } });

            expect(result.content[0]?.type).toBe('text');
            expect(result.content[0]?.text).toBe(JSON.stringify('plain string result'));

            void promise;
        });
    });
});
