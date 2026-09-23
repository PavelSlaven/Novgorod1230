# Архитектура репозитория: карта

> status: REFERENCE / DOMAIN GUIDE; при конфликте действует governing-корпус (AGENTS.md) или профильный контракт. Проверено: 2026-09-22, commit c5501419.

Это карта со ссылками на владельцев. Правила здесь не копируются и не создаются: норма живёт в источнике,
указанном рядом с фактом. Статусы и precedence документов определяет
[CONTRACT_INDEX](../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md).

## 1. Корневые папки

| Папка | Назначение | Источник |
|---|---|---|
| `apps/` | composition roots: `apps/game-server` (production composition, единственный владелец физической PostgreSQL-транзакции) и `apps/game-web` (browser-клиент) | [DEPENDENCY_RULES](../architecture/DEPENDENCY_RULES.md), [MODULE_INDEX](../../MODULE_INDEX.md) |
| `packages/` | модули `@rus/*`: workflow/presentation, domain и platform слои | [DEPENDENCY_RULES](../architecture/DEPENDENCY_RULES.md), [MODULE_INDEX](../../MODULE_INDEX.md) |
| `tools/` | автономные CLI (docs, architecture, world-catalog, local-play и др.); production runtime их не импортирует | [DEPENDENCY_RULES](../architecture/DEPENDENCY_RULES.md), [TOOLS_INVENTORY](../modules/TOOLS_INVENTORY.md) |
| `data/` | нормативный корпус (`data/knowledge-source`), world-catalogs, approved seeds; не место для generated output | [data/README.md](../../data/README.md) |
| `schemas/` | DDL: `schemas/party-db` (party runtime), JSON-схемы knowledge-source/materialization/world-catalogs | [CONTRACT_POLICY](../architecture/CONTRACT_POLICY.md) («DB DDL — `schemas/`») |
| `infra/` | `infra/world-base` (read-only схема канонического мира, seeds, SCHEMA_REFERENCE), `infra/party-db` (справочные таблицы схемы партии), `infra/operator-control` (SQL) | [infra/world-base/README.md](../../infra/world-base/README.md), [infra/party-db/README_PARTY_DATABASE.md](../../infra/party-db/README_PARTY_DATABASE.md) |
| `generated/` | детерминированные build-продукты (`schema-reference`, `module-index.json`, `generated/knowledge-source`, `generated-manifest.json`); коммитятся, вручную не правятся, создаются `npm run docs:generate` | [CONTRACT_POLICY](../architecture/CONTRACT_POLICY.md), [.gitignore](../../.gitignore) |
| `docs/` | `architecture`, `domain`, `pipelines`, `adr`, `modules`, `setup`, `plans`, `implementation`, `work`, `migration` (архив завершённой миграции), `context` (эти карты) | [docs/migration/README.md](../migration/README.md), [CANONICAL_PATHS.json](../migration/CANONICAL_PATHS.json) |
| `test/` | репозиторные тесты: `test/modules`, `test/integration`, `test/acceptance`, `test/e2e`, `test/shadow`, `test/cutover`, `test/spatial-v3`, `test/fixtures`, `test/helpers`. Корневые `test/*.test.js` в основном импортируют `src/` и не входят ни в один `test:*` скрипт | [package.json](../../package.json) |
| `legacy/` | карантин до-модульного runtime: `legacy/src`, `legacy/test` (`npm run test:legacy`), `legacy/scripts`, `legacy/DOCUMENTS`; новые функции в нём не создаются | [MODULE_RULES](../architecture/MODULE_RULES.md) п.10, [legacy/README.md](../../legacy/README.md) |
| `src/` | вторая, расходящаяся копия до-модульного runtime (отличается от `legacy/src`); её импортируют корневые `test/*.test.js` (55 из 61 файла) | фактический `diff -rq src legacy/src`; импорты тестов |
| `DOCUMENTS/` | legacy-копия корпуса и графа `DOCUMENTS/documents-kg`; читается `src/world/corpus-loader.js`. Нормативный корпус — `data/knowledge-source` | [src/world/corpus-loader.js](../../src/world/corpus-loader.js), [README.md](../../README.md) |
| `prompts/` | `prompts/rus13/{g5,new-party,repair}` — промпты legacy-конвейера; из кода читает только `src/world/corpus-loader.js` | [src/world/corpus-loader.js](../../src/world/corpus-loader.js) |
| `scripts/` | разовые seed/import/export/release/audit скрипты; часть вызывается из `package.json` (31 ссылка `node scripts/`) | [package.json](../../package.json) |
| `MapMaker/` | отдельный TypeScript-модуль браузерной карты G1–G4 со своим `package.json`; не workspace (workspaces: `apps/*`, `packages/*`, `tools/*`) | [MapMaker/README.md](../../MapMaker/README.md), [package.json](../../package.json) |
| `db-snapshot/` | `pg_dump` снимки `world_base` и `party` от 2026-07-10 (архив, не источник схемы) | [db-snapshot/README.txt](../../db-snapshot/README.txt) |
| `logs/` | локальные логи; в git только `.gitkeep` | [.gitignore](../../.gitignore) |
| `.github/` | CI (`workflows/test.yml`), issue/PR-шаблоны, указатель Copilot на AGENTS.md | [copilot-instructions.md](../../.github/copilot-instructions.md) |
| `.cursor/` | правило Cursor для RAG (старые правила агента — в [архиве](../archive/README.md)) | [knowledge-rag.mdc](../../.cursor/rules/knowledge-rag.mdc) |

