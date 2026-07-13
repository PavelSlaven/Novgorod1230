<!-- Сгенерировано scripts/generate-schema-reference.js — не редактировать вручную -->

# Справочник схемы world_base

Схема PostgreSQL `world_base`: **62** read-only таблиц для ручного заполнения в NocoDB.

Каноническая архитектура: [read_only_database_and_graph_architecture.md](../../DOCUMENTS/documents-kg/corpus/DOCUMENTS/read_only_database_and_graph_architecture.md).

DDL: [schema.sql](./schema.sql). Регенерация: `npm run world-db:schema-doc`.

---

## Общие поля

Многие справочные таблицы повторяют этот набор. `status` — рабочий процесс; `confidence` — эпистемическая уверенность.

| Поле | Назначение |
|------|------------|
| `id` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `slug` | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | Человекочитаемое название записи. |
| `summary` | Краткое содержание: что это и зачем в игре. |
| `region_id` | FK → regions(id): регион, к которому относится запись. |
| `game_use` | Как игровой код и LLM должны использовать эту запись. |
| `limits` | Ограничения применения; что нельзя выводить из записи. |
| `status` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | Время создания записи (UTC). |
| `updated_at` | Время последнего изменения (обновляется триггером). |

**status:** draft, usable_with_caution, approved, needs_review, conflict, rejected

**confidence:** unknown, low, medium_low, medium, medium_high, high

## Граф (каноническая карта)

### `graph_scale_rules`

Правила масштаба графа G0–G5: единицы измерения, типичные рёбра, использование GU и минут.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `scale_level` | `TEXT` | NOT NULL; CHECK: G0, G1, G2, G3, G4, G5 | G0–G5: уровень вложенности графа. |
| `title` | `TEXT` | — | Человекочитаемое название записи. |
| `unit` | `TEXT` | — | Единица измерения на уровне (route_chain, GU, minutes, …). |
| `typical_edge_min` | `NUMERIC` | — | Нижняя граница типичного ребра на уровне. |
| `typical_edge_max` | `NUMERIC` | — | Верхняя граница типичного ребра. |
| `time_unit` | `TEXT` | — | Поле «time_unit» таблицы graph_scale_rules; см. architecture doc. |
| `uses_gu` | `BOOLEAN` | NOT NULL; DEFAULT false | Использует ли уровень graph units. |
| `uses_minutes` | `BOOLEAN` | NOT NULL; DEFAULT false | Использует ли уровень минуты. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `graph_edge_modifiers`

Модификаторы времени и риска пути: сезон, погода, груз, местность, транспорт.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `title` | `TEXT` | — | Человекочитаемое название записи. |
| `modifier_type` | `TEXT` | CHECK: terrain, season, weather, load, access, visibility, stealth, injury, transport, risk | Тип модификатора: terrain, season, weather, load, access, visibility, … |
| `applies_to_edge_type` | `TEXT` | — | К каким edge_type применяется. |
| `applies_to_terrain_type` | `TEXT` | — | К какой местности применяется. |
| `applies_to_season` | `TEXT` | — | К какому сезону применяется. |
| `multiplier` | `NUMERIC` | — | Множитель к базовому времени/риску ребра. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `example` | `TEXT` | — | Поле «example» таблицы graph_edge_modifiers; см. architecture doc. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `graph_nodes`

Канонические узлы карты: G1 — дневные ячейки региона; G2–G5 — вложенные узлы, места, локации, точки сцены.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `slug` | `TEXT` | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | — | Человекочитаемое название записи. |
| `node_type` | `TEXT` | CHECK: world_region, subregion, place, location, minilocation, scene_anchor, route_junction, river_junction, ford, ferry, gate, road_segment, water_segment, border_crossing, sea_crossing, mountain_pass, desert_oasis, steppe_camp, region_cell, cell_subgraph, map_corridor, geographic_landmark, historical_landmark | Тип узла: world_region, region_cell, place, location, scene_anchor, ford, … |
| `scale_level` | `TEXT` | CHECK: G0, G1, G2, G3, G4, G5 | Уровень графа: G0 (регион) … G5 (точка сцены). |
| `parent_node_id` | `TEXT` | FK → graph_nodes(id) | FK → graph_nodes(id): родительский узел графа. |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `place_id` | `TEXT` | FK → places(id) | FK → places(id): конкретное место, если применимо. |
| `grid_x` | `INTEGER` | — | Координата X в сетке G1-ячеек региона. |
| `grid_y` | `INTEGER` | — | Координата Y в сетке G1-ячеек региона. |
| `grid_z` | `INTEGER` | NOT NULL; DEFAULT 0 | Вертикальный/слойный индекс; для поверхности = 0. |
| `region_cell_code` | `TEXT` | — | Человекочитаемый код ячейки (напр. nov_06_04). |
| `cell_shape` | `TEXT` | CHECK: square, partial, irregular, water, border | Форма ячейки: square, partial, irregular, water, border. |
| `region_cell_status` | `TEXT` | CHECK: active, partial, border, outside_region, water_only | Статус ячейки в сетке: active, partial, border, outside_region, water_only (не путать с status записи). |
| `cell_size_km` | `NUMERIC` | — | Размер стороны G1-ячейки в км (обычно ~32). |
| `crossing_base_gu` | `NUMERIC` | — | Базовая стоимость пересечения ячейки в GU (1 GU ≈ 4 км, 1 ч пешком). |
| `crossing_base_time_hours` | `NUMERIC` | — | Базовое время пересечения ячейки в часах при нормальных условиях. |
| `primary_landscape_template_id` | `TEXT` | FK → landscape_templates(id) | FK → landscape_templates(id): основной ландшафт узла; для G1 region_cell обязателен; должен быть в region_landscape_templates региона. |
| `secondary_landscape_template_ids` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON: id дополнительных landscape_templates для смешанного ландшафта. |
| `landscape_mix_notes` | `TEXT` | — | Пояснение смеси primary и secondary ландшафтов (не замена FK). |
| `primary_water_body_template_id` | `TEXT` | FK → water_body_templates(id) | FK → water_body_templates(id): главный водный объект/среда узла. |
| `secondary_water_body_template_ids` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON: дополнительные water_body_templates; смешение воды — через primary/secondary, не landscape_group. |
| `hydrology_notes` | `TEXT` | — | Текстовое пояснение водной ситуации: где вода в ячейке, сезонность, брод/пристань на G2. Обязателен при primary_water_body_template_id на G1. |
| `land_use_template_ids` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON: хозяйственное использование узла (пашня, покос, …); не landscape_template. |
| `place_template_id` | `TEXT` | FK → place_templates(id) | FK → place_templates(id): тип места/поселения, если узел — place; проверка через region_place_templates. |
| `terrain_profile` | `TEXT` | — | Legacy/editor hint: профиль местности; источник истины — FK на шаблоны слоёв. |
| `water_profile` | `TEXT` | — | Legacy/editor hint: водные объекты; источник истины — water_body_template FK/JSON. |
| `road_profile` | `TEXT` | — | Legacy/editor hint: дороги в узле; источник истины — graph_edges + route_templates. |
| `settlement_density` | `TEXT` | — | Legacy/editor hint: плотность поселений; источник истины — place_template_id / places. |
| `dominant_content` | `TEXT` | — | Legacy/editor hint: что преобладает; источник истины — FK/JSON шаблонов слоёв. |
| `known_landmarks` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON: известные ориентиры в узле. |
| `canonical_corridors` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON: канонические коридоры движения через узел. |
| `neighbor_node_ids` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON: id соседних graph_nodes. Не источник истины; кеш/подсказка для редактора. Истина о связях — в graph_edges. |
| `historical_status` | `TEXT` | — | Поле «historical_status» таблицы graph_nodes; см. architecture doc. |
| `is_known_to_player_default` | `BOOLEAN` | NOT NULL; DEFAULT false | Известен ли узел игроку по умолчанию (канон, не партия). |
| `is_known_to_character_default` | `BOOLEAN` | NOT NULL; DEFAULT false | Известен ли узел персонажу по умолчанию. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- G1 + region_cell: обязательны grid_x, grid_y, grid_z, cell_size_km, crossing_base_gu, crossing_base_time_hours, region_cell_status, primary_landscape_template_id.

**Индексы:**

- `UNIQUE (region_id, grid_x, grid_y, grid_z) WHERE scale_level = 'G1' AND node_type = 'region_cell'`

### `graph_edges`

Канонические связи карты: дороги, реки, переходы между ячейками, коридоры, волоки.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `from_node_id` | `TEXT` | NOT NULL; FK → graph_nodes(id) | FK → graph_nodes(id): узел начала ребра. |
| `to_node_id` | `TEXT` | NOT NULL; FK → graph_nodes(id) | FK → graph_nodes(id): узел конца ребра. |
| `reverse_edge_id` | `TEXT` | FK → graph_edges(id) | FK → graph_edges(id): обратное ребро, если путь двусторонний. |
| `scale_level` | `TEXT` | CHECK: G0, G1, G2, G3, G4, G5 | Уровень: scale level. |
| `edge_type` | `TEXT` | CHECK: road, path, river, lake_route, sea_route, winter_road, ford, ferry, bridge, gate, street, door, yard_passage, forest_track, offroad_crossing, mountain_pass, desert_route, steppe_route, border_transition, corridor_segment, portage | Тип связи: road, path, offroad_crossing (G1 без дороги), corridor_segment (крупный коридор), portage (волок), ford, ferry, border_transition, … |
| `base_gu` | `NUMERIC` | — | Базовая длина ребра в graph units (1 GU ≈ 4 км пешком). |
| `base_distance_km` | `NUMERIC` | — | Ориентировочная дистанция в км. |
| `base_time_minutes` | `NUMERIC` | — | Базовое время для G3–G5 (минуты). |
| `base_time_hours` | `NUMERIC` | — | Базовое время в часах. |
| `base_time_days` | `NUMERIC` | — | Базовое время в днях (дальние G0-переходы). |
| `route_template_id` | `TEXT` | FK → route_templates(id) | FK → route_templates(id): тип движения; обязателен для road/path/forest_track/winter_road/portage/corridor_segment. |
| `landscape_template_id` | `TEXT` | FK → landscape_templates(id) | FK → landscape_templates(id): среда прохождения ребра; обязателен для offroad_crossing. |
| `water_body_template_id` | `TEXT` | FK → water_body_templates(id) | FK → water_body_templates(id): водная среда; обязателен для river/lake_route/sea_route/ford/ferry/bridge. |
| `terrain_type` | `TEXT` | — | Legacy-текст местности ребра; источник истины — landscape_template_id. |
| `route_surface` | `TEXT` | — | Поле «route_surface» таблицы graph_edges; см. architecture doc. |
| `seasonal_rule` | `TEXT` | — | Сезонная доступность или модификатор. |
| `access_rule` | `TEXT` | — | Кто и при каких условиях может пройти. |
| `risk_level` | `TEXT` | — | Уровень: risk level. |
| `known_to_commoners` | `TEXT` | — | Что знают простые люди. |
| `known_to_traders` | `TEXT` | — | Что знают торговцы. |
| `known_to_elites` | `TEXT` | — | Что знают элиты. |
| `known_to_clergy` | `TEXT` | — | Что знают духовенство. |
| `known_to_character_default` | `TEXT` | — | Поле «known_to_character_default» таблицы graph_edges; см. architecture doc. |
| `requires_guide` | `BOOLEAN` | NOT NULL; DEFAULT false | Нужен ли проводник. |
| `requires_boat` | `BOOLEAN` | NOT NULL; DEFAULT false | Нужна ли лодка. |
| `requires_horse` | `BOOLEAN` | NOT NULL; DEFAULT false | Нужна ли лошадь. |
| `requires_sled` | `BOOLEAN` | NOT NULL; DEFAULT false | Нужны ли сани. |
| `requires_permission` | `BOOLEAN` | NOT NULL; DEFAULT false | Нужно ли разрешение власти. |
| `requires_orientation_check` | `BOOLEAN` | NOT NULL; DEFAULT false | Нужна ли проверка ориентирования/поиска направления. |
| `orientation_difficulty` | `TEXT` | CHECK: none, easy, ordinary, hard, dangerous, extreme | Сложность ориентирования: none, easy, ordinary, hard, dangerous, extreme. |
| `movement_risk_profile` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив рисков пути (lost_time, getting_lost, fatigue, wild_animals, …). |
| `failure_consequences` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив последствий провала (lose_1d4_hours, exit_to_wrong_neighbor_cell, …). |
| `historical_status` | `TEXT` | — | Поле «historical_status» таблицы graph_edges; см. architecture doc. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- offroad_crossing → landscape_template_id; river/lake_route/sea_route/ford/ferry/bridge → water_body_template_id; road/path/forest_track/winter_road/portage/corridor_segment → route_template_id.
- offroad_crossing → landscape_template_id; river/lake_route/sea_route/ford/ferry/bridge → water_body_template_id; road/path/forest_track/winter_road/portage/corridor_segment → route_template_id.
- offroad_crossing → landscape_template_id; river/lake_route/sea_route/ford/ferry/bridge → water_body_template_id; road/path/forest_track/winter_road/portage/corridor_segment → route_template_id.

### `graph_edge_knowledge_rules`

Кто какие пути знает.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `graph_edge_id` | `TEXT` | NOT NULL; FK → graph_edges(id) | FK → graph_edges(id): каноническое ребро графа. |
| `social_role_id` | `TEXT` | FK → region_social_roles(id) | FK → region_social_roles(id): социальная роль. |
| `occupation_id` | `TEXT` | FK → region_occupations(id) | FK → region_occupations(id): профессия/занятие. |
| `knowledge_level` | `TEXT` | CHECK: knows_exact, knows_roughly, heard_rumor, does_not_know, false_belief | knows_exact, knows_roughly, heard_rumor, does_not_know, false_belief. |
| `knowledge_source` | `TEXT` | — | Поле «knowledge_source» таблицы graph_edge_knowledge_rules; см. architecture doc. |
| `accuracy` | `TEXT` | — | Поле «accuracy» таблицы graph_edge_knowledge_rules; см. architecture doc. |
| `common_mistakes` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «common_mistakes» таблицы graph_edge_knowledge_rules; см. architecture doc. |
| `seasonal_limitations` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «seasonal_limitations» таблицы graph_edge_knowledge_rules; см. architecture doc. |
| `danger_awareness` | `TEXT` | — | Поле «danger_awareness» таблицы graph_edge_knowledge_rules; см. architecture doc. |
| `landmarks_known` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «landmarks_known» таблицы graph_edge_knowledge_rules; см. architecture doc. |
| `places_known_on_graph_edge` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON: места, известные по этому ребру графа. |
| `can_guide_others` | `BOOLEAN` | NOT NULL; DEFAULT false | Может ли проводить других по этому ребру. |
| `will_share_for_free` | `BOOLEAN` | NOT NULL; DEFAULT false | Расскажет ли путь бесплатно. |
| `will_share_for_payment` | `BOOLEAN` | NOT NULL; DEFAULT false | Расскажет ли за плату. |
| `will_hide_or_lie` | `BOOLEAN` | NOT NULL; DEFAULT false | Скроет или солжёт о пути. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

