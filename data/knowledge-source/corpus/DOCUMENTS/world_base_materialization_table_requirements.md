# Требования к таблицам каталогов и материализации

**Статус:** active technical normative по назначению и наполнению базы
**Версия:** 1.0.0
**Область:** назначение, наполнение, связи и порядок готовности данных `world_base` и party materialization

## 0. Роль документа

Документ не является DDL и не перечисляет полный набор колонок.

```text
infra/world-base/schema.sql и schema/*.sql
  = исполняемый источник физической схемы PostgreSQL;

infra/world-base/SCHEMA_REFERENCE.md
  = автоматически созданный справочник фактически существующих колонок;

этот документ
  = назначение таблиц, требования к данным, уровни category/template/profile/rule,
    обязательные связи, JSONB policy, пробелы и порядок заполнения.
```

Если описание физической колонки расходится с DDL, верен DDL. Если требуется понять, зачем существует таблица и когда её данные готовы для materializer, применяется этот норматив.

## 1. Общая модель

### 1.1. Category

Универсальный допустимый тип. Не является историческим подтверждением присутствия в регионе.

### 1.2. Template

Универсальная либо региональная форма category с машинными параметрами, периодом, источниками и ограничениями.

### 1.3. Profile

Совместимый набор templates/options и limits для materialization scope. Не является конкретным party instance.

### 1.4. Rule

Связывает profile с регионом, G4, временем, сезоном, причиной и условиями применения.

### 1.5. Instance

Конкретная сущность партии. Instances запрещены в authoring-таблицах `world_base`, кроме явно канонических G0–G4 и исторических записей.

## 2. Общие требования к authoring-данным

Каждая активная запись имеет стабильный ID, status, confidence, период применимости либо явное отсутствие временного ограничения, provenance и связь с источниками. Региональные данные имеют `region_id` либо входят через явную region binding.

Runtime использует только `approved` catalog records активной world revision. `draft`, `proposed`, `deprecated`, записи с нарушенными ссылками и записи вне периода не входят в candidate set.

### 2.1. Нормализация

В отдельные таблицы и FK/relations выносятся:

- category/template/profile/rule/instance IDs;
- region, G1–G4, source, role, occupation и period bindings;
- allowed/required/forbidden candidates;
- ownership, containment, holder/controller и graph relations;
- queryable параметры, участвующие в filters, JOIN, uniqueness и referential integrity.

Plural cross-reference не хранится массивом ID в JSONB. Для него создаётся entry/binding-таблица с FK, weight, required flag, applicability и exclusivity group при необходимости.

### 2.2. JSONB

JSONB допускается для:

- versioned condition expression без внешних ID;
- closed policy payload, проверяемого JSON Schema;
- validation report, immutable input/output snapshot и trace metadata;
- локализованного описания и неиндексируемых editor notes.

JSONB не допускается как единственное хранилище NPC, item, ownership, schedule, graph edge либо внешних ссылок.

## 3. Существующая схема

Текущие таблицы сохраняются как исходная физическая база. Их фактический список и колонки определяются `SCHEMA_REFERENCE.md`; число таблиц не фиксируется в нормативе.

Обязательные изменения:

- `graph_nodes` и `graph_edges` ограничиваются G0–G4;
- `graph_scale_rules` может описывать G5 как party/template scale;
- `place_minilocations` и `scene_anchors` объявляются deprecated для новых authoring records;
- конкретные G5 переносятся в party database;
- свободные plural ID JSONB постепенно заменяются relation tables;
- `item_templates` получает нормализованные category/material/container/equipment bindings.

Существующие специализированные universal tables сохраняются: social classes/roles, occupations, skills, legal statuses, landscape, water, route, land-use и place templates. Они не дублируются generic registry.

## 4. Универсальные категории и региональные разрешения

### `universal_categories`

Generic registry для доменов, не имеющих собственного специализированного справочника: demographic, appearance, clothing component, equipment slot, knowledge domain, behavior, motive, goal, fear, relationship, activity, schedule, item/container/property/transport, room/G5 anchor и command.

Запись является category, не template и не instance. Обязательны domain, stable code, status и compatibility semantics.

### `universal_category_relations`

Хранит parent, compatible, requires, excludes и equivalent-with-scope relations между categories. Обе стороны нормализованы FK; циклы запрещаются там, где relation иерархическая.

### `universal_parameter_definitions`

