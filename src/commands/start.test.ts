// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockStop = vi.fn().mockResolvedValue(undefined);
const mockStart = vi.fn().mockResolvedValue(undefined);
const mockListTools = vi.fn().mockReturnValue([]);
const mockCallTool = vi.fn().mockResolvedValue({ content: [] });

vi.mock('@focusmcp/core', () => ({
    createFocusMcp: () => ({
        start: mockStart,
        stop: mockStop,
        router: { listTools: mockListTools, callTool: mockCallTool },
        registry: {},
        bus: {},
    }),
}));

const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockSetRequestHandler = vi.fn();

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
    StreamableHTTPServerTransport: vi.fn().mockImplementation(() => ({
        handleRequest: vi.fn(),
    })),
}));

vi.mock('@modelcontextprotocol/sdk/shared/transport.js', () => ({}));

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
    ListToolsRequestSchema: 'ListToolsRequestSchema',
    CallToolRequestSchema: 'CallToolRequestSchema',
}));

describe('startCommand', () => {
    beforeEach(() => {
        vi.spyOn(process, 'once').mockReturnValue(process);
        vi.spyOn(process.stderr, 'write').mockReturnValue(true);
        mockStart.mockClear();
        mockConnect.mockClear();
        mockSetRequestHandler.mockClear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('starts FocusMcp, connects transport and registers MCP handlers', async () => {
        const { startCommand } = await import('./start.ts');
        await expect(startCommand([])).resolves.toBeUndefined();

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
    });
});