Игнорируются git: `node_modules/`, `artifacts/*`, `releases/*`, `.codebase-memory/`, `.tmp.driveupload/` —
см. [.gitignore](../../.gitignore).

⚠ PR #98 меняет: добавляет `docs/playtests/` (отчёты плейтестов) и `docs/plans/Novgorod1230_Runtime_Plan.md`.

## 2. Слои и владельцы (только ссылки)

| Вопрос | Где ответ |
|---|---|
| Что делают `apps` и `packages`, legacy-карантин, лимиты модулей | [MODULE_RULES](../architecture/MODULE_RULES.md) |
| Направление зависимостей, категории модулей, запрещённые связи, infrastructure exceptions (`pg` только в `apps/game-server/src/infrastructure/postgres/`) | [DEPENDENCY_RULES](../architecture/DEPENDENCY_RULES.md) |
| Где живут контракты, версионирование, stage boundary, hidden/visible, persistence boundary | [CONTRACT_POLICY](../architecture/CONTRACT_POLICY.md) |
| Какой пакет владеет какими данными и формулами (Spatial v3, Temporal World v4) | [OWNERSHIP_MAP](../domain/OWNERSHIP_MAP.md) |
| Список пакетов, путь, public entry, прямые зависимости (generated) | [MODULE_INDEX](../../MODULE_INDEX.md); точный владелец — `MODULE.md` пакета |
| Порядок стадий новой игры | [pipelines/new-game.md](../pipelines/new-game.md) |
| Ход игрока, `turn_step_request_v1` → `turn_step_plan_v1` | [pipelines/turn.md](../pipelines/turn.md) |
| Продвижение времени | [pipelines/temporal-advance.md](../pipelines/temporal-advance.md) |
| Политика корпуса знаний | [KNOWLEDGE_SOURCE_POLICY](../architecture/KNOWLEDGE_SOURCE_POLICY.md) |
| Решения по владельцам | `docs/adr` (например, [ADR-004](../adr/ADR-004-temporal-place-access-owner.md): отдельного place/access пакета нет) |
| Что из этого проверяется машинно | [check-boundaries.mjs](../../tools/architecture/check-boundaries.mjs) (`npm run architecture:check`) |

Схема слоёв (из DEPENDENCY_RULES): `apps → workflow/presentation packages → domain packages → platform packages → @rus/kernel`.

## 3. Где создавать файлы и лимиты

| Правило | Нормативный источник | Машинная проверка |
|---|---|---|
| Целевой размер файла 100–300 строк | [MODULE_RULES](../architecture/MODULE_RULES.md) п.7 | `apps/*/src/**/*.js` — 300 строк; в пакетах и tools, перечисленных в скрипте, — 500 (domain modules, temporal owners, narration/presentation, g5-scene/time-light/visible-context, стадии new-game, отдельные tools), turn — 300/500, оркестратор new-game — 350; остальные пакеты по строкам не проверяются |
| Жёсткий предел 25 КБ | MODULE_RULES п.7 («нового исходника») | `hardBytes = 25 * 1024` для всех `.js`/`.mjs` в `apps/` и `packages/` |
| Публичный API пакета ≤15 экспортов | MODULE_RULES п.8 | считает вхождения слова `export` в `packages/*/src/index.js` (> 15 — violation); строже: turn ≤12, оркестратор new-game ≤5, стадии new-game ≤8 |
| `packages` ↛ `apps` | MODULE_RULES п.2, DEPENDENCY_RULES | импорт с `/apps/` из `packages/` — violation |
| `game-web` ↛ `game-server` | DEPENDENCY_RULES | импорт с `game-server` из `apps/game-web/` — violation; кроме того в `apps/game-web/src` запрещена строка `@rus/` |
| legacy — только через [legacy-adapter.js](../../packages/new-game/src/legacy-adapter.js) | MODULE_RULES п.3; DEPENDENCY_RULES «Infrastructure exceptions» (после cutover — только migration/rollback source или test-only fixture, не production composition) | из `packages/` импорт `/legacy/` разрешён только в `packages/new-game/src/legacy-adapter.js`; default export `@rus/new-game` не должен его загружать; в `apps/game-server/src` строка `legacy/` запрещена |
| Production-код не ссылается на legacy DOCUMENTS | — (правило есть только в проверке) | `.js`/`.mjs`/`.json` в `apps/` и `packages/` не содержат `legacy/DOCUMENTS` или `DOCUMENTS/documents-kg` |
| Корневые `.md` — только allowlist: `AGENTS.md`, `README.md`, `CHANGELOG.md`, `MIGRATION_PHASES_SHORT.md`, `MIGRATION_STATUS.md`, `MODULE_INDEX.md` | нормативного текста нет; реестр путей — [CANONICAL_PATHS.json](../migration/CANONICAL_PATHS.json) (category `root`, без `AGENTS.md` и — после DOC-01 — без `CHANGELOG.md`) | задан дважды: `ROOT_MARKDOWN_ALLOWLIST` в [documentation.js](../../tools/docs-tools/src/documentation.js) (`docs:check`) и `allowedRootMarkdown` в [check-boundaries.mjs](../../tools/architecture/check-boundaries.mjs) |
| `generated/` не редактируется вручную | [CONTRACT_POLICY](../architecture/CONTRACT_POLICY.md), DEPENDENCY_RULES | `docs:check` сравнивает с повторной генерацией |
| Новый пакет: `MODULE.md`, `package.json`, `src/index.js` | DEPENDENCY_RULES (публичные entrypoints) | check-boundaries требует набор файлов для перечисленных в нём пакетов/apps/tools |

