# World Base (PostgreSQL + NocoDB) — Schema v2

Read-only база утверждённых справочных данных мира: **107 таблиц** для ручного аудита, materialization profiles/rules и утверждённого импорта.

Код игрового runtime не создаёт категории или историю и не изменяет `world_base`; он материализует party instances из активных записей. Канонический DDL хранится только в этом инфраструктурном контуре:

- [`schema.sql`](./schema.sql) — исполняемый entrypoint;
- [`schema/`](./schema/) — одиннадцать упорядоченных SQL-частей;
- [`IMPORT.md`](./IMPORT.md) — правила импорта и аудита.

Архитектурное описание разделения read-only project DB и party DB хранится в canonical knowledge corpus как `read_only_database_and_graph_architecture.md`. README не подменяет этот нормативный документ.

## Проверка схемы

```bash
npm run world-db:schema-check
npm run world-db:schema-doc
npm run world-db:schema-doc-check
```

Проверка подтверждает:

- наличие entrypoint;
- одиннадцать SQL-частей в установленном порядке;
- 107 уникальных таблиц `world_base`;
- отсутствие небезопасных include-путей;
- запрет `PUBLIC CREATE`;
- наличие read-only роли и разрешений чтения.

`world-db:schema-doc` детерминированно строит [`SCHEMA_REFERENCE.md`](./SCHEMA_REFERENCE.md) из текущего DDL. Таблицы, колонки, типы, FK и constraints извлекаются из SQL; смысловые описания берутся только из [`field-descriptions.js`](./field-descriptions.js). Неописанные поля остаются явно неописанными.

GitHub Actions дополнительно исполняет весь entrypoint в PostgreSQL 16 с `ON_ERROR_STOP=1`, подтверждает 107 таблиц, роль `world_reader`, `USAGE`/`SELECT` и отсутствие `CREATE`/write grants.

## Слои данных

| Слой | Основные таблицы |
|---|---|
| Граф и карта | `graph_scale_rules`, `graph_edge_modifiers`, `graph_nodes`, `graph_edges`, `graph_edge_knowledge_rules` |
| Базовая среда | `landscape_templates`, `region_landscape_templates` |
| Вода | `water_body_templates`, `region_water_body_templates` |
| Инфраструктура | `route_templates`, ссылки из `graph_edges` |
| Места | `place_templates`, `region_place_templates`, `places`, `place_locations` |
| Хозяйство | `land_use_templates`, `region_land_use_templates` |
| Регион | `regions`, `region_neighbors`, `region_laws`, `region_economy` |
| Социальный слой | `social_classes`, `social_role_archetypes`, `occupation_archetypes`, `skill_catalog`, `occupation_skill_defaults` |
| История и источники | `historical_*`, `source_records`, `record_sources`, `audit_log` |

## Источник истины

`infra/world-base/schema.sql` и одиннадцать файлов `infra/world-base/schema/*.sql` являются единственным исполняемым источником истины для структуры базы.

Справочник полей является generated representation и не должен редактироваться вручную или существовать как независимая нормативная копия. Единственный исполняемый источник структуры — текущий DDL; `field-descriptions.js` владеет только утверждёнными пояснениями.

## Ограничения

- DDL создаёт структуру, но не сочиняет и не заполняет мир.
- Любой импорт данных должен использовать утверждённый пакет и отдельную процедуру проверки.
- Runtime получает только чтение.
- Состояние конкретной партии хранится отдельно от `world_base`.
- Нельзя добавлять смысловые default-значения, которые процедурно создают факты мира.
