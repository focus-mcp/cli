// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from 'vitest';

vi.mock('ink', () => ({
    render: vi.fn().mockReturnValue({ waitUntilExit: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock('react', () => ({
    default: { createElement: vi.fn().mockReturnValue(null) },
    createElement: vi.fn().mockReturnValue(null),
}));

vi.mock('../tui/App.tsx', () => ({
    App: vi.fn(),
}));

describe('browseCommand', () => {
    it('calls render and awaits exit', async () => {
        const { render } = await import('ink');
        const { browseCommand } = await import('./browse.ts');
        await browseCommand();
        expect(render).toHaveBeenCalledOnce();
    });
});
