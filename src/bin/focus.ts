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

import { rm } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { FilesystemCatalogStoreAdapter } from '../adapters/catalog-store-adapter.ts';
import { HttpFetchAdapter } from '../adapters/http-fetch-adapter.ts';
import { NpmInstallerAdapter } from '../adapters/npm-installer-adapter.ts';
import { parseCenterJson, parseCenterLock } from '../center.ts';
import { addManyCommand } from '../commands/add.ts';
import { browseCommand } from '../commands/browse.ts';
import { catalogCommand } from '../commands/catalog.ts';
import { runUpdateCheck } from '../commands/check-updates.ts';
import type { DoctorIO } from '../commands/doctor.ts';
import { doctorCommand, formatDoctorOutput } from '../commands/doctor.ts';
import { infoCommand } from '../commands/info.ts';
import { listCommand } from '../commands/list.ts';
import { reinstallCommand } from '../commands/reinstall.ts';
import { removeManyCommand } from '../commands/remove.ts';
import { searchCommand } from '../commands/search.ts';
import { startCommand } from '../commands/start.ts';
import { upgradeCommand } from '../commands/upgrade.ts';

const HELP = `focus — FocusMCP CLI

Usage:
  focus <command> [options]

Commands:
  list                         List installed bricks (from ~/.focus/center.json)
  info <name>                  Show details of a single brick
  add [-f] <name> [name2 ...]  Install one or more bricks (deps auto-installed)
                               -f / --force  re-install even if already present or corrupted
  remove <name> [...]          Uninstall one or more bricks
  reinstall <name> [...]       Force-reinstall (preserves enabled state; use after doctor)
  upgrade [name] [--all]       Re-install brick(s) at the latest catalog version
  search [query]               Search bricks in the catalog
  catalog                      Manage catalog sources (add|remove|list)
  doctor [--json] [--fix]      Audit local state and report actionable issues
                               --fix  auto-remediate corrupted installs and missing deps
  browse                       Interactive TUI to browse catalogs and bricks
  start                        Launch FocusMCP as a stdio MCP server (AI clients attach here)
  help                         Print this help

Options:
  -h, --help             Print help
  -v, --version          Print the CLI version
  --no-update-check      Skip update notifications for this invocation

Environment:
  FOCUS_NO_UPDATE_NOTIFY=1  Permanently disable update notifications
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
    const { values: addValues, positionals: addPosArgs } = parseArgs({
        args: rest,
        allowPositionals: true,
        strict: false,
        options: { force: { type: 'boolean', short: 'f' } },
    });
    const force = addValues['force'] === true;
    const brickNames = addPosArgs;

    if (brickNames.length === 0) {
        process.stderr.write(
            'error: `focus add [-f] <name> [name2 ...]` requires at least one brick name.\n',
        );
        return 1;
    }

    const installer = new NpmInstallerAdapter();
    const io = {
        fetch: new HttpFetchAdapter(),
        store: new FilesystemCatalogStoreAdapter(),
        installer,
        getBricksDir: () => installer.getBricksDir(),
        rmDir: async (path: string) => {
            await rm(path, { recursive: true, force: true });
        },
    };
    const output = await addManyCommand({ brickNames, io, force });
    process.stdout.write(`${output}\n`);
    return 0;
}

async function runRemove(rest: string[]): Promise<number> {
    if (rest.length === 0) {
        process.stderr.write(
            'error: `focus remove <name> [name2 ...]` requires at least one brick name.\n',
        );
        return 1;
    }
    const output = await removeManyCommand({
        brickNames: rest,
        io: { installer: new NpmInstallerAdapter() },
    });
    process.stdout.write(`${output}\n`);
    return 0;
}

async function runReinstall(rest: string[]): Promise<number> {
    if (rest.length === 0) {
        process.stderr.write(
            'error: `focus reinstall <name> [name2 ...]` requires at least one brick name.\n',
        );
        return 1;
    }
    const installer = new NpmInstallerAdapter();
    const io = {
        fetch: new HttpFetchAdapter(),
        store: new FilesystemCatalogStoreAdapter(),
        installer,
        getBricksDir: () => installer.getBricksDir(),
        rmDir: async (path: string) => {
            await rm(path, { recursive: true, force: true });
        },
    };
    const result = await reinstallCommand({ brickNames: rest, io });
    process.stdout.write(`${result.output}\n`);
    return result.failed.length > 0 ? 1 : 0;
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
        const { values: removeValues, positionals: removePosArgs } = parseArgs({
            args: rest.slice(1),
            allowPositionals: true,
            strict: false,
            options: { force: { type: 'boolean', short: 'f' } },
        });
        const url = removePosArgs[0];
        if (!url) {
            process.stderr.write('error: `focus catalog remove <url>` requires a URL.\n');
            return 1;
        }
        process.stdout.write(
            `${await catalogCommand({ subcommand: 'remove', url, force: removeValues['force'] === true, io: { store } })}\n`,
        );
        return 0;
    }

    // default: list
    process.stdout.write(`${await catalogCommand({ subcommand: 'list', io: { store } })}\n`);
    return 0;
}

async function runUpgrade(rest: string[]): Promise<number> {
    const { values: upgradeValues, positionals: upgradePosArgs } = parseArgs({
        args: rest,
        allowPositionals: true,
        strict: false,
        options: {
            all: { type: 'boolean' },
            check: { type: 'boolean' },
        },
    });
    const brickName = upgradePosArgs[0];
    const all = upgradeValues['all'] === true || brickName === undefined;
    const check = upgradeValues['check'] === true;

    const io = {
        fetch: new HttpFetchAdapter(),
        store: new FilesystemCatalogStoreAdapter(),
        installer: new NpmInstallerAdapter(),
    };
    const result = await upgradeCommand({
        ...(brickName !== undefined ? { brickName } : {}),
        all,
        check,
        io,
    });
    process.stdout.write(`${result.output}\n`);
    return result.failed > 0 ? 1 : 0;
}

async function runDoctor(rest: string[]): Promise<number> {
    const { values: doctorValues } = parseArgs({
        args: rest,
        allowPositionals: false,
        strict: false,
        options: {
            json: { type: 'boolean' },
            fix: { type: 'boolean' },
        },
    });
    const jsonMode = doctorValues['json'] === true;
    const fixMode = doctorValues['fix'] === true;

    const installer = new NpmInstallerAdapter();
    const bricksDir = installer.getBricksDir();
    const focusDir = installer.getFocusDir();

    const { access, readFile: fsReadFile } = await import('node:fs/promises');

    const io: DoctorIO = {
        fetch: new HttpFetchAdapter(),
        store: new FilesystemCatalogStoreAdapter(),
        installer,
        async fileExists(path: string): Promise<boolean> {
            try {
                await access(path);
                return true;
            } catch {
                return false;
            }
        },
        async readJsonFile(path: string): Promise<unknown> {
            try {
                const raw = await fsReadFile(path, 'utf-8');
                return JSON.parse(raw) as unknown;
            } catch {
                return null;
            }
        },
        getBricksDir(): string {
            return bricksDir;
        },
        getCliVersion(): string {
            return process.env['CLI_VERSION'] ?? '0.0.0';
        },
        getCoreVersion(): string {
            return process.env['CORE_VERSION'] ?? '0.0.0';
        },
        getFocusDir(): string {
            return focusDir;
        },
    };

    const result = await doctorCommand({ io, json: jsonMode, fix: fixMode });
    process.stdout.write(`${formatDoctorOutput(result, jsonMode)}\n`);

    if (fixMode && !jsonMode) {
        // Re-run doctor after fixes to show updated state
        process.stdout.write('\n--- Re-running doctor after fixes ---\n\n');
        const recheck = await doctorCommand({ io, json: false });
        process.stdout.write(`${formatDoctorOutput(recheck, false)}\n`);
        return recheck.errors > 0 ? 1 : 0;
    }

    return result.errors > 0 ? 1 : 0;
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
            'no-update-check': { type: 'boolean' },
        },
    });

    if (values['version']) {
        process.stdout.write(
            `@focus-mcp/cli ${process.env['CLI_VERSION'] ?? '0.0.0'} (core ${process.env['CORE_VERSION'] ?? '0.0.0'})\n`,
        );
        return 0;
    }

    const [command] = positionals;
    const commandIndex = argv.indexOf(command ?? '');
    const rest = commandIndex >= 0 ? argv.slice(commandIndex + 1) : [];

    // Fire-and-forget update check (non-blocking, skip for help/version/update)
    const cliVersion = process.env['CLI_VERSION'] ?? '0.0.0';
    runUpdateCheck(command !== undefined ? [command, ...rest] : [], cliVersion);

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
        case 'reinstall':
            return runReinstall(rest);
        case 'upgrade':
        case 'update':
            return runUpgrade(rest);
        case 'search':
            return runSearch(rest);
        case 'catalog':
            return runCatalog(rest);
        case 'doctor':
            return runDoctor(rest);
        case 'browse':
            await browseCommand();
            return 0;
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