## Ландшафт (базовая среда)

### `landscape_templates`

Справочник канонических типов ландшафта: источник истины для.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `slug` | `TEXT` | NOT NULL | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | NOT NULL | Человекочитаемое название записи. |
| `parent_landscape_template_id` | `TEXT` | FK → landscape_templates(id) | FK → landscape_templates(id): родитель в иерархии частных вариантов среды. |
| `landscape_group` | `TEXT` | CHECK: forest, swamp, meadow, floodplain, hill, ravine, steppe, marsh, bog, mountain, desert, coast, riverbank, lake_shore | Природная группа суши: forest, swamp, meadow, floodplain, hill, ravine, steppe, marsh, bog, mountain, desert. Без mixed/water/road/settlement/urban/field. Без riverbank/lake_shore/coast — берег только G2–G5 или hydrology_notes. |
| `base_environment` | `TEXT` | NOT NULL | Главный природный класс среды (NOT NULL); не объект, не инфраструктура, не хозяйство. |
| `dominant_vegetation` | `TEXT` | — | Преобладающая растительность, если применимо. |
| `forest_type` | `TEXT` | — | Тип леса для лесной среды. |
| `moisture_level` | `TEXT` | — | Влажность среды: сухая, влажная, заболоченная и т.п. |
| `relief_type` | `TEXT` | — | Рельеф: равнина, холмы, овраг, склон, горная зона. |
| `soil_ground_type` | `TEXT` | — | Почва/грунт: движение, строительство, сезонность. |
| `openness` | `TEXT` | — | Открытость для обзора, движения, засады, ориентирования. |
| `seasonal_stability` | `TEXT` | — | Насколько среда меняется по сезонам. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `base_movement_multiplier` | `NUMERIC` | — | Базовый множитель к нормальному пешему GU (1 = норма). |
| `default_orientation_difficulty` | `TEXT` | CHECK: none, easy, ordinary, hard, dangerous, extreme | Сложность ориентирования: none, easy, ordinary, hard, dangerous, extreme. |
| `base_risk_level` | `TEXT` | CHECK: none, low, medium, high, extreme | Базовый риск ландшафта: none, low, medium, high, extreme. |
| `game_use` | `TEXT` | — | Базовая природная среда для primary/secondary на graph_nodes и landscape_template_id при offroad_crossing; LLM — проходимость, ориентация, риск, сезон, наполнение сцены. |
| `limits` | `TEXT` | — | Не дорога, не поселение, не пашня, не вода, не берег, не маршрут; инфраструктура/хозяйство/вода/берег — route_templates, place_templates, land_use_templates, water_body_templates, graph. Для *_dominant болот/топей — только primary при доминировании в G1; для floodplain_* — не обычный берег реки. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `region_landscape_templates`

Связь региона с допустимыми ландшафтами; LLM и trigger выбирают только из этой таблицы.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `landscape_template_id` | `TEXT` | NOT NULL; FK → landscape_templates(id) | FK → landscape_templates(id): канонический ландшафт ребра (обязателен для offroad_crossing). |
| `is_allowed` | `BOOLEAN` | NOT NULL; DEFAULT true | Разрешена ли базовая среда для узлов/рёбер региона (trigger + LLM). |
| `is_common` | `BOOLEAN` | NOT NULL; DEFAULT false | Частая среда региона. |
| `is_dominant` | `BOOLEAN` | NOT NULL; DEFAULT false | Доминирующая среда региона. |
| `is_rare` | `BOOLEAN` | NOT NULL; DEFAULT false | Редкая среда региона. |
| `generation_weight` | `NUMERIC` | NOT NULL; DEFAULT 0 | Вес при генерации/распределении (>= 0). |
| `allowed_scale_levels` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON: допустимые scale_level (G1, G2, …). |
| `allowed_node_types` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON: допустимые node_type для этой среды в регионе. |
| `regional_limits` | `TEXT` | — | Региональные ограничения. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

## Вода

### `water_body_templates`

Справочник канонических типов водных объектов (река, озеро, болото, …): не конкретная река, а тип; источник истины для primary_water_body_template_id и secondary_water_body_template_ids на узлах.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `slug` | `TEXT` | NOT NULL | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | NOT NULL | Человекочитаемое название записи. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `water_body_type` | `TEXT` | NOT NULL | Тип водного объекта (река, озеро, море, ручей, …). |
| `salinity` | `TEXT` | NOT NULL | Пресная/солёная/браковая вода. |
| `flow_type` | `TEXT` | — | Течение: стоячая, медленная, быстрая, … |
| `typical_depth` | `TEXT` | — | Типичные depth (JSON или текст). |
| `typical_width` | `TEXT` | — | Типичные width (JSON или текст). |
| `drinkable_default` | `TEXT` | — | Питьевая пригодность по умолчанию. |
| `supports_boat` | `BOOLEAN` | NOT NULL; DEFAULT false | Допускает или требует судно. |
| `supports_fishing` | `BOOLEAN` | NOT NULL; DEFAULT false | Поле «supports_fishing» таблицы water_body_templates; см. architecture doc. |
| `supports_ford` | `BOOLEAN` | NOT NULL; DEFAULT false | Возможен брод. |
| `supports_ferry` | `BOOLEAN` | NOT NULL; DEFAULT false | Возможна переправа. |
| `supports_bridge` | `BOOLEAN` | NOT NULL; DEFAULT false | Возможен мост. |
| `supports_winter_crossing` | `BOOLEAN` | NOT NULL; DEFAULT false | Переход по льду/зимнику. |
| `freeze_pattern` | `TEXT` | — | Паттерн замерзания по сезонам. |
| `flood_risk` | `TEXT` | — | Риск паводка/подтопления. |
| `base_crossing_risk` | `TEXT` | — | Базовый риск переправы. |
| `navigation_use` | `TEXT` | — | Судоходность и навигация: допустимые суда, сезонность, ограничения хода. |
| `water_hazard_notes` | `TEXT` | — | Типичные водные опасности: лёд, течение, топь, прилив, промоины. |
| `game_use` | `TEXT` | — | Как игровой код и LLM используют тип воды на G1 (primary/secondary water_body_template_id) и на рёбрах (water_body_template_id). |
| `limits` | `TEXT` | — | Что этот тип не заменяет: не берег, не маршрут, не конкретная река/озеро; берег — G2–G5 или hydrology_notes. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `region_water_body_templates`

Связь региона с допустимыми типами водных объектов; LLM и trigger выбирают только из этой таблицы.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `water_body_template_id` | `TEXT` | NOT NULL; FK → water_body_templates(id) | FK → water_body_templates(id): водная среда ребра (река, брод, переправа, …). |
| `is_allowed` | `BOOLEAN` | NOT NULL; DEFAULT true | Флаг: is allowed. |
| `is_common` | `BOOLEAN` | NOT NULL; DEFAULT false | Флаг: is common. |
| `is_dominant` | `BOOLEAN` | NOT NULL; DEFAULT false | Флаг: is dominant. |
| `is_rare` | `BOOLEAN` | NOT NULL; DEFAULT false | Флаг: is rare. |
| `generation_weight` | `NUMERIC` | NOT NULL; DEFAULT 0 | Поле «generation_weight» таблицы region_water_body_templates; см. architecture doc. |
| `allowed_scale_levels` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «allowed_scale_levels» таблицы region_water_body_templates; см. architecture doc. |
| `allowed_node_types` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «allowed_node_types» таблицы region_water_body_templates; см. architecture doc. |
| `regional_limits` | `TEXT` | — | Поле «regional_limits» таблицы region_water_body_templates; см. architecture doc. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

## Инфраструктура

### `route_templates`

Шаблоны типов инфраструктуры движения (дорога, тропа, зимник, брод, переправа, …); не заменяет graph_edges, но задаёт route_template_id и правила проходимости.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `slug` | `TEXT` | NOT NULL | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | NOT NULL | Человекочитаемое название записи. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `route_kind` | `TEXT` | NOT NULL | Класс инфраструктуры: дорога, тропа, зимник, волок, речной ход, … |
| `default_edge_type` | `TEXT` | — | Типичный edge_type для graph_edges с этим шаблоном. |
| `surface_type` | `TEXT` | — | Покрытие/поверхность пути. |
| `requires_landscape_template` | `BOOLEAN` | NOT NULL; DEFAULT true | Ребро должно иметь landscape_template_id. |
| `requires_water_body_template` | `BOOLEAN` | NOT NULL; DEFAULT false | Ребро должно иметь water_body_template_id. |
| `supports_pedestrian` | `BOOLEAN` | NOT NULL; DEFAULT true | Поле «supports_pedestrian» таблицы route_templates; см. architecture doc. |
| `supports_horse` | `BOOLEAN` | NOT NULL; DEFAULT false | Поле «supports_horse» таблицы route_templates; см. architecture doc. |
| `supports_cart` | `BOOLEAN` | NOT NULL; DEFAULT false | Поле «supports_cart» таблицы route_templates; см. architecture doc. |
| `supports_sled` | `BOOLEAN` | NOT NULL; DEFAULT false | Поле «supports_sled» таблицы route_templates; см. architecture doc. |
| `supports_boat` | `BOOLEAN` | NOT NULL; DEFAULT false | Поле «supports_boat» таблицы route_templates; см. architecture doc. |
| `seasonal_availability` | `TEXT` | — | Поле «seasonal_availability» таблицы route_templates; см. architecture doc. |
| `default_access_rule` | `TEXT` | — | Поле «default_access_rule» таблицы route_templates; см. architecture doc. |
| `default_orientation_difficulty` | `TEXT` | CHECK: none, easy, ordinary, hard, dangerous, extreme | Поле «default_orientation_difficulty» таблицы route_templates; см. architecture doc. |
| `default_risk_level` | `TEXT` | CHECK: none, low, medium, high, extreme | Уровень: default risk level. |
| `default_movement_multiplier` | `NUMERIC` | — | Базовый множитель времени для этого типа пути. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

## Хозяйство

### `land_use_templates`

Справочник типов хозяйственного использования среды (пашня, покос, пастбище, …); не ландшафт и не место — слой поверх среды.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `slug` | `TEXT` | NOT NULL | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | NOT NULL | Человекочитаемое название записи. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `land_use_kind` | `TEXT` | NOT NULL | Вид хозяйственного использования: пашня, покос, выгон, … |
| `requires_settlement_nearby` | `BOOLEAN` | NOT NULL; DEFAULT false | Требует близкого поселения. |
| `requires_water_nearby` | `BOOLEAN` | NOT NULL; DEFAULT false | Требуется ли water nearby. |
| `requires_specific_landscape` | `BOOLEAN` | NOT NULL; DEFAULT false | Требует конкретную базовую среду. |
| `compatible_landscape_template_ids` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON: совместимые базовые среды. |
| `compatible_water_body_template_ids` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON: совместимые водные типы. |
| `seasonal_pattern` | `TEXT` | — | Поле «seasonal_pattern» таблицы land_use_templates; см. architecture doc. |
| `labor_intensity` | `TEXT` | — | Поле «labor_intensity» таблицы land_use_templates; см. architecture doc. |
| `economic_use` | `TEXT` | — | Поле «economic_use» таблицы land_use_templates; см. architecture doc. |
| `visibility_effect` | `TEXT` | — | Поле «visibility_effect» таблицы land_use_templates; см. architecture doc. |
| `movement_effect` | `TEXT` | — | Поле «movement_effect» таблицы land_use_templates; см. architecture doc. |
| `risk_effect` | `TEXT` | — | Поле «risk_effect» таблицы land_use_templates; см. architecture doc. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `region_land_use_templates`

Связь региона с допустимыми типами хозяйственного использования; LLM выбирает только из этой таблицы.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `land_use_template_id` | `TEXT` | NOT NULL; FK → land_use_templates(id) | Поле «land_use_template_id» таблицы region_land_use_templates; см. architecture doc. |
| `is_allowed` | `BOOLEAN` | NOT NULL; DEFAULT true | Флаг: is allowed. |
| `is_common` | `BOOLEAN` | NOT NULL; DEFAULT false | Флаг: is common. |
| `is_rare` | `BOOLEAN` | NOT NULL; DEFAULT false | Флаг: is rare. |
| `generation_weight` | `NUMERIC` | NOT NULL; DEFAULT 0 | Поле «generation_weight» таблицы region_land_use_templates; см. architecture doc. |
| `allowed_scale_levels` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «allowed_scale_levels» таблицы region_land_use_templates; см. architecture doc. |
| `allowed_node_types` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «allowed_node_types» таблицы region_land_use_templates; см. architecture doc. |
| `regional_limits` | `TEXT` | — | Поле «regional_limits» таблицы region_land_use_templates; см. architecture doc. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

## Места

### `place_templates`

Глобальный справочник типов мест (деревня, село, погост, монастырь, …); существуют поверх среды, не являются ландшафтом.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `slug` | `TEXT` | NOT NULL | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | NOT NULL | Человекочитаемое название записи. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `place_kind` | `TEXT` | NOT NULL | Тип места: деревня, погост, монастырь, … |
| `default_node_type` | `TEXT` | — | Типичный node_type graph_nodes для этого места. |
| `can_exist_inside_landscape` | `BOOLEAN` | NOT NULL; DEFAULT true | Поле «can_exist_inside_landscape» таблицы place_templates; см. architecture doc. |
| `requires_water_nearby` | `BOOLEAN` | NOT NULL; DEFAULT false | Требуется ли water nearby. |
| `requires_route_nearby` | `BOOLEAN` | NOT NULL; DEFAULT false | Требуется ли route nearby. |
| `requires_land_use` | `BOOLEAN` | NOT NULL; DEFAULT false | Требуется ли land use. |
| `compatible_landscape_template_ids` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON: на каких средах возможно. |
| `compatible_water_body_template_ids` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-список ссылок: compatible_water_body_template_ids. |
| `compatible_route_template_ids` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON: какие типы путей нужны рядом. |
| `compatible_land_use_template_ids` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON: типичное хозяйство рядом. |
| `typical_scale_level` | `TEXT` | — | Уровень: typical scale level. |
| `settlement_density_effect` | `TEXT` | — | Поле «settlement_density_effect» таблицы place_templates; см. architecture doc. |
| `access_logic` | `TEXT` | — | Поле «access_logic» таблицы place_templates; см. architecture doc. |
| `social_logic` | `TEXT` | — | Поле «social_logic» таблицы place_templates; см. architecture doc. |
| `economic_logic` | `TEXT` | — | Поле «economic_logic» таблицы place_templates; см. architecture doc. |
| `defense_logic` | `TEXT` | — | Поле «defense_logic» таблицы place_templates; см. architecture doc. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `region_place_templates`

