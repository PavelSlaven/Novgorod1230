# STACK — технологический стек

> status: REFERENCE / DOMAIN GUIDE; при конфликте действует governing-корпус (AGENTS.md) или профильный контракт. Проверено: 2026-09-22, commit c5501419.

Карта стека со ссылками на владельцев. Правила здесь не копируются: норма — в [AGENTS.md](../../AGENTS.md),
профильных контрактах и `MODULE.md`. Версии ниже — то, что закреплено в файлах на указанном commit.
Пометка «⚠ PR #98 меняет» относится к Draft PR #98 (`codex/live-world-runtime`), пока он не смержен.

## Runtime и пакеты

| Что | Факт | Источник |
|---|---|---|
| Node.js | `engines.node: ">=22"`; CI — Node 22 (`actions/setup-node`, `cache: npm`) | [package.json](../../package.json), [test.yml](../../.github/workflows/test.yml) |
| Модули | ESM: `"type": "module"` в корне и в пакетах | [package.json](../../package.json) |
| Workspaces | npm workspaces `apps/*`, `packages/*`, `tools/*`; пакеты `@rus/*` | [package.json](../../package.json) |
| Lockfile | `package-lock.json`, `lockfileVersion: 3`; CI ставит зависимости через `npm ci` после нормализации registry URL | [package-lock.json](../../package-lock.json), [test.yml](../../.github/workflows/test.yml) |
| Dependencies | `pg ^8.22.0`, `embedded-postgres 16.14.0-beta.17` | [package.json](../../package.json) |
| devDependencies | `pg-mem ^3.0.5`, `playwright-core ^1.53.0`, `esbuild ^0.25.5` | [package.json](../../package.json) |

- `esbuild` объявлен в корне, но вызывается только сборкой `MapMaker/` — отдельного пакета `@rus13/map-maker`
  со своим lockfile, не входящего в workspaces (там же TypeScript `tsc`, `cytoscape`, `elkjs`):
  [MapMaker/package.json](../../MapMaker/package.json). Workspace-инструмент `tools/map-maker` — другой модуль.
- `playwright-core` используется browser e2e-тестами `test/e2e/*`; браузер не скачивается пакетом сам.
- `pg-mem` используется отдельными тестами (например `test/cutover/`); реальную DB semantics проверяют
  PostgreSQL integration tests.

## Тесты

- Test runner — встроенный `node:test` (`node --test ...`) во всех `test:*` скриптах; сторонних test frameworks нет:
  [package.json](../../package.json).
- `npm test` — не все `test:*`, а набор скриптов из поля `test` + `docs:check` + `architecture:check` (состав — `docs/context/TESTING.md`); когда и что запускать —
  AGENTS.md §24 и `docs/context/TESTING.md`.

## База данных

| Что | Факт | Источник |
|---|---|---|
| PostgreSQL | 16 | см. ниже |
| CI | docker-контейнер `postgres:16` внутри job | [test.yml](../../.github/workflows/test.yml) |
| Локальная игра | `embedded-postgres` (PostgreSQL 16.14.0) поднимает `npm run play:local` | [local-postgres.js](../../tools/local-play/local-postgres.js), [local-play MODULE.md](../../tools/local-play/MODULE.md) |
| Dev-only compose | `postgres:16` + `nocodb/nocodb:latest` (ручное заполнение world_base в NocoDB); `npm run world-db:up` | [docker-compose.yml](../../docker-compose.yml) |
| Драйвер | `pg` (node-postgres) | [package.json](../../package.json) |

Схемы, миграции и правила записи — `docs/context/DB_SCHEMA.md` и владельцы, на которых он ссылается.

## Фронтенд

- `apps/game-web` — vanilla JS (ES modules), без фреймворка и без runtime dependencies:
  [apps/game-web/package.json](../../apps/game-web/package.json). Устройство — `docs/context/UI_KIT.md`.

## Python

- CI: Python 3.12 (`actions/setup-python`) для world_base importer и провижининга embedding-encoder:
  [test.yml](../../.github/workflows/test.yml), зависимости —
  [requirements.txt](../../tools/rus13-world-base-importer/requirements.txt),
  [requirements-embeddings.txt](../../tools/world-catalog-workflow/requirements-embeddings.txt).
- Локально: `npm run play:local` сам ставит managed Python **3.11.11** через pinned `uv` (не 3.12):
  [WORLD_KNOWLEDGE_GIGA_EMBEDDINGS.md](../setup/WORLD_KNOWLEDGE_GIGA_EMBEDDINGS.md).

## LLM

- Все LLM-вызовы идут через `@rus/llm-runtime` (роли, tier-конфигурация, лимиты, без fallback chain):
  [packages/llm-runtime/MODULE.md](../../packages/llm-runtime/MODULE.md).
