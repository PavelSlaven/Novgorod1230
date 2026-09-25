# Архитектура репозитория: карта

> status: REFERENCE / DOMAIN GUIDE; при конфликте действует governing-корпус (AGENTS.md) или профильный контракт. Проверено: 2026-09-25, commit 59c1a33c.

Это карта со ссылками на владельцев. Правила здесь не копируются и не создаются: норма живёт в источнике,
указанном рядом с фактом. Статусы и precedence документов определяет
[CONTRACT_INDEX](../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md).

## 1. Корневые папки

| Папка | Назначение | Источник |
|---|---|---|
| `apps/` | composition roots: `apps/game-server` (production composition и единственный владелец физической PostgreSQL-транзакции; на ветке PR #98 доменная логика ещё в `src/runtime`, `src/internal` и `src/infrastructure/postgres` — долг LW-026) и `apps/game-web` | [DEPENDENCY_RULES](../architecture/DEPENDENCY_RULES.md), [MODULE_INDEX](../../MODULE_INDEX.md), [game-server MODULE.md](../../apps/game-server/MODULE.md) |
| `packages/` | модули `@rus/*`: workflow/presentation, domain и platform слои | [DEPENDENCY_RULES](../architecture/DEPENDENCY_RULES.md), [MODULE_INDEX](../../MODULE_INDEX.md) |
| `tools/` | автономные CLI (docs, architecture, world-catalog, local-play и др.); production runtime их не импортирует, кроме `tools/world-catalog-workflow`, который импортируют стадии 7, 8, 13, 16 `packages/new-game` (LW-038) | [DEPENDENCY_RULES](../architecture/DEPENDENCY_RULES.md), [TOOLS_INVENTORY](../modules/TOOLS_INVENTORY.md) |
| `data/` | нормативный корпус (`data/knowledge-source`), world-catalogs, approved seeds; не место для generated output | [data/README.md](../../data/README.md) |
| `schemas/` | DDL: `schemas/party-db` (party runtime), JSON-схемы knowledge-source/materialization/world-catalogs | [CONTRACT_POLICY](../architecture/CONTRACT_POLICY.md) («DB DDL — `schemas/`») |
| `infra/` | `infra/world-base` (read-only схема канонического мира, seeds, SCHEMA_REFERENCE), `infra/party-db` (справочные таблицы схемы партии), `infra/operator-control` (SQL) | [infra/world-base/README.md](../../infra/world-base/README.md), [infra/party-db/README_PARTY_DATABASE.md](../../infra/party-db/README_PARTY_DATABASE.md) |
| `generated/` | детерминированные build-продукты (`schema-reference`, `module-index.json`, `generated/knowledge-source`, `generated-manifest.json`); коммитятся, вручную не правятся, создаются `npm run docs:generate` | [CONTRACT_POLICY](../architecture/CONTRACT_POLICY.md), [.gitignore](../../.gitignore) |
| `docs/` | `architecture`, `domain`, `pipelines`, `adr`, `modules`, `setup`, `plans`, `playtests`, `implementation`, `work`, `migration` (архив), `context` (эти карты) | [docs/README.md](../README.md), [playtests/README.md](../playtests/README.md), [CANONICAL_PATHS.json](../migration/CANONICAL_PATHS.json) |
| `test/` | репозиторные тесты: `test/modules`, `test/integration`, `test/acceptance`, `test/e2e`, `test/shadow`, `test/cutover`, `test/spatial-v3`, `test/fixtures`, `test/helpers`. Корневые `test/*.test.js` в основном импортируют `src/` и не входят ни в один `test:*` скрипт | [package.json](../../package.json) |
| `legacy/` | карантин до-модульного runtime: `legacy/src`, `legacy/test` (`npm run test:legacy`), `legacy/scripts`, `legacy/DOCUMENTS`; новые функции в нём не создаются. production до `legacy/src` не доходит: [legacy-adapter.js](../../packages/new-game/src/legacy-adapter.js) подключают только `stages/stage-{3..7}-*/compat.js`, которые не импортирует ни один модуль `apps/` и `packages/` (LW-003); `legacy/DOCUMENTS` — зеркало `canonicalized_from_legacy` | [MODULE_RULES](../architecture/MODULE_RULES.md) п.10, [legacy/README.md](../../legacy/README.md) |
| `src/` | вторая, расходящаяся копия до-модульного runtime (отличается от `legacy/src`); production её не импортирует. Читатели: корневые `test/*.test.js` (55 из 61 файла), `test/fixtures/new-game-pipeline-stage*.js`, gate-тест `test/modules/party-runtime-preflight-v2.test.js` и операторские `scripts/*.js` (`src/env.js`) | фактический `diff -rq src legacy/src`; импорты; [LW-001](../work/LEGACY_WARNINGS.md) |
| `DOCUMENTS/` | legacy-копия корпуса и графа `DOCUMENTS/documents-kg`; читают `src/world/corpus-loader.js`, gate-тест `test/modules/stage23-security.test.js` и `scripts/generate-schema-reference.js`. Нормативный корпус — `data/knowledge-source` | [src/world/corpus-loader.js](../../src/world/corpus-loader.js), [README.md](../../README.md) |
| `prompts/` | `prompts/rus13/{g5,new-party,repair}` — промпты legacy-конвейера; из кода читает только `src/world/corpus-loader.js` | [src/world/corpus-loader.js](../../src/world/corpus-loader.js) |
| `scripts/` | разовые seed/import/export/release/audit скрипты; часть вызывается из `package.json` (31 ссылка `node scripts/`) | [package.json](../../package.json) |
| `MapMaker/` | отдельный TypeScript-модуль браузерной карты G1–G4 (`@rus13/map-maker`) со своим `package.json`; не workspace (workspaces: `apps/*`, `packages/*`, `tools/*`), его не импортируют ни `apps`, ни `packages`, ни `tools`. Не путать с workspace-инструментом `tools/map-maker` (`@rus/map-maker`, редактор графов G0–G5) | [MapMaker/README.md](../../MapMaker/README.md), [package.json](../../package.json) |
| `MIGRATION_STATUS.md`, `MIGRATION_PHASES_SHORT.md`, `MIGRATION_MANIFEST.json` | корневые указатели на архив завершённой миграции; зарегистрированы в CANONICAL_PATHS и ROOT_MARKDOWN_ALLOWLIST, `MIGRATION_MANIFEST.json` и `MIGRATION_PHASES_SHORT.md` читает `test/integration/migration-summary-contract.test.js` | [docs/migration/archive/](../migration/archive/MIGRATION_STATUS.md) |
| `db-snapshot/` | `pg_dump` снимки `world_base` и `party` от 2026-07-10 (архив, не источник схемы) | [db-snapshot/README.txt](../../db-snapshot/README.txt) |
| `logs/` | локальные логи; в git только `.gitkeep` | [.gitignore](../../.gitignore) |
| `.github/` | CI (`workflows/test.yml`), issue/PR-шаблоны, указатель Copilot на AGENTS.md | [copilot-instructions.md](../../.github/copilot-instructions.md) |
| `.cursor/` | правило Cursor для RAG (старые правила агента — в [архиве](../archive/README.md)) | [knowledge-rag.mdc](../../.cursor/rules/knowledge-rag.mdc) |

Игнорируются git: `node_modules/`, `artifacts/*`, `releases/*`, `.codebase-memory/`, `.tmp.driveupload/` —
см. [.gitignore](../../.gitignore).

## 1.1. Цепочка хода v17 (фактический путь)

Composition root строится при старте сервера (`server.js` → `modular-entry.js`), не на каждый HTTP-запрос.

```text
HTTP /api/v1/parties/:id/turns
  → apps/game-server/src/http/handler.js
  → technicalCore.executeReleaseOperation
  → lower-dvina-trace-public-runtime.js
  → createTraceTurnRuntime
       (runtime/releases/spatial-v3-production-trace-runtime.js)
  → phase-2 runTurnWorkflow
  → turn-step-admission → @rus/turn runTurnStepLoop
       (packages/turn/src/turn-step-loop.js)
       + WK grounding (runtime/world-knowledge-grounding.js)
       + grounding auditor (lower-dvina-trace-turn-step-grounding-audit.js)
  → P16 combined atomic committer
       (infrastructure/postgres/spatial-v3-combined-atomic-committer.js /
        lower-dvina-trace-phase-2-commit-p16.js)
  → @rus/narration (post-commit prose from persisted visible package)
```

Bindings: `createSpatialV3ProductionCompositionRoot`
(`composition/production-spatial-v3.js`) →
`runtime/releases/spatial-v3-production-v{16|17}-bindings.js`.
Default binding без env — v16; v17 — `RUS_SPATIAL_V3_BINDINGS_MODULE` / пара БД v17 в `play:local` ([DB_SCHEMA](DB_SCHEMA.md) §1.1, LW-033).

## 1.2. Цепочка заполнения места (first entry / generated G5)

### v17

```text
G4 expansion profile / scene template (world_base)
  → infrastructure/postgres/spatial-v3-generation-admission.js
  → infrastructure/postgres/spatial-v3-generated-expansion-adapter.js
  → infrastructure/postgres/target-generated-first-entry.js
  → infrastructure/postgres/generated-npc-first-entry.js
  → infrastructure/postgres/ordinary-materialization-first-entry-provisioning.js
       (createTargetFiniteFirstEntryPorts)
  → internal/target-runtime-profiles.js (O2a/O2b/F1/S1 на v17 null — LW-029;
       на v17 ordinary- и spatial-semantic-провижинеры не строятся: targetContext == null)
  → infrastructure/postgres/spatial-v3-combined-atomic-committer.js
  → visibility / factual context → opening projection → narrator
```

Старт партии: phase-1b → phase-1a
(`infrastructure/postgres/lower-dvina-trace-phase-1b.js` →
`internal/lower-dvina-trace-phase-1a.js`).

### v16 (к удалению после M2c, LW-033)

На v16 `spatialExpansionRuntime` = null ([`production-spatial-v3.js`](../../apps/game-server/src/composition/production-spatial-v3.js));
заполнение места идёт через
[`createOrdinaryMaterializationFirstEntryProvisioner`](../../apps/game-server/src/infrastructure/postgres/ordinary-materialization-first-entry-provisioning.js)
и
[`createSpatialSemanticFirstEntryProvisioner`](../../apps/game-server/src/infrastructure/postgres/spatial-semantic-first-entry-provisioning.js)
внутри committer с профилями lower-dvina.
Удаление v16 и привязок v2–v15 — [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5836830425).

Владельцы: `@rus/materialization`, `@rus/items-property`, `@rus/npc-runtime`, `@rus/runtime-catalog`; commit — game-server. См. [OWNERSHIP_MAP](../domain/OWNERSHIP_MAP.md).

## 1.3. World Knowledge → игровая LLM

| Слой | Путь | Источник |
|---|---|---|
| Pack | `data/world-catalogs/novgorod/world-knowledge/production-v1/` | [world-knowledge-production.js](../../apps/game-server/src/internal/world-knowledge-production.js) |
| Embedding | `…/embedding-profiles/giga-480m-0826-v1.json` | тот же loader |
| Pure core | `@rus/world-knowledge` | [MODULE.md](../../packages/world-knowledge/MODULE.md) |
| Encoder Giga | `createGigaQueryEncoder` | [giga-query-encoder.js](../../apps/game-server/src/infrastructure/embedding/giga-query-encoder.js); [WORLD_KNOWLEDGE_GIGA_EMBEDDINGS.md](../setup/WORLD_KNOWLEDGE_GIGA_EMBEDDINGS.md) |
| Pins релиза | pack_ref / revision / embedding_profile_ref | `spatial-v3-production-v17-bindings.js` |
| Подключение grounder | ports в `runtime/releases/spatial-v3-production-trace-runtime.js` | createNpcRuntimePorts / bindings |
| Потребители | планировщик хода; NPC semantic/autonomous; разговор [`lower-dvina-trace-conversation-llm.js`](../../apps/game-server/src/runtime/lower-dvina-trace-conversation-llm.js); ordinary/N1/S1 материализация [`ordinary-materialization-llm.js`](../../apps/game-server/src/runtime/ordinary-materialization-llm.js) (`materialization_support`), [`releases/lower-dvina-trace-n1-production.js`](../../apps/game-server/src/runtime/releases/lower-dvina-trace-n1-production.js), [`releases/lower-dvina-trace-s1-production.js`](../../apps/game-server/src/runtime/releases/lower-dvina-trace-s1-production.js) (доступность на v17 — LW-029); preflight старта [`lower-dvina-trace-phase-1a.js`](../../apps/game-server/src/internal/lower-dvina-trace-phase-1a.js) | |

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
| Жёсткий предел 25 КБ / строковые ориентиры | MODULE_RULES п.7 | `hardBytes = 25 * 1024`; превышения размера и строковых ориентиров → `warnings` в [check-boundaries.mjs](../../tools/architecture/check-boundaries.mjs). Запреты импортов, allowlist корневых `.md`, лимит экспортов — violations |
| Публичный API пакета ≤15 экспортов | MODULE_RULES п.8 | считает вхождения слова `export` в `packages/*/src/index.js` (> 15 — violation); строже: turn ≤12, оркестратор new-game ≤5, стадии new-game ≤8 |
| `packages` ↛ `apps` | MODULE_RULES п.2, DEPENDENCY_RULES | импорт с `/apps/` из `packages/` — violation |
| `game-web` ↛ `game-server` | DEPENDENCY_RULES | импорт с `game-server` из `apps/game-web/` — violation; кроме того в `apps/game-web/src` запрещена строка `@rus/` |
| legacy — только через [legacy-adapter.js](../../packages/new-game/src/legacy-adapter.js) | MODULE_RULES п.3; DEPENDENCY_RULES «Infrastructure exceptions» (после cutover — только migration/rollback source или test-only fixture, не production composition) | из `packages/` импорт `/legacy/` разрешён только в `packages/new-game/src/legacy-adapter.js`; default export `@rus/new-game` не должен его загружать; в `apps/game-server/src` строка `legacy/` запрещена |
| Production-код не ссылается на legacy DOCUMENTS | — (правило есть только в проверке) | `.js`/`.mjs`/`.json` в `apps/` и `packages/` не содержат `legacy/DOCUMENTS` или `DOCUMENTS/documents-kg` |
| Корневые `.md` — только allowlist: `AGENTS.md`, `README.md`, `CHANGELOG.md`, `MIGRATION_PHASES_SHORT.md`, `MIGRATION_STATUS.md`, `MODULE_INDEX.md` | нормативного текста нет; реестр путей — [CANONICAL_PATHS.json](../migration/CANONICAL_PATHS.json) (category `root`, без `AGENTS.md` и — после DOC-01 — без `CHANGELOG.md`) | один список `ROOT_MARKDOWN_ALLOWLIST` в [documentation.js](../../tools/docs-tools/src/documentation.js); его проверяют `docs:check` и [check-boundaries.mjs](../../tools/architecture/check-boundaries.mjs) |
| `generated/` не редактируется вручную | [CONTRACT_POLICY](../architecture/CONTRACT_POLICY.md), DEPENDENCY_RULES | `docs:check` сравнивает с повторной генерацией |
| Новый пакет: `MODULE.md`, `package.json`, `src/index.js` | DEPENDENCY_RULES (публичные entrypoints) | check-boundaries требует набор файлов для перечисленных в нём пакетов/apps/tools |

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
| G0–G5 | каноническая пространственная иерархия | AGENTS.md §11; см. [OWNERSHIP_MAP](../domain/OWNERSHIP_MAP.md) |
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
