# Карта баз данных

> status: REFERENCE / DOMAIN GUIDE; при конфликте действует governing-корпус (AGENTS.md) или профильный контракт. Проверено: 2026-09-25, commit 59c1a33c.

Это карта: где лежит схема, кто ей владеет и где проверять. Нормы здесь не повторяются.
Правила записи, причинности, атомарности и replay — [AGENTS.md §14](../governance/ARCHITECTURE_INVARIANTS.md) (сохранение
причинности) и §23 (persistence, concurrency и БД). Статусы документов — [CONTRACT_INDEX](../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md).
Если утверждение ниже расходится с кодом, прав код; расхождение нужно сообщить.

Числа ниже получены скриптом на HEAD ветки PR #98 (`codex/live-world-runtime`):
`EXPECTED_TABLE_COUNT` / CI `table_count`, `SPATIAL_V3_TARGET_MIGRATION_FILES.length`, заголовки `SCHEMA_REFERENCE`.

## 1. Три схемы PostgreSQL

| Схема | Назначение | Где лежит DDL | Кто пишет |
|---|---|---|---|
| `world_base` | утверждённые справочные данные мира, read-only для runtime | [schema.sql](../../infra/world-base/schema.sql) + части `infra/world-base/schema/01.sql`–`26.sql` | только утверждённый импорт (`world-db:import:*`), не runtime |
| `party_runtime` | состояние конкретной партии | `schemas/party-db/` 001–036; [справочник](../../infra/party-db/SCHEMA_REFERENCE.md) | единственный physical transaction owner — `@rus/game-server` |
| `operator_control` | append-only журнал событий operator cutover | [001_lower_dvina_v3_cutover_events.sql](../../infra/operator-control/001_lower_dvina_v3_cutover_events.sql) | только operator tooling |

Подключение: `RUS_WORLD_DATABASE_URL` (или `DATABASE_URL`) и `RUS_PARTY_DATABASE_URL` (или `PARTY_DATABASE_URL`),
отдельные пулы — [config.js](../../apps/game-server/src/infrastructure/postgres/config.js).
Архитектура разделения read-only базы мира и базы партии —
[spatial_v3_target_read_only_database_and_graph_architecture.md](../../data/knowledge-source/corpus/DOCUMENTS/spatial_v3_target_read_only_database_and_graph_architecture.md)
(active по CONTRACT_INDEX); прежний [read_only_database_and_graph_architecture.md](../../data/knowledge-source/corpus/DOCUMENTS/read_only_database_and_graph_architecture.md) —
migration/rollback source.

## 1.1. Локальная пара v17 (ветка PR #98)

| Что | Факт | Источник |
|---|---|---|
| Имена БД | `novgorod_world_v17` / `novgorod_party_v17` | [local-postgres.js](../../tools/local-play/local-postgres.js) `LOCAL_V17_DATABASES`; [bootstrap-live-world-v17.mjs](../../scripts/bootstrap-live-world-v17.mjs) |
| Каталог данных | `%LOCALAPPDATA%\Novgorod1230` (`localDataRoot`); подкаталог кластера — `data\postgres-16.14.0-utf8` | [local-postgres.js](../../tools/local-play/local-postgres.js) |
| MSIX / packaged apps | в процессах из MSIX (Codex, Claude Desktop) `%LOCALAPPDATA%` перенаправлен в LocalCache пакета: пара БД, созданная оттуда, не видна `play:local` из обычного терминала, и тот молча берёт v16 (LW-033). Bootstrap и play — из обычного терминала | LW-033; GS §26 |
| Выбор релиза `play:local` | обе БД v17 есть → release 17; ни одной → 16 (`novgorod_world`/`novgorod_party`); ровно одна → `LOCAL_POSTGRES_V17_PAIR_INCOMPLETE` | `selectLocalRelease` в том же файле; LW-033 |
| Bootstrap | `node scripts/bootstrap-live-world-v17.mjs` (npm-скрипта нет); входы — каталоги `data/world-catalogs/novgorod/live-world-runtime-v17`, `m2c-*`, runtime-catalog gate1 и др. | сам скрипт; LW-035 (без temporal-v4) |
| Default binding сервера | без env — `builtin:spatial-v3-production-v16`; v17 — через `RUS_SPATIAL_V3_BINDINGS_MODULE` | [load-spatial-v3-bindings.js](../../apps/game-server/src/runtime/load-spatial-v3-bindings.js) |

