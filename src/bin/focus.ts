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
import { cliUpdater } from '../commands/cli-updater.ts';
import {
    configToolsClearCommand,
    configToolsHideCommand,
    configToolsListCommand,
    configToolsPinCommand,
    configToolsShowCommand,
    configToolsUnpinCommand,
} from '../commands/config.ts';
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
  update / upgrade             Self-update the CLI to the latest version
                               --all  also update all installed bricks
  list                         List installed bricks (from ~/.focus/center.json)
  info <name>                  Show details of a single brick
  add [-f] <name> [name2 ...]  Install one or more bricks (deps auto-installed)
  remove <name> [...]          Uninstall one or more bricks
  reinstall <name> [...]       Force-reinstall (preserves enabled state; use after doctor)
  search [query]               Search bricks in the catalog
  catalog [list|add|remove]    Manage catalog sources (subcommand or catalog: namespace below)
    catalog:list               List catalog sources
    catalog:add <url> <name>   Add a catalog source
    catalog:remove <url>       Remove a catalog source
  doctor [--json] [--fix]      Audit local state and report actionable issues
                               --fix  auto-remediate corrupted installs and missing deps
  browse                       Interactive TUI to browse catalogs and bricks
  start [options]              Launch FocusMCP as a stdio MCP server (AI clients attach here)
                               --hide=<patterns>    comma-separated patterns to hide (e.g. "sym_get,focus_*")
                               --pin=<patterns>     comma-separated patterns to mark as alwaysLoad

  Bricks namespace (bricks:):
    bricks:install <name>      Install a brick (alias: add)
    bricks:remove <name>       Remove a brick (alias: remove)
    bricks:list                List installed bricks (alias: list)
    bricks:search [query]      Search bricks (alias: search)
    bricks:update [name] [--all] [--check]  Update one or all installed bricks
    bricks:load <name>         Load a brick at runtime
    bricks:unload <name>       Unload a brick at runtime

  Tool visibility (tools: namespace):
    tools:hide <pattern>       Hide a tool or glob (alias: filter hide)
    tools:show <pattern>       Unhide a tool or glob (alias: filter show)
    tools:pin <pattern>        Mark as alwaysLoad (_meta.anthropic/alwaysLoad: true)
    tools:unpin <pattern>      Remove from alwaysLoad list
    tools:list                 Show hidden + alwaysLoad lists (alias: filter list)
    tools:clear                Reset both lists (alias: filter clear)
    Legacy aliases: filter hide|show|list|clear  (permanent, no deprecation)

  help                         Print this help

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

/**
 * `focus update` / `focus upgrade` — self-update the CLI (2.0.0 new semantics).
 *
 * Without args → print the command to run for self-update.
 * With `--all`  → also update all installed bricks (run bricks:update --all after CLI).
 * With a brick name → ERROR with guidance to use `bricks:update <name>` instead.
 */
async function runSelfUpdate(rest: string[]): Promise<number> {
    const { values: updateValues, positionals: updatePosArgs } = parseArgs({
        args: rest,
        allowPositionals: true,
        strict: false,
        options: {
            all: { type: 'boolean' },
        },
    });

    // Guard: brick name argument is no longer supported here
    const brickArg = updatePosArgs[0];
    if (brickArg !== undefined) {
        process.stderr.write(
            `error: \`focus update <brick>\` is no longer supported.\n` +
                `Use \`focus bricks:update ${brickArg}\` to update a specific brick.\n`,
        );
        return 1;
    }

    const includeAll = updateValues['all'] === true;

    // Compute self-update info (pure — no I/O)
    const updateInfo = cliUpdater({ includeBricks: includeAll });

    if (updateInfo.manager === 'unknown') {
        process.stdout.write(
            `To update @focus-mcp/cli, run:\n  npm install -g @focus-mcp/cli@latest\n\n` +
                `(Could not detect your package manager. Run the command above or use your package manager's global install.)\n`,
        );
    } else {
        process.stdout.write(`To update @focus-mcp/cli, run:\n  ${updateInfo.command}\n`);
    }

    if (includeAll) {
        process.stdout.write(`\nAlso updating all installed bricks…\n`);
        const exitCode = await runBricksUpdate([]);
        return exitCode;
    }

    return 0;
}

