#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 FocusMCP contributors
// SPDX-License-Identifier: MIT

/**
 * `focus` — FocusMCP CLI entry point. Dispatches subcommands.
 *
 * Writes human output to stdout and errors to stderr. `focus start` is the
 * MCP stdio transport entry and will be wired up in a follow-up PR; for now
 * it intentionally throws so the binary never pretends to serve MCP.
 *
 * Console usage is expected here (CLI surface); the Biome override in
 * `biome.json` allows `console.*` under `src/bin/` and `src/commands/`.
 */

import { parseArgs } from 'node:util';
import { infoCommand } from '../commands/info.ts';
import { listCommand } from '../commands/list.ts';
import { startCommand } from '../commands/start.ts';

const HELP = `focus — FocusMCP CLI

Usage:
  focus <command> [options]

Commands:
  list             List installed bricks (from ~/.focus/center.json)
  info <name>      Show details of a single brick
  start            Launch FocusMCP as a stdio MCP server (AI clients attach here)
  help             Print this help

Options:
  -h, --help       Print help
  -v, --version    Print the CLI version
`;

function printHelp(): void {
    process.stdout.write(`${HELP}\n`);
}

async function main(argv: string[]): Promise<number> {
    const { positionals, values } = parseArgs({
        args: argv,
        allowPositionals: true,
        strict: false,
        options: {
            help: { type: 'boolean', short: 'h' },
            version: { type: 'boolean', short: 'v' },
        },
    });

    if (values['version']) {
        process.stdout.write(
            `@focusmcp/cli ${process.env['CLI_VERSION'] ?? '0.0.0'} (core ${process.env['CORE_VERSION'] ?? '0.0.0'})\n`,
        );
        return 0;
    }

    const [command] = positionals;
    const commandIndex = argv.indexOf(command ?? '');
    const rest = commandIndex >= 0 ? argv.slice(commandIndex + 1) : [];

    if (!command || command === 'help' || values['help']) {
        printHelp();
        return command ? 0 : 1;
    }

    switch (command) {
        case 'list': {
            // TODO: read ~/.focus/center.json + center.lock, parse, then call listCommand.
            const output = listCommand({ center: { bricks: {} }, lock: {} });
            process.stdout.write(`${output}\n`);
            return 0;
        }
        case 'info': {
            const name = rest[0];
            if (!name) {
                process.stderr.write('error: `focus info <name>` requires a brick name.\n');
                return 1;
            }
            // TODO: read ~/.focus/center.json + center.lock before calling.
            const output = infoCommand({ name, center: { bricks: {} }, lock: {} });
            process.stdout.write(`${output}\n`);
            return 0;
        }
        case 'start': {
            await startCommand(rest);
            // Keep the process alive until a signal terminates it
            await new Promise<void>(() => {});
            return 0;
        }
        default: {
            process.stderr.write(`error: unknown command "${command}"\n\n`);
            printHelp();
            return 1;
        }
    }
}

main(process.argv.slice(2))
    .then((code) => {
        process.exit(code);
    })
    .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`error: ${message}\n`);
        process.exit(1);
    });