Генераторы процедурных сцен (authoring, не runtime write): npm `procedural-scenes:generate`, `procedural-scenes:v6-overlay`, `procedural-scenes:v6-overlay-check`, `procedural-scenes:import-pack`, `procedural-scenes:import-pack-check` — [package.json](../../package.json).

## 2. `world_base` (read-only)

- **Entrypoint:** [schema.sql](../../infra/world-base/schema.sql) подключает **26** частей через `\ir schema/NN.sql`
  (`01`–`26`) и снимает `CREATE` на схеме с `PUBLIC`.
- **Число таблиц: 208.** Проверяется в двух местах:
  - [check-world-base-schema.mjs](../../scripts/check-world-base-schema.mjs): `EXPECTED_TABLE_COUNT = 208`
    (`npm run world-db:schema-check`);
  - [test.yml](../../.github/workflows/test.yml), шаг «Execute world_base DDL in PostgreSQL»: DDL
    исполняется в `postgres:16`, затем `test "$table_count" -eq 208`. Там же проверяется роль `world_reader`:
    не superuser, есть `USAGE`, нет `CREATE`, `SELECT` на каждую таблицу, других грантов нет.
- **Read-only порт:** [packages/world-base/MODULE.md](../../packages/world-base/MODULE.md): `createWorldBaseReader`
  отклоняет mutating SQL до вызова adapter. Production reader — `spatial-v3-world-base-reader.js` в
  `apps/game-server/src/infrastructure/postgres/`.
- **Импорт и аудит:** [IMPORT.md](../../infra/world-base/IMPORT.md); контракты operation plan —
  [tools/db-tools/MODULE.md](../../tools/db-tools/MODULE.md).
- **Описания полей:** только из [field-descriptions.js](../../infra/world-base/field-descriptions.js);
  справочник генерируется, вручную его не правят.
- **Справочник:** [SCHEMA_REFERENCE.md](../../infra/world-base/SCHEMA_REFERENCE.md) — 208 заголовков `### `,
  22 группы `## ` (скрипт на HEAD). Текст `infra/world-base/README.md` ещё пишет «201 таблиц» — расхождение,
  не источник счёта (см. LEGACY_WARNINGS, LW-040).

### Поиск по SCHEMA_REFERENCE