Тонкая связка региона с разрешёнными типами мест; LLM выбирает тип места только из этой таблицы (отдельно от fat region_place_generation_rules).

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `place_template_id` | `TEXT` | NOT NULL; FK → place_templates(id) | FK: на region_place_generation_rules(id) в place_generation_limits/location_object_rules; на place_templates(id) в graph_nodes. |
| `is_allowed` | `BOOLEAN` | NOT NULL; DEFAULT true | Разрешён ли тип места в регионе. |
| `is_common` | `BOOLEAN` | NOT NULL; DEFAULT false | Флаг: is common. |
| `is_rare` | `BOOLEAN` | NOT NULL; DEFAULT false | Флаг: is rare. |
| `generation_weight` | `NUMERIC` | NOT NULL; DEFAULT 0 | Вес при генерации (>= 0). |
| `allowed_scale_levels` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «allowed_scale_levels» таблицы region_place_templates; см. architecture doc. |
| `allowed_node_types` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «allowed_node_types» таблицы region_place_templates; см. architecture doc. |
| `regional_limits` | `TEXT` | — | Поле «regional_limits» таблицы region_place_templates; см. architecture doc. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `region_place_generation_rules`

Региональные правила генерации типовых мест (fat table; бывш.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `template_type` | `TEXT` | CHECK: village, fishing_village, forest_camp, charcoal_burner_camp, logging_camp, winter_hut, pogost, ferry, ford, roadside_inn, market_site, monastery_dependency, watch_post, hunting_camp, beekeeping_site | Тип генерируемого места: village, pogost, forest_camp, … |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `generation_allowed` | `BOOLEAN` | NOT NULL; DEFAULT false | Разрешена ли LLM-генерация по этому правилу. |
| `max_instances_per_region` | `INTEGER` | — | Поле «max_instances_per_region» таблицы region_place_generation_rules; см. architecture doc. |
| `min_distance_from_major_place` | `TEXT` | — | Поле «min_distance_from_major_place» таблицы region_place_generation_rules; см. architecture doc. |
| `required_landscape` | `TEXT` | — | Поле «required_landscape» таблицы region_place_generation_rules; см. architecture doc. |
| `required_economy` | `TEXT` | — | Поле «required_economy» таблицы region_place_generation_rules; см. architecture doc. |
| `required_route_access` | `TEXT` | — | Поле «required_route_access» таблицы region_place_generation_rules; см. architecture doc. |
| `required_water_access` | `TEXT` | — | Поле «required_water_access» таблицы region_place_generation_rules; см. architecture doc. |
| `seasonal_availability` | `TEXT` | — | Поле «seasonal_availability» таблицы region_place_generation_rules; см. architecture doc. |
| `typical_population_band` | `TEXT` | — | Диапазон/полоса: typical population band. |
| `typical_household_count` | `TEXT` | — | Типичные household count (JSON или текст). |
| `typical_wealth_level` | `TEXT` | — | Уровень: typical wealth level. |
| `typical_authority` | `TEXT` | — | Типичные authority (JSON или текст). |
| `typical_social_roles` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные social roles (JSON или текст). |
| `typical_occupations` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные occupations (JSON или текст). |
| `typical_buildings` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные buildings (JSON или текст). |
| `typical_animals` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные animals (JSON или текст). |
| `typical_tools` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные tools (JSON или текст). |
| `typical_goods` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные goods (JSON или текст). |
| `typical_food_sources` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные food sources (JSON или текст). |
| `typical_risks` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные risks (JSON или текст). |
| `typical_conflicts` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные conflicts (JSON или текст). |
| `layout_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON: правила планировки места. |
| `naming_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: naming rules. |
| `access_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: access rules. |
| `law_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: law rules. |
| `religion_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: religion rules. |
| `trade_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: trade rules. |
| `defense_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: defense rules. |
| `npc_generation_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON: правила NPC для места. |
| `item_generation_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: item generation rules. |
| `route_generation_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: route generation rules. |
| `historical_plausibility_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: historical plausibility rules. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `place_generation_limits`

Лимиты генерации мест по региону.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `place_template_id` | `TEXT` | FK → region_place_generation_rules(id) | FK: на region_place_generation_rules(id) в place_generation_limits/location_object_rules; на place_templates(id) в graph_nodes. |
| `max_total` | `INTEGER` | — | Поле «max_total» таблицы place_generation_limits; см. architecture doc. |
| `max_per_subregion` | `INTEGER` | — | Поле «max_per_subregion» таблицы place_generation_limits; см. architecture doc. |
| `min_total_if_region_active` | `INTEGER` | — | Поле «min_total_if_region_active» таблицы place_generation_limits; см. architecture doc. |
| `economic_basis_required` | `BOOLEAN` | NOT NULL; DEFAULT false | Поле «economic_basis_required» таблицы place_generation_limits; см. architecture doc. |
| `route_basis_required` | `BOOLEAN` | NOT NULL; DEFAULT false | Поле «route_basis_required» таблицы place_generation_limits; см. architecture doc. |
| `water_basis_required` | `BOOLEAN` | NOT NULL; DEFAULT false | Поле «water_basis_required» таблицы place_generation_limits; см. architecture doc. |
| `authority_basis_required` | `BOOLEAN` | NOT NULL; DEFAULT false | Поле «authority_basis_required» таблицы place_generation_limits; см. architecture doc. |
| `historical_anchor_basis_required` | `BOOLEAN` | NOT NULL; DEFAULT false | Поле «historical_anchor_basis_required» таблицы place_generation_limits; см. architecture doc. |
| `allowed_near_place_types` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «allowed_near_place_types» таблицы place_generation_limits; см. architecture doc. |
| `forbidden_near_place_types` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «forbidden_near_place_types» таблицы place_generation_limits; см. architecture doc. |
| `minimum_distance_band` | `TEXT` | — | Диапазон/полоса: minimum distance band. |
| `maximum_distance_band` | `TEXT` | — | Диапазон/полоса: maximum distance band. |
| `density_logic` | `TEXT` | — | Поле «density_logic» таблицы place_generation_limits; см. architecture doc. |
| `naming_policy` | `TEXT` | — | Поле «naming_policy» таблицы place_generation_limits; см. architecture doc. |
| `duplication_policy` | `TEXT` | — | Поле «duplication_policy» таблицы place_generation_limits; см. architecture doc. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `places`

Конкретные места: исторические и утверждённые сгенерированные.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `template_id` | `TEXT` | FK → region_place_generation_rules(id) | FK → region_place_generation_rules(id): правило генерации типа места. |
| `slug` | `TEXT` | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `canonical_name` | `TEXT` | — | Каноническое имя. |
| `display_name` | `TEXT` | — | Отображаемое имя. |
| `alt_names` | `JSONB` | NOT NULL; DEFAULT '[]' | Альтернативные имена (JSON). |
| `place_type` | `TEXT` | CHECK: city, posad, village, selo, pogost, monastery, fortress, yard, inn, ferry, ford, pier, market, road_segment, forest_camp, winter_hut, watch_post, border_zone | city, village, pogost, monastery, ford, pier, … |
| `historical_status` | `TEXT` | — | Поле «historical_status» таблицы places; см. architecture doc. |
| `is_fixed_historical_place` | `BOOLEAN` | NOT NULL; DEFAULT false | Исторически фиксированное место (не процедурное). |
| `is_generated_place` | `BOOLEAN` | NOT NULL; DEFAULT false | Место создано LLM и утверждено в справочник. |
| `generation_source` | `TEXT` | — | Откуда взялось место: seed, llm, manual, … |
| `period_start_year` | `INTEGER` | — | Начальный год периода действия. |
| `period_end_year` | `INTEGER` | — | Конечный год периода действия. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `function_in_region` | `TEXT` | — | Поле «function_in_region» таблицы places; см. architecture doc. |
| `economic_basis` | `TEXT` | — | Поле «economic_basis» таблицы places; см. architecture doc. |
| `political_control` | `TEXT` | — | Поле «political_control» таблицы places; см. architecture doc. |
| `religious_control` | `TEXT` | — | Поле «religious_control» таблицы places; см. architecture doc. |
| `legal_status` | `TEXT` | — | Поле «legal_status» таблицы places; см. architecture doc. |
| `owner_or_holder` | `TEXT` | — | Поле «owner_or_holder» таблицы places; см. architecture doc. |
| `population_band` | `TEXT` | — | Диапазон/полоса: population band. |
| `wealth_level` | `TEXT` | — | Уровень: wealth level. |
| `landscape` | `TEXT` | — | Поле «landscape» таблицы places; см. architecture doc. |
| `water_access` | `TEXT` | — | Поле «water_access» таблицы places; см. architecture doc. |
| `road_access` | `TEXT` | — | Поле «road_access» таблицы places; см. architecture doc. |
| `defense_level` | `TEXT` | — | Уровень: defense level. |
| `market_level` | `TEXT` | — | Уровень: market level. |
| `craft_level` | `TEXT` | — | Уровень: craft level. |
| `food_supply_level` | `TEXT` | — | Уровень: food supply level. |
| `risk_level` | `TEXT` | — | Уровень: risk level. |
| `known_to_commoners` | `TEXT` | — | Что знают простые люди. |
| `known_to_traders` | `TEXT` | — | Что знают торговцы. |
| `known_to_elites` | `TEXT` | — | Что знают элиты. |
| `known_to_clergy` | `TEXT` | — | Что знают духовенство. |
| `known_to_outsiders` | `TEXT` | — | Поле «known_to_outsiders» таблицы places; см. architecture doc. |
| `visible_description` | `TEXT` | — | Поле «visible_description» таблицы places; см. architecture doc. |
| `hidden_notes` | `TEXT` | — | Скрытые заметки (не для игрока). |
| `map_notes` | `TEXT` | — | Поле «map_notes» таблицы places; см. architecture doc. |
| `llm_generation_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила генерации для LLM (JSON). |
| `llm_forbidden_changes` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «llm_forbidden_changes» таблицы places; см. architecture doc. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `place_locations`

Локации внутри места.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `place_id` | `TEXT` | NOT NULL; FK → places(id) | FK → places(id): конкретное место, если применимо. |
| `slug` | `TEXT` | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | — | Человекочитаемое название записи. |
| `location_type` | `TEXT` | CHECK: gate, street, market, yard, churchyard, riverbank, pier, house, hall, barn, stable, workshop, storehouse, forest_edge, road_approach, monastery_yard, fortification_wall | Поле «location_type» таблицы place_locations; см. architecture doc. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `function` | `TEXT` | — | Поле «function» таблицы place_locations; см. architecture doc. |
| `access_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: access rules. |
| `visibility_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: visibility rules. |
| `who_controls_access` | `TEXT` | — | Поле «who_controls_access» таблицы place_locations; см. architecture doc. |
| `typical_npc_roles` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные npc roles (JSON или текст). |
| `typical_objects` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные objects (JSON или текст). |
| `typical_buildings` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные buildings (JSON или текст). |
| `typical_sounds` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные sounds (JSON или текст). |
| `typical_smells` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные smells (JSON или текст). |
| `typical_risks` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные risks (JSON или текст). |
| `social_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: social rules. |
| `law_risks` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «law_risks» таблицы place_locations; см. architecture doc. |
| `connected_location_ids` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-список ссылок: connected_location_ids. |
| `entry_points` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «entry_points» таблицы place_locations; см. architecture doc. |
| `closed_zones` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «closed_zones» таблицы place_locations; см. architecture doc. |
| `public_private_level` | `TEXT` | — | Уровень: public private level. |
| `crowd_level` | `TEXT` | — | Уровень: crowd level. |
| `light_level` | `TEXT` | — | Уровень: light level. |
| `weather_exposure` | `TEXT` | — | Поле «weather_exposure» таблицы place_locations; см. architecture doc. |
| `llm_generation_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила генерации для LLM (JSON). |
| `item_generation_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: item generation rules. |
| `npc_generation_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила генерации NPC (JSON). |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `place_minilocations`

Точные сценические зоны.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `place_id` | `TEXT` | NOT NULL; FK → places(id) | FK → places(id): конкретное место, если применимо. |
| `location_id` | `TEXT` | NOT NULL; FK → place_locations(id) | FK → place_locations(id): локация внутри места. |
| `slug` | `TEXT` | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | — | Человекочитаемое название записи. |
| `minilocation_type` | `TEXT` | CHECK: near_door, near_hearth, under_shed, behind_cart, near_gate, near_table, near_chest, near_boat, near_well, at_threshold, in_shadow, beside_fire | Поле «minilocation_type» таблицы place_minilocations; см. architecture doc. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `position_description` | `TEXT` | — | Поле «position_description» таблицы place_minilocations; см. architecture doc. |
| `access_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: access rules. |
| `visibility` | `TEXT` | — | Поле «visibility» таблицы place_minilocations; см. architecture doc. |
| `cover_or_hiding` | `TEXT` | — | Поле «cover_or_hiding» таблицы place_minilocations; см. architecture doc. |
| `noise_level` | `TEXT` | — | Уровень: noise level. |
| `light_level` | `TEXT` | — | Уровень: light level. |
| `weather_exposure` | `TEXT` | — | Поле «weather_exposure» таблицы place_minilocations; см. architecture doc. |
| `nearby_objects` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «nearby_objects» таблицы place_minilocations; см. architecture doc. |
| `nearby_npc_roles` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «nearby_npc_roles» таблицы place_minilocations; см. architecture doc. |
| `possible_actions` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «possible_actions» таблицы place_minilocations; см. architecture doc. |
| `movement_cost` | `TEXT` | — | Поле «movement_cost» таблицы place_minilocations; см. architecture doc. |
| `risk_notes` | `TEXT` | — | Поле «risk_notes» таблицы place_minilocations; см. architecture doc. |
| `connected_minilocation_ids` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-список ссылок: connected_minilocation_ids. |
| `anchor_ids` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-список ссылок: anchor_ids. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `scene_anchors`

Точки сцены: дверь, сундук, колодец, костёр, повозка.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `place_id` | `TEXT` | NOT NULL; FK → places(id) | FK → places(id): конкретное место, если применимо. |
| `location_id` | `TEXT` | FK → place_locations(id) | FK → place_locations(id): локация внутри места. |
| `minilocation_id` | `TEXT` | FK → place_minilocations(id) | FK → place_minilocations(id): сценическая зона. |
| `slug` | `TEXT` | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | — | Человекочитаемое название записи. |
| `anchor_type` | `TEXT` | — | Поле «anchor_type» таблицы scene_anchors; см. architecture doc. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `physical_description` | `TEXT` | — | Поле «physical_description» таблицы scene_anchors; см. architecture doc. |
| `is_fixed` | `BOOLEAN` | NOT NULL; DEFAULT false | Флаг: is fixed. |
| `is_movable` | `BOOLEAN` | NOT NULL; DEFAULT false | Флаг: is movable. |
| `is_container` | `BOOLEAN` | NOT NULL; DEFAULT false | Флаг: is container. |
| `is_passage` | `BOOLEAN` | NOT NULL; DEFAULT false | Флаг: is passage. |
| `is_obstacle` | `BOOLEAN` | NOT NULL; DEFAULT false | Флаг: is obstacle. |
| `is_light_source` | `BOOLEAN` | NOT NULL; DEFAULT false | Флаг: is light source. |
| `is_cover` | `BOOLEAN` | NOT NULL; DEFAULT false | Флаг: is cover. |
| `is_dangerous` | `BOOLEAN` | NOT NULL; DEFAULT false | Флаг: is dangerous. |
| `access_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: access rules. |
| `visibility_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: visibility rules. |
| `ownership_status` | `TEXT` | — | Поле «ownership_status» таблицы scene_anchors; см. architecture doc. |
| `controller` | `TEXT` | — | Поле «controller» таблицы scene_anchors; см. architecture doc. |
| `condition` | `TEXT` | — | Поле «condition» таблицы scene_anchors; см. architecture doc. |
| `interaction_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: interaction rules. |
| `risk_notes` | `TEXT` | — | Поле «risk_notes» таблицы scene_anchors; см. architecture doc. |
| `linked_item_ids` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-список ссылок: linked_item_ids. |
| `linked_graph_edge_ids` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON: id из graph_edges, связанных с точкой сцены. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `place_buildings`

Постройки внутри места.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `place_id` | `TEXT` | NOT NULL; FK → places(id) | FK → places(id): конкретное место, если применимо. |
| `location_id` | `TEXT` | FK → place_locations(id) | FK → place_locations(id): локация внутри места. |
| `slug` | `TEXT` | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | — | Человекочитаемое название записи. |
| `building_type` | `TEXT` | CHECK: house, hut, barn, stable, storehouse, workshop, church, monastery_cell, gatehouse, tower, wall, bathhouse, mill, inn, warehouse, boathouse, smithy | Поле «building_type» таблицы place_buildings; см. architecture doc. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `function` | `TEXT` | — | Поле «function» таблицы place_buildings; см. architecture doc. |
| `owner_or_holder` | `TEXT` | — | Поле «owner_or_holder» таблицы place_buildings; см. architecture doc. |
| `controller` | `TEXT` | — | Поле «controller» таблицы place_buildings; см. architecture doc. |
| `public_private_level` | `TEXT` | — | Уровень: public private level. |
| `access_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: access rules. |
| `legal_status` | `TEXT` | — | Поле «legal_status» таблицы place_buildings; см. architecture doc. |
| `religious_status` | `TEXT` | — | Поле «religious_status» таблицы place_buildings; см. architecture doc. |
| `wealth_level` | `TEXT` | — | Уровень: wealth level. |
| `condition` | `TEXT` | — | Поле «condition» таблицы place_buildings; см. architecture doc. |
| `materials` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «materials» таблицы place_buildings; см. architecture doc. |
| `size_band` | `TEXT` | — | Диапазон/полоса: size band. |
| `floors_or_sections` | `TEXT` | — | Поле «floors_or_sections» таблицы place_buildings; см. architecture doc. |
| `typical_rooms` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные rooms (JSON или текст). |
| `typical_objects` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные objects (JSON или текст). |
| `typical_npc_roles` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные npc roles (JSON или текст). |
| `typical_activities` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные activities (JSON или текст). |
| `storage_logic` | `TEXT` | — | Поле «storage_logic» таблицы place_buildings; см. architecture doc. |
| `locked_areas` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «locked_areas» таблицы place_buildings; см. architecture doc. |
| `hidden_area_policy` | `TEXT` | — | Поле «hidden_area_policy» таблицы place_buildings; см. architecture doc. |
| `fire_risk` | `TEXT` | — | Поле «fire_risk» таблицы place_buildings; см. architecture doc. |
| `theft_risk` | `TEXT` | — | Поле «theft_risk» таблицы place_buildings; см. architecture doc. |
| `social_risk` | `TEXT` | — | Поле «social_risk» таблицы place_buildings; см. architecture doc. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

## Универсальный социальный слой

### `social_classes`

Универсальные социальные классы (10 канонических id).

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `slug` | `TEXT` | NOT NULL | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | NOT NULL | Человекочитаемое название записи. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `social_role_archetypes`

Универсальные архетипы социальной роли (16 id).

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `slug` | `TEXT` | NOT NULL | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | NOT NULL | Человекочитаемое название записи. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `legal_status_archetypes`

Архетипы правового статуса (free, dependent, unfree, …).

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `slug` | `TEXT` | NOT NULL | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | NOT NULL | Человекочитаемое название записи. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `dependency_archetypes`

Архетипы зависимости (долг, двор, монастырь, …).

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `slug` | `TEXT` | NOT NULL | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | NOT NULL | Человекочитаемое название записи. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `mobility_archetypes`

Архетипы мобильности (local_bound, road_mobile, …).

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `slug` | `TEXT` | NOT NULL | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | NOT NULL | Человекочитаемое название записи. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `social_position_archetypes`

Канонические социальные позиции — главный якорь нормализации.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `slug` | `TEXT` | NOT NULL | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | NOT NULL | Человекочитаемое название записи. |
| `social_class_id` | `TEXT` | NOT NULL; FK → social_classes(id) | Поле «social_class_id» таблицы social_position_archetypes; см. architecture doc. |
| `role_archetype_id` | `TEXT` | NOT NULL; FK → social_role_archetypes(id) | Поле «role_archetype_id» таблицы social_position_archetypes; см. architecture doc. |
| `legal_status_archetype_id` | `TEXT` | NOT NULL; FK → legal_status_archetypes(id) | Поле «legal_status_archetype_id» таблицы social_position_archetypes; см. architecture doc. |
| `dependency_archetype_id` | `TEXT` | NOT NULL; FK → dependency_archetypes(id) | Поле «dependency_archetype_id» таблицы social_position_archetypes; см. architecture doc. |
| `mobility_archetype_id` | `TEXT` | NOT NULL; FK → mobility_archetypes(id) | Поле «mobility_archetype_id» таблицы social_position_archetypes; см. architecture doc. |
| `property_rights_model` | `TEXT` | — | Поле «property_rights_model» таблицы social_position_archetypes; см. architecture doc. |
| `weapon_rights_model` | `TEXT` | — | Поле «weapon_rights_model» таблицы social_position_archetypes; см. architecture doc. |
| `court_voice_model` | `TEXT` | — | Поле «court_voice_model» таблицы social_position_archetypes; см. architecture doc. |
| `typical_power_over_others` | `TEXT` | — | Типичные power over others (JSON или текст). |
| `typical_power_over_them` | `TEXT` | — | Типичные power over them (JSON или текст). |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `class_role_rules`

Матрица допустимости класс ↔ роль.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `social_class_id` | `TEXT` | NOT NULL; FK → social_classes(id) | Поле «social_class_id» таблицы class_role_rules; см. architecture doc. |
| `role_archetype_id` | `TEXT` | NOT NULL; FK → social_role_archetypes(id) | Поле «role_archetype_id» таблицы class_role_rules; см. architecture doc. |
| `is_allowed` | `BOOLEAN` | NOT NULL; DEFAULT true | Флаг: is allowed. |
| `notes` | `TEXT` | — | Поле «notes» таблицы class_role_rules; см. architecture doc. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `occupation_archetypes`

Универсальные архетипы занятий (15 id).

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `slug` | `TEXT` | NOT NULL | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | NOT NULL | Человекочитаемое название записи. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `skill_catalog`

Канонический каталог механических навыков (12 id).

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `slug` | `TEXT` | NOT NULL | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | NOT NULL | Человекочитаемое название записи. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `occupation_skill_defaults`

Дефолтные primary/secondary навыки по занятию.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `occupation_archetype_id` | `TEXT` | PK; FK → occupation_archetypes(id) | Поле «occupation_archetype_id» таблицы occupation_skill_defaults; см. architecture doc. |
| `primary_skill_ids` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-список ссылок: primary_skill_ids. |
| `secondary_skill_ids` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-список ссылок: secondary_skill_ids. |
| `gate_skill_ids` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-список ссылок: gate_skill_ids. |
| `forbidden_skill_ids` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-список ссылок: forbidden_skill_ids. |
| `default_level_logic` | `TEXT` | — | Поле «default_level_logic» таблицы occupation_skill_defaults; см. architecture doc. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `role_occupation_rules`

Матрица допустимости роль ↔ занятие.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `role_archetype_id` | `TEXT` | NOT NULL; FK → social_role_archetypes(id) | Поле «role_archetype_id» таблицы role_occupation_rules; см. architecture doc. |
| `occupation_archetype_id` | `TEXT` | NOT NULL; FK → occupation_archetypes(id) | Поле «occupation_archetype_id» таблицы role_occupation_rules; см. architecture doc. |
| `is_allowed` | `BOOLEAN` | NOT NULL; DEFAULT true | Флаг: is allowed. |
| `notes` | `TEXT` | — | Поле «notes» таблицы role_occupation_rules; см. architecture doc. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `universal_archetype_proposals`

Заявки на новые универсальные архетипы при нехватке покрытия.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `source_region_id` | `TEXT` | FK → regions(id) | Поле «source_region_id» таблицы universal_archetype_proposals; см. architecture doc. |
| `proposal_type` | `TEXT` | CHECK: social_position, occupation, skill, other | Поле «proposal_type» таблицы universal_archetype_proposals; см. architecture doc. |
| `local_term` | `TEXT` | — | Поле «local_term» таблицы universal_archetype_proposals; см. architecture doc. |
| `why_existing_archetypes_not_enough` | `TEXT` | — | Поле «why_existing_archetypes_not_enough» таблицы universal_archetype_proposals; см. architecture doc. |
| `proposed_archetype_payload` | `JSONB` | NOT NULL; DEFAULT '{}' | Поле «proposed_archetype_payload» таблицы universal_archetype_proposals; см. architecture doc. |
| `affected_regions` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «affected_regions» таблицы universal_archetype_proposals; см. architecture doc. |
| `review_status` | `TEXT` | NOT NULL; DEFAULT 'pending'; CHECK: pending, approved, rejected | Поле «review_status» таблицы universal_archetype_proposals; см. architecture doc. |
| `review_notes` | `TEXT` | — | Поле «review_notes» таблицы universal_archetype_proposals; см. architecture doc. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

## Региональная рамка

### `regions`

Главная таблица регионов.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `slug` | `TEXT` | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `canonical_name` | `TEXT` | — | Каноническое имя региона (как в world_regions). |
| `display_name` | `TEXT` | — | Имя для UI и прозы. |
| `alt_names` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON: альтернативные названия. |
| `region_type` | `TEXT` | — | Поле «region_type» таблицы regions; см. architecture doc. |
| `parent_region_id` | `TEXT` | FK → regions(id) | FK → regions(id): родительский регион в иерархии. |
| `period_start_year` | `INTEGER` | — | Начальный год периода действия. |
| `period_end_year` | `INTEGER` | — | Конечный год периода действия. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `geographic_scope` | `TEXT` | — | Поле «geographic_scope» таблицы regions; см. architecture doc. |
| `natural_landscape` | `TEXT` | — | Поле «natural_landscape» таблицы regions; см. architecture doc. |
| `climate_summary` | `TEXT` | — | Сводка: climate summary. |
| `seasonal_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: seasonal rules. |
| `waterways_summary` | `TEXT` | — | Сводка: waterways summary. |
| `roads_summary` | `TEXT` | — | Сводка: roads summary. |
| `settlement_logic_summary` | `TEXT` | — | Сводка: settlement logic summary. |
| `political_summary` | `TEXT` | — | Сводка: political summary. |
| `ruling_power` | `TEXT` | — | Поле «ruling_power» таблицы regions; см. architecture doc. |
| `administrative_structure` | `TEXT` | — | Поле «administrative_structure» таблицы regions; см. architecture doc. |
| `law_summary` | `TEXT` | — | Сводка: law summary. |
| `custom_summary` | `TEXT` | — | Сводка: custom summary. |
| `religion_summary` | `TEXT` | — | Сводка: religion summary. |
| `social_order_summary` | `TEXT` | — | Сводка: social order summary. |
| `economy_summary` | `TEXT` | — | Сводка: economy summary. |
| `military_pressure_summary` | `TEXT` | — | Сводка: military pressure summary. |
| `historical_context_summary` | `TEXT` | — | Сводка: historical context summary. |
| `neighbor_regions` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON: краткий список соседей (дубль region_neighbors). |
| `external_pressure_summary` | `TEXT` | — | Сводка: external pressure summary. |
| `common_risks_summary` | `TEXT` | — | Сводка: common risks summary. |
| `npc_common_knowledge_summary` | `TEXT` | — | Сводка: npc common knowledge summary. |
| `llm_generation_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON: жёсткие правила для LLM при генерации в регионе. |
| `llm_forbidden_assumptions` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON: что LLM не должен додумывать. |
| `llm_context_summary` | `TEXT` | — | Сводка: llm context summary. |
| `validation_notes` | `TEXT` | — | Поле «validation_notes» таблицы regions; см. architecture doc. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `region_neighbors`

Связи между регионами.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `neighbor_region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): соседний регион. |
| `direction` | `TEXT` | — | Поле «direction» таблицы region_neighbors; см. architecture doc. |
| `border_type` | `TEXT` | — | Поле «border_type» таблицы region_neighbors; см. architecture doc. |
| `connection_type` | `TEXT` | — | Поле «connection_type» таблицы region_neighbors; см. architecture doc. |
| `trade_connection` | `TEXT` | — | Поле «trade_connection» таблицы region_neighbors; см. architecture doc. |
| `military_pressure` | `TEXT` | — | Поле «military_pressure» таблицы region_neighbors; см. architecture doc. |
| `political_relation` | `TEXT` | — | Поле «political_relation» таблицы region_neighbors; см. architecture doc. |
| `cultural_relation` | `TEXT` | — | Поле «cultural_relation» таблицы region_neighbors; см. architecture doc. |
| `religious_relation` | `TEXT` | — | Поле «religious_relation» таблицы region_neighbors; см. architecture doc. |
| `route_connection_summary` | `TEXT` | — | Сводка: route connection summary. |
| `known_to_commoners` | `TEXT` | — | Что знают простые люди. |
| `known_to_traders` | `TEXT` | — | Что знают торговцы. |
| `known_to_elites` | `TEXT` | — | Что знают элиты. |
| `known_to_clergy` | `TEXT` | — | Что знают духовенство. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `region_laws`

