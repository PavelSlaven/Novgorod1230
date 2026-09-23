# Карта баз данных

> status: REFERENCE / DOMAIN GUIDE; при конфликте действует governing-корпус (AGENTS.md) или профильный контракт. Проверено: 2026-09-23.

Это карта: где лежит схема, кто ей владеет и где проверять. Нормы здесь не повторяются.
Правила записи, причинности, атомарности и replay — [AGENTS.md §14](../governance/ARCHITECTURE_INVARIANTS.md) (сохранение
причинности) и §23 (persistence, concurrency и БД). Статусы документов — [CONTRACT_INDEX](../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md).
Если утверждение ниже расходится с кодом, прав код; расхождение нужно сообщить.

## 1. Три схемы PostgreSQL

| Схема | Назначение | Где лежит DDL | Кто пишет |
|---|---|---|---|
| `world_base` | утверждённые справочные данные мира, read-only для runtime | [schema.sql](../../infra/world-base/schema.sql) + части `infra/world-base/schema/01.sql`–`21.sql` | только утверждённый импорт (`world-db:import:*`), не runtime |
| `party_runtime` | состояние конкретной партии | `schemas/party-db/` 001–033; [справочник](../../infra/party-db/SCHEMA_REFERENCE.md) | единственный physical transaction owner — `@rus/game-server` |
| `operator_control` | append-only журнал событий operator cutover | [001_lower_dvina_v3_cutover_events.sql](../../infra/operator-control/001_lower_dvina_v3_cutover_events.sql) | только operator tooling |

Подключение: `RUS_WORLD_DATABASE_URL` (или `DATABASE_URL`) и `RUS_PARTY_DATABASE_URL` (или `PARTY_DATABASE_URL`),
отдельные пулы — [config.js](../../apps/game-server/src/infrastructure/postgres/config.js).
Архитектура разделения read-only базы мира и базы партии —
[spatial_v3_target_read_only_database_and_graph_architecture.md](../../data/knowledge-source/corpus/DOCUMENTS/spatial_v3_target_read_only_database_and_graph_architecture.md)
(active по AGENTS §20); прежний [read_only_database_and_graph_architecture.md](../../data/knowledge-source/corpus/DOCUMENTS/read_only_database_and_graph_architecture.md) —
migration/rollback source.

## 2. `world_base` (read-only)

- **Entrypoint:** [schema.sql](../../infra/world-base/schema.sql) подключает 21 часть через `\ir schema/NN.sql`
  и снимает `CREATE` на схеме с `PUBLIC`.
- **Число таблиц: 201.** Проверяется в двух местах:
  - [check-world-base-schema.mjs](../../scripts/check-world-base-schema.mjs): `EXPECTED_TABLE_COUNT = 201`
    (`npm run world-db:schema-check`);
  - [test.yml](../../.github/workflows/test.yml), шаг «Execute world_base DDL in PostgreSQL»: DDL
    исполняется в `postgres:16`, затем `test "$table_count" -eq 201`. Там же проверяется роль `world_reader`:
    не superuser, есть `USAGE`, нет `CREATE`, `SELECT` на каждую таблицу, других грантов нет.
    Шаг идёт только в профиле `full`; для `pull_request` профиль всегда `full`.
- **Read-only порт:** [packages/world-base/MODULE.md](../../packages/world-base/MODULE.md): `createWorldBaseReader`
  отклоняет mutating SQL до вызова adapter. Production reader — `spatial-v3-world-base-reader.js` в
  `apps/game-server/src/infrastructure/postgres/`.
- **Импорт и аудит:** [IMPORT.md](../../infra/world-base/IMPORT.md); контракты operation plan —
  [tools/db-tools/MODULE.md](../../tools/db-tools/MODULE.md).
- **Описания полей:** только из [field-descriptions.js](../../infra/world-base/field-descriptions.js);
  справочник генерируется, вручную его не правят.
- ⚠ PR #98 меняет: добавляет в `schema/21.sql` таблицу `world_base.procedural_scene_compiled_records`,
  число таблиц становится 202 (в `check-world-base-schema.mjs`, `test.yml` и `SCHEMA_REFERENCE.md`).

### Поиск по SCHEMA_REFERENCE

