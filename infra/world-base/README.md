# World Base (PostgreSQL + NocoDB) — Schema v2

Read-only база утверждённых справочных данных мира: **62 таблицы** для ручного аудита и последующего утверждённого импорта.

Код игрового runtime не создаёт содержимое мира и не изменяет `world_base`. Канонический DDL хранится только в этом инфраструктурном контуре:

- [`schema.sql`](./schema.sql) — исполняемый entrypoint;
- [`schema/`](./schema/) — восемь упорядоченных SQL-частей;
- [`IMPORT.md`](./IMPORT.md) — правила импорта и аудита.

Архитектурное описание разделения read-only project DB и party DB пока находится в очереди побайтовой миграции в canonical knowledge corpus. До завершения переноса статус и SHA-256 источника фиксируются в [`MIGRATION_STATUS.md`](../../MIGRATION_STATUS.md). README не подменяет этот нормативный документ.

## Проверка схемы

```bash
npm run world-db:schema-check
```

Проверка подтверждает:

- наличие entrypoint;
- восемь SQL-частей в установленном порядке;
- 62 уникальные таблицы `world_base`;
- отсутствие небезопасных include-путей;
- запрет `PUBLIC CREATE`;
- наличие read-only роли и разрешений чтения.

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
| Социальный слой | `universal_social_classes`, `universal_social_role_archetypes`, `universal_occupation_archetypes`, `universal_skills`, `occupation_skill_defaults` |
| История и источники | `historical_*`, `source_records`, `record_sources`, `audit_log` |

## Источник истины

`infra/world-base/schema.sql` и восемь файлов `infra/world-base/schema/*.sql` являются единственным исполняемым источником истины для структуры базы.

Справочник полей не должен редактироваться вручную или существовать как независимая нормативная копия. Его генератор и `SCHEMA_REFERENCE.md` ещё не восстановлены в этой ветке. До их восстановления README не объявляет несуществующую команду или файл доступными.

## Ограничения

- DDL создаёт структуру, но не сочиняет и не заполняет мир.
- Любой импорт данных должен использовать утверждённый пакет и отдельную процедуру проверки.
- Runtime получает только чтение.
- Состояние конкретной партии хранится отдельно от `world_base`.
- Нельзя добавлять смысловые default-значения, которые процедурно создают факты мира.