Право, обычай, запреты, наказания.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `law_type` | `TEXT` | CHECK: property, violence, weapon, travel, hospitality, debt, trade, religious, status, punishment, court, tax, custom | Поле «law_type» таблицы region_laws; см. architecture doc. |
| `applies_to_statuses` | `JSONB` | NOT NULL; DEFAULT '[]' | Применяется к: statuses (JSON). |
| `applies_to_roles` | `JSONB` | NOT NULL; DEFAULT '[]' | Применяется к: roles (JSON). |
| `applies_to_places` | `JSONB` | NOT NULL; DEFAULT '[]' | Применяется к: places (JSON). |
| `period_start_year` | `INTEGER` | — | Начальный год периода действия. |
| `period_end_year` | `INTEGER` | — | Конечный год периода действия. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `rule_text` | `TEXT` | — | Поле «rule_text» таблицы region_laws; см. architecture doc. |
| `custom_basis` | `TEXT` | — | Поле «custom_basis» таблицы region_laws; см. architecture doc. |
| `authority_enforcing` | `TEXT` | — | Поле «authority_enforcing» таблицы region_laws; см. architecture doc. |
| `punishment_or_consequence` | `TEXT` | — | Поле «punishment_or_consequence» таблицы region_laws; см. architecture doc. |
| `dispute_resolution` | `TEXT` | — | Поле «dispute_resolution» таблицы region_laws; см. architecture doc. |
| `property_effect` | `TEXT` | — | Поле «property_effect» таблицы region_laws; см. architecture doc. |
| `violence_effect` | `TEXT` | — | Поле «violence_effect» таблицы region_laws; см. architecture doc. |
| `weapon_effect` | `TEXT` | — | Поле «weapon_effect» таблицы region_laws; см. architecture doc. |
| `travel_effect` | `TEXT` | — | Поле «travel_effect» таблицы region_laws; см. architecture doc. |
| `trade_effect` | `TEXT` | — | Поле «trade_effect» таблицы region_laws; см. architecture doc. |
| `religious_effect` | `TEXT` | — | Поле «religious_effect» таблицы region_laws; см. architecture doc. |
| `who_knows_this` | `TEXT` | — | Поле «who_knows_this» таблицы region_laws; см. architecture doc. |
| `npc_behavior_effect` | `TEXT` | — | Поле «npc_behavior_effect» таблицы region_laws; см. architecture doc. |
| `player_risk` | `TEXT` | — | Поле «player_risk» таблицы region_laws; см. architecture doc. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `region_economy`