/**
 * `focus bricks:update [name] [--all] [--check]` — update one or all installed bricks.
 * This is the former behavior of `focus update/upgrade`.
 */
async function runBricksUpdate(rest: string[]): Promise<number> {
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

/**
 * `focus bricks:load <name>` — dynamically load a brick at runtime via MCP.
 *
 * Note: this CLI stub only shows guidance. Actual load/unload at runtime
 * must go through the MCP tool `focus_bricks_load` (the running server).
 */
async function runBricksLoad(rest: string[]): Promise<number> {
    const name = rest[0];
    if (!name) {
        process.stderr.write(
            'error: `focus bricks:load <name>` requires a brick name.\n' +
                'Tip: to load a brick in a running MCP session, use the MCP tool `focus_bricks_load`.\n',
        );
        return 1;
    }
    process.stdout.write(
        `To load brick "${name}" in a running MCP session, call the MCP tool:\n` +
            `  focus_bricks_load({ name: "${name}" })\n\n` +
            `Or restart \`focus start\` after installing the brick.\n`,
    );
    return 0;
}

/**
 * `focus bricks:unload <name>` — dynamically unload a brick at runtime via MCP.
 */
async function runBricksUnload(rest: string[]): Promise<number> {
    const name = rest[0];
    if (!name) {
        process.stderr.write(
            'error: `focus bricks:unload <name>` requires a brick name.\n' +
                'Tip: to unload a brick in a running MCP session, use the MCP tool `focus_bricks_unload`.\n',
        );
        return 1;
    }
    process.stdout.write(
        `To unload brick "${name}" in a running MCP session, call the MCP tool:\n` +
            `  focus_bricks_unload({ name: "${name}" })\n\n` +
            `Or restart \`focus start\` without the brick enabled.\n`,
    );
    return 0;
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

/**
 * `runTools` — shared handler for `focus tools:<action>` (Symfony canonical)
 * and `focus filter <action>` (legacy alias, permanent).
 *
 * `rest` is [action, pattern?].
 */
async function runTools(rest: string[]): Promise<number> {
    const action = rest[0];
    const pattern = rest[1];

    if (action === 'hide') {
        if (!pattern) {
            process.stderr.write('error: `focus tools:hide <pattern>` requires a pattern.\n');
            return 1;
        }
        process.stdout.write(`${await configToolsHideCommand(pattern)}\n`);
        return 0;
    }

    if (action === 'show') {
        if (!pattern) {
            process.stderr.write('error: `focus tools:show <pattern>` requires a pattern.\n');
            return 1;
        }
        process.stdout.write(`${await configToolsShowCommand(pattern)}\n`);
        return 0;
    }

    if (action === 'pin') {
        if (!pattern) {
            process.stderr.write('error: `focus tools:pin <pattern>` requires a pattern.\n');
            return 1;
        }
        process.stdout.write(`${await configToolsPinCommand(pattern)}\n`);
        return 0;
    }

    if (action === 'unpin') {
        if (!pattern) {
            process.stderr.write('error: `focus tools:unpin <pattern>` requires a pattern.\n');
            return 1;
        }
        process.stdout.write(`${await configToolsUnpinCommand(pattern)}\n`);
        return 0;
    }

    if (action === 'list' || action === undefined) {
        process.stdout.write(`${await configToolsListCommand()}\n`);
        return 0;
    }

    if (action === 'clear') {
        process.stdout.write(`${await configToolsClearCommand()}\n`);
        return 0;
    }

    process.stderr.write(
        `error: unknown tools action "${action}". Use: hide, show, pin, unpin, list, clear\n`,
    );
    return 1;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: multi-branch CLI dispatch for config tools subcommands
async function runConfig(rest: string[]): Promise<number> {
    // Expect: ["tools", <action>, <pattern?>]
    if (rest[0] !== 'tools') {
        process.stderr.write(
            `error: unknown config subcommand "${rest[0] ?? ''}". Use: focus config tools <action>\n`,
        );
        return 1;
    }

    const action = rest[1];
    const pattern = rest[2];

    if (action === 'hide') {
        if (!pattern) {
            process.stderr.write(
                'error: `focus config tools hide <pattern>` requires a pattern.\n',
            );
            return 1;
        }
        process.stdout.write(`${await configToolsHideCommand(pattern)}\n`);
        return 0;
    }

    if (action === 'show') {
        if (!pattern) {
            process.stderr.write(
                'error: `focus config tools show <pattern>` requires a pattern.\n',
            );
            return 1;
        }
        process.stdout.write(`${await configToolsShowCommand(pattern)}\n`);
        return 0;
    }

    if (action === 'pin') {
        if (!pattern) {
            process.stderr.write('error: `focus config tools pin <pattern>` requires a pattern.\n');
            return 1;
        }
        process.stdout.write(`${await configToolsPinCommand(pattern)}\n`);
        return 0;
    }

    if (action === 'unpin') {
        if (!pattern) {
            process.stderr.write(
                'error: `focus config tools unpin <pattern>` requires a pattern.\n',
            );
            return 1;
        }
        process.stdout.write(`${await configToolsUnpinCommand(pattern)}\n`);
        return 0;
    }

    if (action === 'list' || action === undefined) {
        process.stdout.write(`${await configToolsListCommand()}\n`);
        return 0;
    }

    if (action === 'clear') {
        process.stdout.write(`${await configToolsClearCommand()}\n`);
        return 0;
    }

    process.stderr.write(
        `error: unknown action "${action}". Use: hide, show, pin, unpin, list, clear\n`,
    );
    return 1;
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
            `@focus-mcp/cli ${process.env['CLI_VERSION'] ?? '0.0.0'} (core ${process.env['CORE_VERSION'] ?? '0.0.0'})\n`,
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
        case 'reinstall':
            return runReinstall(rest);
        // update / upgrade now self-update the CLI (breaking change in 2.0.0)
        case 'upgrade':
        case 'update':
            return runSelfUpdate(rest);
        case 'search':
            return runSearch(rest);
        case 'catalog':
            return runCatalog(rest);
        // catalog: namespace — Symfony-style aliases (permanent)
        case 'catalog:list':
            return runCatalog(['list', ...rest]);
        case 'catalog:add':
            return runCatalog(['add', ...rest]);
        case 'catalog:remove':
            return runCatalog(['remove', ...rest]);
        case 'doctor':
            return runDoctor(rest);
        case 'config':
            return runConfig(rest);
        // bricks: namespace — manage bricks (canonical in 2.0.0)
        case 'bricks:install':
            return runAdd(rest);
        case 'bricks:remove':
            return runRemove(rest);
        case 'bricks:list':
            return runList();
        case 'bricks:search':
            return runSearch(rest);
        case 'bricks:update':
            return runBricksUpdate(rest);
        case 'bricks:load':
            return runBricksLoad(rest);
        case 'bricks:unload':
            return runBricksUnload(rest);
        // tools: namespace — canonical Symfony-style commands
        case 'tools:hide':
            return runTools(['hide', ...rest]);
        case 'tools:show':
            return runTools(['show', ...rest]);
        case 'tools:pin':
            return runTools(['pin', ...rest]);
        case 'tools:unpin':
            return runTools(['unpin', ...rest]);
        case 'tools:list':
            return runTools(['list', ...rest]);
        case 'tools:clear':
            return runTools(['clear', ...rest]);
        // filter <action> [pattern] — legacy alias for tools: (permanent, no deprecation)
        case 'filter':
            return runTools(rest);
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
