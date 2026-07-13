# party_database_v1

Назначение: изменяемая база состояния одной партии исторической текстовой RPG RUS13.

Основа схемы:

- read-only `world_base` хранит канонический мир и справочники;
- `party` хранит только то, что уже материализовано, изменено, известно персонажу или произошло в конкретной партии;
- код не создаёт смысловые сущности мира, а только хранит, валидирует и фиксирует принятый результат LLM-процедур;
- скрытое состояние отделено от видимого, чтобы агент прозы получал только безопасный видимый пакет.

## Состав пакета

- `schema/party_database_schema_v1.sql` — PostgreSQL DDL.
- `schema/party_database_schema_v1.sql.gz` — сжатый DDL.
- `schema/party_database_schema_v1.json` — машинночитаемое описание схемы.
- `party_database_schema_v1.xlsx` — человекочитаемый справочник таблиц, полей, enum и правил.
- `party_database_tables_v1.csv` — список таблиц.
- `party_database_columns_v1.csv` — список полей.
- `party_database_enums_v1.csv` — допустимые значения enum/check.
- `party_database_relationships_v1.csv` — связи таблиц.
- `party_database_validation_rules_v1.csv` — обязательные правила валидации.
- `reports/party_database_schema_report_v1.md` — сводный отчёт.

## Запуск DDL

```bash
psql "$PARTY_DATABASE_URL" -f schema/party_database_schema_v1.sql
```

## Важное ограничение

В отдельной party-базе нельзя делать SQL FK на `world_base`, если `world_base` находится в другой физической базе данных. Поэтому `canonical_*_id`, `region_id`, `template_id`, `social_role_id`, `occupation_id` являются логическими ссылками на read-only базу и проверяются импортёром/валидатором, а не обычным FK.

## Минимальный MVP-набор

Для старта партии обязательны:

1. `party_state`
2. `party_player_characters`
3. `party_graph_nodes`
4. `party_graph_edges`
5. `party_places`
6. `party_locations`
7. `party_minilocations`
8. `party_scene_anchors`
9. `party_current_position`
10. `party_map_knowledge`
11. `party_npcs`
12. `party_items`
13. `party_inventory_entries`
14. `party_events`
15. `party_turns`
16. `party_journal_entries`

`party_llm_steps` и `party_validation_issues` нужны для repair/audit pipeline и отладки.
