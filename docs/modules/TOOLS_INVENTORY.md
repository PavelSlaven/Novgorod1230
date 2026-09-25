# Tools inventory

REFERENCE. Список каталогов `tools/*` на ветке; описание — из `tools/*/MODULE.md` (если есть)
или имя пакета из `tools/*/package.json`. Числа таблиц/миграций сюда не копируются —
см. [DB_SCHEMA](../context/DB_SCHEMA.md) и [MODULE_INDEX](../../MODULE_INDEX.md).

Скрипт сверки (вне репо): перечислить `tools/*/`, прочитать `package.json` + первую строку
«Назначение»/Purpose в `MODULE.md`. Ниже — результат на commit карты.

| Каталог | Пакет | Назначение (из MODULE.md / имя) |
|---|---|---|
| `architecture` | (нет package name) | `check-boundaries.mjs` и др. — `npm run architecture:check` |
| `audit-tools` | `@rus/audit-tools` | Безопасная инвентаризация release/audit trees |
| `cutover` | `@rus/cutover` | 13-шаговый cutover legacy → modular |
| `db-tools` | `@rus/db-tools` | Контракты dry-run/approval для DB operations |
| `docs-tools` | `@rus/docs-tools` | Генерация/проверка документации и corpus |
| `finalization` | `@rus/finalization` | Финализация миграции / evidence |
| `llm-runtime-eval` | llm-runtime-eval | Eval harness (без MODULE.md) |
| `local-play` | local-play | `npm run play:local` launcher |
| `map-maker` | `@rus/map-maker` | Редактор графов G0–G5 |
| `release` | release | Release hygiene (без MODULE.md) |
| `runtime-catalog-activation` | `@rus/runtime-catalog-activation-tooling` | Operator import/activation catalog |
| `rus13-llm-repair-audit` | — | Authoring audit (без MODULE.md) |
| `rus13-new-party-generator` | — | Authoring generator (без MODULE.md) |
| `rus13-novgorod-place-generation-limits` | — | Authoring limits (без MODULE.md) |
| `rus13-novgorod-place-generation-rules` | — | Authoring rules (без MODULE.md) |
| `rus13-novgorod-regional-templates` | — | Regional templates (без MODULE.md) |
| `rus13-social-archetype-backfill` | — | Social backfill (без MODULE.md) |
| `rus13-start-g5-materialization` | — | G5 materialization tooling (без MODULE.md) |
| `rus13-world-base-fk-audit` | — | FK audit helper (без MODULE.md) |
| `rus13-world-base-importer` | — | World-base importer (без MODULE.md) |
| `shadow-run` | `@rus/shadow-run` | Old/new parity corpus |
| `spatial-v3` | spatial-v3 | Spatial v3 checks/generators (без корневого MODULE.md) |
| `temporal-v4` | temporal-v4 | Temporal v4 checks (без корневого MODULE.md) |
| `world-catalog-workflow` | `@rus/world-catalog-workflow` | Ревизии карты / G1; также читается stages new-game (LW-038) |

**Всего каталогов `tools/*`:** 24 (скрипт `fs.readdirSync('tools')`).

Production runtime **не импортирует** tools, кроме исключения LW-038 (`world-catalog-workflow` из
отдельных стадий `@rus/new-game`).

Связанные корневые скрипты схемы (не tools): `scripts/check-world-base-schema.mjs`,
`scripts/generate-world-base-schema-reference.mjs` — числа таблиц только в DB_SCHEMA / CI.

## CI contract

`.github/workflows/test.yml` — матрица suite; обязательные schema gates на `fast`:
`world-db:schema-check`, `world-db:schema-doc-check`, DDL + table count (см. DB_SCHEMA / TESTING).
`test/integration/ci-workflow-contract.test.js` ловит выпадение gates.