⚠ PR #98 меняет: в `check-boundaries.mjs` все лимиты размера (25 КБ и все строковые лимиты выше, включая
оркестраторы и legacy-фасады) переводятся из violations в warnings; лимит 15 экспортов,
запреты импортов и allowlist корневых `.md` остаются violations.

Куда класть новое:
- доменная логика — в пакет-владелец по [OWNERSHIP_MAP](../domain/OWNERSHIP_MAP.md), наружу только через `src/index.js`
  или `package.json.exports` (DEPENDENCY_RULES, «Публичные entrypoints»);
- межмодульный нейтральный контракт — `@rus/contracts` (MODULE_RULES п.4);
- SQL и драйвер `pg` — только `apps/game-server/src/infrastructure/postgres/` (DEPENDENCY_RULES);
- DDL партии — новый файл в `schemas/party-db` (подробности — в DB_SCHEMA);
- CLI и генераторы — `tools/*`; UI — `apps/game-web` (см. [UI_KIT](UI_KIT.md));
- документация — к владельцу по AGENTS.md §20, не в корень.
- в `legacy/`, `src/`, `DOCUMENTS/`, `prompts/` новое не добавляется (MODULE_RULES п.10 для `legacy`; для остальных — это
  legacy-потребители, см. раздел 1).

## 4. Термины

| Термин | Смысл | Источник |
|---|---|---|
| owner / владелец | единственный authoritative модуль ответственности | AGENTS.md §15, [OWNERSHIP_MAP](../domain/OWNERSHIP_MAP.md) |
| authoritative / ordinary | авторская/значимая истина против обычной детали мира | AGENTS.md §10.1, §10.4 |
| authoritative envelope | рамка, внутри которой допустима semantic freedom | AGENTS.md §11 |
| G0–G5 | каноническая пространственная иерархия | AGENTS.md §11, `@rus/space-map` в MODULE_INDEX |
| `world_base` | read-only база канонического мира | MODULE_RULES п.5, [infra/world-base/README.md](../../infra/world-base/README.md) |
| party runtime | изменяемое состояние партии, запись только через `@rus/party-store` | MODULE_RULES п.5, `schemas/party-db` |
| composition root | `apps/*`: wiring без доменной логики | DEPENDENCY_RULES |
| proposal | результат чистого owner, не факт до commit | CONTRACT_POLICY «Temporal target boundary» |
| logical change set / write plan | объединённый план записи от `@rus/turn`, исполняется без дополнения | CONTRACT_POLICY «Persistence boundary» |
| typed gap / fail-closed | типизированный отказ вместо fallback | CONTRACT_POLICY, OWNERSHIP_MAP |
| visible package / hidden | player-safe проекция; hidden не уходит в narration/presentation/web | CONTRACT_POLICY «Hidden/visible boundary» |
| `turn_step_request_v1` → `turn_step_plan_v1` | единая semantic boundary хода | AGENTS.md §6, [pipelines/turn.md](../pipelines/turn.md) |
| stage | одна смысловая операция конвейера | CONTRACT_POLICY «Stage boundary» |
| compatibility adapter | именованная точка доступа к `legacy` | MODULE_RULES п.3 |
| generated | build-продукт команды, не источник истины | CONTRACT_POLICY «Generated reference» |
| CONTRACT_INDEX | реестр статусов и precedence документов | AGENTS.md §2 |