[SCHEMA_REFERENCE.md](../../infra/world-base/SCHEMA_REFERENCE.md) весит около 559 КБ. Целиком его не читают.
Это generated-файл (`npm run world-db:schema-doc`, проверка — `world-db:schema-doc-check`).

```powershell
rg '^## ' infra/world-base/SCHEMA_REFERENCE.md          # 21 группа таблиц
rg -n '^### `world_base\.graph_' infra/world-base/SCHEMA_REFERENCE.md   # таблицы по префиксу
rg -n -A 30 '^### `world_base\.graph_nodes`' infra/world-base/SCHEMA_REFERENCE.md
```

Группы (`## `): граф, ландшафт, вода, инфраструктура, хозяйство, места, социальный слой, региональная рамка,
история, шаблоны, мета/LLM, Materialization v2 (категории, NPC-профили, G4/G5, предметы, решения),
Spatial v3 (authoring core, orientation/routes, scene closure), Temporal World v4, «без группы».
Каждая таблица — заголовок `### `; их 201.

## 3. `party_runtime`

- **Файлы:** `schemas/party-db/` — от [001_party_runtime.sql](../../schemas/party-db/001_party_runtime.sql)
  до `033_party_runtime_initial_semantic_decision.sql`, без пропусков.
- **Порядок и состав цепочки** задаёт не имя файла, а массив `files` в
  [spatial-v3-target-migrations.js](../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js).
  Оттуда же:
  - `SPATIAL_V3_TARGET_MIGRATION_FILES` — имена SQL-файлов в порядке исполнения;
  - `SPATIAL_V3_TARGET_MIGRATIONS` — тексты SQL в порядке `files`;
  - `SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST` — sha256 от номера, имени и содержимого каждого файла;
  - `runSpatialV3TargetMigrations` — применяет цепочку в одной транзакции.
- **Когда применяется.** При каждом старте production composition
  ([production-spatial-v3.js](../../apps/game-server/src/composition/production-spatial-v3.js)). Если в
  `party_runtime.schema_migrations` уже есть запись catalog-миграции release, первые 11 файлов
  пропускаются (`CATALOG_MIGRATION_COVERED_TARGET_COUNT = 11`), остальные исполняются заново (`extended_existing`);
  без такой записи заново исполняется вся цепочка (`applied`). Число файлов и digest сверяются с release; при
  расхождении — `SPATIAL_V3_MIGRATION_CHAIN_MISMATCH`, при несовпадающей записи — `SPATIAL_V3_MIGRATION_LEDGER_MISMATCH`.
- **`schema_migrations` и catalog pins** создаёт не эта цепочка, а operator tooling:
  [001_runtime_catalog_pins.sql](../../tools/runtime-catalog-activation/migrations/party/001_runtime_catalog_pins.sql)
  ([MODULE.md](../../tools/runtime-catalog-activation/MODULE.md)).
- **Legacy:** [migrations.js](../../apps/game-server/src/infrastructure/postgres/migrations.js)
  (`runPartyRuntimeMigrations`) применяет только `001` как `party_runtime_v2`.
- **Логическая граница записи:** [packages/party-store/MODULE.md](../../packages/party-store/MODULE.md).
  `@rus/party-store` проверяет и передаёт утверждённые write plans через внедрённую транзакцию, но SQL и драйвер
  ему не принадлежат. SQL и физическая транзакция — `apps/game-server/src/infrastructure/postgres/`.
- **Справочник таблиц:** [SCHEMA_REFERENCE.md](../../infra/party-db/SCHEMA_REFERENCE.md)
  генерируется `npm run docs:generate` из упорядоченных миграций; `npm run docs:check` проверяет
  его актуальность. Для каждой таблицы приведены SQL-определения `CREATE TABLE`, `ALTER TABLE` и
  `CREATE INDEX` в порядке исполнения; полный SQL, включая удаления и условные блоки, сохранён в конце справочника.
  Итоговые поля и ограничения определяет исполняемый SQL.
- ⚠ PR #98 меняет: добавляет `034_party_runtime_actor_base_attributes.sql`
  (`ALTER TABLE party_runtime.party_actor_profile_bindings ADD COLUMN IF NOT EXISTS attribute_profile_snapshot jsonb`),
  34-ю строку в `files` и, следовательно, `SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST`.

## 4. `operator_control`

