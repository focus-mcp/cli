<!--
SPDX-FileCopyrightText: 2026 FocusMCP contributors
SPDX-License-Identifier: MIT
-->

# FocusMCP CLI — Product Requirements Document

> Périmètre : le **CLI officiel `@focusmcp/cli`** (repo `cli/`).
> Pour la lib `@focusmcp/core` : voir [`core/PRD.md`](../core/PRD.md). Pour le catalogue : voir [`marketplace/PRD.md`](../marketplace/PRD.md). Le client Tauri (repo `client/`) est **gelé** — pas de UI bundlée au MVP.

## Vision (rappel)

**FocusMCP** — Focaliser les agents AI sur l'essentiel.

Le CLI est **le point d'entrée principal** de FocusMCP. Pivot CLI-first : tout client AI qui parle MCP (Claude Code, Cursor, Continue, etc.) consomme FocusMCP via ce CLI, spawné en sous-processus et piloté en stdio. **Comme `node` pour JavaScript, comme `docker` pour les conteneurs.**

> **Single binary, stdio-first.** Le CLI fait une seule chose correctement : exposer les briques activées via MCP sur stdin/stdout.

---

## Rôle du CLI dans l'écosystème

Le repo `cli/` contient :

1. **Le binaire `focus`** — publié sous `@focusmcp/cli` sur npm, consommé via `npx` ou `npm install -g`.
2. **Le transport stdio MCP** — `focus start` démarre un `StdioServerTransport` du SDK officiel MCP, routé vers le `createFocusMcp()` de `@focusmcp/core`.
3. **Le brick manager local** — `focus list`, `focus info`, `focus add`, `focus remove`, `focus update` opèrent sur `~/.focus/center.json` + `~/.focus/center.lock`.
4. **Le client marketplace** — résolution des briques depuis le catalogue officiel (et les catalogues tiers en P2).

Le CLI **embarque `@focusmcp/core`**, il n'y a **pas** d'HTTP par défaut, et **pas** de UI bundlée (un `cli-manager` séparé existera en Phase 2 pour administrer le CLI à distance).

---

## Architecture

```
AI client (Claude Code, Cursor, etc.)
       │ stdio (JSON-RPC)
       ▼
@focusmcp/cli
  ├─ @modelcontextprotocol/sdk StdioServerTransport
  ├─ @focusmcp/core (createFocusMcp)
  │    Registry + EventBus + Router + bricks
  └─ center.json + center.lock (~/.focus/)
```

- **stdin/stdout** sont réservés au transport MCP (JSON-RPC framed).
- **stderr** reçoit les logs humains.
- Un signal `SIGINT`/`SIGTERM` flush les subscribers EventBus avant exit.

### Format des fichiers d'état

- `~/.focus/center.json` — déclaration utilisateur :

  ```json
  {
    "bricks": {
      "official/echo": { "version": "^1.0.0", "enabled": true },
      "official/indexer": { "version": "^0.2.0", "enabled": true, "config": { "root": "/src" } }
    }
  }
  ```

- `~/.focus/center.lock` — résolution machine :

  ```json
  {
    "official/echo": {
      "version": "1.0.0",
      "catalog_url": "https://marketplace.focusmcp.dev/catalog.json",
      "catalog_id": "official",
      "integrity": "sha256-abc",
      "tarballUrl": "https://example.com/echo-1.0.0.tgz"
    }
  }
  ```

Les deux fichiers sont parsés par `src/center.ts` — validation structurelle uniquement ; la sémantique (semver, catalog URL, signature) est gérée par `@focusmcp/core`.

---

## Commandes

| Groupe | Commande | Rôle | Statut |
|---|---|---|---|
| **Inspection** | `focus list` | Liste les briques déclarées | **P0** |
| | `focus info <name>` | Détails d'une brique | **P0** |
| | `focus status` | État du runtime (briques actives, erreurs) | P1 |
| | `focus logs [brick]` | Flux logs EventBus | P1 |
| **Transport** | `focus start` | Démarre MCP stdio | **P0** |
| | `focus start --http <port>` | Admin API HTTP pour `cli-manager` | P2 |
| **Gestion briques** | `focus add <name>[@range]` | Ajoute + résout + écrit lock | P1 |
| | `focus remove <name>` | Retire + réécrit lock | P1 |
| | `focus update [name]` | Bump versions (tout ou une) | P1 |
| | `focus search <query>` | Recherche dans le catalogue | P1 |
| | `focus enable <name>` | `enabled: true` | P1 |
| | `focus disable <name>` | `enabled: false` | P1 |
| **Catalogues** | `focus catalog list` | Liste les catalogues configurés | P2 |
| | `focus catalog add <url>` | Ajoute un catalogue tiers | P2 |
| | `focus catalog remove <id>` | Retire un catalogue tiers | P2 |
| **Config** | `focus config set <key> <val>` | Modifie `center.json` | P1 |
| | `focus config get <key>` | Lit `center.json` | P1 |

