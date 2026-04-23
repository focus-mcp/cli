<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# CLAUDE.md — @focus-mcp/cli

> Auto-loaded by Claude Code (and any agents.md-compatible tool) when working in this repo.
> This file is the **source of truth for AI agent behaviour** on this project. It replaces the
> former `~/.claude/projects/**/memory/` system — do not recreate that folder.

## Projet

**FocusMCP** — orchestrateur MCP. Reduces AI-agent context from 200k to ~2k tokens by composing
**briques** (atomic MCP modules). Site [focusmcp.dev](https://focusmcp.dev).

Ce repo est **le point d'entrée primaire** : `@focus-mcp/cli`, une CLI Node publiée sur npm,
qui embarque `@focus-mcp/core` et parle **stdio MCP** (via `@modelcontextprotocol/sdk`) aux
clients AI (Claude Code, Cursor, Codex, Gemini CLI…).

## Écosystème (3 repos actifs + 1 archivé)

| Repo | Rôle |
|---|---|
| `focus-mcp/core` | Monorepo lib TS — 3 piliers (Registry/EventBus/Router) + SDK/Validator/Marketplace resolver. Importé par ce repo via `file:../core/packages/core`. |
| `focus-mcp/cli` (ici) | `@focus-mcp/cli` — stdio MCP, brick manager (`focus list/info/add/remove/...`). Publié npm. |
| `focus-mcp/marketplace` | Catalogue officiel + `bricks/*` + `modules/*` (dont `manager` = dashboard optionnel). |
| `focus-mcp/client` | **archivé** — ex desktop Tauri, gelé post-pivot CLI-first. |

## Architecture (post-pivot CLI-first, 2026-04-16)

```
AI client (Claude Code, Cursor, Codex, Gemini…)
       │ stdio (JSON-RPC MCP)
       ▼
@focus-mcp/cli (ce repo)
  ├─ @modelcontextprotocol/sdk StdioServerTransport
  ├─ @focus-mcp/core (Registry + EventBus + Router + bricks loader)
  └─ (opt-in P1) admin API HTTP côté latéral (consommé par marketplace/modules/manager)
```

**Distribution** : `npm install -g @focus-mcp/cli` ou `npx @focus-mcp/cli start`.
**Claude Code plugin** natif via `.claude-plugin/plugin.json` :

```json
{
    "mcpServers": {
        "focus": {
            "command": "npx",
            "args": ["@focus-mcp/cli", "start"]
        }
    }
}
```

## Règles non-négociables (tous repos FocusMCP)

1. **TDD strict** — tests AVANT le code (Red → Green → Refactor). Coverage ≥ **80 %** global.
2. **Périmètre strict** — pas de features ou décisions non explicitement demandées.
3. **Standards pro** — TS strict (pas de `any`), Biome, Conventional Commits, husky + lint-staged,
   semver, SPDX headers (REUSE), ADRs pour les décisions archi.
4. **Imports** : `node:` protocol systématique.
5. **Public-facing content en anglais** — règle "à partir de maintenant". Périmètre :
   `.github/`, PR/issue titles+bodies, commits, docs contributor-facing (README, AGENTS,
   CONTRIBUTING, SECURITY, CODE_OF_CONDUCT). Les docs existantes peuvent rester majoritairement
   en français jusqu'à leur prochaine réécriture substantielle. Exceptions permanentes :
   `PRD.md` et `CLAUDE.md` (ce fichier) restent en français (docs internes).
6. **Git-flow strict** — `develop` est **permanente**, jamais `--delete-branch` sur PR
   `develop→main`.
7. **npm orgs** — `focusmcp` + `focus-mcp` réservées (squatting). `@focus-mcp/cli` est LE package
   publié au MVP (primary distribution). Scope canonique : `@focus-mcp/*`.
8. **Rulesets GitHub** (identiques sur les 3 repos actifs) :
   - `main protection` cible **UNIQUEMENT `refs/heads/main`** (status checks, PR, CodeQL,
     Code Quality, linear history, pas de `required_signatures`).
   - `develop protection` cible **UNIQUEMENT `refs/heads/develop`** (deletion, non_fast_forward,
     required_linear_history, pull_request ; PAS `code_quality`).
   - NE JAMAIS mettre `develop` dans les targets de "main protection" (Code Quality ne tourne
     pas sur non-default = pending éternel).

## Dans ce repo (cli)

**Stack** : Node ≥ 22, pnpm ≥ 10, TS 5.7+ strict, ESM, Vitest, Biome 2.x, tsup, Changesets,
`@modelcontextprotocol/sdk` (stdio transport), `@focus-mcp/core` en file: dep.

**Dépendance critique** : `@focus-mcp/core` est consommé via `file:../core/packages/core`. Cela
implique :
- **Dev local** : le user doit avoir `focus-mcp/core` cloné comme repo sibling de ce repo
  (layout attendu : `../core`, avec le package à `../core/packages/core`). Indépendant de l'OS.
- **CI** : action composite `.github/actions/setup` qui clone `focus-mcp/core` comme sibling,
  le build (pnpm filter), puis install ce repo.
- **Publish npm** : `tsup --noExternal '@focus-mcp/core'` bundle le core dans le dist de la CLI,
  donc les users finaux installent uniquement `@focus-mcp/cli`.

**Commandes** :
```bash
pnpm install
pnpm test        # 142 tests, 100% coverage (center, commands/list, commands/info, commands/add, commands/remove, commands/search, commands/catalog)
pnpm typecheck
pnpm lint / lint:fix
pnpm build       # tsup → dist/bin/focus.js + dist/index.js
pnpm changeset   # avant toute PR qui change l'API publique
```

**Commandes CLI publiques** (implémentées) :
- `focus list` — liste les briques installées (lit `~/.focus/center.json` + `center.lock`)
- `focus info <name>` — détails d'une brique
- `focus start` — lance stdio MCP via `@modelcontextprotocol/sdk`
- `focus add <name>` — installe une brique depuis le catalogue (npm)
- `focus remove <name>` — désinstalle une brique
- `focus search <query>` — recherche dans le catalogue
- `focus catalog` — affiche/gère les sources de catalogue

**Adapters (couche infra)** :
- `catalog-store-adapter` — persistance locale du catalogue (lecture/écriture `~/.focus/`)
- `http-fetch-adapter` — récupération HTTP du `catalog.json` distant
- `npm-installer-adapter` — installation/désinstallation de packages npm

**Architecture marketplace flow** :
```
focus add <name>
  ├─ http-fetch-adapter → catalog.json (URL source)
  ├─ catalog-store-adapter → cache local + résolution brique
  └─ npm-installer-adapter → npm install @focus-mcp/<name>
```

## Workflow pour une feature

1. Lire PRD.md + ce fichier
2. Feature branch depuis `develop`
3. Red → Green → Refactor
4. `pnpm test:coverage && pnpm typecheck && pnpm lint`
5. `pnpm changeset` si ça change l'API publique
6. Conventional Commits
7. PR vers `develop` + résoudre threads Copilot avant merge

## Sécurité

- Aucun secret commité (gitleaks en CI)
- Le sandbox OS vient du parent process (Claude Code spawn en stdio via Seatbelt/bubblewrap)
- EventBus guards (couche 1 sécurité) intactes, fournies par `@focus-mcp/core`
- Pour run des briques non-reviewed : ajouter `isolated-vm` Phase 2 (pas au MVP)

## Documentation à lire en priorité

1. [PRD.md](./PRD.md) — vision, architecture, roadmap (français, interne)
2. [AGENTS.md](./AGENTS.md) — instructions cross-agents
3. [CONTRIBUTING.md](./CONTRIBUTING.md) — workflow