```powershell
rg '^## ' infra/world-base/SCHEMA_REFERENCE.md
rg -n '^### `world_base\.graph_' infra/world-base/SCHEMA_REFERENCE.md
rg -n -A 30 '^### `world_base\.graph_nodes`' infra/world-base/SCHEMA_REFERENCE.md
```

Generated-файл (`npm run world-db:schema-doc`, проверка — `world-db:schema-doc-check`). Целиком не читают.

## 3. `party_runtime`

- **Файлы:** `schemas/party-db/` — от [001_party_runtime.sql](../../schemas/party-db/001_party_runtime.sql)
  до `036_party_runtime_visibility_modifiers.sql` (**36** SQL-файлов на диске).
- **Порядок и состав цепочки** задаёт массив `files` в
  [spatial-v3-target-migrations.js](../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js).
  `SPATIAL_V3_TARGET_MIGRATION_FILES.length === 36`; хвост `033`–`036`:
  `033_party_runtime_initial_semantic_decision.sql`,
  `034_party_runtime_actor_base_attributes.sql`,
  `035_party_runtime_nonportal_availability.sql`,
  `036_party_runtime_visibility_modifiers.sql`.
  Digest цепочки — `SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST`.
- **Справочник:** [SCHEMA_REFERENCE.md](../../infra/party-db/SCHEMA_REFERENCE.md) — «001–036», **132** таблицы
  (generated header на HEAD).
- **Когда применяется.** При каждом старте production composition
  ([production-spatial-v3.js](../../apps/game-server/src/composition/production-spatial-v3.js)). Если в
  `party_runtime.schema_migrations` уже есть запись catalog-миграции release, первые 11 файлов
  пропускаются (`CATALOG_MIGRATION_COVERED_TARGET_COUNT = 11`), остальные исполняются заново (`extended_existing`);
  без такой записи заново исполняется вся цепочка (`applied`).
- **`schema_migrations` и catalog pins** создаёт operator tooling:
  [001_runtime_catalog_pins.sql](../../tools/runtime-catalog-activation/migrations/party/001_runtime_catalog_pins.sql)
  ([MODULE.md](../../tools/runtime-catalog-activation/MODULE.md)).
- **Логическая граница записи:** [packages/party-store/MODULE.md](../../packages/party-store/MODULE.md).
  SQL и физическая транзакция — `apps/game-server/src/infrastructure/postgres/`.
- **Стейл-тест:** [first-playable-party-migration.test.js](../../test/spatial-v3/first-playable-party-migration.test.js)
  ожидает `SPATIAL_V3_TARGET_MIGRATIONS.length === 35` при фактических 36 — не чинить в этой задаче (LW-041 / #145).

## 4. `operator_control`

Одна таблица `operator_control.lower_dvina_v3_cutover_events`. Append-only; пишет только operator cutover
([lower-dvina-v3-production-cutover.js](../../tools/runtime-catalog-activation/src/lower-dvina-v3-production-cutover.js)).
Runtime игры её не использует.

## 5. Как добавить миграцию party_runtime

1. Новый файл `schemas/party-db/NNN_party_runtime_<смысл>.sql` со следующим номером после `036`.
2. Имя — **в конец** массива `files` в `spatial-v3-target-migrations.js`.
3. SQL идемпотентен (`IF NOT EXISTS` …): хвост цепочки переисполняется при старте.
4. Обновить тест порядка цепочки (сейчас стейл на 35 — чинить вместе с CR реализации).
5. `npm run docs:generate` → `generated/schema-reference.*` и party SCHEMA_REFERENCE.
6. Существующие файлы миграций не правят (байты в digest; LW-011).
7. Смена persistence semantics — PostgreSQL integration test и аудит (AGENTS §24, §25).

Изменение `world_base` DDL: часть в `infra/world-base/schema/`, затем `EXPECTED_TABLE_COUNT`, число в `test.yml`,
`field-descriptions.js` и `npm run world-db:schema-doc`.

Legacy [`migrations.js`](../../apps/game-server/src/infrastructure/postgres/migrations.js):
`runPartyRuntimeMigrations` применяет только `001_party_runtime.sql` (не Spatial v3 chain).

## 6. Только тестовая БД

Правило — [AGENTS.md §23](../governance/ARCHITECTURE_INVARIANTS.md):

- PostgreSQL-тесты поднимают одноразовый `postgres:16-alpine` и в `t.after` удаляют через `docker rm -fv` (не `-f`; GS §26 — anonymous volume).
- CI использует `postgres:16` и `world_base_ci` ([test.yml](../../.github/workflows/test.yml)).
- `npm run play:local` — embedded PostgreSQL в `%LOCALAPPDATA%\Novgorod1230\data\postgres-16.14.0-utf8` (`tools/local-play/`); см. предупреждение MSIX в §1.1.
- Import/seed/operator CLI — только против локальной/тестовой базы по задаче.

## 7. Куда смотреть дальше

| Вопрос | Владелец |
|---|---|
| смысл таблиц и полей `world_base` | [SCHEMA_REFERENCE.md](../../infra/world-base/SCHEMA_REFERENCE.md), [world_base_materialization_table_requirements.md](../../data/knowledge-source/corpus/DOCUMENTS/world_base_materialization_table_requirements.md) |
| CAS, idempotency и write plan партии | [packages/party-store/MODULE.md](../../packages/party-store/MODULE.md), `apps/game-server/src/infrastructure/postgres/` |
| сбои записи, конфликты версий и retry | [EDGE_CASES.md](EDGE_CASES.md) |
| runtime catalog pins и activation | [tools/runtime-catalog-activation/MODULE.md](../../tools/runtime-catalog-activation/MODULE.md) |
| цепочка хода и заполнения места | [ARCHITECTURE.md](ARCHITECTURE.md), [pipelines/turn.md](../pipelines/turn.md) |