Toutes les sous-commandes métier sont des **fonctions pures** (input structuré → string de sortie, ou throw). Seul `src/bin/focus.ts` touche `process.*`, stdin/stdout et le système de fichiers.

---

## Distribution

- **Package npm** : `@focusmcp/cli` sous le scope `@focusmcp` (org npm réservée).
- **Installation** :
  - `npx @focusmcp/cli start` — one-shot, idéal pour Claude Code.
  - `npm install -g @focusmcp/cli` — installation globale, `focus` dans le `$PATH`.
- **Publish** : via Changesets (single package mode) + `release.yml` sur push `main`. Secret `NPM_TOKEN` requis.
- **Provenance npm** activée (`publishConfig.provenance: true`) pour signer les tarballs via Sigstore.

---

## Sécurité

Trois couches de défense, empilées :

1. **EventBus guards** (hérités de `@focusmcp/core`) — une brique ne peut émettre ni consommer que des événements déclarés dans son manifeste. Mismatch → fail fast au boot.
2. **Permissions utilisateur via `center.json`** — une brique désactivée (`enabled: false`) ne boote pas. `config` par brique est validé contre le manifeste avant forwarding.
3. **Sandbox du process parent** — Claude Code et Cursor sandboxent déjà les serveurs MCP stdio (FS restreint, réseau filtré). Le CLI **ne cherche pas** à s'en échapper.

Parsers `center.json` / `center.lock` : validation structurelle stricte, rejet fail-fast de tout input malformé.

---

## Roadmap

### P0 — MVP (ce sprint)

- [x] Scaffolding repo (structure, CI, REUSE, biome, changesets)
- [x] `focus list` + `focus info` + parsers `center.*`
- [ ] `focus start` — transport stdio MCP fonctionnel (raccorde `createFocusMcp` + `StdioServerTransport`)
- [ ] Publication `@focusmcp/cli@0.1.0` sur npm
- [ ] README + docs d'install pour Claude Code

### P1

- [ ] `focus add` / `focus remove` / `focus update` / `focus search`
- [ ] `focus enable` / `focus disable` / `focus status` / `focus logs`
- [ ] `focus config get` / `focus config set`
- [ ] Admin API HTTP (transport secondaire, derrière un flag explicite)

### P2

- [ ] `focus catalog add/remove/list` — catalogues tiers
- [ ] Hot-reload de briques (rechargement à chaud sans restart)
- [ ] Plugins CLI tiers (briques qui ajoutent des sous-commandes)
- [ ] Séparation `cli-manager` (UI admin qui attaque l'API HTTP)

---

## Stack technique

| Composant | Technologie | Rôle |
|---|---|---|
| Langage | **TypeScript strict** | Code source |
| Build | **tsup** | Bundling (ESM, Node 22, dts pour l'API programmatique) |
| Tests | **Vitest** | Unit (≥ 80 % coverage) |
| Transport MCP | **@modelcontextprotocol/sdk** | `StdioServerTransport` officiel |
| Lib FocusMCP | **@focusmcp/core** (git dep) | Registry + EventBus + Router |
| Parsing CLI | **node:util `parseArgs`** | Dispatch sous-commandes (pas de dep externe) |
| Lint | **Biome 2.x** | Style + qualité |
| License | **REUSE** | SPDX headers |
| CI | **GitHub Actions** | Lint, typecheck, test, build, REUSE, gitleaks, CodeQL |
| Publish | **Changesets** + npm provenance | Releases semver |

---

## Décisions clés

| Décision | Choix | Raison |
|---|---|---|
| **Entrée principale** | CLI (pas Tauri) | Pivot CLI-first : tout client MCP peut attacher ; pas de lock-in UI |
| **Transport primaire** | stdio MCP | Standard MCP ; Claude Code/Cursor spawnent des sous-processus stdio, pas des serveurs HTTP |
| **HTTP** | Phase 2, derrière un flag | Gardé pour `cli-manager`, pas exposé par défaut pour limiter la surface |
| **UI** | Pas bundlée | Séparation CLI ↔ UI ; `cli-manager` sera un repo dédié en P2 |
| **`@focusmcp/core`** | Git dependency | Core n'est pas publié sur npm au MVP — git dep évite un release coupling prématuré |
| **Changesets** | Single-package mode | `@focusmcp/cli` est un package unique ; `independent` n'a pas de sens ici |
| **npm org** | `@focusmcp` | Scope officiel réservé ; distribution via npm, pas GitHub Releases (contrairement aux briques) |
| **CLI parsing** | `node:util` `parseArgs` | Pas de dépendance externe (commander, yargs) — API Node stable suffit |
| **Coverage gate** | 80 % | Aligné sur marketplace/core ; `src/bin/` et `src/index.ts` sont exclus (surface fine, testée e2e) |

---

## Inspirations

- **npm CLI** — binaire unique, sous-commandes, lock file, registre central.
- **Docker CLI** — `docker run` en sous-processus spawné par un client higher-level.
- **Claude Code plugins** — format stdio MCP canonique pour l'intégration agent AI.
- **tsc / tsx** — distribution via npm + `npx` comme pattern standard.