Экономика, ресурсы, промыслы, товары.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `economy_type` | `TEXT` | CHECK: farming, fishing, hunting, fur, beekeeping, logging, charcoal, tar, iron, salt, livestock, craft, trade, transport, monastery_economy, military_supply | Поле «economy_type» таблицы region_economy; см. architecture doc. |
| `resource_or_activity` | `TEXT` | — | Поле «resource_or_activity» таблицы region_economy; см. architecture doc. |
| `production_method` | `TEXT` | — | Поле «production_method» таблицы region_economy; см. architecture doc. |
| `seasonality` | `TEXT` | — | Поле «seasonality» таблицы region_economy; см. architecture doc. |
| `required_landscape` | `TEXT` | — | Поле «required_landscape» таблицы region_economy; см. architecture doc. |
| `required_settlement_type` | `TEXT` | — | Поле «required_settlement_type» таблицы region_economy; см. architecture doc. |
| `required_tools` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «required_tools» таблицы region_economy; см. architecture doc. |
| `required_roles` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «required_roles» таблицы region_economy; см. architecture doc. |
| `labor_intensity` | `TEXT` | — | Поле «labor_intensity» таблицы region_economy; см. architecture doc. |
| `wealth_level` | `TEXT` | — | Уровень: wealth level. |
| `risk_level` | `TEXT` | — | Уровень: risk level. |
| `goods_produced` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «goods_produced» таблицы region_economy; см. architecture doc. |
| `goods_consumed` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «goods_consumed» таблицы region_economy; см. architecture doc. |
| `goods_imported` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «goods_imported» таблицы region_economy; см. architecture doc. |
| `goods_exported` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «goods_exported» таблицы region_economy; см. architecture doc. |
| `trade_graph_edges` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON: id из graph_edges — торговые коридоры/пути (не legacy routes). |
| `market_access` | `TEXT` | — | Поле «market_access» таблицы region_economy; см. architecture doc. |
| `storage_requirements` | `TEXT` | — | Поле «storage_requirements» таблицы region_economy; см. architecture doc. |
| `spoilage_or_loss_risk` | `TEXT` | — | Поле «spoilage_or_loss_risk» таблицы region_economy; см. architecture doc. |
| `who_controls_it` | `TEXT` | — | Поле «who_controls_it» таблицы region_economy; см. architecture doc. |
| `tax_or_duty` | `TEXT` | — | Поле «tax_or_duty» таблицы region_economy; см. architecture doc. |
| `social_status_link` | `TEXT` | — | Поле «social_status_link» таблицы region_economy; см. architecture doc. |
| `conflict_potential` | `TEXT` | — | Поле «conflict_potential» таблицы region_economy; см. architecture doc. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `region_social_roles`

Социальные роли и статусы.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `role_group` | `TEXT` | CHECK: elite, clergy, warrior, merchant, craftsman, peasant, dependent, slave, servant, outsider, marginal, official | Поле «role_group» таблицы region_social_roles; см. architecture doc. |
| `social_position_archetype_id` | `TEXT` | FK → social_position_archetypes(id) | Поле «social_position_archetype_id» таблицы region_social_roles; см. architecture doc. |
| `social_class_id` | `TEXT` | FK → social_classes(id) | Поле «social_class_id» таблицы region_social_roles; см. architecture doc. |
| `role_archetype_id` | `TEXT` | FK → social_role_archetypes(id) | Поле «role_archetype_id» таблицы region_social_roles; см. architecture doc. |
| `legal_status_archetype_id` | `TEXT` | FK → legal_status_archetypes(id) | Поле «legal_status_archetype_id» таблицы region_social_roles; см. architecture doc. |
| `dependency_archetype_id` | `TEXT` | FK → dependency_archetypes(id) | Поле «dependency_archetype_id» таблицы region_social_roles; см. architecture doc. |
| `mobility_archetype_id` | `TEXT` | FK → mobility_archetypes(id) | Поле «mobility_archetype_id» таблицы region_social_roles; см. architecture doc. |
| `mapping_review_status` | `TEXT` | CHECK: pending, approved, accepted_with_caution, rejected | Поле «mapping_review_status» таблицы region_social_roles; см. architecture doc. |
| `mapping_confidence` | `TEXT` | — | Поле «mapping_confidence» таблицы region_social_roles; см. architecture doc. |
| `mapping_notes` | `TEXT` | — | Поле «mapping_notes» таблицы region_social_roles; см. architecture doc. |
| `status_level` | `TEXT` | — | Уровень: status level. |
| `free_status` | `TEXT` | — | Поле «free_status» таблицы region_social_roles; см. architecture doc. |
| `dependency_type` | `TEXT` | — | Поле «dependency_type» таблицы region_social_roles; см. architecture doc. |
| `wealth_level` | `TEXT` | — | Уровень: wealth level. |
| `legal_capacity` | `TEXT` | — | Поле «legal_capacity» таблицы region_social_roles; см. architecture doc. |
| `mobility_level` | `TEXT` | — | Уровень: mobility level. |
| `social_respect` | `TEXT` | — | Поле «social_respect» таблицы region_social_roles; см. architecture doc. |
| `vulnerability_level` | `TEXT` | — | Уровень: vulnerability level. |
| `allowed_occupations` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «allowed_occupations» таблицы region_social_roles; см. architecture doc. |
| `forbidden_occupations` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «forbidden_occupations» таблицы region_social_roles; см. architecture doc. |
| `allowed_weapons` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «allowed_weapons» таблицы region_social_roles; см. architecture doc. |
| `forbidden_weapons` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «forbidden_weapons» таблицы region_social_roles; см. architecture doc. |
| `allowed_places` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «allowed_places» таблицы region_social_roles; см. architecture doc. |
| `restricted_places` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «restricted_places» таблицы region_social_roles; см. architecture doc. |
| `property_rights` | `TEXT` | — | Поле «property_rights» таблицы region_social_roles; см. architecture doc. |
| `travel_rights` | `TEXT` | — | Поле «travel_rights» таблицы region_social_roles; см. architecture doc. |
| `trade_rights` | `TEXT` | — | Поле «trade_rights» таблицы region_social_roles; см. architecture doc. |
| `court_rights` | `TEXT` | — | Поле «court_rights» таблицы region_social_roles; см. architecture doc. |
| `tax_obligations` | `TEXT` | — | Поле «tax_obligations» таблицы region_social_roles; см. architecture doc. |
| `service_obligations` | `TEXT` | — | Поле «service_obligations» таблицы region_social_roles; см. architecture doc. |
| `typical_clothing` | `TEXT` | — | Типичные clothing (JSON или текст). |
| `typical_equipment` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные equipment (JSON или текст). |
| `typical_knowledge` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные knowledge (JSON или текст). |
| `typical_speech_register` | `TEXT` | — | Типичные speech register (JSON или текст). |
| `typical_fears` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные fears (JSON или текст). |
| `typical_goals` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные goals (JSON или текст). |
| `who_commands_them` | `TEXT` | — | Поле «who_commands_them» таблицы region_social_roles; см. architecture doc. |
| `who_protects_them` | `TEXT` | — | Поле «who_protects_them» таблицы region_social_roles; см. architecture doc. |
| `who_can_punish_them` | `TEXT` | — | Поле «who_can_punish_them» таблицы region_social_roles; см. architecture doc. |
| `relation_to_church` | `TEXT` | — | Поле «relation_to_church» таблицы region_social_roles; см. architecture doc. |
| `relation_to_power` | `TEXT` | — | Поле «relation_to_power» таблицы region_social_roles; см. architecture doc. |
| `npc_generation_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила генерации NPC (JSON). |
| `player_character_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: player character rules. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `region_occupations`

Профессии и занятия.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `occupation_group` | `TEXT` | CHECK: agriculture, fishing, forest, craft, trade, transport, military, religious, service, administration, criminal, healing, hospitality | Поле «occupation_group» таблицы region_occupations; см. architecture doc. |
| `occupation_archetype_id` | `TEXT` | FK → occupation_archetypes(id) | Поле «occupation_archetype_id» таблицы region_occupations; см. architecture doc. |
| `mapping_review_status` | `TEXT` | CHECK: pending, approved, accepted_with_caution, rejected | Поле «mapping_review_status» таблицы region_occupations; см. architecture doc. |
| `mapping_confidence` | `TEXT` | — | Поле «mapping_confidence» таблицы region_occupations; см. architecture doc. |
| `mapping_notes` | `TEXT` | — | Поле «mapping_notes» таблицы region_occupations; см. architecture doc. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `allowed_social_roles` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «allowed_social_roles» таблицы region_occupations; см. architecture doc. |
| `forbidden_social_roles` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «forbidden_social_roles» таблицы region_occupations; см. architecture doc. |
| `typical_status` | `TEXT` | — | Типичные status (JSON или текст). |
| `typical_wealth` | `TEXT` | — | Типичные wealth (JSON или текст). |
| `typical_gender_age_rules` | `TEXT` | — | Правила: typical gender age rules. |
| `required_location_types` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «required_location_types» таблицы region_occupations; см. architecture doc. |
| `required_economy_types` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «required_economy_types» таблицы region_occupations; см. architecture doc. |
| `required_tools` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «required_tools» таблицы region_occupations; см. architecture doc. |
| `required_materials` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «required_materials» таблицы region_occupations; см. architecture doc. |
| `produced_goods` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «produced_goods» таблицы region_occupations; см. architecture doc. |
| `services_provided` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «services_provided» таблицы region_occupations; см. architecture doc. |
| `seasonality` | `TEXT` | — | Поле «seasonality» таблицы region_occupations; см. architecture doc. |
| `work_rhythm` | `TEXT` | — | Поле «work_rhythm» таблицы region_occupations; см. architecture doc. |
| `income_logic` | `TEXT` | — | Поле «income_logic» таблицы region_occupations; см. architecture doc. |
| `typical_skills` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные skills (JSON или текст). |
| `typical_attributes` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные attributes (JSON или текст). |
| `typical_clothing` | `TEXT` | — | Типичные clothing (JSON или текст). |
| `typical_equipment` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные equipment (JSON или текст). |
| `typical_risks` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные risks (JSON или текст). |
| `typical_knowledge` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные knowledge (JSON или текст). |
| `typical_contacts` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные contacts (JSON или текст). |
| `settlement_generation_weight` | `TEXT` | — | Поле «settlement_generation_weight» таблицы region_occupations; см. architecture doc. |
| `npc_generation_weight` | `TEXT` | — | Поле «npc_generation_weight» таблицы region_occupations; см. architecture doc. |
| `rarity` | `TEXT` | — | Поле «rarity» таблицы region_occupations; см. architecture doc. |
| `is_historical_fact` | `BOOLEAN` | NOT NULL; DEFAULT false | Флаг: is historical fact. |
| `is_generated_allowed` | `BOOLEAN` | NOT NULL; DEFAULT false | Флаг: is generated allowed. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `region_material_culture`

Материальная культура региона.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `material_category` | `TEXT` | CHECK: clothing, tool, weapon, armor, food, livestock, container, transport, religious_item, trade_good, household_item, craft_material, luxury, document_or_mark | Поле «material_category» таблицы region_material_culture; см. architecture doc. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `commonness` | `TEXT` | — | Поле «commonness» таблицы region_material_culture; см. architecture doc. |
| `status_level` | `TEXT` | — | Уровень: status level. |
| `allowed_social_roles` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «allowed_social_roles» таблицы region_material_culture; см. architecture doc. |
| `restricted_social_roles` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «restricted_social_roles» таблицы region_material_culture; см. architecture doc. |
| `typical_places` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные places (JSON или текст). |
| `typical_owners` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные owners (JSON или текст). |
| `typical_holders` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные holders (JSON или текст). |
| `typical_materials` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные materials (JSON или текст). |
| `typical_condition` | `TEXT` | — | Типичные condition (JSON или текст). |
| `typical_quality` | `TEXT` | — | Типичные quality (JSON или текст). |
| `typical_value_band` | `TEXT` | — | Диапазон/полоса: typical value band. |
| `typical_marks` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные marks (JSON или текст). |
| `legal_status` | `TEXT` | — | Поле «legal_status» таблицы region_material_culture; см. architecture doc. |
| `social_risk` | `TEXT` | — | Поле «social_risk» таблицы region_material_culture; см. architecture doc. |
| `theft_risk` | `TEXT` | — | Поле «theft_risk» таблицы region_material_culture; см. architecture doc. |
| `trade_risk` | `TEXT` | — | Поле «trade_risk» таблицы region_material_culture; см. architecture doc. |
| `seasonality` | `TEXT` | — | Поле «seasonality» таблицы region_material_culture; см. architecture doc. |
| `economic_source` | `TEXT` | — | Поле «economic_source» таблицы region_material_culture; см. architecture doc. |
| `import_or_local` | `TEXT` | — | Поле «import_or_local» таблицы region_material_culture; см. architecture doc. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `region_risks`