Описывает машинные параметры category domain: тип, unit, bounds, enum source и обязательность. Значение параметра не может вводить новый category ID.

### `region_category_options`

Разрешает category для региона и периода, задаёт commonness/weight и дополнительные ограничения. Без активной записи универсальная category не считается исторически доступной в регионе.

## 5. Региональные NPC-профили

Сохраняются и постепенно нормализуются `region_social_roles`, `region_occupations`, `region_npc_generation_rules`, `region_npc_knowledge` и `region_material_culture`.

Новые таблицы:

| Таблица | Уровень и назначение | Обязательные связи |
|---|---|---|
| `region_npc_archetypes` | Региональный NPC template без имени и биографии | region, role, occupation, legal/mobility refs |
| `region_demographic_profiles` | Profile допустимых age/sex/household/health/build choices | region и normalized category options |
| `region_name_pools` | Региональный/культурный pool для периода | region, period, sources |
| `region_name_pool_entries` | Конкретные разрешённые формы имён и weights | name pool |
| `region_appearance_profiles` | Choice sets внешности | region и appearance categories |
| `region_clothing_profiles` | Согласованные garment slots и ограничения | region, item templates/categories |
| `region_equipment_profiles` | Equipment set | region, role/occupation applicability |
| `region_equipment_profile_entries` | Required/optional equipment choices | equipment profile, item template/category |
| `region_knowledge_profiles` | Разрешённые fact domains и конкретные fact refs | region, knowledge categories, canonical IDs |
| `region_behavior_profiles` | Temperament/goal/fear/response и decision policy | region, behavior categories, policy |
| `region_relationship_profiles` | Типы и ограничения отношений | region, relationship categories |
| `region_activity_profiles` | Причины присутствия, занятия, ресурсы и anchors | region, activity category, G4/anchor refs |
| `region_schedule_profiles` | Time bands, routes, places и explicit fallback | region, activity/place/route refs |
| `region_npc_profile_sets` | Profile: одна совместимая композиция компонентов | archetype и все component profiles |

Для всех plural choices создаются нормализованные entry/binding tables. Fallback schedule может ссылаться только на явно перечисленные place/route/activity варианты.

## 6. G4, buildings и G5 templates

| Таблица | Уровень и назначение | Обязательные связи |
|---|---|---|
| `room_templates` | Universal/region template функции помещения или зоны | room category, optional region |
| `building_layout_templates` | Layout profile здания/комплекса | region, building template, period |
| `building_layout_nodes` | Template slots помещений/зон | layout, room template |
| `building_layout_edges` | Template passages | layout и два node slots |
| `g4_materialization_profiles` | Главный G4→G5 profile | region, layouts, limits |
| `g4_materialization_bindings` | Rule выбора profile | G4/node type/place/building/period |
| `g5_minilocation_templates` | Допустимый party G5 node template | category, capacity/access/visibility policy |
| `g5_anchor_templates` | Anchor template и interaction capabilities | anchor category |
| `g5_edge_templates` | Passage template между минилокациями | passage category и policies |
| `materialization_slot_rules` | Required/optional slots для NPC/items/containers/anchors | owner profile, normalized candidates |

Приоритет binding: конкретный G4 → конкретный place/building → G4 type → региональный default. На одном уровне неоднозначные active bindings запрещены.

## 7. Предметы, контейнеры, имущество и транспорт

| Таблица | Уровень и назначение | Обязательные связи |
|---|---|---|
| `item_templates` | Существующий item template, расширяемый category bindings | region/material culture/item category |
| `container_templates` | Отдельный container template | container category, region, capacity/access policies |
| `item_profile_sets` | Profile комплекта места/NPC | context domain и applicability |
| `item_profile_entries` | Required/optional item choice | profile, item template/category |
| `container_content_profiles` | Profile содержимого | container template/category |
| `container_content_profile_entries` | Content choices и quantity | content profile, item template/category |
| `property_profiles` | Ownership/access model | region и property categories |
| `property_profile_rules` | Owner/holder/controller/claim conditions | property profile и applicable context |
| `transport_templates` | Transport template | transport category, route categories, equipment requirements |

Пустой контейнер допустим только как явно разрешённый candidate. Конкретный owner, holder, controller и container nesting являются party relations, а не JSONB item description.

## 8. G4-specific materialization rules

