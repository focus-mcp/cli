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
import { FilesystemCatalogStoreAdapter } from '../adapters/catalog-store-adapter.ts';
import { HttpFetchAdapter } from '../adapters/http-fetch-adapter.ts';
import { NpmInstallerAdapter } from '../adapters/npm-installer-adapter.ts';
import { parseCenterJson, parseCenterLock } from '../center.ts';
import { addCommand } from '../commands/add.ts';
import { catalogCommand } from '../commands/catalog.ts';
import { infoCommand } from '../commands/info.ts';
import { listCommand } from '../commands/list.ts';
import { removeCommand } from '../commands/remove.ts';
import { searchCommand } from '../commands/search.ts';
import { startCommand } from '../commands/start.ts';

const HELP = `focus — FocusMCP CLI

Usage:
  focus <command> [options]

Commands:
  list             List installed bricks (from ~/.focus/center.json)
  info <name>      Show details of a single brick
  add <name>       Install a brick from the catalog
  remove <name>    Uninstall a brick
  search [query]   Search bricks in the catalog
  catalog          Manage catalog sources (add|remove|list)
  start            Launch FocusMCP as a stdio MCP server (AI clients attach here)
  help             Print this help

Options:
  -h, --help       Print help
  -v, --version    Print the CLI version
`;

function printHelp(): void {
    process.stdout.write(`${HELP}\n`);
}

// ---------- per-command handlers ----------

async function runList(): Promise<number> {
    const installer = new NpmInstallerAdapter();
    const rawCenter = await installer.readCenterJson();
    const rawLock = await installer.readCenterLock();
    const center = parseCenterJson(rawCenter);
    const lock = parseCenterLock(rawLock);
    process.stdout.write(`${listCommand({ center, lock })}\n`);
    return 0;
}

async function runInfo(rest: string[]): Promise<number> {
    const name = rest[0];
    if (!name) {
        process.stderr.write('error: `focus info <name>` requires a brick name.\n');
        return 1;
    }
    const installer = new NpmInstallerAdapter();
    const rawCenter = await installer.readCenterJson();
    const rawLock = await installer.readCenterLock();
    const center = parseCenterJson(rawCenter);
    const lock = parseCenterLock(rawLock);
    process.stdout.write(`${infoCommand({ name, center, lock })}\n`);
    return 0;
}

async function runAdd(rest: string[]): Promise<number> {
    const brickName = rest[0];
    if (!brickName) {
        process.stderr.write('error: `focus add <name>` requires a brick name.\n');
        return 1;
    }
    const io = {
        fetch: new HttpFetchAdapter(),
        store: new FilesystemCatalogStoreAdapter(),
        installer: new NpmInstallerAdapter(),
    };
    const output = await addCommand({ brickName, io });
    process.stdout.write(`${output}\n`);
    return 0;
}

async function runRemove(rest: string[]): Promise<number> {
    const brickName = rest[0];
    if (!brickName) {
        process.stderr.write('error: `focus remove <name>` requires a brick name.\n');
        return 1;
    }
    const output = await removeCommand({
        brickName,
        io: { installer: new NpmInstallerAdapter() },
    });
    process.stdout.write(`${output}\n`);
    return 0;
}

async function runSearch(rest: string[]): Promise<number> {
    const query = rest[0] ?? '';
    const io = { fetch: new HttpFetchAdapter(), store: new FilesystemCatalogStoreAdapter() };
    const result = await searchCommand({ query, io });
    for (const err of result.errors) {
        process.stderr.write(`warning: ${err}\n`);
    }
    process.stdout.write(`${result.output}\n`);
    return 0;
}

async function runCatalog(rest: string[]): Promise<number> {
    const store = new FilesystemCatalogStoreAdapter();
    const sub = rest[0];

    if (sub === 'add') {
        const url = rest[1];
        const name = rest[2];
        if (!url || !name) {
            process.stderr.write(
                'error: `focus catalog add <url> <name>` requires a URL and a name.\n',
            );
            return 1;
        }
        process.stdout.write(
            `${await catalogCommand({ subcommand: 'add', url, name, io: { store } })}\n`,
        );
        return 0;
    }

    if (sub === 'remove') {
        const url = rest[1];
        if (!url) {
            process.stderr.write('error: `focus catalog remove <url>` requires a URL.\n');
            return 1;
        }
        process.stdout.write(
            `${await catalogCommand({ subcommand: 'remove', url, io: { store } })}\n`,
        );
        return 0;
    }

    // default: list
    process.stdout.write(`${await catalogCommand({ subcommand: 'list', io: { store } })}\n`);
    return 0;
}

// ---------- main ----------

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
        case 'list':
            return runList();
        case 'info':
            return runInfo(rest);
        case 'add':
            return runAdd(rest);
        case 'remove':
            return runRemove(rest);
        case 'search':
            return runSearch(rest);
        case 'catalog':
            return runCatalog(rest);
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