Одна таблица `operator_control.lower_dvina_v3_cutover_events`. Она append-only: триггер вызывает
`reject_cutover_event_mutation`, ошибка `55000`. Пишет и читает её только operator cutover
([lower-dvina-v3-production-cutover.js](../../tools/runtime-catalog-activation/src/lower-dvina-v3-production-cutover.js),
запуск — [run-lower-dvina-v3-production-cutover.mjs](../../scripts/run-lower-dvina-v3-production-cutover.mjs)).
Runtime игры её не использует. Новые файлы сюда — только в рамках operator-задачи.

## 5. Как добавить миграцию party_runtime

Это описание того, как делает текущий код и PR #98, а не новая норма.

1. Создать новый файл `schemas/party-db/NNN_party_runtime_<смысл>.sql` со следующим номером
   (сейчас это `034`, но его занимает PR #98 — сверить с `main` и открытыми PR).
2. Добавить имя файла **в конец** массива `files` в `spatial-v3-target-migrations.js`. Порядок массива и есть
   порядок применения.
3. SQL каждого файла должен быть **идемпотентным** (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS` и т. п.): при
   каждом старте заново исполняется хвост цепочки или, без записи release, вся цепочка (§3). Так сделан 034 в PR #98; тест прямо проверяет «restart re-apply».
4. Обновить тест порядка цепочки
   [first-playable-party-migration.test.js](../../test/spatial-v3/first-playable-party-migration.test.js)
   (сейчас он ожидает длину 33).
5. Перегенерировать `generated/schema-reference.{json,md}` через `npm run docs:generate` — там записаны
   sha256 каждого SQL-файла. Проверка — `npm run docs:check`.
6. **Уже существующие файлы миграций не правят.** Их байты входят в `SPATIAL_V3_TARGET_MIGRATION_CHAIN_DIGEST`
   (он сверяется с release и отдаётся в health) и в `generated/schema-reference.*`. В коде нет отдельного
   запрета, но изменение старого файла — это смена уже применённой истории
   (см. LW-011 в `docs/work/LEGACY_WARNINGS.md`).
7. Если меняется persistence semantics — нужен PostgreSQL integration test и независимый аудит
   (AGENTS §24, §25, §25.1).

Изменение `world_base` DDL — это отдельный путь: часть в `infra/world-base/schema/`, затем обновить
`EXPECTED_TABLE_COUNT`, число в `test.yml`, `field-descriptions.js` и `npm run world-db:schema-doc`.
Именно так делает PR #98.

## 6. Только тестовая БД

Правило — [AGENTS.md §23](../governance/ARCHITECTURE_INVARIANTS.md): migrations, import, seed и tests никогда не направляются в
operator/production базу. Как это устроено сейчас:

- PostgreSQL-тесты поднимают одноразовый контейнер `postgres:16-alpine` и в `t.after` удаляют его через
  `docker rm -f` (пример: [p13-party-runtime-postgres.test.js](../../test/spatial-v3/p13-party-runtime-postgres.test.js)).
  Без Docker тест пропускается (`t.skip`). Требование удалять anonymous volumes — AGENTS §26.1.
- CI использует собственный `postgres:16` и базу `world_base_ci` ([test.yml](../../.github/workflows/test.yml)).
- `npm run play:local` поднимает свой embedded PostgreSQL (`tools/local-play/`).
- Скрипты `world-db:import:apply`, `world-db:seed`, `party-db:seed` и operator CLI пишут в ту базу, которую
  им передали. Запускать их можно только против локальной или тестовой базы; operator apply — только по
  прямой operator-задаче.

## 7. Куда смотреть дальше

| Вопрос | Владелец |
|---|---|
| смысл таблиц и полей `world_base` | [SCHEMA_REFERENCE.md](../../infra/world-base/SCHEMA_REFERENCE.md), [world_base_materialization_table_requirements.md](../../data/knowledge-source/corpus/DOCUMENTS/world_base_materialization_table_requirements.md) |
| CAS, idempotency и write plan партии | [packages/party-store/MODULE.md](../../packages/party-store/MODULE.md), `apps/game-server/src/infrastructure/postgres/` |
| сбои записи, конфликты версий и retry | [EDGE_CASES.md](EDGE_CASES.md) |
| runtime catalog pins и activation | [tools/runtime-catalog-activation/MODULE.md](../../tools/runtime-catalog-activation/MODULE.md) |
