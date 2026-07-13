# world_base_fk_audit_v1

Пакет проверяет ссылочную целостность после сборки `world_base`.

## Что проверяется

1. Прямые FK-ссылки между импортируемыми таблицами.
2. JSON-массивы ссылок: secondary landscape/water, land_use, allowed roles/occupations.
3. `sources[]` против `source_records.id`.
4. Условные правила `graph_edges`:
   - `road/path/forest_track/winter_road/portage/corridor_segment` требуют `route_template_id`;
   - `river/lake_route/sea_route/ford/ferry/bridge` требуют `water_body_template_id`;
   - `offroad_crossing` требует `landscape_template_id`.
5. Обязательные поля G1 `region_cell`.

## Staged-аудит без PostgreSQL

```bash
cd world_base_fk_audit_v1
python3 scripts/audit_world_base_fk.py \
  --mode staged \
  --input-root /mnt/data \
  --importer-root /mnt/data/world_base_importer_v1 \
  --out-json reports/world_base_fk_audit_report_v1.json \
  --out-md reports/world_base_fk_audit_report_v1.md \
  --out-violations-csv reports/world_base_fk_violations_v1.csv \
  --out-rule-summary-csv reports/world_base_fk_rule_summary_v1.csv
```

## Аудит реальной PostgreSQL-базы

```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/db" \
python3 scripts/audit_world_base_fk.py \
  --mode database \
  --out-json reports/world_base_fk_audit_db_report_v1.json \
  --out-md reports/world_base_fk_audit_db_report_v1.md
```

Также можно выполнить SQL-запросы из `sql/world_base_fk_audit_queries_v1.sql`. Каждый запрос должен вернуть 0 строк.

## Политика

Скрипт не создаёт сущности мира и не исправляет данные. Он только сообщает, где ссылка не разрешается или где нарушено условное правило схемы.
