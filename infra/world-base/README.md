# World Base (PostgreSQL + NocoDB) — Schema v2 (layered map)

Read-only база **утверждённых** справочных данных мира: **50 таблиц** для Python import из пакета `БАЗА` и ручного аудита в NocoDB.

Код **не пишет** в PostgreSQL во время игры. Редактирование — через NocoDB UI и утверждённые import/audit процедуры. `npm run world-db:seed` применяет DDL (пустые таблицы). Каноническая загрузка данных — [IMPORT.md](./IMPORT.md).

Архитектура графа, **слоистая модель карты** (§12.5) и разделение read-only / party-баз: [read_only_database_and_graph_architecture.md](../../DOCUMENTS/documents-kg/corpus/DOCUMENTS/read_only_database_and_graph_architecture.md).

**Справочник полей:** [SCHEMA_REFERENCE.md](./SCHEMA_REFERENCE.md) (все 50 таблиц; `npm run world-db:schema-doc`).

> **Важно:** `world-db:seed` делает `DROP SCHEMA world_base CASCADE` и стирает импортированные строки. После Python import не запускайте seed без повторного import.

## Слои карты (кратко)

| Слой | Таблицы |
|------|---------|
| Базовая среда | `landscape_templates`, `region_landscape_templates` |
| Вода | `water_body_templates`, `region_water_body_templates` |
| Инфраструктура | `route_templates` (+ `graph_edges.route_template_id`) |
| Места | `place_templates`, `region_place_templates` |
| Хозяйство | `land_use_templates`, `region_land_use_templates` |
| Правила генерации мест | `region_place_generation_rules` (бывш. fat `region_place_templates`) |

## Быстрый старт

```bash
npm run world-db:up
npm run world-db:seed
npm run world-db:prepare-staging
npm run world-db:import:dry-run
npm run world-db:fk-audit:staged
npm run world-db:import:apply
npm run world-db:import:novgorod-regional:apply
npm run world-db:fk-audit:db
npm run party-db:seed
npm run new-game:preflight
node scripts/seed-world-base.js --check
npm run world-db:nocodb
```

Dev-only seed для отдельных XLSX-слоёв:

```bash
npm run world-db:export-landscapes
npm run world-db:seed-landscapes
npm run world-db:export-water-bodies
npm run world-db:seed-water-bodies
npm run world-db:export-routes
npm run world-db:seed-routes
npm run world-db:export-land-uses
npm run world-db:seed-land-uses
npm run world-db:export-places
npm run world-db:seed-places
npm run world-db:seed-llm-validation-landscape
```

Эти Node seed/export скрипты нужны для разработки отдельных XLSX. Они не заменяют Python importer пакета `БАЗА` и не должны запускаться поверх импортированной базы без осознанного re-import плана.

`--check` падает, если число таблиц ≠ 50.

## Каталог таблиц (50)

Полный порядок NocoDB — в [architecture doc § NocoDB](../../DOCUMENTS/documents-kg/corpus/DOCUMENTS/read_only_database_and_graph_architecture.md).

### Граф

`graph_scale_rules`, `graph_edge_modifiers`, `graph_nodes`, `graph_edges`, `graph_edge_knowledge_rules`

### Слои карты

`landscape_templates`, `region_landscape_templates`, `water_body_templates`, `region_water_body_templates`, `route_templates`, `land_use_templates`, `region_land_use_templates`, `place_templates`, `region_place_templates`

### Регион и места

`regions`, `region_neighbors`, `region_laws`, `region_economy`, …, `region_place_generation_rules`, `place_generation_limits`, `places`, `place_locations`, …

### История, шаблоны, мета

`historical_*`, `item_templates`, `building_templates`, `source_records`, `record_sources`, `audit_log`, `llm_*`, `region_gaps`

## npm-скрипты

| Скрипт | Действие |
|--------|----------|
| `npm run world-db:seed` | DROP + CREATE schema v2 |
| `npm run world-db:prepare-staging` | Desktop `БАЗА` → ignored staging + nested zip extraction |
| `npm run world-db:import:dry-run` | Python importer validation without DB writes |
| `npm run world-db:import:apply` | Python importer apply into `world_base` |
| `npm run world-db:fk-audit:staged` | FK audit по staging до записи |
| `npm run world-db:fk-audit:db` | FK audit по применённой DB |
| `npm run world-db:import:novgorod-regional:*` | Импорт оставшихся Новгородских runtime templates |
| `npm run party-db:seed` | Применить `infra/party-db` DDL и проверить MVP-таблицы |
| `npm run new-game:preflight` | Проверить `WORLD_DATA_SOURCE=postgres`, env, party seed, Novgorod G1-G4/world_base rows |
| `npm run world-db:schema-doc` | SCHEMA_REFERENCE.md + corpus copy |
| `node scripts/seed-world-base.js --check` | 50 таблиц, счётчики строк |
| `npm run world-db:export-landscapes` | xlsx → `landscape_templates.seed.json` (70 rows) |
| `npm run world-db:seed-landscapes` | 70 landscape_templates (upsert + delete stale ids) |
| `npm run world-db:export-water-bodies` | xlsx → `water_body_templates.seed.json` (41 rows) |
| `npm run world-db:seed-water-bodies` | 41 water_body_templates (upsert + delete stale ids) |
| `npm run world-db:export-routes` | xlsx → `route_templates.seed.json` (21 rows) |
| `npm run world-db:seed-routes` | 21 route_templates (upsert + delete stale ids) |
| `npm run world-db:export-land-uses` | xlsx → `land_use_templates.seed.json` (45 rows) |
| `npm run world-db:seed-land-uses` | 45 land_use_templates (upsert + delete stale ids) |
| `npm run world-db:export-places` | xlsx → `place_templates.seed.json` (64 rows) |
| `npm run world-db:seed-places` | 64 place_templates (upsert + delete stale ids) |
| `npm run world-db:seed-llm-validation-landscape` | 6 llm_validation_rules (берег/вода/G1) |

## Файлы

- `infra/world-base/schema.sql` — DDL (50 таблиц, `validate_template_region_link`)
- `infra/world-base/IMPORT.md` — порядок staging/import/audit пакета `БАЗА`
- `infra/world-base/field-descriptions.js` — глоссарий для генератора
- `scripts/generate-schema-reference.js` — генератор справочника