Риски региона.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `risk_type` | `TEXT` | CHECK: road, weather, law, violence, theft, hunger, disease, wild_animals, social, religious, economic, war, fire, water, cold | Поле «risk_type» таблицы region_risks; см. architecture doc. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `applies_to_places` | `JSONB` | NOT NULL; DEFAULT '[]' | Применяется к: places (JSON). |
| `applies_to_graph_edges` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON: id из graph_edges, к которым применяется риск. |
| `applies_to_roles` | `JSONB` | NOT NULL; DEFAULT '[]' | Применяется к: roles (JSON). |
| `applies_to_occupations` | `JSONB` | NOT NULL; DEFAULT '[]' | Применяется к: occupations (JSON). |
| `seasonality` | `TEXT` | — | Поле «seasonality» таблицы region_risks; см. architecture doc. |
| `trigger_conditions` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «trigger_conditions» таблицы region_risks; см. architecture doc. |
| `visible_signs` | `JSONB` | NOT NULL; DEFAULT '[]' | Видимые признаки (JSON). |
| `hidden_causes` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «hidden_causes» таблицы region_risks; см. architecture doc. |
| `possible_consequences` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «possible_consequences» таблицы region_risks; см. architecture doc. |
| `risk_level` | `TEXT` | — | Уровень: risk level. |
| `frequency` | `TEXT` | — | Поле «frequency» таблицы region_risks; см. architecture doc. |
| `avoidance_methods` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «avoidance_methods» таблицы region_risks; см. architecture doc. |
| `mitigation_methods` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «mitigation_methods» таблицы region_risks; см. architecture doc. |
| `npc_reactions` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «npc_reactions» таблицы region_risks; см. architecture doc. |
| `law_consequences` | `TEXT` | — | Поле «law_consequences» таблицы region_risks; см. architecture doc. |
| `economic_consequences` | `TEXT` | — | Поле «economic_consequences» таблицы region_risks; см. architecture doc. |
| `body_state_consequences` | `TEXT` | — | Поле «body_state_consequences» таблицы region_risks; см. architecture doc. |
| `item_consequences` | `TEXT` | — | Поле «item_consequences» таблицы region_risks; см. architecture doc. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `conflict_templates`

Типовые конфликты.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `conflict_type` | `TEXT` | CHECK: debt, property, trade, family, labor, status, religious, road, theft, violence, tax, duty, stranger, resource | Поле «conflict_type» таблицы conflict_templates; см. architecture doc. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `applies_to_place_types` | `JSONB` | NOT NULL; DEFAULT '[]' | Применяется к: place types (JSON). |
| `applies_to_roles` | `JSONB` | NOT NULL; DEFAULT '[]' | Применяется к: roles (JSON). |
| `applies_to_occupations` | `JSONB` | NOT NULL; DEFAULT '[]' | Применяется к: occupations (JSON). |
| `trigger_conditions` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «trigger_conditions» таблицы conflict_templates; см. architecture doc. |
| `participants` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «participants» таблицы conflict_templates; см. architecture doc. |
| `stakes` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «stakes» таблицы conflict_templates; см. architecture doc. |
| `visible_signs` | `JSONB` | NOT NULL; DEFAULT '[]' | Видимые признаки (JSON). |
| `hidden_layers` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «hidden_layers» таблицы conflict_templates; см. architecture doc. |
| `possible_escalation` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «possible_escalation» таблицы conflict_templates; см. architecture doc. |
| `possible_resolution` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «possible_resolution» таблицы conflict_templates; см. architecture doc. |
| `law_involvement` | `TEXT` | — | Поле «law_involvement» таблицы conflict_templates; см. architecture doc. |
| `authority_involvement` | `TEXT` | — | Поле «authority_involvement» таблицы conflict_templates; см. architecture doc. |
| `rumor_effect` | `TEXT` | — | Поле «rumor_effect» таблицы conflict_templates; см. architecture doc. |
| `relationship_effect` | `TEXT` | — | Поле «relationship_effect» таблицы conflict_templates; см. architecture doc. |
| `economic_effect` | `TEXT` | — | Поле «economic_effect» таблицы conflict_templates; см. architecture doc. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `rumor_templates`

Шаблоны слухов.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `rumor_type` | `TEXT` | — | Поле «rumor_type» таблицы rumor_templates; см. architecture doc. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `source_role` | `TEXT` | — | Поле «source_role» таблицы rumor_templates; см. architecture doc. |
| `spread_places` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «spread_places» таблицы rumor_templates; см. architecture doc. |
| `spread_graph_edges` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON: id из graph_edges — по каким путям распространяется слух. |
| `affected_roles` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «affected_roles» таблицы rumor_templates; см. architecture doc. |
| `linked_event_id` | `TEXT` | — | JSON-список ссылок: linked_event_id. |
| `linked_place_id` | `TEXT` | — | JSON-список ссылок: linked_place_id. |
| `linked_risk_id` | `TEXT` | — | JSON-список ссылок: linked_risk_id. |
| `truth_status` | `TEXT` | CHECK: true, false, distorted, unknown, mixed | Поле «truth_status» таблицы rumor_templates; см. architecture doc. |
| `distortion_level` | `TEXT` | — | Уровень: distortion level. |
| `what_is_visible` | `TEXT` | — | Поле «what_is_visible» таблицы rumor_templates; см. architecture doc. |
| `what_is_hidden` | `TEXT` | — | Поле «what_is_hidden» таблицы rumor_templates; см. architecture doc. |
| `who_believes_it` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «who_believes_it» таблицы rumor_templates; см. architecture doc. |
| `who_denies_it` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «who_denies_it» таблицы rumor_templates; см. architecture doc. |
| `danger_of_repeating` | `TEXT` | — | Поле «danger_of_repeating» таблицы rumor_templates; см. architecture doc. |
| `possible_effects` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «possible_effects» таблицы rumor_templates; см. architecture doc. |
| `expiration_or_update_rule` | `TEXT` | — | Поле «expiration_or_update_rule» таблицы rumor_templates; см. architecture doc. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `price_bands`

Цены и относительная ценность.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `item_or_service_type` | `TEXT` | — | Поле «item_or_service_type» таблицы price_bands; см. architecture doc. |
| `value_band` | `TEXT` | — | Диапазон/полоса: value band. |
| `normal_price_description` | `TEXT` | — | Поле «normal_price_description» таблицы price_bands; см. architecture doc. |
| `cheap_condition` | `TEXT` | — | Поле «cheap_condition» таблицы price_bands; см. architecture doc. |
| `expensive_condition` | `TEXT` | — | Поле «expensive_condition» таблицы price_bands; см. architecture doc. |
| `scarcity_factors` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «scarcity_factors» таблицы price_bands; см. architecture doc. |
| `seasonal_modifiers` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «seasonal_modifiers» таблицы price_bands; см. architecture doc. |
| `war_modifiers` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «war_modifiers» таблицы price_bands; см. architecture doc. |
| `road_modifiers` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «road_modifiers» таблицы price_bands; см. architecture doc. |
| `status_modifiers` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «status_modifiers» таблицы price_bands; см. architecture doc. |
| `trade_place_modifiers` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «trade_place_modifiers» таблицы price_bands; см. architecture doc. |
| `who_can_afford` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «who_can_afford» таблицы price_bands; см. architecture doc. |
| `who_can_sell` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «who_can_sell» таблицы price_bands; см. architecture doc. |
| `who_controls_supply` | `TEXT` | — | Поле «who_controls_supply» таблицы price_bands; см. architecture doc. |
| `barter_options` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «barter_options» таблицы price_bands; см. architecture doc. |
| `tax_or_duty` | `TEXT` | — | Поле «tax_or_duty» таблицы price_bands; см. architecture doc. |
| `risk_of_fraud` | `TEXT` | — | Поле «risk_of_fraud» таблицы price_bands; см. architecture doc. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `seasonal_rules`

Сезонные правила региона.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `season` | `TEXT` | CHECK: winter, spring, summer, autumn, rasputitsa, early_winter, late_winter | Поле «season» таблицы seasonal_rules; см. architecture doc. |
| `title` | `TEXT` | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `weather_profile` | `TEXT` | — | Поле «weather_profile» таблицы seasonal_rules; см. architecture doc. |
| `daylight_profile` | `TEXT` | — | Поле «daylight_profile» таблицы seasonal_rules; см. architecture doc. |
| `road_effects` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «road_effects» таблицы seasonal_rules; см. architecture doc. |
| `river_effects` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «river_effects» таблицы seasonal_rules; см. architecture doc. |
| `forest_effects` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «forest_effects» таблицы seasonal_rules; см. architecture doc. |
| `field_effects` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «field_effects» таблицы seasonal_rules; см. architecture doc. |
| `food_effects` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «food_effects» таблицы seasonal_rules; см. architecture doc. |
| `work_effects` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «work_effects» таблицы seasonal_rules; см. architecture doc. |
| `trade_effects` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «trade_effects» таблицы seasonal_rules; см. architecture doc. |
| `war_effects` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «war_effects» таблицы seasonal_rules; см. architecture doc. |
| `disease_effects` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «disease_effects» таблицы seasonal_rules; см. architecture doc. |
| `clothing_requirements` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «clothing_requirements» таблицы seasonal_rules; см. architecture doc. |
| `shelter_requirements` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «shelter_requirements» таблицы seasonal_rules; см. architecture doc. |
| `available_occupations` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «available_occupations» таблицы seasonal_rules; см. architecture doc. |
| `restricted_occupations` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «restricted_occupations» таблицы seasonal_rules; см. architecture doc. |
| `available_graph_edges` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON: id из graph_edges, доступных в сезон. |
| `restricted_graph_edges` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON: id из graph_edges, закрытых или ограниченных в сезон. |
| `common_risks` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «common_risks» таблицы seasonal_rules; см. architecture doc. |
| `common_scenes` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «common_scenes» таблицы seasonal_rules; см. architecture doc. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `weather_profiles`

Погодные профили.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `seasonal_rule_id` | `TEXT` | FK → seasonal_rules(id) | FK → seasonal_rules(id): сезонное правило региона. |
| `title` | `TEXT` | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `weather_type` | `TEXT` | — | Поле «weather_type» таблицы weather_profiles; см. architecture doc. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `temperature_band` | `TEXT` | — | Диапазон/полоса: temperature band. |
| `precipitation` | `TEXT` | — | Поле «precipitation» таблицы weather_profiles; см. architecture doc. |
| `wind` | `TEXT` | — | Поле «wind» таблицы weather_profiles; см. architecture doc. |
| `visibility` | `TEXT` | — | Поле «visibility» таблицы weather_profiles; см. architecture doc. |
| `ground_condition` | `TEXT` | — | Поле «ground_condition» таблицы weather_profiles; см. architecture doc. |
| `water_condition` | `TEXT` | — | Поле «water_condition» таблицы weather_profiles; см. architecture doc. |
| `road_modifier` | `TEXT` | — | Поле «road_modifier» таблицы weather_profiles; см. architecture doc. |
| `movement_modifier` | `TEXT` | — | Поле «movement_modifier» таблицы weather_profiles; см. architecture doc. |
| `body_state_risk` | `TEXT` | — | Поле «body_state_risk» таблицы weather_profiles; см. architecture doc. |
| `npc_activity_effect` | `TEXT` | — | Поле «npc_activity_effect» таблицы weather_profiles; см. architecture doc. |
| `trade_effect` | `TEXT` | — | Поле «trade_effect» таблицы weather_profiles; см. architecture doc. |
| `combat_effect` | `TEXT` | — | Поле «combat_effect» таблицы weather_profiles; см. architecture doc. |
| `stealth_effect` | `TEXT` | — | Поле «stealth_effect» таблицы weather_profiles; см. architecture doc. |
| `fire_effect` | `TEXT` | — | Поле «fire_effect» таблицы weather_profiles; см. architecture doc. |
| `visible_description` | `TEXT` | — | Поле «visible_description» таблицы weather_profiles; см. architecture doc. |
| `sound_description` | `TEXT` | — | Поле «sound_description» таблицы weather_profiles; см. architecture doc. |
| `smell_description` | `TEXT` | — | Поле «smell_description» таблицы weather_profiles; см. architecture doc. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `religious_context`

