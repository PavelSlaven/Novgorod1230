# world_base_importer_v1

Импортёр для загрузки текущих справочников и Новгородского пакета G1–G4 в PostgreSQL-схему `world_base`.

## Что импортируется

Пакет покрывает прямые таблицы, которые уже имеют готовые файлы и не требуют смысловой генерации кода:

1. `source_records`
2. `graph_scale_rules`
3. `graph_edge_modifiers`
4. `landscape_templates`
5. `water_body_templates`
6. `route_templates`
7. `land_use_templates`
8. `place_templates`
9. `regions` — паспорт Новгородской земли + минимальные FK-заглушки соседних регионов
10. `region_landscape_templates`
11. `region_water_body_templates`
12. `region_land_use_templates`
13. `region_place_templates`
14. `region_neighbors`
15. `region_social_roles`
16. `region_occupations`
17. `graph_nodes` — G1, G2, G3, G4
18. `graph_edges` — связи G1–G4
19. `historical_anchors` — G1-якоря

## Что намеренно не импортируется этим шагом

Этот импортёр не раскладывает сложные JSON-пакеты в таблицы событий, слухов, цен, NPC, предметов, погоды и конфликтов. Эти файлы требуют отдельного семантического маппинга, потому что код не должен сам решать, какая вложенная запись является отдельной игровой сущностью.

Оставлено на следующие этапы:

- `historical_events` / `historical_event_phases` / `historical_figures`;
- `item_templates`;
- `rumor_templates`;
- `conflict_templates`;
- `price_bands`;
- `seasonal_rules`;
- `weather_profiles`;
- `region_npc_generation_rules`;
- `region_npc_knowledge`;
- `llm_context_packs`.

## Установка зависимостей

```bash
python3 -m pip install pandas openpyxl psycopg[binary]
```

Для dry-run и генерации SQL достаточно `pandas` и `openpyxl`. Для прямой записи в PostgreSQL нужен `psycopg`.

## Dry-run

```bash
python3 scripts/import_world_base.py \
  --input-root /mnt/data \
  --mode dry-run \
  --report reports/world_base_import_report_v1.json
```

Dry-run читает все файлы из манифеста, нормализует строки, проверяет обязательные поля и staged-FK внутри импортируемого набора.

## Генерация SQL seed

```bash
python3 scripts/import_world_base.py \
  --input-root /mnt/data \
  --mode emit-sql \
  --output-sql world_base_seed_v1.sql \
  --report reports/world_base_import_report_v1.json
```

SQL использует `INSERT ... ON CONFLICT (id) DO UPDATE`. Для `graph_edges.reverse_edge_id` применяется двухфазная загрузка: сначала рёбра без self-FK, затем `UPDATE reverse_edge_id`.

## Прямая запись в PostgreSQL

```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/db" \
python3 scripts/import_world_base.py \
  --input-root /mnt/data \
  --mode apply \
  --report reports/world_base_import_report_v1.json
```

## Политика данных

Импортёр не придумывает новые исторические сведения. Он делает только технические преобразования:

- приводит `region_id` соседей к формату `region_*`, чтобы сработали FK;
- создаёт минимальные `regions`-заглушки для соседних регионов, потому что `region_neighbors.neighbor_region_id` требует FK;
- маппит русские группы социальных ролей/занятий в enum схемы, сохраняя исходное значение в `audit_notes`;
- неподдерживаемый `historical_anchor.anchor_type` переводит в `NULL`, сохраняя исходный тип в `audit_notes`;
- лишние поля не выбрасывает молча: они дописываются в `audit_notes` как `Importer preserved unmapped source fields`.

## Выходные файлы

- `world_base_import_manifest_v1.json` — список входных файлов и таблиц;
- `import_world_base.py` — основной импортёр;
- `world_base_import_report_v1.json` — отчёт dry-run;
- `world_base_seed_v1.sql` — SQL seed, если выбран `--mode emit-sql`.
