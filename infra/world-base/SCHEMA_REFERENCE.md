<!-- GENERATED FILE. Sources: infra/world-base/schema.sql, infra/world-base/schema/*.sql and infra/world-base/field-descriptions.js. Run `npm run world-db:schema-doc`; do not edit manually. -->
# Справочник схемы `world_base`

- Исполняемый источник: `infra/world-base/schema.sql` и 12 упорядоченных SQL-частей.
- SHA-256 развёрнутого DDL: `b32bded12b0912470fb81cdeedfc96d7e8bcb0dde9e8b0084703432a40e08a52`.
- Таблиц: 138.
- Описания берутся только из утверждённого `infra/world-base/field-descriptions.js`; отсутствие описания не заполняется эвристикой.

## Граф (каноническая карта)

### `world_base.graph_scale_rules`

Правила масштаба графа G0–G5: единицы пути, типичные длины рёбер. Метрики G1-ячейки (32 км, 8 GU) — на graph_nodes, не здесь.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `scale_level` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (scale_level IN ('G0', 'G1', 'G2', 'G3', 'G4', 'G5'))` | G0–G5: уровень вложенности графа. |
| `title` | `TEXT` | да | — | — | — | Человекочитаемое название записи. |
| `unit` | `TEXT` | да | — | — | — | Единица измерения на уровне (route_chain, GU, minutes, …). |
| `typical_edge_min` | `NUMERIC` | да | — | — | — | Нижняя граница типичного ребра на уровне. |
| `typical_edge_max` | `NUMERIC` | да | — | — | — | Верхняя граница типичного ребра. |
| `time_unit` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `uses_gu` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Использует ли уровень graph units. |
| `uses_minutes` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Использует ли уровень минуты. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.graph_edge_modifiers`

Множители времени/риска пути по местности, сезону, погоде и др.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `title` | `TEXT` | да | — | — | — | Человекочитаемое название записи. |
| `modifier_type` | `TEXT` | да | — | — | `CHECK (modifier_type IS NULL OR modifier_type IN ( 'terrain','season','weather','load','access','visibility','stealth','injury','transport','risk' ))` | Тип модификатора: terrain, season, weather, load, access, visibility, … |
| `applies_to_edge_type` | `TEXT` | да | — | — | — | К каким edge_type применяется. |
| `applies_to_terrain_type` | `TEXT` | да | — | — | — | К какой местности применяется. |
| `applies_to_season` | `TEXT` | да | — | — | — | К какому сезону применяется. |
| `multiplier` | `NUMERIC` | да | — | — | — | Множитель к базовому времени/риску ребра. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `example` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |
| `landscape_template_id` | `TEXT` | да | — | `world_base.landscape_templates(id) ON DELETE SET NULL` | — | FK → landscape_templates(id): рекомендуется для modifier_type=terrain (см. seed offroad). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.graph_nodes`

Канонические узлы карты; G1 — дневные ячейки региона (region_cell), G2–G5 — вложенные уровни.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `slug` | `TEXT` | да | — | — | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | да | — | — | — | Человекочитаемое название записи. |
| `node_type` | `TEXT` | да | — | — | `CHECK (node_type IS NULL OR node_type IN ( 'world_region','subregion','place','location','minilocation','scene_anchor', 'route_junction','river_junction','ford','ferry','gate','road_segment', 'water_segment','border_crossing','sea_crossing','mountain_pass','desert_oasis','steppe_camp', 'region_cell','cell_subgraph','map_corridor','geographic_landmark','historical_landmark' ))` | Тип узла: world_region, region_cell, place, location, scene_anchor, ford, … |
| `scale_level` | `TEXT` | да | — | — | `CHECK (scale_level IS NULL OR scale_level IN ('G0', 'G1', 'G2', 'G3', 'G4'))` | Уровень графа: G0 (регион) … G5 (точка сцены). |
| `parent_node_id` | `TEXT` | да | — | `world_base.graph_nodes(id) ON DELETE SET NULL` | — | FK → graph_nodes(id): родительский узел графа. |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `place_id` | `TEXT` | да | — | `world_base.places(id) ON DELETE SET NULL` | — | FK → places(id): конкретное место, если применимо. |
| `grid_x` | `INTEGER` | да | — | — | — | Координата X в сетке G1-ячеек региона. |
| `grid_y` | `INTEGER` | да | — | — | — | Координата Y в сетке G1-ячеек региона. |
| `grid_z` | `INTEGER` | нет | `0` | — | `NOT NULL` | Вертикальный/слойный индекс; для поверхности = 0. |
| `region_cell_code` | `TEXT` | да | — | — | — | Человекочитаемый код ячейки (напр. nov_06_04). |
| `cell_shape` | `TEXT` | да | — | — | `CHECK (cell_shape IS NULL OR cell_shape IN ('square', 'partial', 'irregular', 'water', 'border'))` | Форма ячейки: square, partial, irregular, water, border. |
| `region_cell_status` | `TEXT` | да | — | — | `CHECK (region_cell_status IS NULL OR region_cell_status IN ('active', 'partial', 'border', 'outside_region', 'water_only'))` | Статус ячейки в сетке: active, partial, border, outside_region, water_only (не путать с status записи). |
| `cell_size_km` | `NUMERIC` | да | — | — | — | Размер стороны G1-ячейки в км (обычно ~32). |
| `crossing_base_gu` | `NUMERIC` | да | — | — | — | Базовая стоимость пересечения ячейки в GU (1 GU ≈ 4 км, 1 ч пешком). |
| `crossing_base_time_hours` | `NUMERIC` | да | — | — | — | Базовое время пересечения ячейки в часах при нормальных условиях. |
| `primary_landscape_template_id` | `TEXT` | да | — | `world_base.landscape_templates(id) ON DELETE SET NULL` | — | FK → landscape_templates(id): основной ландшафт узла; для G1 region_cell обязателен; должен быть в region_landscape_templates региона. |
| `secondary_landscape_template_ids` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON: id дополнительных landscape_templates для смешанного ландшафта. |
| `landscape_mix_notes` | `TEXT` | да | — | — | — | Пояснение смеси primary и secondary ландшафтов (не замена FK). |
| `primary_water_body_template_id` | `TEXT` | да | — | `world_base.water_body_templates(id) ON DELETE SET NULL` | — | FK → water_body_templates(id): главный водный объект/среда узла. |
| `secondary_water_body_template_ids` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON: дополнительные water_body_templates; смешение воды — через primary/secondary, не landscape_group. |
| `hydrology_notes` | `TEXT` | да | — | — | — | Текстовое пояснение водной ситуации: где вода в ячейке, сезонность, брод/пристань на G2. Обязателен при primary_water_body_template_id на G1. |
| `land_use_template_ids` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON: хозяйственное использование узла (пашня, покос, …); не landscape_template. |
| `place_template_id` | `TEXT` | да | — | `world_base.place_templates(id) ON DELETE SET NULL` | — | FK → place_templates(id): тип места/поселения, если узел — place; проверка через region_place_templates. |
| `terrain_profile` | `TEXT` | да | — | — | — | Legacy/editor hint: профиль местности; источник истины — FK на шаблоны слоёв. |
| `water_profile` | `TEXT` | да | — | — | — | Legacy/editor hint: водные объекты; источник истины — water_body_template FK/JSON. |
| `road_profile` | `TEXT` | да | — | — | — | Legacy/editor hint: дороги в узле; источник истины — graph_edges + route_templates. |
| `settlement_density` | `TEXT` | да | — | — | — | Legacy/editor hint: плотность поселений; источник истины — place_template_id / places. |
| `dominant_content` | `TEXT` | да | — | — | — | Legacy/editor hint: что преобладает; источник истины — FK/JSON шаблонов слоёв. |
| `known_landmarks` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON: известные ориентиры в узле. |
| `canonical_corridors` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON: канонические коридоры движения через узел. |
| `neighbor_node_ids` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON: id соседних graph_nodes. Не источник истины; кеш/подсказка для редактора. Истина о связях — в graph_edges. |
| `historical_status` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `is_known_to_player_default` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Известен ли узел игроку по умолчанию (канон, не партия). |
| `is_known_to_character_default` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Известен ли узел персонажу по умолчанию. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- `CHECK ( NOT (scale_level = 'G1' AND node_type = 'region_cell') OR ( grid_x IS NOT NULL AND grid_y IS NOT NULL AND grid_z IS NOT NULL AND cell_size_km IS NOT NULL AND crossing_base_gu IS NOT NULL AND crossing_base_time_hours IS NOT NULL AND region_cell_status IS NOT NULL AND primary_landscape_template_id IS NOT NULL ) )`
- `FOREIGN KEY (region_id, primary_landscape_template_id) REFERENCES world_base.region_landscape_templates(region_id, landscape_template_id)`
- `UNIQUE INDEX graph_nodes_region_grid_unique (region_id, grid_x, grid_y, grid_z) WHERE scale_level = 'G1' AND node_type = 'region_cell'`

### `world_base.graph_edges`

Канонические связи между узлами графа; offroad_crossing — переход между G1-клетками без дороги; landscape_template_id обязателен для offroad_crossing.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `from_node_id` | `TEXT` | нет | — | `world_base.graph_nodes(id) ON DELETE CASCADE` | `NOT NULL` | FK → graph_nodes(id): узел начала ребра. |
| `to_node_id` | `TEXT` | нет | — | `world_base.graph_nodes(id) ON DELETE CASCADE` | `NOT NULL` | FK → graph_nodes(id): узел конца ребра. |
| `reverse_edge_id` | `TEXT` | да | — | `world_base.graph_edges(id) ON DELETE SET NULL` | — | FK → graph_edges(id): обратное ребро, если путь двусторонний. |
| `scale_level` | `TEXT` | да | — | — | `CHECK (scale_level IS NULL OR scale_level IN ('G0', 'G1', 'G2', 'G3', 'G4'))` | Описание отсутствует. |
| `edge_type` | `TEXT` | да | — | — | `CHECK (edge_type IS NULL OR edge_type IN ( 'road','path','river','lake_route','sea_route','winter_road','ford','ferry','bridge', 'gate','street','door','yard_passage','forest_track','offroad_crossing','mountain_pass','desert_route', 'steppe_route','border_transition','corridor_segment','portage' ))` | Тип связи: road, path, offroad_crossing (G1 без дороги), corridor_segment (крупный коридор), portage (волок), ford, ferry, border_transition, … |
| `base_gu` | `NUMERIC` | да | — | — | — | Базовая длина ребра в graph units (1 GU ≈ 4 км пешком). |
| `base_distance_km` | `NUMERIC` | да | — | — | — | Ориентировочная дистанция в км. |
| `base_time_minutes` | `NUMERIC` | да | — | — | — | Базовое время для G3–G5 (минуты). |
| `base_time_hours` | `NUMERIC` | да | — | — | — | Базовое время в часах. |
| `base_time_days` | `NUMERIC` | да | — | — | — | Базовое время в днях (дальние G0-переходы). |
| `route_template_id` | `TEXT` | да | — | `world_base.route_templates(id) ON DELETE SET NULL` | — | FK → route_templates(id): тип движения; обязателен для road/path/forest_track/winter_road/portage/corridor_segment. |
| `landscape_template_id` | `TEXT` | да | — | `world_base.landscape_templates(id) ON DELETE SET NULL` | — | FK → landscape_templates(id): среда прохождения ребра; обязателен для offroad_crossing. |
| `water_body_template_id` | `TEXT` | да | — | `world_base.water_body_templates(id) ON DELETE SET NULL` | — | FK → water_body_templates(id): водная среда; обязателен для river/lake_route/sea_route/ford/ferry/bridge. |
| `terrain_type` | `TEXT` | да | — | — | — | Legacy-текст местности ребра; источник истины — landscape_template_id. |
| `route_surface` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `seasonal_rule` | `TEXT` | да | — | — | — | Сезонная доступность или модификатор. |
| `access_rule` | `TEXT` | да | — | — | — | Кто и при каких условиях может пройти. |
| `risk_level` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `known_to_commoners` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `known_to_traders` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `known_to_elites` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `known_to_clergy` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `known_to_character_default` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `requires_guide` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Нужен ли проводник. |
| `requires_boat` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Нужна ли лодка. |
| `requires_horse` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Нужна ли лошадь. |
| `requires_sled` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Нужны ли сани. |
| `requires_permission` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Нужно ли разрешение власти. |
| `requires_orientation_check` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Нужна ли проверка ориентирования/поиска направления. |
| `orientation_difficulty` | `TEXT` | да | — | — | `CHECK (orientation_difficulty IS NULL OR orientation_difficulty IN ('none', 'easy', 'ordinary', 'hard', 'dangerous', 'extreme'))` | Сложность ориентирования: none, easy, ordinary, hard, dangerous, extreme. |
| `movement_risk_profile` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив рисков пути (lost_time, getting_lost, fatigue, wild_animals, …). |
| `failure_consequences` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив последствий провала (lose_1d4_hours, exit_to_wrong_neighbor_cell, …). |
| `historical_status` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- `CHECK (NOT (edge_type = 'offroad_crossing') OR landscape_template_id IS NOT NULL)`
- `CHECK (edge_type IS NULL OR edge_type NOT IN ('river', 'lake_route', 'sea_route', 'ford', 'ferry', 'bridge') OR water_body_template_id IS NOT NULL)`
- `CHECK (edge_type IS NULL OR edge_type NOT IN ('road', 'path', 'forest_track', 'winter_road', 'portage', 'corridor_segment') OR route_template_id IS NOT NULL)`

### `world_base.graph_edge_knowledge_rules`

Кто из ролей/профессий какие рёбра графа знает и насколько точно.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `graph_edge_id` | `TEXT` | нет | — | `world_base.graph_edges(id) ON DELETE CASCADE` | `NOT NULL` | FK → graph_edges(id): каноническое ребро графа. |
| `social_role_id` | `TEXT` | да | — | `world_base.region_social_roles(id) ON DELETE SET NULL` | — | FK → region_social_roles(id): социальная роль. |
| `occupation_id` | `TEXT` | да | — | `world_base.region_occupations(id) ON DELETE SET NULL` | — | FK → region_occupations(id): профессия/занятие. |
| `knowledge_level` | `TEXT` | да | — | — | `CHECK (knowledge_level IS NULL OR knowledge_level IN ( 'knows_exact','knows_roughly','heard_rumor','does_not_know','false_belief' ))` | knows_exact, knows_roughly, heard_rumor, does_not_know, false_belief. |
| `knowledge_source` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `accuracy` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `common_mistakes` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `seasonal_limitations` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `danger_awareness` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `landmarks_known` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `places_known_on_graph_edge` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON: места, известные по этому ребру графа. |
| `can_guide_others` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Может ли проводить других по этому ребру. |
| `will_share_for_free` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Расскажет ли путь бесплатно. |
| `will_share_for_payment` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Расскажет ли за плату. |
| `will_hide_or_lie` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Скроет или солжёт о пути. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

## Ландшафт (базовая среда)

### `world_base.landscape_templates`

Справочник базовой природно-географической среды (лес, болото, пойма, …); не дороги, не вода, не поселения, не хозяйство.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `slug` | `TEXT` | нет | — | — | `NOT NULL`<br>`UNIQUE` | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | нет | — | — | `NOT NULL` | Человекочитаемое название записи. |
| `parent_landscape_template_id` | `TEXT` | да | — | `world_base.landscape_templates(id) ON DELETE SET NULL` | — | FK → landscape_templates(id): родитель в иерархии частных вариантов среды. |
| `landscape_group` | `TEXT` | да | — | — | `CHECK (landscape_group IS NULL OR landscape_group IN ( 'forest','swamp','meadow','floodplain','hill','ravine', 'steppe','marsh','bog','mountain','desert', 'coast','riverbank','lake_shore' ))` | Природная группа суши: forest, swamp, meadow, floodplain, hill, ravine, steppe, marsh, bog, mountain, desert. Без mixed/water/road/settlement/urban/field. Без riverbank/lake_shore/coast — берег только G2–G5 или hydrology_notes. |
| `base_environment` | `TEXT` | нет | — | — | `NOT NULL` | Главный природный класс среды (NOT NULL); не объект, не инфраструктура, не хозяйство. |
| `dominant_vegetation` | `TEXT` | да | — | — | — | Преобладающая растительность, если применимо. |
| `forest_type` | `TEXT` | да | — | — | — | Тип леса для лесной среды. |
| `moisture_level` | `TEXT` | да | — | — | — | Влажность среды: сухая, влажная, заболоченная и т.п. |
| `relief_type` | `TEXT` | да | — | — | — | Рельеф: равнина, холмы, овраг, склон, горная зона. |
| `soil_ground_type` | `TEXT` | да | — | — | — | Почва/грунт: движение, строительство, сезонность. |
| `openness` | `TEXT` | да | — | — | — | Открытость для обзора, движения, засады, ориентирования. |
| `seasonal_stability` | `TEXT` | да | — | — | — | Насколько среда меняется по сезонам. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `base_movement_multiplier` | `NUMERIC` | да | — | — | — | Базовый множитель к нормальному пешему GU (1 = норма). |
| `default_orientation_difficulty` | `TEXT` | да | — | — | `CHECK (default_orientation_difficulty IS NULL OR default_orientation_difficulty IN ( 'none', 'easy', 'ordinary', 'hard', 'dangerous', 'extreme' ))` | Сложность ориентирования: none, easy, ordinary, hard, dangerous, extreme. |
| `base_risk_level` | `TEXT` | да | — | — | `CHECK (base_risk_level IS NULL OR base_risk_level IN ( 'none', 'low', 'medium', 'high', 'extreme' ))` | Базовый риск ландшафта: none, low, medium, high, extreme. |
| `game_use` | `TEXT` | да | — | — | — | Базовая природная среда для primary/secondary на graph_nodes и landscape_template_id при offroad_crossing; LLM — проходимость, ориентация, риск, сезон, наполнение сцены. |
| `limits` | `TEXT` | да | — | — | — | Не дорога, не поселение, не пашня, не вода, не берег, не маршрут; инфраструктура/хозяйство/вода/берег — route_templates, place_templates, land_use_templates, water_body_templates, graph. Для *_dominant болот/топей — только primary при доминировании в G1; для floodplain_* — не обычный берег реки. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.region_landscape_templates`

Какие базовые природные среды допустимы в регионе: is_allowed, веса генерации.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `landscape_template_id` | `TEXT` | нет | — | `world_base.landscape_templates(id) ON DELETE CASCADE` | `NOT NULL` | FK → landscape_templates(id): канонический ландшафт ребра (обязателен для offroad_crossing). |
| `is_allowed` | `BOOLEAN` | нет | `true` | — | `NOT NULL` | Разрешена ли базовая среда для узлов/рёбер региона (trigger + LLM). |
| `is_common` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Частая среда региона. |
| `is_dominant` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Доминирующая среда региона. |
| `is_rare` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Редкая среда региона. |
| `generation_weight` | `NUMERIC` | нет | `0` | — | `NOT NULL`<br>`CHECK (generation_weight >= 0)` | Вес при генерации/распределении (>= 0). |
| `allowed_scale_levels` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON: допустимые scale_level (G1, G2, …). |
| `allowed_node_types` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON: допустимые node_type для этой среды в регионе. |
| `regional_limits` | `TEXT` | да | — | — | — | Региональные ограничения. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- `UNIQUE (region_id, landscape_template_id)`

## Вода

### `world_base.water_body_templates`

Типы водных объектов и водной среды: солёность, течение, глубина, судоходность, бродимость, лёд.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `slug` | `TEXT` | нет | — | — | `NOT NULL`<br>`UNIQUE` | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | нет | — | — | `NOT NULL` | Человекочитаемое название записи. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `water_body_type` | `TEXT` | нет | — | — | `NOT NULL` | Тип водного объекта (река, озеро, море, ручей, …). |
| `salinity` | `TEXT` | нет | — | — | `NOT NULL` | Пресная/солёная/браковая вода. |
| `flow_type` | `TEXT` | да | — | — | — | Течение: стоячая, медленная, быстрая, … |
| `typical_depth` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `typical_width` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `drinkable_default` | `TEXT` | да | — | — | — | Питьевая пригодность по умолчанию. |
| `supports_boat` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Допускает или требует судно. |
| `supports_fishing` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `supports_ford` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Возможен брод. |
| `supports_ferry` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Возможна переправа. |
| `supports_bridge` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Возможен мост. |
| `supports_winter_crossing` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Переход по льду/зимнику. |
| `freeze_pattern` | `TEXT` | да | — | — | — | Паттерн замерзания по сезонам. |
| `flood_risk` | `TEXT` | да | — | — | — | Риск паводка/подтопления. |
| `base_crossing_risk` | `TEXT` | да | — | — | — | Базовый риск переправы. |
| `navigation_use` | `TEXT` | да | — | — | — | Судоходность и навигация: допустимые суда, сезонность, ограничения хода. |
| `water_hazard_notes` | `TEXT` | да | — | — | — | Типичные водные опасности: лёд, течение, топь, прилив, промоины. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM используют тип воды на G1 (primary/secondary water_body_template_id) и на рёбрах (water_body_template_id). |
| `limits` | `TEXT` | да | — | — | — | Что этот тип не заменяет: не берег, не маршрут, не конкретная река/озеро; берег — G2–G5 или hydrology_notes. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.region_water_body_templates`

Какие типы водных объектов допустимы в регионе.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `water_body_template_id` | `TEXT` | нет | — | `world_base.water_body_templates(id) ON DELETE CASCADE` | `NOT NULL` | FK → water_body_templates(id): водная среда ребра (река, брод, переправа, …). |
| `is_allowed` | `BOOLEAN` | нет | `true` | — | `NOT NULL` | Описание отсутствует. |
| `is_common` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `is_dominant` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `is_rare` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `generation_weight` | `NUMERIC` | нет | `0` | — | `NOT NULL`<br>`CHECK (generation_weight >= 0)` | Описание отсутствует. |
| `allowed_scale_levels` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `allowed_node_types` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `regional_limits` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- `UNIQUE (region_id, water_body_template_id)`

## Инфраструктура

### `world_base.route_templates`

Шаблоны типов движения и инфраструктуры (дорога, тропа, зимник, волок); не заменяет graph_edges.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `slug` | `TEXT` | нет | — | — | `NOT NULL`<br>`UNIQUE` | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | нет | — | — | `NOT NULL` | Человекочитаемое название записи. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `route_kind` | `TEXT` | нет | — | — | `NOT NULL` | Класс инфраструктуры: дорога, тропа, зимник, волок, речной ход, … |
| `default_edge_type` | `TEXT` | да | — | — | — | Типичный edge_type для graph_edges с этим шаблоном. |
| `surface_type` | `TEXT` | да | — | — | — | Покрытие/поверхность пути. |
| `requires_landscape_template` | `BOOLEAN` | нет | `true` | — | `NOT NULL` | Ребро должно иметь landscape_template_id. |
| `requires_water_body_template` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Ребро должно иметь water_body_template_id. |
| `supports_pedestrian` | `BOOLEAN` | нет | `true` | — | `NOT NULL` | Описание отсутствует. |
| `supports_horse` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `supports_cart` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `supports_sled` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `supports_boat` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `seasonal_availability` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `default_access_rule` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `default_orientation_difficulty` | `TEXT` | да | — | — | `CHECK (default_orientation_difficulty IS NULL OR default_orientation_difficulty IN ( 'none', 'easy', 'ordinary', 'hard', 'dangerous', 'extreme' ))` | Описание отсутствует. |
| `default_risk_level` | `TEXT` | да | — | — | `CHECK (default_risk_level IS NULL OR default_risk_level IN ( 'none', 'low', 'medium', 'high', 'extreme' ))` | Описание отсутствует. |
| `default_movement_multiplier` | `NUMERIC` | да | — | — | — | Базовый множитель времени для этого типа пути. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

## Хозяйство

### `world_base.land_use_templates`

Хозяйственное использование среды: пашня, покос, выгон, вырубка и т.п.; не базовый ландшафт.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `slug` | `TEXT` | нет | — | — | `NOT NULL`<br>`UNIQUE` | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | нет | — | — | `NOT NULL` | Человекочитаемое название записи. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `land_use_kind` | `TEXT` | нет | — | — | `NOT NULL` | Вид хозяйственного использования: пашня, покос, выгон, … |
| `requires_settlement_nearby` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Требует близкого поселения. |
| `requires_water_nearby` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `requires_specific_landscape` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Требует конкретную базовую среду. |
| `compatible_landscape_template_ids` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON: совместимые базовые среды. |
| `compatible_water_body_template_ids` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON: совместимые водные типы. |
| `seasonal_pattern` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `labor_intensity` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `economic_use` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `visibility_effect` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `movement_effect` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `risk_effect` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.region_land_use_templates`

Какие типы хозяйственного использования допустимы в регионе.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `land_use_template_id` | `TEXT` | нет | — | `world_base.land_use_templates(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `is_allowed` | `BOOLEAN` | нет | `true` | — | `NOT NULL` | Описание отсутствует. |
| `is_common` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `is_rare` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `generation_weight` | `NUMERIC` | нет | `0` | — | `NOT NULL`<br>`CHECK (generation_weight >= 0)` | Описание отсутствует. |
| `allowed_scale_levels` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `allowed_node_types` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `regional_limits` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- `UNIQUE (region_id, land_use_template_id)`

## Места

### `world_base.place_templates`

Глобальный справочник типов устойчивых мест и поселений (деревня, погост, …); не ландшафт.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `slug` | `TEXT` | нет | — | — | `NOT NULL`<br>`UNIQUE` | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | нет | — | — | `NOT NULL` | Человекочитаемое название записи. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `place_kind` | `TEXT` | нет | — | — | `NOT NULL` | Тип места: деревня, погост, монастырь, … |
| `default_node_type` | `TEXT` | да | — | — | — | Типичный node_type graph_nodes для этого места. |
| `can_exist_inside_landscape` | `BOOLEAN` | нет | `true` | — | `NOT NULL` | Описание отсутствует. |
| `requires_water_nearby` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `requires_route_nearby` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `requires_land_use` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `compatible_landscape_template_ids` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON: на каких средах возможно. |
| `compatible_water_body_template_ids` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `compatible_route_template_ids` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON: какие типы путей нужны рядом. |
| `compatible_land_use_template_ids` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON: типичное хозяйство рядом. |
| `typical_scale_level` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `settlement_density_effect` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `access_logic` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `social_logic` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `economic_logic` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `defense_logic` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.region_place_templates`

Тонкая связка region ↔ place_templates: какие типы мест разрешены в регионе.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `place_template_id` | `TEXT` | нет | — | `world_base.place_templates(id) ON DELETE CASCADE` | `NOT NULL` | FK: на region_place_generation_rules(id) в place_generation_limits/location_object_rules; на place_templates(id) в graph_nodes. |
| `is_allowed` | `BOOLEAN` | нет | `true` | — | `NOT NULL` | Разрешён ли тип места в регионе. |
| `is_common` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `is_rare` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `generation_weight` | `NUMERIC` | нет | `0` | — | `NOT NULL`<br>`CHECK (generation_weight >= 0)` | Вес при генерации (>= 0). |
| `allowed_scale_levels` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `allowed_node_types` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `regional_limits` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- `UNIQUE (region_id, place_template_id)`

### `world_base.region_place_generation_rules`

Региональные правила генерации типовых мест (fat table).

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | да | — | — | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | да | — | — | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `template_type` | `TEXT` | да | — | — | `CHECK (template_type IS NULL OR template_type IN ( 'village','fishing_village','forest_camp','charcoal_burner_camp','logging_camp','winter_hut','pogost','ferry','ford','roadside_inn','market_site','monastery_dependency','watch_post','hunting_camp','beekeeping_site' ))` | Тип генерируемого места: village, pogost, forest_camp, … |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `generation_allowed` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Разрешена ли LLM-генерация по этому правилу. |
| `max_instances_per_region` | `INTEGER` | да | — | — | — | Описание отсутствует. |
| `min_distance_from_major_place` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `required_landscape` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `required_economy` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `required_route_access` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `required_water_access` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `seasonal_availability` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `typical_population_band` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `typical_household_count` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `typical_wealth_level` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `typical_authority` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `typical_social_roles` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_occupations` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_buildings` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_animals` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_tools` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_goods` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_food_sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_risks` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_conflicts` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `layout_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON: правила планировки места. |
| `naming_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `access_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `law_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `religion_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `trade_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `defense_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `npc_generation_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON: правила NPC для места. |
| `item_generation_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `route_generation_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `historical_plausibility_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.place_generation_limits`

Описание назначения отсутствует.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `place_template_id` | `TEXT` | да | — | `world_base.region_place_generation_rules(id) ON DELETE SET NULL` | — | FK: на region_place_generation_rules(id) в place_generation_limits/location_object_rules; на place_templates(id) в graph_nodes. |
| `max_total` | `INTEGER` | да | — | — | — | Описание отсутствует. |
| `max_per_subregion` | `INTEGER` | да | — | — | — | Описание отсутствует. |
| `min_total_if_region_active` | `INTEGER` | да | — | — | — | Описание отсутствует. |
| `economic_basis_required` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `route_basis_required` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `water_basis_required` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `authority_basis_required` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `historical_anchor_basis_required` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `allowed_near_place_types` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `forbidden_near_place_types` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `minimum_distance_band` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `maximum_distance_band` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `density_logic` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `naming_policy` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `duplication_policy` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.places`

Конкретные утверждённые места: исторические и сгенерированные.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `template_id` | `TEXT` | да | — | `world_base.region_place_generation_rules(id) ON DELETE SET NULL` | — | FK → region_place_generation_rules(id): правило генерации типа места. |
| `slug` | `TEXT` | да | — | — | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `canonical_name` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `display_name` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `alt_names` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `place_type` | `TEXT` | да | — | — | `CHECK (place_type IS NULL OR place_type IN ( 'city','posad','village','selo','pogost','monastery','fortress','yard','inn','ferry','ford','pier','market','road_segment','forest_camp','winter_hut','watch_post','border_zone' ))` | city, village, pogost, monastery, ford, pier, … |
| `historical_status` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `is_fixed_historical_place` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Исторически фиксированное место (не процедурное). |
| `is_generated_place` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Место создано LLM и утверждено в справочник. |
| `generation_source` | `TEXT` | да | — | — | — | Откуда взялось место: seed, llm, manual, … |
| `period_start_year` | `INTEGER` | да | — | — | — | Описание отсутствует. |
| `period_end_year` | `INTEGER` | да | — | — | — | Описание отсутствует. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `function_in_region` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `economic_basis` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `political_control` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `religious_control` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `legal_status` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `owner_or_holder` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `population_band` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `wealth_level` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `landscape` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `water_access` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `road_access` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `defense_level` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `market_level` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `craft_level` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `food_supply_level` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `risk_level` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `known_to_commoners` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `known_to_traders` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `known_to_elites` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `known_to_clergy` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `known_to_outsiders` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `visible_description` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `hidden_notes` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `map_notes` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `llm_generation_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `llm_forbidden_changes` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.place_locations`

Локации внутри места (двор, улица, пристань, …).

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `place_id` | `TEXT` | нет | — | `world_base.places(id) ON DELETE CASCADE` | `NOT NULL` | FK → places(id): конкретное место, если применимо. |
| `slug` | `TEXT` | да | — | — | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | да | — | — | — | Человекочитаемое название записи. |
| `location_type` | `TEXT` | да | — | — | `CHECK (location_type IS NULL OR location_type IN ( 'gate','street','market','yard','churchyard','riverbank','pier','house','hall','barn','stable','workshop','storehouse','forest_edge','road_approach','monastery_yard','fortification_wall' ))` | Описание отсутствует. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `function` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `access_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `visibility_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `who_controls_access` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `typical_npc_roles` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_objects` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_buildings` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_sounds` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_smells` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_risks` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `social_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `law_risks` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `connected_location_ids` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `entry_points` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `closed_zones` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `public_private_level` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `crowd_level` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `light_level` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `weather_exposure` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `llm_generation_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `item_generation_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `npc_generation_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.place_minilocations`

Точные сценические зоны внутри локации.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `place_id` | `TEXT` | нет | — | `world_base.places(id) ON DELETE CASCADE` | `NOT NULL` | FK → places(id): конкретное место, если применимо. |
| `location_id` | `TEXT` | нет | — | `world_base.place_locations(id) ON DELETE CASCADE` | `NOT NULL` | FK → place_locations(id): локация внутри места. |
| `slug` | `TEXT` | да | — | — | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | да | — | — | — | Человекочитаемое название записи. |
| `minilocation_type` | `TEXT` | да | — | — | `CHECK (minilocation_type IS NULL OR minilocation_type IN ( 'near_door','near_hearth','under_shed','behind_cart','near_gate','near_table','near_chest','near_boat','near_well','at_threshold','in_shadow','beside_fire' ))` | Описание отсутствует. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `position_description` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `access_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `visibility` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `cover_or_hiding` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `noise_level` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `light_level` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `weather_exposure` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `nearby_objects` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `nearby_npc_roles` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `possible_actions` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `movement_cost` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `risk_notes` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `connected_minilocation_ids` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `anchor_ids` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.scene_anchors`

Точки сцены: дверь, сундук, колодец, костёр.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `place_id` | `TEXT` | нет | — | `world_base.places(id) ON DELETE CASCADE` | `NOT NULL` | FK → places(id): конкретное место, если применимо. |
| `location_id` | `TEXT` | да | — | `world_base.place_locations(id) ON DELETE SET NULL` | — | FK → place_locations(id): локация внутри места. |
| `minilocation_id` | `TEXT` | да | — | `world_base.place_minilocations(id) ON DELETE SET NULL` | — | FK → place_minilocations(id): сценическая зона. |
| `slug` | `TEXT` | да | — | — | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | да | — | — | — | Человекочитаемое название записи. |
| `anchor_type` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `physical_description` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `is_fixed` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `is_movable` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `is_container` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `is_passage` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `is_obstacle` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `is_light_source` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `is_cover` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `is_dangerous` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `access_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `visibility_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `ownership_status` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `controller` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `condition` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `interaction_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `risk_notes` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `linked_item_ids` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `linked_graph_edge_ids` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON: id из graph_edges, связанных с точкой сцены. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.place_buildings`

Постройки внутри места.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `place_id` | `TEXT` | нет | — | `world_base.places(id) ON DELETE CASCADE` | `NOT NULL` | FK → places(id): конкретное место, если применимо. |
| `location_id` | `TEXT` | да | — | `world_base.place_locations(id) ON DELETE SET NULL` | — | FK → place_locations(id): локация внутри места. |
| `slug` | `TEXT` | да | — | — | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | да | — | — | — | Человекочитаемое название записи. |
| `building_type` | `TEXT` | да | — | — | `CHECK (building_type IS NULL OR building_type IN ( 'house','hut','barn','stable','storehouse','workshop','church','monastery_cell','gatehouse','tower','wall','bathhouse','mill','inn','warehouse','boathouse','smithy' ))` | Описание отсутствует. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `function` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `owner_or_holder` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `controller` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `public_private_level` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `access_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `legal_status` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `religious_status` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `wealth_level` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `condition` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `materials` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `size_band` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `floors_or_sections` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `typical_rooms` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_objects` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_npc_roles` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_activities` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `storage_logic` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `locked_areas` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `hidden_area_policy` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `fire_risk` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `theft_risk` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `social_risk` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

## Универсальный социальный слой

### `world_base.social_classes`

Универсальные социальные классы (10 канонических id).

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `slug` | `TEXT` | нет | — | — | `NOT NULL` | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | нет | — | — | `NOT NULL` | Человекочитаемое название записи. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.social_role_archetypes`

Универсальные архетипы социальной роли (16 id).

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `slug` | `TEXT` | нет | — | — | `NOT NULL` | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | нет | — | — | `NOT NULL` | Человекочитаемое название записи. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.legal_status_archetypes`

Архетипы правового статуса (free, dependent, unfree, …).

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `slug` | `TEXT` | нет | — | — | `NOT NULL` | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | нет | — | — | `NOT NULL` | Человекочитаемое название записи. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.dependency_archetypes`

Архетипы зависимости (долг, двор, монастырь, …).

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `slug` | `TEXT` | нет | — | — | `NOT NULL` | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | нет | — | — | `NOT NULL` | Человекочитаемое название записи. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.mobility_archetypes`

Архетипы мобильности (local_bound, road_mobile, …).

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `slug` | `TEXT` | нет | — | — | `NOT NULL` | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | нет | — | — | `NOT NULL` | Человекочитаемое название записи. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.social_position_archetypes`

Канонические социальные позиции — главный якорь нормализации.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `slug` | `TEXT` | нет | — | — | `NOT NULL` | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | нет | — | — | `NOT NULL` | Человекочитаемое название записи. |
| `social_class_id` | `TEXT` | нет | — | `world_base.social_classes(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `role_archetype_id` | `TEXT` | нет | — | `world_base.social_role_archetypes(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `legal_status_archetype_id` | `TEXT` | нет | — | `world_base.legal_status_archetypes(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `dependency_archetype_id` | `TEXT` | нет | — | `world_base.dependency_archetypes(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `mobility_archetype_id` | `TEXT` | нет | — | `world_base.mobility_archetypes(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `property_rights_model` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `weapon_rights_model` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `court_voice_model` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `typical_power_over_others` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `typical_power_over_them` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.class_role_rules`

Матрица допустимости класс ↔ роль.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `social_class_id` | `TEXT` | нет | — | `world_base.social_classes(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `role_archetype_id` | `TEXT` | нет | — | `world_base.social_role_archetypes(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `is_allowed` | `BOOLEAN` | нет | `true` | — | `NOT NULL` | Описание отсутствует. |
| `notes` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- `PRIMARY KEY (social_class_id, role_archetype_id)`

### `world_base.occupation_archetypes`

Универсальные архетипы занятий (15 id).

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `slug` | `TEXT` | нет | — | — | `NOT NULL` | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | нет | — | — | `NOT NULL` | Человекочитаемое название записи. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.skill_catalog`

Канонический каталог механических навыков (12 id).

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `slug` | `TEXT` | нет | — | — | `NOT NULL` | Короткий машиночитаемый ключ для ссылок и LLM. |
| `title` | `TEXT` | нет | — | — | `NOT NULL` | Человекочитаемое название записи. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.occupation_skill_defaults`

Дефолтные primary/secondary навыки по занятию.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `occupation_archetype_id` | `TEXT` | нет | — | `world_base.occupation_archetypes(id) ON DELETE CASCADE` | `NOT NULL`<br>`PRIMARY KEY` | Описание отсутствует. |
| `primary_skill_ids` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `secondary_skill_ids` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `gate_skill_ids` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `forbidden_skill_ids` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `default_level_logic` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.role_occupation_rules`

Матрица допустимости роль ↔ занятие.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `role_archetype_id` | `TEXT` | нет | — | `world_base.social_role_archetypes(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `occupation_archetype_id` | `TEXT` | нет | — | `world_base.occupation_archetypes(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `is_allowed` | `BOOLEAN` | нет | `true` | — | `NOT NULL` | Описание отсутствует. |
| `notes` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- `PRIMARY KEY (role_archetype_id, occupation_archetype_id)`

### `world_base.universal_archetype_proposals`

Заявки на новые универсальные архетипы при нехватке покрытия.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `source_region_id` | `TEXT` | да | — | `world_base.regions(id) ON DELETE SET NULL` | — | Описание отсутствует. |
| `proposal_type` | `TEXT` | да | — | — | `CHECK (proposal_type IS NULL OR proposal_type IN ('social_position', 'occupation', 'skill', 'other'))` | Описание отсутствует. |
| `local_term` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `why_existing_archetypes_not_enough` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `proposed_archetype_payload` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `affected_regions` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `review_status` | `TEXT` | нет | `'pending'` | — | `NOT NULL`<br>`CHECK (review_status IN ('pending', 'approved', 'rejected'))` | Описание отсутствует. |
| `review_notes` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

## Региональная рамка

### `world_base.regions`

Главная карточка региона RUS13: рамка климата, власти, экономики, истории.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `slug` | `TEXT` | да | — | — | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `canonical_name` | `TEXT` | да | — | — | — | Каноническое имя региона (как в world_regions). |
| `display_name` | `TEXT` | да | — | — | — | Имя для UI и прозы. |
| `alt_names` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON: альтернативные названия. |
| `region_type` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `parent_region_id` | `TEXT` | да | — | `world_base.regions(id) ON DELETE SET NULL` | — | FK → regions(id): родительский регион в иерархии. |
| `period_start_year` | `INTEGER` | да | — | — | — | Описание отсутствует. |
| `period_end_year` | `INTEGER` | да | — | — | — | Описание отсутствует. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `geographic_scope` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `natural_landscape` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `climate_summary` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `seasonal_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `waterways_summary` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `roads_summary` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `settlement_logic_summary` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `political_summary` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `ruling_power` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `administrative_structure` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `law_summary` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `custom_summary` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `religion_summary` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `social_order_summary` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `economy_summary` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `military_pressure_summary` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `historical_context_summary` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `neighbor_regions` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON: краткий список соседей (дубль region_neighbors). |
| `external_pressure_summary` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `common_risks_summary` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `npc_common_knowledge_summary` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `llm_generation_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON: жёсткие правила для LLM при генерации в регионе. |
| `llm_forbidden_assumptions` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON: что LLM не должен додумывать. |
| `llm_context_summary` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `validation_notes` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.region_neighbors`

Связи между соседними регионами: граница, торговля, давление, знание пути.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `neighbor_region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): соседний регион. |
| `direction` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `border_type` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `connection_type` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `trade_connection` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `military_pressure` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `political_relation` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `cultural_relation` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `religious_relation` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `route_connection_summary` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `known_to_commoners` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `known_to_traders` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `known_to_elites` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `known_to_clergy` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.region_laws`

Право, обычай, запреты и наказания в регионе.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | да | — | — | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | да | — | — | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `law_type` | `TEXT` | да | — | — | `CHECK (law_type IS NULL OR law_type IN ( 'property','violence','weapon','travel','hospitality','debt','trade','religious','status','punishment','court','tax','custom' ))` | Описание отсутствует. |
| `applies_to_statuses` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `applies_to_roles` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `applies_to_places` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `period_start_year` | `INTEGER` | да | — | — | — | Описание отсутствует. |
| `period_end_year` | `INTEGER` | да | — | — | — | Описание отсутствует. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `rule_text` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `custom_basis` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `authority_enforcing` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `punishment_or_consequence` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `dispute_resolution` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `property_effect` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `violence_effect` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `weapon_effect` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `travel_effect` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `trade_effect` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `religious_effect` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `who_knows_this` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `npc_behavior_effect` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `player_risk` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.region_economy`

Экономика, ресурсы, промыслы и товары региона.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | да | — | — | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | да | — | — | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `economy_type` | `TEXT` | да | — | — | `CHECK (economy_type IS NULL OR economy_type IN ( 'farming','fishing','hunting','fur','beekeeping','logging','charcoal','tar','iron','salt','livestock','craft','trade','transport','monastery_economy','military_supply' ))` | Описание отсутствует. |
| `resource_or_activity` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `production_method` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `seasonality` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `required_landscape` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `required_settlement_type` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `required_tools` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `required_roles` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `labor_intensity` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `wealth_level` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `risk_level` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `goods_produced` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `goods_consumed` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `goods_imported` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `goods_exported` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `trade_graph_edges` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON: id из graph_edges — торговые коридоры/пути (не legacy routes). |
| `market_access` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `storage_requirements` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `spoilage_or_loss_risk` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `who_controls_it` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `tax_or_duty` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `social_status_link` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `conflict_potential` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.region_social_roles`

Региональные социальные роли — локальные термины, FK на social_position_archetypes.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | да | — | — | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | да | — | — | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `role_group` | `TEXT` | да | — | — | `CHECK (role_group IS NULL OR role_group IN ( 'elite','clergy','warrior','merchant','craftsman','peasant','dependent','slave','servant','outsider','marginal','official' ))` | Описание отсутствует. |
| `social_position_archetype_id` | `TEXT` | да | — | `world_base.social_position_archetypes(id) ON DELETE RESTRICT` | — | Описание отсутствует. |
| `social_class_id` | `TEXT` | да | — | `world_base.social_classes(id) ON DELETE RESTRICT` | — | Описание отсутствует. |
| `role_archetype_id` | `TEXT` | да | — | `world_base.social_role_archetypes(id) ON DELETE RESTRICT` | — | Описание отсутствует. |
| `legal_status_archetype_id` | `TEXT` | да | — | `world_base.legal_status_archetypes(id) ON DELETE SET NULL` | — | Описание отсутствует. |
| `dependency_archetype_id` | `TEXT` | да | — | `world_base.dependency_archetypes(id) ON DELETE SET NULL` | — | Описание отсутствует. |
| `mobility_archetype_id` | `TEXT` | да | — | `world_base.mobility_archetypes(id) ON DELETE SET NULL` | — | Описание отсутствует. |
| `mapping_review_status` | `TEXT` | да | — | — | `CHECK (mapping_review_status IS NULL OR mapping_review_status IN ('pending', 'approved', 'accepted_with_caution', 'rejected'))` | Описание отсутствует. |
| `mapping_confidence` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `mapping_notes` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `status_level` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `free_status` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `dependency_type` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `wealth_level` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `legal_capacity` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `mobility_level` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `social_respect` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `vulnerability_level` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `allowed_occupations` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `forbidden_occupations` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `allowed_weapons` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `forbidden_weapons` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `allowed_places` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `restricted_places` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `property_rights` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `travel_rights` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `trade_rights` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `court_rights` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `tax_obligations` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `service_obligations` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `typical_clothing` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `typical_equipment` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_knowledge` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_speech_register` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `typical_fears` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_goals` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `who_commands_them` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `who_protects_them` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `who_can_punish_them` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `relation_to_church` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `relation_to_power` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `npc_generation_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `player_character_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.region_occupations`

Профессии и занятия, привязанные к региону.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | да | — | — | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | да | — | — | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `occupation_group` | `TEXT` | да | — | — | `CHECK (occupation_group IS NULL OR occupation_group IN ( 'agriculture','fishing','forest','craft','trade','transport','military','religious','service','administration','criminal','healing','hospitality' ))` | Описание отсутствует. |
| `occupation_archetype_id` | `TEXT` | да | — | `world_base.occupation_archetypes(id) ON DELETE RESTRICT` | — | Описание отсутствует. |
| `mapping_review_status` | `TEXT` | да | — | — | `CHECK (mapping_review_status IS NULL OR mapping_review_status IN ('pending', 'approved', 'accepted_with_caution', 'rejected'))` | Описание отсутствует. |
| `mapping_confidence` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `mapping_notes` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `allowed_social_roles` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `forbidden_social_roles` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_status` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `typical_wealth` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `typical_gender_age_rules` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `required_location_types` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `required_economy_types` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `required_tools` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `required_materials` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `produced_goods` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `services_provided` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `seasonality` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `work_rhythm` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `income_logic` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `typical_skills` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_attributes` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_clothing` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `typical_equipment` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_risks` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_knowledge` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_contacts` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `settlement_generation_weight` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `npc_generation_weight` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `rarity` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `is_historical_fact` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `is_generated_allowed` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.region_material_culture`

Описание назначения отсутствует.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | да | — | — | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | да | — | — | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `material_category` | `TEXT` | да | — | — | `CHECK (material_category IS NULL OR material_category IN ( 'clothing','tool','weapon','armor','food','livestock','container','transport','religious_item','trade_good','household_item','craft_material','luxury','document_or_mark' ))` | Описание отсутствует. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `commonness` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `status_level` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `allowed_social_roles` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `restricted_social_roles` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_places` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_owners` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_holders` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_materials` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_condition` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `typical_quality` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `typical_value_band` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `typical_marks` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `legal_status` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `social_risk` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `theft_risk` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `trade_risk` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `seasonality` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `economic_source` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `import_or_local` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.region_risks`

Описание назначения отсутствует.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | да | — | — | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | да | — | — | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `risk_type` | `TEXT` | да | — | — | `CHECK (risk_type IS NULL OR risk_type IN ( 'road','weather','law','violence','theft','hunger','disease','wild_animals','social','religious','economic','war','fire','water','cold' ))` | Описание отсутствует. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `applies_to_places` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `applies_to_graph_edges` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON: id из graph_edges, к которым применяется риск. |
| `applies_to_roles` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `applies_to_occupations` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `seasonality` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `trigger_conditions` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `visible_signs` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `hidden_causes` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `possible_consequences` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `risk_level` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `frequency` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `avoidance_methods` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `mitigation_methods` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `npc_reactions` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `law_consequences` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `economic_consequences` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `body_state_consequences` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `item_consequences` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.conflict_templates`

Описание назначения отсутствует.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | да | — | — | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | да | — | — | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `conflict_type` | `TEXT` | да | — | — | `CHECK (conflict_type IS NULL OR conflict_type IN ( 'debt','property','trade','family','labor','status','religious','road','theft','violence','tax','duty','stranger','resource' ))` | Описание отсутствует. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `applies_to_place_types` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `applies_to_roles` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `applies_to_occupations` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `trigger_conditions` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `participants` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `stakes` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `visible_signs` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `hidden_layers` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `possible_escalation` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `possible_resolution` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `law_involvement` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `authority_involvement` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `rumor_effect` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `relationship_effect` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `economic_effect` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.rumor_templates`

Описание назначения отсутствует.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | да | — | — | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | да | — | — | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `rumor_type` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `source_role` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `spread_places` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `spread_graph_edges` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON: id из graph_edges — по каким путям распространяется слух. |
| `affected_roles` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `linked_event_id` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `linked_place_id` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `linked_risk_id` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `truth_status` | `TEXT` | да | — | — | `CHECK (truth_status IS NULL OR truth_status IN ('true','false','distorted','unknown','mixed'))` | Описание отсутствует. |
| `distortion_level` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `what_is_visible` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `what_is_hidden` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `who_believes_it` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `who_denies_it` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `danger_of_repeating` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `possible_effects` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `expiration_or_update_rule` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.price_bands`

Описание назначения отсутствует.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | да | — | — | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | да | — | — | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `item_or_service_type` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `value_band` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `normal_price_description` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `cheap_condition` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `expensive_condition` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `scarcity_factors` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `seasonal_modifiers` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `war_modifiers` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `road_modifiers` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `status_modifiers` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `trade_place_modifiers` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `who_can_afford` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `who_can_sell` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `who_controls_supply` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `barter_options` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `tax_or_duty` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `risk_of_fraud` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.seasonal_rules`

Описание назначения отсутствует.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `season` | `TEXT` | да | — | — | `CHECK (season IS NULL OR season IN ( 'winter','spring','summer','autumn','rasputitsa','early_winter','late_winter' ))` | Описание отсутствует. |
| `title` | `TEXT` | да | — | — | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | да | — | — | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `weather_profile` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `daylight_profile` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `road_effects` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `river_effects` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `forest_effects` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `field_effects` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `food_effects` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `work_effects` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `trade_effects` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `war_effects` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `disease_effects` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `clothing_requirements` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `shelter_requirements` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `available_occupations` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `restricted_occupations` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `available_graph_edges` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON: id из graph_edges, доступных в сезон. |
| `restricted_graph_edges` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON: id из graph_edges, закрытых или ограниченных в сезон. |
| `common_risks` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `common_scenes` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.weather_profiles`

Описание назначения отсутствует.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `seasonal_rule_id` | `TEXT` | да | — | `world_base.seasonal_rules(id) ON DELETE SET NULL` | — | FK → seasonal_rules(id): сезонное правило региона. |
| `title` | `TEXT` | да | — | — | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | да | — | — | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `weather_type` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `temperature_band` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `precipitation` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `wind` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `visibility` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `ground_condition` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `water_condition` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `road_modifier` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `movement_modifier` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `body_state_risk` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `npc_activity_effect` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `trade_effect` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `combat_effect` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `stealth_effect` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `fire_effect` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `visible_description` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `sound_description` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `smell_description` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.religious_context`

Описание назначения отсутствует.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | да | — | — | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | да | — | — | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `religion_type` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `dominant_religion` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `minority_religions` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `religious_authority` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `sacred_places` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `monastery_presence` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `church_presence` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `ritual_calendar` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `taboos` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `oath_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `burial_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `hospitality_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `charity_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `conflict_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `role_effects` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `law_effects` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `npc_knowledge` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `player_risks` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.region_npc_knowledge`

Описание назначения отсутствует.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `social_role_id` | `TEXT` | да | — | `world_base.region_social_roles(id) ON DELETE SET NULL` | — | FK → region_social_roles(id): социальная роль. |
| `occupation_id` | `TEXT` | да | — | `world_base.region_occupations(id) ON DELETE SET NULL` | — | FK → region_occupations(id): профессия/занятие. |
| `knowledge_type` | `TEXT` | да | — | — | `CHECK (knowledge_type IS NULL OR knowledge_type IN ( 'common','role_based','occupation_based','elite','clergy','trader','outsider','local','rumor','false_belief' ))` | Описание отсутствует. |
| `title` | `TEXT` | да | — | — | — | Человекочитаемое название записи. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `knows_as_fact` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `knows_as_rumor` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `common_mistakes` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `cannot_know` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `taboo_topics` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `dangerous_to_say` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `who_they_trust` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `who_they_fear` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `regional_knowledge` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `local_place_knowledge` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `law_knowledge` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `economy_knowledge` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `religion_knowledge` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `historical_knowledge` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `route_knowledge` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `social_order_knowledge` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `price_knowledge` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `speech_style_notes` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `behavior_effect` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.region_npc_generation_rules`

Описание назначения отсутствует.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | да | — | — | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | да | — | — | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `npc_profile_type` | `TEXT` | да | — | — | `CHECK (npc_profile_type IS NULL OR npc_profile_type IN ('background','scene','key','group'))` | Описание отсутствует. |
| `applies_to_place_types` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `applies_to_location_types` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `allowed_social_roles` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `allowed_occupations` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `forbidden_roles` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `rarity_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `name_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `age_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `gender_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `status_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `wealth_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `clothing_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `equipment_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `speech_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `knowledge_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `fear_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `goal_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `authority_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `reaction_to_strangers` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `reaction_to_violence` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `reaction_to_theft` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `reaction_to_trade` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `reaction_to_law` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `background_npc_minimum` | `INTEGER` | да | — | — | — | Описание отсутствует. |
| `scene_npc_minimum` | `INTEGER` | да | — | — | — | Описание отсутствует. |
| `key_npc_minimum` | `INTEGER` | да | — | — | — | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.region_gaps`

Описание назначения отсутствует.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | да | — | `world_base.regions(id) ON DELETE SET NULL` | — | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | да | — | — | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | да | — | — | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `gap_type` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `why_needed` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `affected_tables` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `priority` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `risk_if_missing` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `suggested_sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `suggested_research_query` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `current_workaround` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `blocked_generation_steps` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

## История

### `world_base.historical_anchors`

Исторические и географические якоря региона.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `place_id` | `TEXT` | да | — | `world_base.places(id) ON DELETE SET NULL` | — | FK → places(id): конкретное место, если применимо. |
| `slug` | `TEXT` | да | — | — | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `canonical_name` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `display_name` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `anchor_type` | `TEXT` | да | — | — | `CHECK (anchor_type IS NULL OR anchor_type IN ( 'city','fortress','monastery','market','river','ford','ferry','road','winter_road','border','battle_site','princely_court','bishopric' ))` | Описание отсутствует. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `historical_status` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `period_start_year` | `INTEGER` | да | — | — | — | Описание отсутствует. |
| `period_end_year` | `INTEGER` | да | — | — | — | Описание отсутствует. |
| `approximate_bearing` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `distance_band` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `zone_of_influence` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `access_graph_edges` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON: id из graph_edges — пути доступа к якорю. |
| `visible_signs` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `economic_influence` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `political_influence` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `religious_influence` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `military_influence` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `trade_influence` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `character_knowledge_common` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `character_knowledge_trader` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `character_knowledge_elite` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `character_knowledge_clergy` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `character_knowledge_outsider` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `discovery_conditions` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `llm_use_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `llm_forbidden_changes` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.historical_events`

Исторические события и региональное давление.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | да | — | — | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | да | — | — | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `event_type` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `period_start_year` | `INTEGER` | да | — | — | — | Описание отсутствует. |
| `period_end_year` | `INTEGER` | да | — | — | — | Описание отсутствует. |
| `approximate_date` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `date_confidence` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `historical_status` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `cause` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `participants` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `affected_regions` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `affected_places` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `current_phase` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `phase_logic` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `local_signs` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `economic_effect` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `road_effect` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `law_effect` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `social_effect` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `military_effect` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `religious_effect` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `npc_knowledge_effect` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `rumor_effect` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `what_commoners_know` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `what_traders_know` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `what_elites_know` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `what_clergy_know` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `what_outsiders_know` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `hidden_truth_policy` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `future_knowledge_forbidden` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.historical_event_phases`

Фазы жизненного цикла события.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `event_id` | `TEXT` | нет | — | `world_base.historical_events(id) ON DELETE CASCADE` | `NOT NULL` | FK → historical_events(id): родительское событие. |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `phase_name` | `TEXT` | да | — | — | `CHECK (phase_name IS NULL OR phase_name IN ('background','omens','escalation','impact','aftermath'))` | background, omens, escalation, impact, aftermath. |
| `phase_order` | `INTEGER` | да | — | — | — | Порядок фазы в жизненном цикле события. |
| `date_start` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `date_end` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `date_confidence` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `trigger_condition` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `visible_signs` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `hidden_processes` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `affected_places` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `affected_graph_edges` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON: id из graph_edges, затронутых фазой. |
| `affected_roles` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `affected_goods` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `npc_behavior_changes` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `price_changes` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `security_changes` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `law_changes` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `rumor_templates` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `delayed_event_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `what_character_can_know` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `what_character_cannot_know` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.historical_figures`

Исторические личности и их влияние.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | да | — | — | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | да | — | — | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `canonical_name` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `alt_names` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `figure_type` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `social_status` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `political_role` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `religious_role` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `military_role` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `social_class_id` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `role_archetype_id` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `social_position_archetype_id` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `period_start_year` | `INTEGER` | да | — | — | — | Описание отсутствует. |
| `period_end_year` | `INTEGER` | да | — | — | — | Описание отсутствует. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `region_of_influence` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `linked_events` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `linked_places` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `current_location_policy` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `direct_encounter_policy` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `influence_method` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `orders_or_effects` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `reputation` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `what_commoners_know` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `what_traders_know` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `what_elites_know` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `what_clergy_know` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `what_outsiders_know` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `can_appear_directly` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `appearance_conditions` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `forbidden_uses` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

## Шаблоны и правила генерации

### `world_base.item_templates`

Описание назначения отсутствует.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `material_culture_id` | `TEXT` | да | — | `world_base.region_material_culture(id) ON DELETE SET NULL` | — | FK → region_material_culture(id): слой материальной культуры. |
| `title` | `TEXT` | да | — | — | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | да | — | — | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `item_type` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `function` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `typical_material` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `weight_band` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `size_band` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `durability` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `quality_band` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `value_band` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `rarity` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `legal_status` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `social_status_signal` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `typical_owner_roles` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_holder_roles` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_locations` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_containers` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `visibility_default` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `access_default` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `marking_default` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `risk_default` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `skill_use` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `attribute_use` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `possible_modifiers` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `failure_risks` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `damage_or_wear_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |
| `category_id` | `TEXT` | да | — | `world_base.universal_categories(id) ON DELETE RESTRICT` | — | FK → universal_categories(id): object-type category template; legacy item_type не является вторым классификатором. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.building_templates`

Описание назначения отсутствует.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | да | — | — | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | да | — | — | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `building_type` | `TEXT` | да | — | — | `CHECK (building_type IS NULL OR building_type IN ( 'house','hut','barn','stable','storehouse','workshop','church','monastery_cell','gatehouse','tower','wall','bathhouse','mill','inn','warehouse','boathouse','smithy' ))` | Описание отсутствует. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `allowed_place_types` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `allowed_location_types` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `required_economy` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `required_social_order` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `typical_owner` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `typical_controller` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `typical_users` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `materials` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `size_band` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `wealth_level` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `condition_band` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `layout_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `room_templates` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `storage_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `access_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `locked_area_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `hidden_area_rules` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `fire_risk` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `theft_risk` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `social_risk` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `typical_objects` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_npc_roles` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `typical_activities` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.location_object_rules`

Описание назначения отсутствует.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `place_template_id` | `TEXT` | да | — | `world_base.region_place_generation_rules(id) ON DELETE SET NULL` | — | FK: на region_place_generation_rules(id) в place_generation_limits/location_object_rules; на place_templates(id) в graph_nodes. |
| `place_id` | `TEXT` | да | — | `world_base.places(id) ON DELETE SET NULL` | — | FK → places(id): конкретное место, если применимо. |
| `location_type` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `building_type` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `object_category` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `item_template_id` | `TEXT` | да | — | `world_base.item_templates(id) ON DELETE SET NULL` | — | FK → item_templates(id): шаблон предмета. |
| `probability_band` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `required_reason` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `required_owner` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `required_holder` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `visibility_default` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `access_default` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `legal_risk` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `social_risk` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `economic_justification` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `can_be_generated` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `must_be_pregenerated` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `forbidden_without_reason` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `container_policy` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `hidden_policy` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `game_use` | `TEXT` | да | — | — | — | Как игровой код и LLM должны использовать эту запись. |
| `limits` | `TEXT` | да | — | — | — | Ограничения применения; что нельзя выводить из записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

## Мета, источники, LLM

### `world_base.source_records`

Библиография и проектные источники; основа для record_sources.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `title` | `TEXT` | да | — | — | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | да | — | — | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `source_type` | `TEXT` | да | — | — | `CHECK (source_type IS NULL OR source_type IN ( 'book','article','chronicle','academic_database','museum','map','archaeology','web','project_note','llm_draft','manual_entry' ))` | book, article, chronicle, academic_database, project_note, … |
| `author` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `publication_year` | `INTEGER` | да | — | — | — | Год публикации; NULL если ongoing/неизвестен. |
| `period_covered` | `TEXT` | да | — | — | — | Период истории, который покрывает источник. |
| `region_covered` | `TEXT` | да | — | — | — | География источника. |
| `url` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `file_reference` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `page_or_section` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `quote_short` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `reliability_level` | `TEXT` | да | — | — | — | Оценка надёжности (произвольный текст или код). |
| `bias_notes` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `usefulness` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `limitations` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `checked_by` | `TEXT` | да | — | — | — | Кто проверил источник. |
| `checked_at` | `TIMESTAMPTZ` | да | — | — | — | Когда проверили. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.record_sources`

Связь источника с любой записью справочника (полиморфная).

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `source_id` | `TEXT` | нет | — | `world_base.source_records(id) ON DELETE CASCADE` | `NOT NULL` | FK → source_records(id): подтверждающий источник. |
| `target_table` | `TEXT` | нет | — | — | `NOT NULL` | Имя таблицы цели (полиморфная ссылка, без FK в DDL). |
| `target_record_id` | `TEXT` | нет | — | — | `NOT NULL` | id записи в target_table (полиморфная ссылка). |
| `support_type` | `TEXT` | да | — | — | `CHECK (support_type IS NULL OR support_type IN ('supports','contradicts','partial','background','uncertain'))` | supports, contradicts, partial, background, uncertain. |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `page_or_section` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `confidence` | `TEXT` | да | — | — | `CHECK (confidence IS NULL OR confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `contradiction_notes` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.audit_log`

Журнал ручных правок и утверждений (полиморфная цель).

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `target_table` | `TEXT` | нет | — | — | `NOT NULL` | Имя таблицы цели (полиморфная ссылка, без FK в DDL). |
| `target_record_id` | `TEXT` | нет | — | — | `NOT NULL` | id записи в target_table (полиморфная ссылка). |
| `action_type` | `TEXT` | да | — | — | `CHECK (action_type IS NULL OR action_type IN ( 'created','updated','approved','rejected','marked_conflict','merged','split','needs_review' ))` | created, updated, approved, rejected, marked_conflict, merged, split, needs_review. |
| `old_value` | `JSONB` | да | — | — | — | JSON или текст старого значения. |
| `new_value` | `JSONB` | да | — | — | — | JSON или текст нового значения. |
| `reason` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `changed_by` | `TEXT` | да | — | — | — | Кто внёс изменение. |
| `changed_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Описание отсутствует. |
| `review_status` | `TEXT` | да | — | — | — | Статус ревью правки. |
| `notes` | `TEXT` | да | — | — | — | Описание отсутствует. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.llm_context_packs`

Описание назначения отсутствует.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | да | — | `world_base.regions(id) ON DELETE SET NULL` | — | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | да | — | — | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | да | — | — | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `context_type` | `TEXT` | да | — | — | `CHECK (context_type IS NULL OR context_type IN ( 'region_start','new_place_generation','npc_generation','route_generation','historical_check','scene_context','repair_context' ))` | region_start, new_place_generation, npc_generation, route_generation, … |
| `summary` | `TEXT` | да | — | — | — | Краткое содержание: что это и зачем в игре. |
| `included_tables` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON: какие таблицы входят в пакет. |
| `included_record_ids` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON: конкретные id записей. |
| `prompt_text` | `TEXT` | да | — | — | — | Готовый текст для вставки в промпт. |
| `hard_constraints` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON: жёсткие ограничения для LLM. |
| `forbidden_assumptions` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `known_gaps` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `use_when` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `do_not_use_when` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `max_tokens_estimate` | `INTEGER` | да | — | — | — | Оценка размера пакета в токенах. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.llm_validation_rules`

Описание назначения отсутствует.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | да | — | `world_base.regions(id) ON DELETE SET NULL` | — | FK → regions(id): регион, к которому относится запись. |
| `title` | `TEXT` | да | — | — | — | Человекочитаемое название записи. |
| `slug` | `TEXT` | да | — | — | — | Короткий машиночитаемый ключ для ссылок и LLM. |
| `validation_type` | `TEXT` | да | — | — | — | Тип проверки генерации. |
| `rule_text` | `TEXT` | да | — | — | — | Текст правила валидации. |
| `applies_to_table` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `applies_to_generation_step` | `TEXT` | да | — | — | — | На каком шаге пайплайна проверять. |
| `severity` | `TEXT` | да | — | — | `CHECK (severity IS NULL OR severity IN ('warning','error','hard_block'))` | warning, error, hard_block. |
| `failure_message` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `repair_instruction` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `examples_valid` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `examples_invalid` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft', 'usable_with_caution', 'approved', 'needs_review', 'conflict', 'rejected'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `sources` | `JSONB` | нет | `'[]'::jsonb` | — | `NOT NULL` | JSON-массив id из source_records и/или заметок об источнике. |
| `audit_notes` | `TEXT` | да | — | — | — | Заметки редактора: споры, TODO, ссылки на проверку. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |
| `updated_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время последнего изменения (обновляется триггером). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

## Materialization v2: категории и ревизии

### `world_base.world_revisions`

Неизменяемые утверждённые ревизии каталогов мира и их общий digest.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `parent_revision_id` | `TEXT` | да | — | `world_base.world_revisions(id) ON DELETE RESTRICT` | — | Описание отсутствует. |
| `title` | `TEXT` | нет | — | — | `NOT NULL` | Человекочитаемое название записи. |
| `effective_from` | `DATE` | да | — | — | — | Описание отсутствует. |
| `effective_to` | `DATE` | да | — | — | — | Описание отсутствует. |
| `catalog_digest` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (catalog_digest ~ '^[a-f0-9]{64}$')` | Описание отсутствует. |
| `status` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `approved_at` | `TIMESTAMPTZ` | да | — | — | — | Описание отсутствует. |
| `created_at` | `TIMESTAMPTZ` | нет | `now()` | — | `NOT NULL` | Время создания записи (UTC). |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.classification_schemes`

Локально зафиксированные версии внешних классификационных схем без runtime live-запросов.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `title` | `TEXT` | нет | — | — | `NOT NULL` | Человекочитаемое название записи. |
| `authority` | `TEXT` | нет | — | — | `NOT NULL` | Организация, отвечающая за внешнюю классификационную схему. |
| `scheme_version` | `TEXT` | нет | — | — | `NOT NULL` | Зафиксированная версия внешней схемы. |
| `release_date` | `DATE` | да | — | — | — | Дата выпуска зафиксированной версии схемы. |
| `canonical_reference` | `TEXT` | нет | — | — | `NOT NULL` | Каноническая ссылка на схему или локальный snapshot. |
| `license_or_usage_note` | `TEXT` | нет | — | — | `NOT NULL` | Условия лицензии либо допустимого справочного использования. |
| `snapshot_digest` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (snapshot_digest ~ '^[a-f0-9]{64}$')` | SHA-256 локально проверенного snapshot; runtime не обращается к внешнему сервису. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.universal_categories`

Универсальные категории, которые код вправе использовать, но не создавать.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `domain` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `parent_category_id` | `TEXT` | да | — | `world_base.universal_categories(id) ON DELETE RESTRICT` | — | Описание отсутствует. |
| `stable_code` | `TEXT` | нет | — | — | `NOT NULL`<br>`UNIQUE` | Уникальный стабильный машинный код одного понятия. |
| `facet` | `TEXT` | нет | — | — | `NOT NULL` | Классификационный фасет категории в пределах domain. |
| `preferred_label` | `TEXT` | нет | — | — | `NOT NULL` | Предпочтительная метка категории; historical labels хранятся отдельно. |
| `definition` | `TEXT` | нет | — | — | `NOT NULL` | Нормативное определение одного классификационного понятия. |
| `scope_note` | `TEXT` | нет | — | — | `NOT NULL` | Граница смысла и применимости понятия без утверждения региональной истории. |
| `inclusion_rules` | `TEXT` | нет | — | — | `NOT NULL` | Явные условия включения в категорию. |
| `exclusion_rules` | `TEXT` | нет | — | — | `NOT NULL` | Явные условия исключения из категории. |
| `replaced_by_category_id` | `TEXT` | да | — | `world_base.universal_categories(id) ON DELETE RESTRICT` | — | FK на заменяющую категорию; deprecated/replaced категория не кандидат runtime. |
| `title` | `TEXT` | нет | — | — | `NOT NULL` | Человекочитаемое название записи. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- `UNIQUE (domain, facet, preferred_label)`
- `CHECK (length(trim(stable_code)) > 0)`
- `CHECK (length(trim(domain)) > 0)`
- `CHECK (length(trim(facet)) > 0)`
- `CHECK (length(trim(preferred_label)) > 0)`
- `CHECK (length(trim(definition)) > 0)`
- `CHECK (length(trim(scope_note)) > 0)`
- `CHECK (length(trim(inclusion_rules)) > 0)`
- `CHECK (length(trim(exclusion_rules)) > 0)`

### `world_base.category_labels`

Нормализованные preferred, alternative, historical и deprecated labels категорий.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `category_id` | `TEXT` | нет | — | `world_base.universal_categories(id) ON DELETE CASCADE` | `NOT NULL` | FK на классифицируемую универсальную категорию. |
| `language` | `TEXT` | нет | — | — | `NOT NULL` | Язык метки по принятому языковому коду проекта. |
| `label` | `TEXT` | нет | — | — | `NOT NULL` | Текстовая метка; не самостоятельный category ID. |
| `label_type` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (label_type IN ('preferred','alternative','historical','deprecated'))` | preferred, alternative, historical или deprecated. |
| `valid_from` | `DATE` | да | — | — | — | Описание отсутствует. |
| `valid_to` | `DATE` | да | — | — | — | Описание отсутствует. |
| `source_id` | `TEXT` | да | — | `world_base.source_records(id) ON DELETE RESTRICT` | — | FK на подтверждающий source_records, если он известен. |

**Ограничения таблицы:**

- `CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_from <= valid_to)`
- `UNIQUE (category_id, language, label)`
- `UNIQUE INDEX category_labels_one_preferred_per_language (category_id, language) WHERE label_type = 'preferred'`

### `world_base.category_scheme_mappings`

Справочные mappings проектных категорий к pinned внешним схемам; не являются regional permission или rule.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `category_id` | `TEXT` | нет | — | `world_base.universal_categories(id) ON DELETE CASCADE` | `NOT NULL` | FK на проектную категорию. |
| `classification_scheme_id` | `TEXT` | нет | — | `world_base.classification_schemes(id) ON DELETE RESTRICT` | `NOT NULL` | FK на pinned classification scheme. |
| `external_concept_id` | `TEXT` | нет | — | — | `NOT NULL` | Стабильный ID понятия во внешней схеме. |
| `mapping_type` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (mapping_type IN ('exact','close','broad','narrow','related'))` | exact, close, broad, narrow или related; mapping не даёт regional permission. |
| `mapping_evidence` | `TEXT` | нет | — | — | `NOT NULL` | Основание сопоставления без подмены исторической применимости. |
| `source_id` | `TEXT` | да | — | `world_base.source_records(id) ON DELETE RESTRICT` | — | FK на источник evidence, если он известен. |
| `review_status` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (review_status IN ('draft','approved','rejected'))` | Статус редакторского review mapping: draft, approved или rejected. |

**Ограничения таблицы:**

- `UNIQUE (category_id, classification_scheme_id, external_concept_id)`

### `world_base.universal_category_relations`

Нормализованные отношения между универсальными категориями.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `from_category_id` | `TEXT` | нет | — | `world_base.universal_categories(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `to_category_id` | `TEXT` | нет | — | `world_base.universal_categories(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `relation_type` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (relation_type IN ('broader','narrower','related','compatible','requires','excludes','equivalent_with_scope'))` | broader, narrower, related, compatible, requires, excludes или equivalent_with_scope; hierarchy cycles forbidden. |

**Ограничения таблицы:**

- `CHECK (from_category_id <> to_category_id)`
- `UNIQUE (from_category_id, to_category_id, relation_type)`

### `world_base.universal_parameter_definitions`

Типизированные определения параметров категорий.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `category_id` | `TEXT` | нет | — | `world_base.universal_categories(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `parameter_key` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `value_type` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (value_type IN ('boolean','integer','number','text','enum'))` | Описание отсутствует. |
| `constraints` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Описание отсутствует. |

**Ограничения таблицы:**

- `UNIQUE (category_id, parameter_key)`

### `world_base.region_category_options`

Разрешение категории для региона, периода и ревизии с весом выбора.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `world_revision_id` | `TEXT` | нет | — | `world_base.world_revisions(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `category_id` | `TEXT` | нет | — | `world_base.universal_categories(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `valid_from` | `DATE` | да | — | — | — | Описание отсутствует. |
| `valid_to` | `DATE` | да | — | — | — | Описание отсутствует. |
| `weight` | `INTEGER` | нет | `1` | — | `NOT NULL`<br>`CHECK (weight > 0)` | Описание отсутствует. |
| `applicability` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- `UNIQUE (world_revision_id, region_id, category_id, valid_from, valid_to)`

## Materialization v2: NPC-профили

### `world_base.region_npc_archetypes`

Региональные NPC templates без конкретной identity и биографии.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `world_revision_id` | `TEXT` | нет | — | `world_base.world_revisions(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `social_role_id` | `TEXT` | нет | — | `world_base.region_social_roles(id) ON DELETE RESTRICT` | `NOT NULL` | FK → region_social_roles(id): социальная роль. |
| `occupation_id` | `TEXT` | да | — | `world_base.region_occupations(id) ON DELETE RESTRICT` | — | FK → region_occupations(id): профессия/занятие. |
| `legal_status_id` | `TEXT` | да | — | `world_base.legal_status_archetypes(id) ON DELETE RESTRICT` | — | Описание отсутствует. |
| `mobility_id` | `TEXT` | да | — | `world_base.mobility_archetypes(id) ON DELETE RESTRICT` | — | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.region_demographic_profiles`

Региональные демографические варианты и ограничения.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `demographic_option_id` | `TEXT` | нет | — | `world_base.region_category_options(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `minimum_age` | `INTEGER` | да | — | — | `CHECK (minimum_age >= 0)` | Описание отсутствует. |
| `maximum_age` | `INTEGER` | да | — | — | `CHECK (maximum_age IS NULL OR maximum_age >= minimum_age)` | Описание отсутствует. |
| `weight` | `INTEGER` | нет | `1` | — | `NOT NULL`<br>`CHECK (weight > 0)` | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.region_name_pools`

Региональные пулы имён для периода и ревизии.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `world_revision_id` | `TEXT` | нет | — | `world_base.world_revisions(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `valid_from` | `DATE` | да | — | — | — | Описание отсутствует. |
| `valid_to` | `DATE` | да | — | — | — | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.region_name_pool_entries`

Конкретные утверждённые формы имён и веса.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `name_pool_id` | `TEXT` | нет | — | `world_base.region_name_pools(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `name_form` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `name_category_id` | `TEXT` | да | — | `world_base.universal_categories(id) ON DELETE RESTRICT` | — | Описание отсутствует. |
| `weight` | `INTEGER` | нет | `1` | — | `NOT NULL`<br>`CHECK (weight > 0)` | Описание отсутствует. |

**Ограничения таблицы:**

- `UNIQUE (name_pool_id, name_form)`

### `world_base.region_appearance_profiles`

Региональные варианты внешности из разрешённых категорий.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `appearance_option_id` | `TEXT` | нет | — | `world_base.region_category_options(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `weight` | `INTEGER` | нет | `1` | — | `NOT NULL`<br>`CHECK (weight > 0)` | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.region_clothing_profiles`

Региональные garment slots и ограничения одежды.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `garment_category_id` | `TEXT` | нет | — | `world_base.universal_categories(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `slot_key` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `constraints` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.region_equipment_profiles`

Профили снаряжения для ролей и занятий.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `social_role_id` | `TEXT` | да | — | `world_base.region_social_roles(id) ON DELETE RESTRICT` | — | FK → region_social_roles(id): социальная роль. |
| `occupation_id` | `TEXT` | да | — | `world_base.region_occupations(id) ON DELETE RESTRICT` | — | FK → region_occupations(id): профессия/занятие. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.region_equipment_profile_entries`

Нормализованные required/optional варианты снаряжения.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `equipment_profile_id` | `TEXT` | нет | — | `world_base.region_equipment_profiles(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `item_template_id` | `TEXT` | да | — | `world_base.item_templates(id) ON DELETE RESTRICT` | — | FK → item_templates(id): шаблон предмета. |
| `item_category_id` | `TEXT` | да | — | `world_base.universal_categories(id) ON DELETE RESTRICT` | — | Описание отсутствует. |
| `slot_key` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `required` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `weight` | `INTEGER` | нет | `1` | — | `NOT NULL`<br>`CHECK (weight > 0)` | Описание отсутствует. |

**Ограничения таблицы:**

- `CHECK ((item_template_id IS NULL) <> (item_category_id IS NULL))`

### `world_base.region_knowledge_profiles`

Разрешённые категории и ссылки знаний NPC.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `knowledge_category_id` | `TEXT` | нет | — | `world_base.universal_categories(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `fact_table` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `fact_record_id` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.region_behavior_profiles`

Поведенческие варианты и привязанная decision policy.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `behavior_option_id` | `TEXT` | нет | — | `world_base.region_category_options(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `decision_policy_id` | `TEXT` | да | — | `world_base.decision_policy_profiles(id) ON DELETE RESTRICT` | — | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.region_relationship_profiles`

Типы и ограничения отношений NPC.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `relationship_option_id` | `TEXT` | нет | — | `world_base.region_category_options(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `constraints` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.region_activity_profiles`

Причины присутствия, действия и опорные узлы NPC.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `activity_option_id` | `TEXT` | нет | — | `world_base.region_category_options(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `presence_reason` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `graph_node_id` | `TEXT` | да | — | `world_base.graph_nodes(id) ON DELETE RESTRICT` | — | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.region_schedule_profiles`

Расписания NPC с явными place/route/fallback ссылками.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `activity_profile_id` | `TEXT` | нет | — | `world_base.region_activity_profiles(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `time_band` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `place_id` | `TEXT` | да | — | `world_base.places(id) ON DELETE RESTRICT` | — | FK → places(id): конкретное место, если применимо. |
| `route_template_id` | `TEXT` | да | — | `world_base.route_templates(id) ON DELETE RESTRICT` | — | FK → route_templates(id): тип движения/инфраструктуры ребра. |
| `fallback_activity_profile_id` | `TEXT` | да | — | `world_base.region_activity_profiles(id) ON DELETE RESTRICT` | — | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.region_npc_profile_sets`

Совместимые композиции компонентных NPC-профилей.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `world_revision_id` | `TEXT` | нет | — | `world_base.world_revisions(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `archetype_id` | `TEXT` | нет | — | `world_base.region_npc_archetypes(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `demographic_profile_id` | `TEXT` | нет | — | `world_base.region_demographic_profiles(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `name_pool_id` | `TEXT` | да | — | `world_base.region_name_pools(id) ON DELETE RESTRICT` | — | Описание отсутствует. |
| `appearance_profile_id` | `TEXT` | нет | — | `world_base.region_appearance_profiles(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `clothing_profile_id` | `TEXT` | да | — | `world_base.region_clothing_profiles(id) ON DELETE RESTRICT` | — | Описание отсутствует. |
| `equipment_profile_id` | `TEXT` | да | — | `world_base.region_equipment_profiles(id) ON DELETE RESTRICT` | — | Описание отсутствует. |
| `knowledge_profile_id` | `TEXT` | да | — | `world_base.region_knowledge_profiles(id) ON DELETE RESTRICT` | — | Описание отсутствует. |
| `behavior_profile_id` | `TEXT` | нет | — | `world_base.region_behavior_profiles(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `relationship_profile_id` | `TEXT` | да | — | `world_base.region_relationship_profiles(id) ON DELETE RESTRICT` | — | Описание отсутствует. |
| `activity_profile_id` | `TEXT` | нет | — | `world_base.region_activity_profiles(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `schedule_profile_id` | `TEXT` | да | — | `world_base.region_schedule_profiles(id) ON DELETE RESTRICT` | — | Описание отсутствует. |
| `profile_level` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (profile_level IN ('background','scene','key'))` | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- `UNIQUE INDEX region_npc_profile_set_revision (world_revision_id, id) WHERE status = 'approved'`

## Materialization v2: G4 и G5

### `world_base.room_templates`

Шаблоны функций помещений или зон.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `region_id` | `TEXT` | да | — | `world_base.regions(id) ON DELETE CASCADE` | — | FK → regions(id): регион, к которому относится запись. |
| `room_category_id` | `TEXT` | нет | — | `world_base.universal_categories(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `capacity` | `INTEGER` | нет | `1` | — | `NOT NULL`<br>`CHECK (capacity > 0)` | Описание отсутствует. |
| `access_policy` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `visibility_policy` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.building_layout_templates`

Региональные профили планировки здания для периода.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `world_revision_id` | `TEXT` | нет | — | `world_base.world_revisions(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `building_template_id` | `TEXT` | нет | — | `world_base.building_templates(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `valid_from` | `DATE` | да | — | — | — | Описание отсутствует. |
| `valid_to` | `DATE` | да | — | — | — | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.building_layout_nodes`

Нормализованные slots помещений в планировке.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `layout_template_id` | `TEXT` | нет | — | `world_base.building_layout_templates(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `slot_key` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `room_template_id` | `TEXT` | нет | — | `world_base.room_templates(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `required` | `BOOLEAN` | нет | `true` | — | `NOT NULL` | Описание отсутствует. |
| `ordinal` | `INTEGER` | нет | — | — | `NOT NULL` | Описание отсутствует. |

**Ограничения таблицы:**

- `UNIQUE (layout_template_id, slot_key)`

### `world_base.building_layout_edges`

Нормализованные проходы между slots планировки.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `layout_template_id` | `TEXT` | нет | — | `world_base.building_layout_templates(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `from_node_id` | `TEXT` | нет | — | `world_base.building_layout_nodes(id) ON DELETE CASCADE` | `NOT NULL` | FK → graph_nodes(id): узел начала ребра. |
| `to_node_id` | `TEXT` | нет | — | `world_base.building_layout_nodes(id) ON DELETE CASCADE` | `NOT NULL` | FK → graph_nodes(id): узел конца ребра. |
| `passage_category_id` | `TEXT` | нет | — | `world_base.universal_categories(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `access_policy` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Описание отсутствует. |

**Ограничения таблицы:**

- `UNIQUE (layout_template_id, from_node_id, to_node_id)`

### `world_base.g5_minilocation_templates`

Шаблоны party G5-минилокаций и их policies.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `category_id` | `TEXT` | нет | — | `world_base.universal_categories(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `capacity` | `INTEGER` | нет | `1` | — | `NOT NULL`<br>`CHECK (capacity > 0)` | Описание отсутствует. |
| `access_policy` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `visibility_policy` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `initial_state` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `valid_from` | `DATE, ADD COLUMN valid_to DATE, ADD COLUMN confidence TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown','low','medium_low','medium','medium_high','high'))` | Описание отсутствует. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.g5_anchor_templates`

Шаблоны anchors с capacities и interaction capabilities.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `category_id` | `TEXT` | нет | — | `world_base.universal_categories(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `can_hold_npc` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `can_hold_item` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `can_hold_container` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `npc_capacity` | `INTEGER` | нет | `0` | — | `NOT NULL`<br>`CHECK (npc_capacity >= 0)` | Описание отсутствует. |
| `item_capacity` | `INTEGER` | нет | `0` | — | `NOT NULL`<br>`CHECK (item_capacity >= 0)` | Описание отсутствует. |
| `container_capacity` | `INTEGER` | нет | `0` | — | `NOT NULL`<br>`CHECK (container_capacity >= 0)` | Описание отсутствует. |
| `access_policy` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `visibility_policy` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `initial_state` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `valid_from` | `DATE, ADD COLUMN valid_to DATE, ADD COLUMN confidence TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown','low','medium_low','medium','medium_high','high'))` | Описание отсутствует. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.g5_edge_templates`

Шаблоны G5-проходов с access/visibility policies.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `passage_category_id` | `TEXT` | нет | — | `world_base.universal_categories(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `access_policy` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `visibility_policy` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `initial_state` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `valid_from` | `DATE, ADD COLUMN valid_to DATE, ADD COLUMN confidence TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown','low','medium_low','medium','medium_high','high'))` | Описание отсутствует. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.g4_materialization_profiles`

Главные профили материализации G4 в party G5.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `world_revision_id` | `TEXT` | нет | — | `world_base.world_revisions(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE CASCADE` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `layout_template_id` | `TEXT` | нет | — | `world_base.building_layout_templates(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `maximum_g5_nodes` | `INTEGER` | нет | — | — | `NOT NULL`<br>`CHECK (maximum_g5_nodes > 0)` | Описание отсутствует. |
| `player_start_anchor_slot_key` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `visibility_model` | `JSONB` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `access_model` | `JSONB` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `valid_from` | `DATE, ADD COLUMN valid_to DATE, ADD COLUMN confidence TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown','low','medium_low','medium','medium_high','high'))` | Описание отсутствует. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.g4_materialization_bindings`

Приоритетные правила выбора G4 materialization profile.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `profile_id` | `TEXT` | нет | — | `world_base.g4_materialization_profiles(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `graph_node_id` | `TEXT` | да | — | `world_base.graph_nodes(id) ON DELETE CASCADE` | — | Описание отсутствует. |
| `node_type` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `place_template_id` | `TEXT` | да | — | `world_base.place_templates(id) ON DELETE RESTRICT` | — | FK: на region_place_generation_rules(id) в place_generation_limits/location_object_rules; на place_templates(id) в graph_nodes. |
| `building_template_id` | `TEXT` | да | — | `world_base.building_templates(id) ON DELETE RESTRICT` | — | Описание отсутствует. |
| `priority` | `INTEGER` | нет | `0` | — | `NOT NULL` | Описание отсутствует. |
| `applicability` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `valid_from` | `DATE, ADD COLUMN valid_to DATE, ADD COLUMN confidence TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown','low','medium_low','medium','medium_high','high'))` | Описание отсутствует. |

**Ограничения таблицы:**

- `CHECK (num_nonnulls(graph_node_id, node_type, place_template_id, building_template_id) = 1)`
- `UNIQUE INDEX g4_materialization_binding_active_priority ( COALESCE(graph_node_id, ''), COALESCE(node_type, ''), COALESCE(place_template_id, ''), COALESCE(building_template_id, ''), priority ) WHERE status = 'approved'`

### `world_base.materialization_slot_rules`

Required/optional slots и количественные границы materializer.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `profile_id` | `TEXT` | нет | — | `world_base.g4_materialization_profiles(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `slot_key` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `slot_domain` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (slot_domain IN ('g5_node','anchor','npc','item','container'))` | Описание отсутствует. |
| `min_count` | `INTEGER` | нет | `0` | — | `NOT NULL`<br>`CHECK (min_count >= 0)` | Описание отсутствует. |
| `max_count` | `INTEGER` | нет | — | — | `NOT NULL`<br>`CHECK (max_count >= min_count)` | Описание отсутствует. |
| `g5_minilocation_template_id` | `TEXT` | да | — | `world_base.g5_minilocation_templates(id) ON DELETE RESTRICT` | — | Описание отсутствует. |
| `g5_anchor_template_id` | `TEXT` | да | — | `world_base.g5_anchor_templates(id) ON DELETE RESTRICT` | — | Описание отсутствует. |
| `g5_edge_template_id` | `TEXT` | да | — | `world_base.g5_edge_templates(id) ON DELETE RESTRICT` | — | Описание отсутствует. |
| `parent_node_slot_key` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `entry_role` | `TEXT` | нет | `'none'` | — | `NOT NULL`<br>`CHECK (entry_role IN ('none','start','exit','start_and_exit'))` | Описание отсутствует. |
| `required` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |
| `valid_from` | `DATE, ADD COLUMN valid_to DATE, ADD COLUMN applicability JSONB` | нет | `'{}'::jsonb, ADD COLUMN confidence TEXT` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown','low','medium_low','medium','medium_high','high'))` | Описание отсутствует. |

**Ограничения таблицы:**

- `UNIQUE (profile_id, slot_key)`

### `world_base.g4_npc_materialization_rules`

G4-specific правила количества и причин присутствия NPC.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `world_revision_id` | `TEXT` | нет | — | `world_base.world_revisions(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `graph_node_id` | `TEXT` | нет | — | `world_base.graph_nodes(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `slot_rule_id` | `TEXT` | нет | — | `world_base.materialization_slot_rules(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `npc_profile_set_id` | `TEXT` | нет | — | `world_base.region_npc_profile_sets(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `min_count` | `INTEGER` | нет | `0` | — | `NOT NULL`<br>`CHECK (min_count >= 0)` | Описание отсутствует. |
| `max_count` | `INTEGER` | нет | — | — | `NOT NULL`<br>`CHECK (max_count >= min_count)` | Описание отсутствует. |
| `presence_reason` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `causal_basis_type` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `causal_basis_id` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `applicability` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `valid_from` | `DATE` | да | — | — | — | Описание отсутствует. |
| `valid_to` | `DATE` | да | — | — | — | Описание отсутствует. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown','low','medium_low','medium','medium_high','high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `weight` | `INTEGER` | нет | `1` | — | `NOT NULL`<br>`CHECK (weight > 0)` | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.g4_item_materialization_rules`

G4-specific правила предметов, имущества и economic basis.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `world_revision_id` | `TEXT` | нет | — | `world_base.world_revisions(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `graph_node_id` | `TEXT` | нет | — | `world_base.graph_nodes(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `slot_rule_id` | `TEXT` | нет | — | `world_base.materialization_slot_rules(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `item_profile_id` | `TEXT` | нет | — | `world_base.item_profile_sets(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `property_profile_id` | `TEXT` | да | — | `world_base.property_profiles(id) ON DELETE RESTRICT` | — | Описание отсутствует. |
| `min_count` | `INTEGER` | нет | `0` | — | `NOT NULL`<br>`CHECK (min_count >= 0)` | Описание отсутствует. |
| `max_count` | `INTEGER` | нет | — | — | `NOT NULL`<br>`CHECK (max_count >= min_count)` | Описание отсутствует. |
| `economic_basis` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `causal_basis_type` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `causal_basis_id` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `applicability` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `valid_from` | `DATE` | да | — | — | — | Описание отсутствует. |
| `valid_to` | `DATE` | да | — | — | — | Описание отсутствует. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown','low','medium_low','medium','medium_high','high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `weight` | `INTEGER` | нет | `1` | — | `NOT NULL`<br>`CHECK (weight > 0)` | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.g4_container_materialization_rules`

G4-specific правила контейнеров, содержимого и доступа.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `world_revision_id` | `TEXT` | нет | — | `world_base.world_revisions(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `graph_node_id` | `TEXT` | нет | — | `world_base.graph_nodes(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `slot_rule_id` | `TEXT` | нет | — | `world_base.materialization_slot_rules(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `container_template_id` | `TEXT` | нет | — | `world_base.container_templates(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `content_profile_id` | `TEXT` | да | — | `world_base.container_content_profiles(id) ON DELETE RESTRICT` | — | Описание отсутствует. |
| `property_profile_id` | `TEXT` | да | — | `world_base.property_profiles(id) ON DELETE RESTRICT` | — | Описание отсутствует. |
| `min_count` | `INTEGER` | нет | `0` | — | `NOT NULL`<br>`CHECK (min_count >= 0)` | Описание отсутствует. |
| `max_count` | `INTEGER` | нет | — | — | `NOT NULL`<br>`CHECK (max_count >= min_count)` | Описание отсутствует. |
| `causal_basis_type` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `causal_basis_id` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `applicability` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `valid_from` | `DATE` | да | — | — | — | Описание отсутствует. |
| `valid_to` | `DATE` | да | — | — | — | Описание отсутствует. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown','low','medium_low','medium','medium_high','high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `weight` | `INTEGER` | нет | `1` | — | `NOT NULL`<br>`CHECK (weight > 0)` | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

## Materialization v2: предметы и имущество

### `world_base.container_templates`

Шаблоны контейнеров с capacity и access policy.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `world_revision_id` | `TEXT` | нет | — | `world_base.world_revisions(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `region_id` | `TEXT` | да | — | `world_base.regions(id) ON DELETE CASCADE` | — | FK → regions(id): регион, к которому относится запись. |
| `category_id` | `TEXT` | нет | — | `world_base.universal_categories(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `source_id` | `TEXT` | да | — | `world_base.source_records(id) ON DELETE RESTRICT` | — | FK → source_records(id): provenance container template; draft catalog не выводит историческую точность из этой ссылки. |
| `capacity` | `INTEGER` | нет | — | — | `NOT NULL`<br>`CHECK (capacity > 0)` | Положительная внутренняя вместимость контейнера в packing slots; не является массой, литрами или inventory slots персонажа. |
| `packing_slot_cost` | `INTEGER` | нет | — | — | `NOT NULL`<br>`CHECK (packing_slot_cost > 0)` | Положительный внешний размер контейнера в packing slots при переноске или вложении. |
| `capacity_policy` | `JSONB` | нет | — | — | `NOT NULL`<br>`CHECK ( jsonb_typeof(capacity_policy) = 'object' AND capacity_policy = '{"version":1,"mode":"packing_slots","unit":"packing_slot"}'::jsonb )` | Closed policy строго {version:1,mode:packing_slots,unit:packing_slot}; runtime не интерпретирует иные единицы. |
| `access_policy` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.item_profile_sets`

Профили комплектов предметов для контекста.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `world_revision_id` | `TEXT` | нет | — | `world_base.world_revisions(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `region_id` | `TEXT` | да | — | `world_base.regions(id) ON DELETE CASCADE` | — | FK → regions(id): регион, к которому относится запись. |
| `context_domain` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `applicability` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.item_profile_entries`

Нормализованные варианты предметов и quantity limits.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `profile_id` | `TEXT` | нет | — | `world_base.item_profile_sets(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `item_template_id` | `TEXT` | да | — | `world_base.item_templates(id) ON DELETE RESTRICT` | — | FK → item_templates(id): шаблон предмета. |
| `item_category_id` | `TEXT` | да | — | `world_base.universal_categories(id) ON DELETE RESTRICT` | — | Описание отсутствует. |
| `slot_key` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `min_quantity` | `INTEGER` | нет | `1` | — | `NOT NULL`<br>`CHECK (min_quantity >= 0)` | Описание отсутствует. |
| `max_quantity` | `INTEGER` | нет | `1` | — | `NOT NULL`<br>`CHECK (max_quantity >= min_quantity)` | Описание отсутствует. |
| `required` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `weight` | `INTEGER` | нет | `1` | — | `NOT NULL`<br>`CHECK (weight > 0)` | Описание отсутствует. |

**Ограничения таблицы:**

- `CHECK ((item_template_id IS NULL) <> (item_category_id IS NULL))`

### `world_base.container_content_profiles`

Профили содержимого контейнеров.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `container_template_id` | `TEXT` | нет | — | `world_base.container_templates(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `empty_allowed` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.container_content_profile_entries`

Нормализованные варианты содержимого и количества.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `profile_id` | `TEXT` | нет | — | `world_base.container_content_profiles(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `item_template_id` | `TEXT` | да | — | `world_base.item_templates(id) ON DELETE RESTRICT` | — | FK → item_templates(id): шаблон предмета. |
| `item_category_id` | `TEXT` | да | — | `world_base.universal_categories(id) ON DELETE RESTRICT` | — | Описание отсутствует. |
| `min_quantity` | `INTEGER` | нет | `1` | — | `NOT NULL`<br>`CHECK (min_quantity >= 0)` | Описание отсутствует. |
| `max_quantity` | `INTEGER` | нет | `1` | — | `NOT NULL`<br>`CHECK (max_quantity >= min_quantity)` | Описание отсутствует. |
| `required` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `weight` | `INTEGER` | нет | `1` | — | `NOT NULL`<br>`CHECK (weight > 0)` | Описание отсутствует. |

**Ограничения таблицы:**

- `CHECK ((item_template_id IS NULL) <> (item_category_id IS NULL))`

### `world_base.item_template_category_bindings`

Нормализованные фасетные связи шаблона предмета с утверждёнными категориями.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `item_template_id` | `TEXT` | нет | — | `world_base.item_templates(id) ON DELETE CASCADE` | `NOT NULL` | FK → item_templates(id): классифицируемый шаблон предмета. |
| `category_id` | `TEXT` | нет | — | `world_base.universal_categories(id) ON DELETE RESTRICT` | `NOT NULL` | FK → universal_categories(id): утверждённая категория фасета. |
| `binding_kind` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (binding_kind IN ( 'object_type','primary_function','secondary_function','material', 'manufacturing_technique','component_type','physical_form','condition', 'quality_band','size_band','mass_band','use_context' ))` | Независимый фасет: object_type, function, material, technique, condition и др. |
| `packing_slot_cost` | `INTEGER` | да | — | — | — | Только size_band: положительное число packing slots за один bundle; не является массой или объёмом. |
| `packing_bundle_size` | `INTEGER` | да | — | — | — | Только size_band: положительное количество одинаковых template/state items в одном packing bundle. |
| `exclusivity_group` | `TEXT` | да | — | — | — | Только primary_function либо NULL; запрещает неформальные группы совместимости. |
| `requires_regional_permission` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Требует approved regional/period permission в той же world revision до импорта. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- `CHECK (exclusivity_group IS NULL OR (binding_kind = 'primary_function' AND exclusivity_group = 'primary_function'))`
- `CHECK ( (binding_kind = 'size_band' AND packing_slot_cost IS NOT NULL AND packing_slot_cost > 0 AND packing_bundle_size IS NOT NULL AND packing_bundle_size > 0) OR (binding_kind <> 'size_band' AND packing_slot_cost IS NULL AND packing_bundle_size IS NULL) )`
- `UNIQUE (item_template_id, category_id, binding_kind)`
- `UNIQUE INDEX item_template_one_active_primary_function (item_template_id) WHERE binding_kind = 'primary_function' AND status = 'approved'`
- `UNIQUE INDEX item_template_one_active_size_band (item_template_id) WHERE binding_kind = 'size_band' AND status = 'approved'`

### `world_base.item_template_inventory_profiles`

Строго типизированные mass и carrying параметры шаблона предмета; не историческое подтверждение без source record.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `item_template_id` | `TEXT` | нет | — | `world_base.item_templates(id) ON DELETE CASCADE` | `NOT NULL` | FK → item_templates(id): шаблон предмета, для которого утверждены физические inventory parameters. |
| `world_revision_id` | `TEXT` | нет | — | `world_base.world_revisions(id) ON DELETE RESTRICT` | `NOT NULL` | FK → world_revisions(id): pinned ревизия authoring-каталога. |
| `source_id` | `TEXT` | нет | — | `world_base.source_records(id) ON DELETE RESTRICT` | `NOT NULL` | FK → source_records(id): provenance параметров; отсутствие не допускает historical approval. |
| `mass_grams` | `INTEGER` | нет | — | — | `NOT NULL`<br>`CHECK (mass_grams >= 0)` | Неотрицательная масса одного экземпляра в граммах; не выводится из packing slots и не имеет fallback. |
| `carry_form` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (carry_form IN ('compact','regular','long','bulky'))` | Closed carrying form: compact, regular, long или bulky. |
| `external_hand_cost` | `INTEGER` | нет | — | — | `NOT NULL`<br>`CHECK (external_hand_cost IN (0,1,2))` | Closed внешний hand cost 0, 1 или 2; не является use_hand_cost. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | draft, approved или deprecated; для template допустим только один approved profile. |

**Ограничения таблицы:**

- `UNIQUE INDEX item_template_one_active_inventory_profile (item_template_id) WHERE status = 'approved'`

### `world_base.container_template_inventory_profiles`

Строго типизированные mass, carrying и quick/primary role параметры шаблона контейнера.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `container_template_id` | `TEXT` | нет | — | `world_base.container_templates(id) ON DELETE CASCADE` | `NOT NULL` | FK → container_templates(id): контейнер, для которого утверждены физические inventory parameters. |
| `world_revision_id` | `TEXT` | нет | — | `world_base.world_revisions(id) ON DELETE RESTRICT` | `NOT NULL` | FK → world_revisions(id): pinned ревизия authoring-каталога. |
| `source_id` | `TEXT` | нет | — | `world_base.source_records(id) ON DELETE RESTRICT` | `NOT NULL` | FK → source_records(id): provenance параметров; отсутствие не допускает historical approval. |
| `mass_grams` | `INTEGER` | нет | — | — | `NOT NULL`<br>`CHECK (mass_grams >= 0)` | Неотрицательная масса пустого контейнера в граммах; contents считаются отдельно. |
| `carry_form` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (carry_form IN ('compact','regular','long','bulky'))` | Closed carrying form: compact, regular, long или bulky. |
| `external_hand_cost` | `INTEGER` | нет | — | — | `NOT NULL`<br>`CHECK (external_hand_cost IN (0,1,2))` | Closed внешний hand cost 0, 1 или 2; не является use_hand_cost. |
| `inventory_role` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (inventory_role IN ('none','quick_container','primary_container'))` | none, quick_container или primary_container; это authoring role, а не сохранённый derived zone. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | draft, approved или deprecated; для template допустим только один approved profile. |

**Ограничения таблицы:**

- `UNIQUE INDEX container_template_one_active_inventory_profile (container_template_id) WHERE status = 'approved'`

### `world_base.container_template_facet_bindings`

Нормализованные фасеты шаблона контейнера.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `container_template_id` | `TEXT` | нет | — | `world_base.container_templates(id) ON DELETE CASCADE` | `NOT NULL` | FK → container_templates(id): классифицируемый шаблон контейнера. |
| `category_id` | `TEXT` | нет | — | `world_base.universal_categories(id) ON DELETE RESTRICT` | `NOT NULL` | FK → universal_categories(id): утверждённая категория фасета. |
| `facet` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (facet IN ( 'container_form','capacity_band','closure_type','access_model', 'portability','content_compatibility','condition','material' ))` | container_form, material, capacity_band, closure_type, access_model, portability, content_compatibility или condition. |
| `requires_regional_permission` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Требует approved regional/period permission в той же world revision до импорта. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- `UNIQUE (container_template_id, category_id, facet)`

### `world_base.container_content_category_relations`

Разрешённые и запрещённые пары категорий контейнера и содержимого.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `container_category_id` | `TEXT` | нет | — | `world_base.universal_categories(id) ON DELETE RESTRICT` | `NOT NULL` | FK → universal_categories(id): категория контейнера. |
| `content_category_id` | `TEXT` | нет | — | `world_base.universal_categories(id) ON DELETE RESTRICT` | `NOT NULL` | FK → universal_categories(id): категория допустимого либо запрещённого содержимого. |
| `compatibility` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (compatibility IN ('allowed','forbidden'))` | closed vocabulary: allowed или forbidden; не создаёт regional permission. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- `UNIQUE (container_category_id, content_category_id)`

### `world_base.item_classification_migration_inventory`

Явный отчёт перехода legacy-полей предметов и контейнеров без guessed mapping.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `legacy_table_name` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (legacy_table_name IN ('item_templates','container_templates'))` | Исходная legacy-таблица без автоматической записи в неё. |
| `legacy_record_id` | `TEXT` | нет | — | — | `NOT NULL` | ID исходной legacy-записи. |
| `legacy_field_name` | `TEXT` | нет | — | — | `NOT NULL` | Поле, для которого требуется reviewed classification mapping. |
| `legacy_value` | `TEXT` | нет | — | — | `NOT NULL` | Дословное legacy-значение; не интерпретируется как категория. |
| `resolution_status` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (resolution_status IN ('mapped','data_gap','migration_conflict','deferred'))` | mapped, data_gap, migration_conflict или deferred. |
| `resolved_category_id` | `TEXT` | да | — | `world_base.universal_categories(id) ON DELETE RESTRICT` | — | FK → universal_categories(id); обязателен только при mapped. |
| `report_note` | `TEXT` | да | — | — | — | Описание отсутствует. |

**Ограничения таблицы:**

- `CHECK ((resolution_status = 'mapped') = (resolved_category_id IS NOT NULL))`
- `UNIQUE (legacy_table_name, legacy_record_id, legacy_field_name)`

### `world_base.property_profiles`

Региональные модели имущества и доступа.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `world_revision_id` | `TEXT` | нет | — | `world_base.world_revisions(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `region_id` | `TEXT` | да | — | `world_base.regions(id) ON DELETE CASCADE` | — | FK → regions(id): регион, к которому относится запись. |
| `property_category_id` | `TEXT` | нет | — | `world_base.universal_categories(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.property_profile_rules`

Условия owner/holder/controller/access/claim.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `property_profile_id` | `TEXT` | нет | — | `world_base.property_profiles(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `owner_kind` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (owner_kind IN ('person','household','workshop','community','institution','estate','unknown'))` | Closed vocabulary: person, household, workshop, community, institution, estate или unknown; не ID конкретного owner. |
| `holder_kind` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (holder_kind IN ('person','household','workshop','community','institution','estate','unknown'))` | Closed vocabulary holder relation; не заменяет party holder relation. |
| `controller_kind` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (controller_kind IN ('person','household','workshop','community','institution','estate','unknown'))` | Closed vocabulary controller relation; не заменяет party controller relation. |
| `access_policy` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Versioned policy payload для authoring access; без внешних ID и художественного текста. |
| `claim_conditions` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Versioned policy payload условий claim; без конкретных party relations. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.transport_templates`

Шаблоны транспорта с маршрутными и equipment requirements.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `world_revision_id` | `TEXT` | нет | — | `world_base.world_revisions(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `region_id` | `TEXT` | да | — | `world_base.regions(id) ON DELETE CASCADE` | — | FK → regions(id): регион, к которому относится запись. |
| `category_id` | `TEXT` | нет | — | `world_base.universal_categories(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `route_category_id` | `TEXT` | нет | — | `world_base.universal_categories(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `equipment_profile_id` | `TEXT` | да | — | `world_base.region_equipment_profiles(id) ON DELETE RESTRICT` | — | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

## Materialization v2: решения и импорт

### `world_base.decision_command_catalog`

Закрытый каталог команд bounded decision и зарегистрированных code handlers.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `domain` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `handler_id` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `input_schema_id` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- `UNIQUE (domain, handler_id)`

### `world_base.decision_policy_profiles`

Политики, определяющие контексты формального запроса решения.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `world_revision_id` | `TEXT` | нет | — | `world_base.world_revisions(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `region_id` | `TEXT` | да | — | `world_base.regions(id) ON DELETE CASCADE` | — | FK → regions(id): регион, к которому относится запись. |
| `context_domain` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `state_schema_version` | `INTEGER` | нет | — | — | `NOT NULL`<br>`CHECK (state_schema_version >= 2)` | Описание отсутствует. |
| `applicability` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.decision_policy_options`

Допустимые команды, preconditions, costs и risk metadata политики.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `policy_profile_id` | `TEXT` | нет | — | `world_base.decision_policy_profiles(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `command_id` | `TEXT` | нет | — | `world_base.decision_command_catalog(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `option_order` | `INTEGER` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `preconditions` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `costs` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `risk_metadata` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Описание отсутствует. |

**Ограничения таблицы:**

- `UNIQUE (policy_profile_id, option_order)`
- `UNIQUE (policy_profile_id, command_id)`

### `world_base.catalog_imports`

Проверяемые импорты versioned authoring manifest.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `world_revision_id` | `TEXT` | нет | — | `world_base.world_revisions(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `manifest_schema_version` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `manifest_digest` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (manifest_digest ~ '^[a-f0-9]{64}$')` | Описание отсутствует. |
| `approval_status` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (approval_status IN ('proposed','approved','rejected'))` | Описание отсутствует. |
| `deletion_mode` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (deletion_mode IN ('none','explicit_only'))` | Описание отсутствует. |
| `provenance` | `JSONB` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `validation_report` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `imported_at` | `TIMESTAMPTZ` | да | — | — | — | Описание отсутствует. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.catalog_import_tables`

Digests, counts и dependency order таблиц одного импорта.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `import_id` | `TEXT` | нет | — | `world_base.catalog_imports(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `table_name` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `payload_digest` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (payload_digest ~ '^[a-f0-9]{64}$')` | Описание отсутствует. |
| `record_count` | `INTEGER` | нет | — | — | `NOT NULL`<br>`CHECK (record_count >= 0)` | Описание отсутствует. |
| `dependency_order` | `INTEGER` | нет | — | — | `NOT NULL`<br>`CHECK (dependency_order >= 0)` | Описание отсутствует. |

**Ограничения таблицы:**

- `PRIMARY KEY (import_id, table_name)`

## PR8: ориентиры, сигналы и следы среды

### `world_base.environment_landmark_templates`

Approved templates постоянных природных ориентиров; не party instances и не G0–G4 nodes.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `world_revision_id` | `TEXT` | нет | — | `world_base.world_revisions(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `category_id` | `TEXT` | нет | — | `world_base.universal_categories(id) ON DELETE RESTRICT` | `NOT NULL` | FK → universal_categories(id): approved landmark category. |
| `region_id` | `TEXT` | да | — | `world_base.regions(id) ON DELETE RESTRICT` | — | FK → regions(id): регион, к которому относится запись. |
| `public_label_key` | `TEXT` | нет | — | — | `NOT NULL` | Ключ функционального player-facing label; не собственное имя. |
| `icon_key` | `TEXT` | нет | — | — | `NOT NULL` | Approved semantic icon key без generic fallback. |
| `navigation_value` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `distinctiveness` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `recognition_difficulty` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `morphology_policy` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Закрытая versioned morphology policy без внешних ID. |
| `valid_from` | `DATE` | да | — | — | — | Описание отсутствует. |
| `valid_to` | `DATE` | да | — | — | — | Описание отсутствует. |
| `confidence` | `TEXT` | нет | `'unknown'` | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown','low','medium_low','medium','medium_high','high'))` | Уверенность в достоверности. Допустимо: unknown, low, medium_low, medium, medium_high, high. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.environment_landmark_profiles`

Региональные совместимые наборы landmark templates и закрытая policy.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `world_revision_id` | `TEXT` | нет | — | `world_base.world_revisions(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE RESTRICT` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `profile_policy` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `valid_from` | `DATE` | да | — | — | — | Описание отсутствует. |
| `valid_to` | `DATE` | да | — | — | — | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.environment_landmark_profile_entries`

Нормализованные template choices landmark profile с weight и exclusivity.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `profile_id` | `TEXT` | нет | — | `world_base.environment_landmark_profiles(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `template_id` | `TEXT` | нет | — | `world_base.environment_landmark_templates(id) ON DELETE RESTRICT` | `NOT NULL` | FK → region_place_generation_rules(id): правило генерации типа места. |
| `weight` | `INTEGER` | нет | `1` | — | `NOT NULL`<br>`CHECK (weight > 0)` | Описание отсутствует. |
| `required` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `exclusivity_group` | `TEXT` | да | — | — | — | Описание отсутствует. |

**Ограничения таблицы:**

- `PRIMARY KEY (profile_id, template_id)`

### `world_base.environment_landmark_rules`

Правила применения landmark profile в G1 scope и количественные пределы.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `world_revision_id` | `TEXT` | нет | — | `world_base.world_revisions(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `profile_id` | `TEXT` | нет | — | `world_base.environment_landmark_profiles(id) ON DELETE RESTRICT` | `NOT NULL` | FK → environment_landmark_profiles(id): применяемый regional profile. |
| `region_id` | `TEXT` | нет | — | `world_base.regions(id) ON DELETE RESTRICT` | `NOT NULL` | FK → regions(id): регион, к которому относится запись. |
| `min_count` | `INTEGER` | нет | `0` | — | `NOT NULL`<br>`CHECK (min_count >= 0)` | Минимум materialized landmarks; > 0 делает пустой candidate set hard block. |
| `max_count` | `INTEGER` | нет | — | — | `NOT NULL`<br>`CHECK (max_count >= min_count)` | Максимум deterministic materialized landmarks. |
| `required` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `weight` | `INTEGER` | нет | `1` | — | `NOT NULL`<br>`CHECK (weight > 0)` | Описание отсутствует. |
| `exclusivity_group` | `TEXT` | да | — | — | — | Группа взаимного исключения placement instances. |
| `valid_from` | `DATE` | да | — | — | — | Описание отсутствует. |
| `valid_to` | `DATE` | да | — | — | — | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- `UNIQUE INDEX environment_landmark_rule_approved_scope (world_revision_id, region_id, profile_id, COALESCE(exclusivity_group, '')) WHERE status = 'approved'`

### `world_base.environment_landmark_rule_g1_classes`

Допустимые классы G1 landmark rule.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `rule_id` | `TEXT` | нет | — | `world_base.environment_landmark_rules(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `g1_class` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |

**Ограничения таблицы:**

- `PRIMARY KEY (rule_id, g1_class)`

### `world_base.environment_landmark_rule_node_types`

Допустимые типы graph placement nodes landmark rule.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `rule_id` | `TEXT` | нет | — | `world_base.environment_landmark_rules(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `node_type` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |

**Ограничения таблицы:**

- `PRIMARY KEY (rule_id, node_type)`

### `world_base.environment_landmark_rule_landscapes`

Нормализованная совместимость landmark rule с landscape template.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `rule_id` | `TEXT` | нет | — | `world_base.environment_landmark_rules(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `landscape_template_id` | `TEXT` | нет | — | `world_base.landscape_templates(id) ON DELETE RESTRICT` | `NOT NULL` | FK → landscape_templates(id): канонический ландшафт ребра (обязателен для offroad_crossing). |

**Ограничения таблицы:**

- `PRIMARY KEY (rule_id, landscape_template_id)`

### `world_base.environment_landmark_rule_hydrology`

Нормализованная совместимость landmark rule с water template.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `rule_id` | `TEXT` | нет | — | `world_base.environment_landmark_rules(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `water_body_template_id` | `TEXT` | нет | — | `world_base.water_body_templates(id) ON DELETE RESTRICT` | `NOT NULL` | FK → water_body_templates(id): водная среда ребра (река, брод, переправа, …). |

**Ограничения таблицы:**

- `PRIMARY KEY (rule_id, water_body_template_id)`

### `world_base.environment_landmark_rule_land_use`

Нормализованная совместимость landmark rule с land-use template.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `rule_id` | `TEXT` | нет | — | `world_base.environment_landmark_rules(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `land_use_template_id` | `TEXT` | нет | — | `world_base.land_use_templates(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |

**Ограничения таблицы:**

- `PRIMARY KEY (rule_id, land_use_template_id)`

### `world_base.environment_landmark_rule_routes`

Нормализованная совместимость landmark rule с route template.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `rule_id` | `TEXT` | нет | — | `world_base.environment_landmark_rules(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `route_template_id` | `TEXT` | нет | — | `world_base.route_templates(id) ON DELETE RESTRICT` | `NOT NULL` | FK → route_templates(id): тип движения/инфраструктуры ребра. |

**Ограничения таблицы:**

- `PRIMARY KEY (rule_id, route_template_id)`

### `world_base.environment_cue_templates`

Templates временных зрительных, звуковых и запаховых signals с propagation/visibility policy.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `world_revision_id` | `TEXT` | нет | — | `world_base.world_revisions(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `category_id` | `TEXT` | нет | — | `world_base.universal_categories(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `public_label_key` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `icon_key` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `sense` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (sense IN ('sight','sound','smell'))` | Канал восприятия: sight, sound или smell. |
| `fading_duration_minutes` | `INTEGER` | нет | — | — | `NOT NULL`<br>`CHECK (fading_duration_minutes >= 0)` | Длительность controlled fading после прекращения emitter. |
| `expiry_duration_minutes` | `INTEGER` | нет | — | — | `NOT NULL`<br>`CHECK (expiry_duration_minutes >= fading_duration_minutes)` | Возраст, после которого cue сохраняется только в истории. |
| `propagation_policy` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Закрытая versioned policy физического распространения cue. |
| `visibility_policy` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Закрытая versioned policy физической различимости cue. |
| `valid_from` | `DATE` | да | — | — | — | Описание отсутствует. |
| `valid_to` | `DATE` | да | — | — | — | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.environment_emission_rules`

Approved causal rule emitter → cue template; отсутствие emitter блокирует cue.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `world_revision_id` | `TEXT` | нет | — | `world_base.world_revisions(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `cue_template_id` | `TEXT` | нет | — | `world_base.environment_cue_templates(id) ON DELETE RESTRICT` | `NOT NULL` | FK → environment_cue_templates(id): тип порождаемого сигнала. |
| `emitter_category_id` | `TEXT` | нет | — | `world_base.universal_categories(id) ON DELETE RESTRICT` | `NOT NULL` | FK → universal_categories(id): approved emitter category. |
| `source_type` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `region_id` | `TEXT` | да | — | `world_base.regions(id) ON DELETE RESTRICT` | — | FK → regions(id): регион, к которому относится запись. |
| `season` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `weather_applicability` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Описание отсутствует. |
| `emission_policy` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Закрытая versioned policy интенсивности и применимости emitter. |
| `valid_from` | `DATE` | да | — | — | — | Описание отсутствует. |
| `valid_to` | `DATE` | да | — | — | — | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.environment_trace_templates`

Templates наблюдаемых следов деятельности.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `world_revision_id` | `TEXT` | нет | — | `world_base.world_revisions(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `category_id` | `TEXT` | нет | — | `world_base.universal_categories(id) ON DELETE RESTRICT` | `NOT NULL` | FK → universal_categories(id): approved trace category. |
| `public_label_key` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `icon_key` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `recognition_difficulty` | `TEXT` | нет | — | — | `NOT NULL` | Сложность распознавания физически различимого следа. |
| `valid_from` | `DATE` | да | — | — | — | Описание отсутствует. |
| `valid_to` | `DATE` | да | — | — | — | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.environment_decay_profiles`

Versioned policy постепенного ослабления trace strength.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `world_revision_id` | `TEXT` | нет | — | `world_base.world_revisions(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `decay_policy` | `JSONB` | нет | — | — | `NOT NULL` | Закрытая versioned policy decay coefficients; не external references. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.environment_trace_creation_rules`

Approved causal rule emission → trace template и decay profile.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `world_revision_id` | `TEXT` | нет | — | `world_base.world_revisions(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `trace_template_id` | `TEXT` | нет | — | `world_base.environment_trace_templates(id) ON DELETE RESTRICT` | `NOT NULL` | FK → environment_trace_templates(id): создаваемый тип следа. |
| `decay_profile_id` | `TEXT` | нет | — | `world_base.environment_decay_profiles(id) ON DELETE RESTRICT` | `NOT NULL` | FK → environment_decay_profiles(id): policy его исчезновения. |
| `source_category_id` | `TEXT` | нет | — | `world_base.universal_categories(id) ON DELETE RESTRICT` | `NOT NULL` | FK → universal_categories(id): approved source category. |
| `source_kind` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `movement_mode` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `region_id` | `TEXT` | да | — | `world_base.regions(id) ON DELETE RESTRICT` | — | FK → regions(id): регион, к которому относится запись. |
| `season` | `TEXT` | да | — | — | — | Описание отсутствует. |
| `required` | `BOOLEAN` | нет | `false` | — | `NOT NULL` | Описание отсутствует. |
| `creation_policy` | `JSONB` | нет | `'{}'::jsonb` | — | `NOT NULL` | Закрытая versioned policy причинного создания trace. |
| `valid_from` | `DATE` | да | — | — | — | Описание отсутствует. |
| `valid_to` | `DATE` | да | — | — | — | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- Явные табличные constraints отсутствуют.

### `world_base.environment_trace_rule_landscapes`

Нормализованная совместимость trace rule с landscape template.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `rule_id` | `TEXT` | нет | — | `world_base.environment_trace_creation_rules(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `landscape_template_id` | `TEXT` | нет | — | `world_base.landscape_templates(id) ON DELETE RESTRICT` | `NOT NULL` | FK → landscape_templates(id): канонический ландшафт ребра (обязателен для offroad_crossing). |

**Ограничения таблицы:**

- `PRIMARY KEY (rule_id, landscape_template_id)`

### `world_base.environment_trace_rule_hydrology`

Нормализованная совместимость trace rule с water template.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `rule_id` | `TEXT` | нет | — | `world_base.environment_trace_creation_rules(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `water_body_template_id` | `TEXT` | нет | — | `world_base.water_body_templates(id) ON DELETE RESTRICT` | `NOT NULL` | FK → water_body_templates(id): водная среда ребра (река, брод, переправа, …). |

**Ограничения таблицы:**

- `PRIMARY KEY (rule_id, water_body_template_id)`

## Без утверждённой группы

### `world_base.g4_materialization_layout_edges`

Описание назначения отсутствует.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `profile_id` | `TEXT` | нет | — | `world_base.g4_materialization_profiles(id) ON DELETE CASCADE` | `NOT NULL` | Описание отсутствует. |
| `from_anchor_slot_key` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `to_anchor_slot_key` | `TEXT` | нет | — | — | `NOT NULL` | Описание отсутствует. |
| `g5_edge_template_id` | `TEXT` | нет | — | `world_base.g5_edge_templates(id) ON DELETE RESTRICT` | `NOT NULL` | Описание отсутствует. |
| `ordinal` | `INTEGER` | нет | — | — | `NOT NULL`<br>`CHECK (ordinal >= 0)` | Описание отсутствует. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | Статус утверждения записи. Допустимо: draft, usable_with_caution, approved, needs_review, conflict, rejected. |

**Ограничения таблицы:**

- `CHECK (from_anchor_slot_key <> to_anchor_slot_key)`
- `UNIQUE (profile_id, from_anchor_slot_key, to_anchor_slot_key)`

### `world_base.item_template_source_bindings`

Описание назначения отсутствует.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `item_template_id` | `TEXT` | нет | — | `world_base.item_templates(id) ON DELETE CASCADE` | `NOT NULL` | FK → item_templates(id): template, к которому относится одно ограниченное evidence claim. |
| `source_id` | `TEXT` | нет | — | `world_base.source_records(id) ON DELETE RESTRICT` | `NOT NULL` | FK → source_records(id): конкретный источник доказательства; project policy не заменяет historical source. |
| `world_revision_id` | `TEXT` | нет | — | `world_base.world_revisions(id) ON DELETE RESTRICT` | `NOT NULL` | FK → world_revisions(id): revision, в котором рассматривается evidence binding. |
| `evidence_class` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (evidence_class IN ('direct_novgorod','direct_novgorod_or_rus_period','rus_period_with_novgorod_context','comparative_period'))` | Закрытый класс evidence: direct_novgorod, direct_novgorod_or_rus_period, rus_period_with_novgorod_context или comparative_period. |
| `claim_scope` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (claim_scope IN ('historical_presence','material','construction','physical_parameter','social_access','commonness'))` | Точно ограниченное утверждение: historical_presence, material, construction, physical_parameter, social_access или commonness. |
| `valid_from` | `DATE` | да | — | — | — | Описание отсутствует. |
| `valid_to` | `DATE` | да | — | — | — | Описание отсутствует. |
| `confidence` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown','low','medium_low','medium','medium_high','high'))` | Оценка уверенности в конкретном claim, не историческая частотность. |
| `review_status` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (review_status IN ('needs_review','reviewed','rejected'))` | needs_review, reviewed или rejected; только reviewed historical_presence может участвовать в promotion readiness. |
| `notes` | `TEXT` | да | — | — | — | Необязательная граница доказательного утверждения; не является queryable категорией. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | draft, approved или deprecated; approved binding не создаёт regional permission. |

**Ограничения таблицы:**

- `CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)`
- `UNIQUE (item_template_id, source_id, claim_scope)`

### `world_base.container_template_source_bindings`

Описание назначения отсутствует.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `container_template_id` | `TEXT` | нет | — | `world_base.container_templates(id) ON DELETE CASCADE` | `NOT NULL` | FK → container_templates(id): container template, к которому относится одно ограниченное evidence claim. |
| `source_id` | `TEXT` | нет | — | `world_base.source_records(id) ON DELETE RESTRICT` | `NOT NULL` | FK → source_records(id): конкретный источник доказательства. |
| `world_revision_id` | `TEXT` | нет | — | `world_base.world_revisions(id) ON DELETE RESTRICT` | `NOT NULL` | FK → world_revisions(id): revision, в котором рассматривается evidence binding. |
| `evidence_class` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (evidence_class IN ('direct_novgorod','direct_novgorod_or_rus_period','rus_period_with_novgorod_context','comparative_period'))` | Закрытый класс evidence без неявного вывода исторической допустимости. |
| `claim_scope` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (claim_scope IN ('historical_presence','material','construction','physical_parameter','social_access','commonness'))` | historical_presence, material, construction, physical_parameter, social_access или commonness. |
| `valid_from` | `DATE` | да | — | — | — | Описание отсутствует. |
| `valid_to` | `DATE` | да | — | — | — | Описание отсутствует. |
| `confidence` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (confidence IN ('unknown','low','medium_low','medium','medium_high','high'))` | Оценка уверенности в конкретном claim. |
| `review_status` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (review_status IN ('needs_review','reviewed','rejected'))` | needs_review, reviewed или rejected; reviewed historical_presence является отдельным promotion gate. |
| `notes` | `TEXT` | да | — | — | — | Необязательная граница доказательного утверждения. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | draft, approved или deprecated; binding не создаёт региональное permission. |

**Ограничения таблицы:**

- `CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)`
- `UNIQUE (container_template_id, source_id, claim_scope)`

### `world_base.quantity_unit_definitions`

Описание назначения отсутствует.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `dimension` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (dimension IN ('count','mass','volume','length'))` | Измеряемое измерение: count, mass, volume или length. |
| `canonical_unit` | `TEXT` | нет | — | — | `NOT NULL` | Каноническая единица внутри данного dimension; не свободный игровой текст. |
| `conversion_policy` | `JSONB` | нет | — | — | `NOT NULL` | Versioned closed policy преобразования единицы; runtime не запрашивает внешние справочники. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | draft, approved или deprecated; draft definition не создаёт runtime quantity candidate. |

**Ограничения таблицы:**

- `CHECK (jsonb_typeof(conversion_policy) = 'object')`
- `UNIQUE (dimension, canonical_unit)`

### `world_base.item_template_quantity_profiles`

Описание назначения отсутствует.

| Поле | Тип | NULL | Default | FK | Constraints | Описание |
|---|---|---:|---|---|---|---|
| `id` | `TEXT` | нет | — | — | `NOT NULL`<br>`PRIMARY KEY` | Уникальный идентификатор записи (TEXT, первичный ключ). |
| `item_template_id` | `TEXT` | нет | — | `world_base.item_templates(id) ON DELETE CASCADE` | `NOT NULL` | FK → item_templates(id): bulk template с явной quantity semantics. |
| `world_revision_id` | `TEXT` | нет | — | `world_base.world_revisions(id) ON DELETE RESTRICT` | `NOT NULL` | FK → world_revisions(id): pinned authoring revision quantity profile. |
| `quantity_unit_id` | `TEXT` | нет | — | `world_base.quantity_unit_definitions(id) ON DELETE RESTRICT` | `NOT NULL` | FK → quantity_unit_definitions(id): нормализованная единица количества. |
| `quantity_dimension` | `TEXT` | нет | — | — | `NOT NULL`<br>`CHECK (quantity_dimension IN ('count','mass','volume','length'))` | dimension quantity profile; должен совпадать с quantity unit definition. |
| `minimum_quantity` | `INTEGER` | нет | — | — | `NOT NULL`<br>`CHECK (minimum_quantity > 0)` | Минимальное положительное количество в выбранной единице. |
| `maximum_quantity` | `INTEGER` | да | — | — | `CHECK (maximum_quantity IS NULL OR maximum_quantity >= minimum_quantity)` | Необязательная верхняя граница; NULL не означает fallback quantity. |
| `default_quantity_policy` | `JSONB` | нет | — | — | `NOT NULL` | Closed versioned policy. explicit_only требует готовое quantity от materialization rule и запрещает default. |
| `mass_grams_per_unit` | `INTEGER` | нет | — | — | `NOT NULL`<br>`CHECK (mass_grams_per_unit > 0)` | Детерминированный массовый input одной quantity unit; не является packing slots или исторической частотностью. |
| `stackable` | `BOOLEAN` | нет | — | — | `NOT NULL` | Разрешено ли хранить одинаковые quantity units в одной instance line. |
| `partial_consumption_allowed` | `BOOLEAN` | нет | — | — | `NOT NULL` | Разрешено ли уменьшение quantity конкретной party instance. |
| `source_id` | `TEXT` | нет | — | `world_base.source_records(id) ON DELETE RESTRICT` | `NOT NULL` | FK → source_records(id): provenance quantity policy; draft policy не подтверждает историческую меру. |
| `status` | `TEXT` | нет | `'draft'` | — | `NOT NULL`<br>`CHECK (status IN ('draft','approved','deprecated'))` | draft, approved или deprecated; для template допустим только один approved quantity profile. |

**Ограничения таблицы:**

- `CHECK (jsonb_typeof(default_quantity_policy) = 'object')`
- `UNIQUE (item_template_id, world_revision_id)`
- `UNIQUE INDEX item_template_one_active_quantity_profile (item_template_id) WHERE status = 'approved'`