Религиозные нормы, институты и объекты.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `religion_type` | `TEXT` | — | Поле «religion_type» таблицы religious_context; см. architecture doc. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `dominant_religion` | `TEXT` | — | Поле «dominant_religion» таблицы religious_context; см. architecture doc. |
| `minority_religions` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «minority_religions» таблицы religious_context; см. architecture doc. |
| `religious_authority` | `TEXT` | — | Поле «religious_authority» таблицы religious_context; см. architecture doc. |
| `sacred_places` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «sacred_places» таблицы religious_context; см. architecture doc. |
| `monastery_presence` | `TEXT` | — | Поле «monastery_presence» таблицы religious_context; см. architecture doc. |
| `church_presence` | `TEXT` | — | Поле «church_presence» таблицы religious_context; см. architecture doc. |
| `ritual_calendar` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «ritual_calendar» таблицы religious_context; см. architecture doc. |
| `taboos` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «taboos» таблицы religious_context; см. architecture doc. |
| `oath_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: oath rules. |
| `burial_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: burial rules. |
| `hospitality_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: hospitality rules. |
| `charity_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: charity rules. |
| `conflict_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: conflict rules. |
| `role_effects` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «role_effects» таблицы religious_context; см. architecture doc. |
| `law_effects` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «law_effects» таблицы religious_context; см. architecture doc. |
| `npc_knowledge` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «npc_knowledge» таблицы religious_context; см. architecture doc. |
| `player_risks` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «player_risks» таблицы religious_context; см. architecture doc. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `region_npc_knowledge`

Что знает NPC в зависимости от роли.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `social_role_id` | `TEXT` | FK → region_social_roles(id) | FK → region_social_roles(id): социальная роль. |
| `occupation_id` | `TEXT` | FK → region_occupations(id) | FK → region_occupations(id): профессия/занятие. |
| `knowledge_type` | `TEXT` | CHECK: common, role_based, occupation_based, elite, clergy, trader, outsider, local, rumor, false_belief | Поле «knowledge_type» таблицы region_npc_knowledge; см. architecture doc. |
| `title` | `TEXT` | — | Человекочитаемое название записи. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `knows_as_fact` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «knows_as_fact» таблицы region_npc_knowledge; см. architecture doc. |
| `knows_as_rumor` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «knows_as_rumor» таблицы region_npc_knowledge; см. architecture doc. |
| `common_mistakes` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «common_mistakes» таблицы region_npc_knowledge; см. architecture doc. |
| `cannot_know` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «cannot_know» таблицы region_npc_knowledge; см. architecture doc. |
| `taboo_topics` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «taboo_topics» таблицы region_npc_knowledge; см. architecture doc. |
| `dangerous_to_say` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «dangerous_to_say» таблицы region_npc_knowledge; см. architecture doc. |
| `who_they_trust` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «who_they_trust» таблицы region_npc_knowledge; см. architecture doc. |
| `who_they_fear` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «who_they_fear» таблицы region_npc_knowledge; см. architecture doc. |
| `regional_knowledge` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «regional_knowledge» таблицы region_npc_knowledge; см. architecture doc. |
| `local_place_knowledge` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «local_place_knowledge» таблицы region_npc_knowledge; см. architecture doc. |
| `law_knowledge` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «law_knowledge» таблицы region_npc_knowledge; см. architecture doc. |
| `economy_knowledge` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «economy_knowledge» таблицы region_npc_knowledge; см. architecture doc. |
| `religion_knowledge` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «religion_knowledge» таблицы region_npc_knowledge; см. architecture doc. |
| `historical_knowledge` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «historical_knowledge» таблицы region_npc_knowledge; см. architecture doc. |
| `route_knowledge` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «route_knowledge» таблицы region_npc_knowledge; см. architecture doc. |
| `social_order_knowledge` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «social_order_knowledge» таблицы region_npc_knowledge; см. architecture doc. |
| `price_knowledge` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «price_knowledge» таблицы region_npc_knowledge; см. architecture doc. |
| `speech_style_notes` | `TEXT` | — | Поле «speech_style_notes» таблицы region_npc_knowledge; см. architecture doc. |
| `behavior_effect` | `TEXT` | — | Поле «behavior_effect» таблицы region_npc_knowledge; см. architecture doc. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `region_npc_generation_rules`

Правила генерации NPC по региону.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `npc_profile_type` | `TEXT` | CHECK: background, scene, key, group | Поле «npc_profile_type» таблицы region_npc_generation_rules; см. architecture doc. |
| `applies_to_place_types` | `JSONB` | NOT NULL; DEFAULT '[]' | Применяется к: place types (JSON). |
| `applies_to_location_types` | `JSONB` | NOT NULL; DEFAULT '[]' | Применяется к: location types (JSON). |
| `allowed_social_roles` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «allowed_social_roles» таблицы region_npc_generation_rules; см. architecture doc. |
| `allowed_occupations` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «allowed_occupations» таблицы region_npc_generation_rules; см. architecture doc. |
| `forbidden_roles` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «forbidden_roles» таблицы region_npc_generation_rules; см. architecture doc. |
| `rarity_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: rarity rules. |
| `name_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: name rules. |
| `age_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: age rules. |
| `gender_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: gender rules. |
| `status_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: status rules. |
| `wealth_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: wealth rules. |
| `clothing_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: clothing rules. |
| `equipment_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: equipment rules. |
| `speech_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: speech rules. |
| `knowledge_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: knowledge rules. |
| `fear_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: fear rules. |
| `goal_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: goal rules. |
| `authority_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: authority rules. |
| `reaction_to_strangers` | `TEXT` | — | Поле «reaction_to_strangers» таблицы region_npc_generation_rules; см. architecture doc. |
| `reaction_to_violence` | `TEXT` | — | Поле «reaction_to_violence» таблицы region_npc_generation_rules; см. architecture doc. |
| `reaction_to_theft` | `TEXT` | — | Поле «reaction_to_theft» таблицы region_npc_generation_rules; см. architecture doc. |
| `reaction_to_trade` | `TEXT` | — | Поле «reaction_to_trade» таблицы region_npc_generation_rules; см. architecture doc. |
| `reaction_to_law` | `TEXT` | — | Поле «reaction_to_law» таблицы region_npc_generation_rules; см. architecture doc. |
| `background_npc_minimum` | `INTEGER` | — | Поле «background_npc_minimum» таблицы region_npc_generation_rules; см. architecture doc. |
| `scene_npc_minimum` | `INTEGER` | — | Поле «scene_npc_minimum» таблицы region_npc_generation_rules; см. architecture doc. |
| `key_npc_minimum` | `INTEGER` | — | Поле «key_npc_minimum» таблицы region_npc_generation_rules; см. architecture doc. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `region_gaps`

Что ещё не заполнено или требует проверки.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `gap_type` | `TEXT` | — | Поле «gap_type» таблицы region_gaps; см. architecture doc. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `why_needed` | `TEXT` | — | Поле «why_needed» таблицы region_gaps; см. architecture doc. |
| `affected_tables` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «affected_tables» таблицы region_gaps; см. architecture doc. |
| `priority` | `TEXT` | — | Поле «priority» таблицы region_gaps; см. architecture doc. |
| `risk_if_missing` | `TEXT` | — | Поле «risk_if_missing» таблицы region_gaps; см. architecture doc. |
| `suggested_sources` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «suggested_sources» таблицы region_gaps; см. architecture doc. |
| `suggested_research_query` | `TEXT` | — | Поле «suggested_research_query» таблицы region_gaps; см. architecture doc. |
| `current_workaround` | `TEXT` | — | Поле «current_workaround» таблицы region_gaps; см. architecture doc. |
| `blocked_generation_steps` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «blocked_generation_steps» таблицы region_gaps; см. architecture doc. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

## История

### `historical_anchors`

Исторические якоря: города, монастыри, крепости, торги, крупные реки.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `place_id` | `TEXT` | FK → places(id) | FK → places(id): конкретное место, если применимо. |
| `slug` | `TEXT` | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `canonical_name` | `TEXT` | — | Каноническое имя. |
| `display_name` | `TEXT` | — | Отображаемое имя. |
| `anchor_type` | `TEXT` | CHECK: city, fortress, monastery, market, river, ford, ferry, road, winter_road, border, battle_site, princely_court, bishopric | Поле «anchor_type» таблицы historical_anchors; см. architecture doc. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `historical_status` | `TEXT` | — | Поле «historical_status» таблицы historical_anchors; см. architecture doc. |
| `period_start_year` | `INTEGER` | — | Начальный год периода действия. |
| `period_end_year` | `INTEGER` | — | Конечный год периода действия. |
| `approximate_bearing` | `TEXT` | — | Поле «approximate_bearing» таблицы historical_anchors; см. architecture doc. |
| `distance_band` | `TEXT` | — | Диапазон/полоса: distance band. |
| `zone_of_influence` | `TEXT` | — | Поле «zone_of_influence» таблицы historical_anchors; см. architecture doc. |
| `access_graph_edges` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON: id из graph_edges — пути доступа к якорю. |
| `visible_signs` | `JSONB` | NOT NULL; DEFAULT '[]' | Видимые признаки (JSON). |
| `economic_influence` | `TEXT` | — | Поле «economic_influence» таблицы historical_anchors; см. architecture doc. |
| `political_influence` | `TEXT` | — | Поле «political_influence» таблицы historical_anchors; см. architecture doc. |
| `religious_influence` | `TEXT` | — | Поле «religious_influence» таблицы historical_anchors; см. architecture doc. |
| `military_influence` | `TEXT` | — | Поле «military_influence» таблицы historical_anchors; см. architecture doc. |
| `trade_influence` | `TEXT` | — | Поле «trade_influence» таблицы historical_anchors; см. architecture doc. |
| `character_knowledge_common` | `TEXT` | — | Поле «character_knowledge_common» таблицы historical_anchors; см. architecture doc. |
| `character_knowledge_trader` | `TEXT` | — | Поле «character_knowledge_trader» таблицы historical_anchors; см. architecture doc. |
| `character_knowledge_elite` | `TEXT` | — | Поле «character_knowledge_elite» таблицы historical_anchors; см. architecture doc. |
| `character_knowledge_clergy` | `TEXT` | — | Поле «character_knowledge_clergy» таблицы historical_anchors; см. architecture doc. |
| `character_knowledge_outsider` | `TEXT` | — | Поле «character_knowledge_outsider» таблицы historical_anchors; см. architecture doc. |
| `discovery_conditions` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «discovery_conditions» таблицы historical_anchors; см. architecture doc. |
| `llm_use_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: llm use rules. |
| `llm_forbidden_changes` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «llm_forbidden_changes» таблицы historical_anchors; см. architecture doc. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `historical_events`

Исторические события и региональное давление.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `event_type` | `TEXT` | — | Поле «event_type» таблицы historical_events; см. architecture doc. |
| `period_start_year` | `INTEGER` | — | Начальный год периода действия. |
| `period_end_year` | `INTEGER` | — | Конечный год периода действия. |
| `approximate_date` | `TEXT` | — | Поле «approximate_date» таблицы historical_events; см. architecture doc. |
| `date_confidence` | `TEXT` | — | Поле «date_confidence» таблицы historical_events; см. architecture doc. |
| `historical_status` | `TEXT` | — | Поле «historical_status» таблицы historical_events; см. architecture doc. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `cause` | `TEXT` | — | Поле «cause» таблицы historical_events; см. architecture doc. |
| `participants` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «participants» таблицы historical_events; см. architecture doc. |
| `affected_regions` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «affected_regions» таблицы historical_events; см. architecture doc. |
| `affected_places` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «affected_places» таблицы historical_events; см. architecture doc. |
| `current_phase` | `TEXT` | — | Поле «current_phase» таблицы historical_events; см. architecture doc. |
| `phase_logic` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «phase_logic» таблицы historical_events; см. architecture doc. |
| `local_signs` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «local_signs» таблицы historical_events; см. architecture doc. |
| `economic_effect` | `TEXT` | — | Поле «economic_effect» таблицы historical_events; см. architecture doc. |
| `road_effect` | `TEXT` | — | Поле «road_effect» таблицы historical_events; см. architecture doc. |
| `law_effect` | `TEXT` | — | Поле «law_effect» таблицы historical_events; см. architecture doc. |
| `social_effect` | `TEXT` | — | Поле «social_effect» таблицы historical_events; см. architecture doc. |
| `military_effect` | `TEXT` | — | Поле «military_effect» таблицы historical_events; см. architecture doc. |
| `religious_effect` | `TEXT` | — | Поле «religious_effect» таблицы historical_events; см. architecture doc. |
| `npc_knowledge_effect` | `TEXT` | — | Поле «npc_knowledge_effect» таблицы historical_events; см. architecture doc. |
| `rumor_effect` | `TEXT` | — | Поле «rumor_effect» таблицы historical_events; см. architecture doc. |
| `what_commoners_know` | `TEXT` | — | Поле «what_commoners_know» таблицы historical_events; см. architecture doc. |
| `what_traders_know` | `TEXT` | — | Поле «what_traders_know» таблицы historical_events; см. architecture doc. |
| `what_elites_know` | `TEXT` | — | Поле «what_elites_know» таблицы historical_events; см. architecture doc. |
| `what_clergy_know` | `TEXT` | — | Поле «what_clergy_know» таблицы historical_events; см. architecture doc. |
| `what_outsiders_know` | `TEXT` | — | Поле «what_outsiders_know» таблицы historical_events; см. architecture doc. |
| `hidden_truth_policy` | `TEXT` | — | Поле «hidden_truth_policy» таблицы historical_events; см. architecture doc. |
| `future_knowledge_forbidden` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «future_knowledge_forbidden» таблицы historical_events; см. architecture doc. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `historical_event_phases`

Фазы событий.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `event_id` | `TEXT` | NOT NULL; FK → historical_events(id) | FK → historical_events(id): родительское событие. |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `phase_name` | `TEXT` | CHECK: background, omens, escalation, impact, aftermath | background, omens, escalation, impact, aftermath. |
| `phase_order` | `INTEGER` | — | Порядок фазы в жизненном цикле события. |
| `date_start` | `TEXT` | — | Поле «date_start» таблицы historical_event_phases; см. architecture doc. |
| `date_end` | `TEXT` | — | Поле «date_end» таблицы historical_event_phases; см. architecture doc. |
| `date_confidence` | `TEXT` | — | Поле «date_confidence» таблицы historical_event_phases; см. architecture doc. |
| `trigger_condition` | `TEXT` | — | Поле «trigger_condition» таблицы historical_event_phases; см. architecture doc. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `visible_signs` | `JSONB` | NOT NULL; DEFAULT '[]' | Видимые признаки (JSON). |
| `hidden_processes` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «hidden_processes» таблицы historical_event_phases; см. architecture doc. |
| `affected_places` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «affected_places» таблицы historical_event_phases; см. architecture doc. |
| `affected_graph_edges` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON: id из graph_edges, затронутых фазой. |
| `affected_roles` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «affected_roles» таблицы historical_event_phases; см. architecture doc. |
| `affected_goods` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «affected_goods» таблицы historical_event_phases; см. architecture doc. |
| `npc_behavior_changes` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «npc_behavior_changes» таблицы historical_event_phases; см. architecture doc. |
| `price_changes` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «price_changes» таблицы historical_event_phases; см. architecture doc. |
| `security_changes` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «security_changes» таблицы historical_event_phases; см. architecture doc. |
| `law_changes` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «law_changes» таблицы historical_event_phases; см. architecture doc. |
| `rumor_templates` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «rumor_templates» таблицы historical_event_phases; см. architecture doc. |
| `delayed_event_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: delayed event rules. |
| `what_character_can_know` | `TEXT` | — | Поле «what_character_can_know» таблицы historical_event_phases; см. architecture doc. |
| `what_character_cannot_know` | `TEXT` | — | Поле «what_character_cannot_know» таблицы historical_event_phases; см. architecture doc. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `historical_figures`

Исторические личности.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `canonical_name` | `TEXT` | — | Каноническое имя. |
| `alt_names` | `JSONB` | NOT NULL; DEFAULT '[]' | Альтернативные имена (JSON). |
| `figure_type` | `TEXT` | — | Поле «figure_type» таблицы historical_figures; см. architecture doc. |
| `social_status` | `TEXT` | — | Поле «social_status» таблицы historical_figures; см. architecture doc. |
| `political_role` | `TEXT` | — | Поле «political_role» таблицы historical_figures; см. architecture doc. |
| `religious_role` | `TEXT` | — | Поле «religious_role» таблицы historical_figures; см. architecture doc. |
| `military_role` | `TEXT` | — | Поле «military_role» таблицы historical_figures; см. architecture doc. |
| `social_class_id` | `TEXT` | — | Поле «social_class_id» таблицы historical_figures; см. architecture doc. |
| `role_archetype_id` | `TEXT` | — | Поле «role_archetype_id» таблицы historical_figures; см. architecture doc. |
| `social_position_archetype_id` | `TEXT` | — | Поле «social_position_archetype_id» таблицы historical_figures; см. architecture doc. |
| `period_start_year` | `INTEGER` | — | Начальный год периода действия. |
| `period_end_year` | `INTEGER` | — | Конечный год периода действия. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `region_of_influence` | `TEXT` | — | Поле «region_of_influence» таблицы historical_figures; см. architecture doc. |
| `linked_events` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-список ссылок: linked_events. |
| `linked_places` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-список ссылок: linked_places. |
| `current_location_policy` | `TEXT` | — | Поле «current_location_policy» таблицы historical_figures; см. architecture doc. |
| `direct_encounter_policy` | `TEXT` | — | Поле «direct_encounter_policy» таблицы historical_figures; см. architecture doc. |
| `influence_method` | `TEXT` | — | Поле «influence_method» таблицы historical_figures; см. architecture doc. |
| `orders_or_effects` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «orders_or_effects» таблицы historical_figures; см. architecture doc. |
| `reputation` | `TEXT` | — | Поле «reputation» таблицы historical_figures; см. architecture doc. |
| `what_commoners_know` | `TEXT` | — | Поле «what_commoners_know» таблицы historical_figures; см. architecture doc. |
| `what_traders_know` | `TEXT` | — | Поле «what_traders_know» таблицы historical_figures; см. architecture doc. |
| `what_elites_know` | `TEXT` | — | Поле «what_elites_know» таблицы historical_figures; см. architecture doc. |
| `what_clergy_know` | `TEXT` | — | Поле «what_clergy_know» таблицы historical_figures; см. architecture doc. |
| `what_outsiders_know` | `TEXT` | — | Поле «what_outsiders_know» таблицы historical_figures; см. architecture doc. |
| `can_appear_directly` | `BOOLEAN` | NOT NULL; DEFAULT false | Поле «can_appear_directly» таблицы historical_figures; см. architecture doc. |
| `appearance_conditions` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «appearance_conditions» таблицы historical_figures; см. architecture doc. |
| `forbidden_uses` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «forbidden_uses» таблицы historical_figures; см. architecture doc. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