- `g4_npc_materialization_rules` связывает G4/profile с допустимыми NPC profile sets, количеством, временем, причиной присутствия и ресурсом/маршрутом.
- `g4_item_materialization_rules` связывает slots с item profile sets, количеством, economic basis, ownership и NPC dependency.
- `g4_container_materialization_rules` связывает slots с container/content/property profiles и access/controller conditions.

Любая ссылка на G4, profile, template или category нормализуется. Conditions могут быть JSONB только как versioned expression, не содержащий скрытых ID.

## 9. Bounded decision data

### `decision_command_catalog`

Universal command definitions. Команда описывает тип намерения и зарегистрированный code handler, но не результат действия.

### `decision_policy_profiles`

Определяет, когда для actor/context требуется bounded decision, какие command domains разрешены и какая версия состояния обязательна.

### `decision_policy_options`

Связывает policy с допустимыми commands, preconditions, costs и risk metadata. Runtime формирует options только после code filtering.

## 10. Party database v2

Party schema хранится в `party_runtime`, логически изолируется `party_id` и имеет внутренние FK. World refs сопровождаются `world_revision_id` и проходят application validation, поскольку `world_base` может быть отдельной PostgreSQL database.

Обязательные логические хранилища:

- party/version pins, current state, position, player character и knowledge map;
- `party_materialization_runs` и `party_materialization_choices`;
- `party_g5_nodes`, `party_g5_edges` и anchors/slots;
- `party_npcs`, traits, relations, knowledge и schedules;
- `party_items`, `party_containers`, inventory и ownership;
- `party_decision_requests` и `party_decision_results`;
- `party_change_sets` и `party_autonomous_updates`;
- events, journal и versioned public-screen read model.
- `party_server_sessions` как нормализованная техническая проекция HTTP/game-server состояния с FK на v2 party; она не является source of truth мира.

Один committed baseline materialization допускается на `(party_id, g4_id)`. Repeat-entry читает его; repair использует отдельное поколение и историю.

Старая JSONB `game_sessions` не входит в production DDL v2, не создаётся migrations и не читается runtime. Backup/rollback старого формата выполняется только внешним migration tooling.

## 11. Seed/import contract

Authoring datasets поставляются отдельными versioned JSON-файлами и manifest. Manifest хранит schema version, world revision, список таблиц, digests, dependencies, provenance, режим удаления и approval.

Импорт выполняется так:

1. Проверка manifest и файловых digests.
2. JSON Schema validation.
3. Проверка table registry и отсутствия party instances.
4. Cross-reference validation.
5. Построение FK-derived load order.
6. Dry-run без записи.
7. Явное approval.
8. Transactional apply.
9. Readback counts/digests и audit record.

Implicit delete запрещён. Неизвестная таблица, ID вне manifest, dangling ref, active ambiguity либо отсутствующий required candidate блокируют импорт.

## 12. Порядок наполнения

```text
1. sources, revisions, regions и канонические G0–G4
2. специализированные universal справочники
3. universal_categories, relations и parameter definitions
4. region_category_options
5. regional NPC component profiles и profile sets
6. room/building/G4/G5 templates и bindings
7. item/container/property/transport profiles
8. G4-specific materialization rules
9. decision commands и policies
10. readiness/cross-reference audit
11. активация revision
```

Таблица готова к runtime только если её required links разрешаются, JSONB payload проходит свою schema, sources и period заданы, negative fixtures существуют, import order определён и readiness audit не содержит hard gaps.

## 13. Принятые физические решения

1. Generic registry называется `universal_categories`.
2. Существующие специализированные справочники не дублируются.
3. Plural ID relations нормализуются в entry/binding tables.
4. `place_minilocations` и `scene_anchors` deprecated; новые G5 используют templates.
5. Party G5 хранится нормализованно в `party_runtime`.
6. Queryable NPC components хранятся строками/relations, snapshots — JSONB.
7. RNG version — `mulberry32_v1`, seed derivation — SHA-256 canonical JSON.
8. Trace разделяется на run и choice rows; validation snapshot допустим в JSONB.
9. Command envelope — request-bound `cmd.v1` digest и exact option match.
10. Runtime v2 создаёт только новые партии; legacy JSONB sessions не мигрируют и не загружаются.

## 14. Критерий повышения в active

Технический норматив повышается вместе с основным архитектурным документом только после синхронизации DDL, generated schema reference, schemas/contracts, importer/readiness checks, party persistence и PASS отдельного критика.
