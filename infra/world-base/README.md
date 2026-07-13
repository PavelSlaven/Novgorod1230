# World Base (PostgreSQL + NocoDB) — Schema v2 (layered map)

Read-only база **утверждённых** справочных данных мира: **62 таблицы** для Python import из пакета `БАЗА` и ручного аудита в NocoDB.

Код **не пишет** в PostgreSQL во время игры. Редактирование — через NocoDB UI и утверждённые import/audit процедуры. `npm run world-db:seed` применяет DDL (пустые таблицы). Каноническая загрузка данных — [IMPORT.md](./IMPORT.md).

Архитектура графа, **слоистая модель карты** и разделение read-only / party-баз: [READ_ONLY_DATABASE_AND_GRAPH_ARCHITECTURE.md](../../docs/normative/READ_ONLY_DATABASE_AND_GRAPH_ARCHITECTURE.md).

**Справочник полей:** [SCHEMA_REFERENCE.md](./SCHEMA_REFERENCE.md) (все 62 таблицы; `npm run world-db:schema-doc`).

> **Важно:** `world-db:seed` делает `DROP SCHEMA world_base CASCADE` и стирает импортированные строки. После Python import не запускайте seed без повторного import.

## Слои карты

| Слой | Таблицы |
|------|---------|
| Базовая среда | `landscape_templates`, `region_landscape_templates` |
| Вода | `water_body_templates`, `region_water_body_templates` |
| Инфраструктура | `route_templates` и `graph_edges.route_template_id` |
| Места | `place_templates`, `region_place_templates` |
| Хозяйство | `land_use_templates`, `region_land_use_templates` |
| Правила генерации мест | `region_place_generation_rules` |
| Универсальный социальный слой | `universal_social_classes`, `universal_social_role_archetypes`, `universal_occupation_archetypes`, `universal_skills`, `occupation_skill_defaults` |

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

`--check` падает, если число таблиц не равно 62.

## Каталог таблиц

Полный состав и порядок полей определяют `schema.sql` и генерируемый `SCHEMA_REFERENCE.md`.

### Граф

`graph_scale_rules`, `graph_edge_modifiers`, `graph_nodes`, `graph_edges`, `graph_edge_knowledge_rules`

### Слои карты

`landscape_templates`, `region_landscape_templates`, `water_body_templates`, `region_water_body_templates`, `route_templates`, `land_use_templates`, `region_land_use_templates`, `place_templates`, `region_place_templates`

### Регион и места

`regions`, `region_neighbors`, `region_laws`, `region_economy`, `region_place_generation_rules`, `place_generation_limits`, `places`, `place_locations` и связанные таблицы.

### История, социальный слой, шаблоны и мета

`historical_*`, `universal_*`, `occupation_skill_defaults`, `item_templates`, `building_templates`, `source_records`, `record_sources`, `audit_log`, `llm_*`, `region_gaps`.

## Основные команды

| Скрипт | Действие |
|--------|----------|
| `npm run world-db:seed` | DROP + CREATE schema v2 |
| `npm run world-db:prepare-staging` | утверждённый пакет `БАЗА` → ignored staging |
| `npm run world-db:import:dry-run` | validation без записи в DB |
| `npm run world-db:import:apply` | импорт в `world_base` |
| `npm run world-db:fk-audit:staged` | FK-аудит staging до записи |
| `npm run world-db:fk-audit:db` | FK-аудит применённой DB |
| `npm run world-db:import:novgorod-regional:*` | импорт региональных runtime-шаблонов |
| `npm run party-db:seed` | применить DDL party-базы |
| `npm run new-game:preflight` | проверить готовность `world_base`, party DB и входов новой игры |
| `npm run world-db:schema-doc` | пересобрать `SCHEMA_REFERENCE.md` и корпусную копию |
| `node scripts/seed-world-base.js --check` | проверить 62 таблицы и счётчики строк |

## Файлы

- `infra/world-base/schema.sql` — канонический DDL 62 таблиц;
- `infra/world-base/SCHEMA_REFERENCE.md` — генерируемый справочник схемы;
- `infra/world-base/IMPORT.md` — порядок staging/import/audit;
- `infra/world-base/field-descriptions.js` — глоссарий генератора;
- `scripts/generate-schema-reference.js` — генератор справочника.