- Провайдер и модель по умолчанию здесь не фиксируются — смотри владельцев:
  [LLM_PROVIDERS.md](../setup/LLM_PROVIDERS.md), [local-play MODULE.md](../../tools/local-play/MODULE.md),
  переменные окружения — [.env.example](../../.env.example).
  ⚠ PR #98 меняет: default gameplay provider/model и поведение `play:local` (описано в тех же двух файлах
  и в `packages/llm-runtime/MODULE.md`; скрипт `gameplay:acceptance:local` сохраняет имя, но указывает на `tools/local-play/local-provider-acceptance.mjs`).

## Навигация по коду для агентов

- `codebase-memory-mcp` закреплён на release `v0.10.8`; официальный installer настраивает Codex, Cursor и VS Code
  (Claude Code — автоматически или вручную, см. там же); индекс вне репозитория:
  [CODEBASE_MEMORY_MCP.md](../setup/CODEBASE_MEMORY_MCP.md). Порядок использования — AGENTS.md §19.
- Удалены: Graphify (skills, cursor rule, CI-шаги, `.graphifyignore`) и repo-intel
  (`packages/repository-intelligence`) — commit `be24363a` (PR #94). Каталог
  `DOCUMENTS/documents-kg/corpus/DOCUMENTS/novgorod_graphify_g1_g4_full/` — старые данные в legacy-корпусе,
  не инструмент.

## Нельзя

- **Обновлять зависимости и toolchain без задачи** — AGENTS.md §21 («Используй текущий stack…»).
- **`pg` в `apps/`/`packages/` — только в `apps/game-server/src/infrastructure/postgres/`.** Фактически единственный
  импорт — `pools.js` там же. `architecture:check`
  ([check-boundaries.mjs](../../tools/architecture/check-boundaries.mjs)) проверяет это **частично**:
  - `apps/game-server/src/**`: импорт `pg` вне `infrastructure/postgres/` — нарушение (полный охват app);
  - `apps/game-web/src/**`: `from 'pg'` запрещён;
  - `packages/*`: запрет есть только в перечисленных в скрипте областях (knowledge-source, domain modules,
    turn, narration, presentation, отдельные подкаталоги `new-game/src/`) и ловит строку `from 'pg'`/`from "pg"`; в domain, temporal, turn, narration и presentation `pg` дополнительно
    не проходит списки разрешённых внешних импортов;
    общего правила для всех пакетов нет — например `party-store`, `world-base`, `runtime-catalog` не покрыты;
  - `tools/*` проверяются выборочно (например `tools/map-maker`), `scripts/` и `test/` — нет.
- **`Math.random` в доменном коде** — случайность только через порт `RandomSource`
  ([checks-rng MODULE.md](../../packages/checks-rng/MODULE.md); см. также
  [materialization MODULE.md](../../packages/materialization/MODULE.md)). `architecture:check` ищет `Math.random(`
  в knowledge-source, domain modules, turn, temporal owners, narration, presentation и в `apps/*/src`.

## Инструменты агентов

- Codex, Cursor и GitHub Copilot читают корневой [AGENTS.md](../../AGENTS.md) сами; Copilot дополнительно —
  [.github/copilot-instructions.md](../../.github/copilot-instructions.md), который ведёт на AGENTS.md.
- Claude Code ≥ 2.1.277 работает в direct-AGENTS mode: читает AGENTS.md сам, **только если** в рабочем каталоге
  и выше нет `CLAUDE.md`, `.claude/CLAUDE.md` или `CLAUDE.local.md` (`~/.claude/CLAUDE.md` не считается).
  Поэтому эти файлы в репозиторий не коммитятся; `CLAUDE.local.md` и `.claude/settings.local.json` —
  в [.gitignore](../../.gitignore).
- Сессии без поддержки direct-AGENTS mode (сторонние провайдеры вроде Bedrock, отключённая телеметрия, первая сессия
  после установки/обновления, версия ниже 2.1.277): личный gitignored `CLAUDE.local.md` с единственной строкой
  `@AGENTS.md` — свой в каждом worktree. Это не репозиторный источник истины и не новая норма.
- Skills (процедуры): `.agents/skills/` (Codex, Cursor, Copilot) и `.claude/skills/` (Claude Code; Cursor и Copilot
  тоже читают). Копии одинаковые; канон указан в поле `metadata.canonical` каждого `SKILL.md`. Процедуры проекта —
  заглушки на `docs/process/*`, `docs/work/LEGACY_WARNINGS.md` или governance; `caveman` и `ponytail` — полные копии
  upstream (`metadata.source`), обязательны по AGENTS.md §18.1.
- Документация инструментов — [LINKS.md](LINKS.md).
