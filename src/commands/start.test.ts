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
    mockStreamableTransportCtor,
    mockListen,
    mockOnce,
    mockHttpServer,
    mockCreateServer,
    lastTransportInstance,
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
    return {
        mockStop: vi.fn().mockResolvedValue(undefined),
        mockStart: vi.fn().mockResolvedValue(undefined),
        mockListTools: vi.fn().mockReturnValue([]),
        mockCallTool: vi.fn().mockResolvedValue({ content: [] }),
        mockConnect: vi.fn().mockResolvedValue(undefined),
        mockSetRequestHandler: vi.fn(),
        mockStreamableTransportCtor,
        mockListen,
        mockOnce,
        mockHttpServer,
        mockCreateServer,
        lastTransportInstance,
    };
});

vi.mock('@focusmcp/core', () => ({
    createFocusMcp: () => ({
        start: mockStart,
        stop: mockStop,
        router: { listTools: mockListTools, callTool: mockCallTool },
        registry: {},
        bus: {},
    }),
}));

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
    Server: class MockServer {
        connect = mockConnect;
        setRequestHandler = mockSetRequestHandler;
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
    });

    afterEach(() => {
        vi.restoreAllMocks();
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

    it('ListTools handler returns mapped tools from router', async () => {
        mockListTools.mockReturnValue([
            {
                name: 'focus_list',
                description: 'Lists bricks',
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

        expect(result).toEqual({
            tools: [
                {
                    name: 'focus_list',
                    description: 'Lists bricks',
                    inputSchema: { type: 'object', properties: {} },
                },
            ],
        });

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

        const result = await handler({ params: { name: 'focus_list', arguments: { foo: 'bar' } } });

        expect(mockCallTool).toHaveBeenCalledWith('focus_list', { foo: 'bar' });
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
});