## Шаблоны и правила генерации

### `item_templates`

Шаблоны предметов.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `material_culture_id` | `TEXT` | FK → region_material_culture(id) | FK → region_material_culture(id): слой материальной культуры. |
| `title` | `TEXT` | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `item_type` | `TEXT` | — | Поле «item_type» таблицы item_templates; см. architecture doc. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `function` | `TEXT` | — | Поле «function» таблицы item_templates; см. architecture doc. |
| `typical_material` | `TEXT` | — | Типичные material (JSON или текст). |
| `weight_band` | `TEXT` | — | Диапазон/полоса: weight band. |
| `size_band` | `TEXT` | — | Диапазон/полоса: size band. |
| `durability` | `TEXT` | — | Поле «durability» таблицы item_templates; см. architecture doc. |
| `quality_band` | `TEXT` | — | Диапазон/полоса: quality band. |
| `value_band` | `TEXT` | — | Диапазон/полоса: value band. |
| `rarity` | `TEXT` | — | Поле «rarity» таблицы item_templates; см. architecture doc. |
| `legal_status` | `TEXT` | — | Поле «legal_status» таблицы item_templates; см. architecture doc. |
| `social_status_signal` | `TEXT` | — | Поле «social_status_signal» таблицы item_templates; см. architecture doc. |
| `typical_owner_roles` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные owner roles (JSON или текст). |
| `typical_holder_roles` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные holder roles (JSON или текст). |
| `typical_locations` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные locations (JSON или текст). |
| `typical_containers` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные containers (JSON или текст). |
| `visibility_default` | `TEXT` | — | Поле «visibility_default» таблицы item_templates; см. architecture doc. |
| `access_default` | `TEXT` | — | Поле «access_default» таблицы item_templates; см. architecture doc. |
| `marking_default` | `TEXT` | — | Поле «marking_default» таблицы item_templates; см. architecture doc. |
| `risk_default` | `TEXT` | — | Поле «risk_default» таблицы item_templates; см. architecture doc. |
| `skill_use` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «skill_use» таблицы item_templates; см. architecture doc. |
| `attribute_use` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «attribute_use» таблицы item_templates; см. architecture doc. |
| `possible_modifiers` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «possible_modifiers» таблицы item_templates; см. architecture doc. |
| `failure_risks` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «failure_risks» таблицы item_templates; см. architecture doc. |
| `damage_or_wear_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: damage or wear rules. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `building_templates`

Шаблоны построек.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `building_type` | `TEXT` | CHECK: house, hut, barn, stable, storehouse, workshop, church, monastery_cell, gatehouse, tower, wall, bathhouse, mill, inn, warehouse, boathouse, smithy | Поле «building_type» таблицы building_templates; см. architecture doc. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `allowed_place_types` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «allowed_place_types» таблицы building_templates; см. architecture doc. |
| `allowed_location_types` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «allowed_location_types» таблицы building_templates; см. architecture doc. |
| `required_economy` | `TEXT` | — | Поле «required_economy» таблицы building_templates; см. architecture doc. |
| `required_social_order` | `TEXT` | — | Поле «required_social_order» таблицы building_templates; см. architecture doc. |
| `typical_owner` | `TEXT` | — | Типичные owner (JSON или текст). |
| `typical_controller` | `TEXT` | — | Типичные controller (JSON или текст). |
| `typical_users` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные users (JSON или текст). |
| `materials` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «materials» таблицы building_templates; см. architecture doc. |
| `size_band` | `TEXT` | — | Диапазон/полоса: size band. |
| `wealth_level` | `TEXT` | — | Уровень: wealth level. |
| `condition_band` | `TEXT` | — | Диапазон/полоса: condition band. |
| `layout_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: layout rules. |
| `room_templates` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «room_templates» таблицы building_templates; см. architecture doc. |
| `storage_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: storage rules. |
| `access_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: access rules. |
| `locked_area_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: locked area rules. |
| `hidden_area_rules` | `JSONB` | NOT NULL; DEFAULT '[]' | Правила: hidden area rules. |
| `fire_risk` | `TEXT` | — | Поле «fire_risk» таблицы building_templates; см. architecture doc. |
| `theft_risk` | `TEXT` | — | Поле «theft_risk» таблицы building_templates; см. architecture doc. |
| `social_risk` | `TEXT` | — | Поле «social_risk» таблицы building_templates; см. architecture doc. |
| `typical_objects` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные objects (JSON или текст). |
| `typical_npc_roles` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные npc roles (JSON или текст). |
| `typical_activities` | `JSONB` | NOT NULL; DEFAULT '[]' | Типичные activities (JSON или текст). |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `location_object_rules`

Правила появления объектов в локациях.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | NOT NULL; FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `place_template_id` | `TEXT` | FK → region_place_generation_rules(id) | FK: на region_place_generation_rules(id) в place_generation_limits/location_object_rules; на place_templates(id) в graph_nodes. |
| `place_id` | `TEXT` | FK → places(id) | FK → places(id): конкретное место, если применимо. |
| `location_type` | `TEXT` | — | Поле «location_type» таблицы location_object_rules; см. architecture doc. |
| `building_type` | `TEXT` | — | Поле «building_type» таблицы location_object_rules; см. architecture doc. |
| `object_category` | `TEXT` | — | Поле «object_category» таблицы location_object_rules; см. architecture doc. |
| `item_template_id` | `TEXT` | FK → item_templates(id) | FK → item_templates(id): шаблон предмета. |
| `probability_band` | `TEXT` | — | Диапазон/полоса: probability band. |
| `required_reason` | `TEXT` | — | Поле «required_reason» таблицы location_object_rules; см. architecture doc. |
| `required_owner` | `TEXT` | — | Поле «required_owner» таблицы location_object_rules; см. architecture doc. |
| `required_holder` | `TEXT` | — | Поле «required_holder» таблицы location_object_rules; см. architecture doc. |
| `visibility_default` | `TEXT` | — | Поле «visibility_default» таблицы location_object_rules; см. architecture doc. |
| `access_default` | `TEXT` | — | Поле «access_default» таблицы location_object_rules; см. architecture doc. |
| `legal_risk` | `TEXT` | — | Поле «legal_risk» таблицы location_object_rules; см. architecture doc. |
| `social_risk` | `TEXT` | — | Поле «social_risk» таблицы location_object_rules; см. architecture doc. |
| `economic_justification` | `TEXT` | — | Поле «economic_justification» таблицы location_object_rules; см. architecture doc. |
| `can_be_generated` | `BOOLEAN` | NOT NULL; DEFAULT false | Поле «can_be_generated» таблицы location_object_rules; см. architecture doc. |
| `must_be_pregenerated` | `BOOLEAN` | NOT NULL; DEFAULT false | Поле «must_be_pregenerated» таблицы location_object_rules; см. architecture doc. |
| `forbidden_without_reason` | `BOOLEAN` | NOT NULL; DEFAULT false | Поле «forbidden_without_reason» таблицы location_object_rules; см. architecture doc. |
| `container_policy` | `TEXT` | — | Поле «container_policy» таблицы location_object_rules; см. architecture doc. |
| `hidden_policy` | `TEXT` | — | Поле «hidden_policy» таблицы location_object_rules; см. architecture doc. |
| `game_use` | `TEXT` | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

## Мета, источники, LLM

### `source_records`

Библиография и проектные источники; основа для record_sources.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `title` | `TEXT` | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `source_type` | `TEXT` | CHECK: book, article, chronicle, academic_database, museum, map, archaeology, web, project_note, llm_draft, manual_entry | book, article, chronicle, academic_database, project_note, … |
| `author` | `TEXT` | — | Поле «author» таблицы source_records; см. architecture doc. |
| `publication_year` | `INTEGER` | — | Год публикации; NULL если ongoing/неизвестен. |
| `period_covered` | `TEXT` | — | Период истории, который покрывает источник. |
| `region_covered` | `TEXT` | — | География источника. |
| `url` | `TEXT` | — | Поле «url» таблицы source_records; см. architecture doc. |
| `file_reference` | `TEXT` | — | Поле «file_reference» таблицы source_records; см. architecture doc. |
| `page_or_section` | `TEXT` | — | Поле «page_or_section» таблицы source_records; см. architecture doc. |
| `quote_short` | `TEXT` | — | Поле «quote_short» таблицы source_records; см. architecture doc. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `reliability_level` | `TEXT` | — | Оценка надёжности (произвольный текст или код). |
| `bias_notes` | `TEXT` | — | Поле «bias_notes» таблицы source_records; см. architecture doc. |
| `usefulness` | `TEXT` | — | Поле «usefulness» таблицы source_records; см. architecture doc. |
| `limitations` | `TEXT` | — | Поле «limitations» таблицы source_records; см. architecture doc. |
| `checked_by` | `TEXT` | — | Кто проверил источник. |
| `checked_at` | `TIMESTAMPTZ` | — | Когда проверили. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `record_sources`

Связующая таблица: какие источники подтверждают какую запись.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `source_id` | `TEXT` | NOT NULL; FK → source_records(id) | FK → source_records(id): подтверждающий источник. |
| `target_table` | `TEXT` | NOT NULL | Имя таблицы цели (полиморфная ссылка, без FK в DDL). |
| `target_record_id` | `TEXT` | NOT NULL | id записи в target_table (полиморфная ссылка). |
| `support_type` | `TEXT` | CHECK: supports, contradicts, partial, background, uncertain | supports, contradicts, partial, background, uncertain. |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `page_or_section` | `TEXT` | — | Поле «page_or_section» таблицы record_sources; см. architecture doc. |
| `confidence` | `TEXT` | CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `contradiction_notes` | `TEXT` | — | Поле «contradiction_notes» таблицы record_sources; см. architecture doc. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `audit_log`

История ручных правок.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `target_table` | `TEXT` | NOT NULL | Имя таблицы цели (полиморфная ссылка, без FK в DDL). |
| `target_record_id` | `TEXT` | NOT NULL | id записи в target_table (полиморфная ссылка). |
| `action_type` | `TEXT` | CHECK: created, updated, approved, rejected, marked_conflict, merged, split, needs_review | created, updated, approved, rejected, marked_conflict, merged, split, needs_review. |
| `old_value` | `JSONB` | — | JSON или текст старого значения. |
| `new_value` | `JSONB` | — | JSON или текст нового значения. |
| `reason` | `TEXT` | — | Поле «reason» таблицы audit_log; см. architecture doc. |
| `changed_by` | `TEXT` | — | Кто внёс изменение. |
| `changed_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Поле «changed_at» таблицы audit_log; см. architecture doc. |
| `review_status` | `TEXT` | — | Статус ревью правки. |
| `notes` | `TEXT` | — | Поле «notes» таблицы audit_log; см. architecture doc. |

### `llm_context_packs`

Готовые компактные пакеты контекста для LLM.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `context_type` | `TEXT` | CHECK: region_start, new_place_generation, npc_generation, route_generation, historical_check, scene_context, repair_context | region_start, new_place_generation, npc_generation, route_generation, … |
| `summary` | `TEXT` | — | Краткое содержание: что это и зачем в игре. |
| `included_tables` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON: какие таблицы входят в пакет. |
| `included_record_ids` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON: конкретные id записей. |
| `prompt_text` | `TEXT` | — | Готовый текст для вставки в промпт. |
| `hard_constraints` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON: жёсткие ограничения для LLM. |
| `forbidden_assumptions` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «forbidden_assumptions» таблицы llm_context_packs; см. architecture doc. |
| `known_gaps` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «known_gaps» таблицы llm_context_packs; см. architecture doc. |
| `use_when` | `TEXT` | — | Поле «use_when» таблицы llm_context_packs; см. architecture doc. |
| `do_not_use_when` | `TEXT` | — | Поле «do_not_use_when» таблицы llm_context_packs; см. architecture doc. |
| `max_tokens_estimate` | `INTEGER` | — | Оценка размера пакета в токенах. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

### `llm_validation_rules`

Правила проверки генерации.

| Поле | Тип | Ограничения | Назначение |
|------|-----|-------------|------------|
| `id` | `TEXT` | PK | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | FK → regions(id) | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `validation_type` | `TEXT` | — | Тип проверки генерации. |
| `rule_text` | `TEXT` | — | Текст правила валидации. |
| `applies_to_table` | `TEXT` | — | Применяется к: table (JSON). |
| `applies_to_generation_step` | `TEXT` | — | На каком шаге пайплайна проверять. |
| `severity` | `TEXT` | CHECK: warning, error, hard_block | warning, error, hard_block. |
| `failure_message` | `TEXT` | — | Поле «failure_message» таблицы llm_validation_rules; см. architecture doc. |
| `repair_instruction` | `TEXT` | — | Поле «repair_instruction» таблицы llm_validation_rules; см. architecture doc. |
| `examples_valid` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «examples_valid» таблицы llm_validation_rules; см. architecture doc. |
| `examples_invalid` | `JSONB` | NOT NULL; DEFAULT '[]' | Поле «examples_invalid» таблицы llm_validation_rules; см. architecture doc. |
| `status` | `TEXT` | NOT NULL; DEFAULT 'draft'; CHECK: draft, usable_with_caution, approved, needs_review, conflict, rejected | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | NOT NULL; DEFAULT 'unknown'; CHECK: unknown, low, medium_low, medium, medium_high, high | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | NOT NULL; DEFAULT '[]' | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL; DEFAULT now() | Время последнего изменения (обновляется триггером). |

---

*Сгенерировано: 2026-07-08 · таблиц: 62*
