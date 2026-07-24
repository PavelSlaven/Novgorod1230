# Архитектурный стандарт пространственной модели G0–G6 и сценической топологии

**Статус:** `target`; не используется production runtime до прохождения единого integration gate<br>
**Версия:** `4.2.0`<br>
**Дата:** `2026-07-23`<br>
**Проект:** «Русь XIII век»<br>
**Канонический репозиторий:** `PavelSlaven/Novgorod1230`, ветка `main`<br>
**Базовая ревизия:** `520c0ea8cc366fc16c949a874c710f3547a322f6`<br>
**Действующая до активации модель:** materialization v2 — канонические G0–G4 и party-scoped G5<br>
**Целевая модель:** materialization v3 — канонические G0–G5, ограниченные party-scoped generated G5, party-scoped G6 и устойчивые сценические позиции<br>
**Область:** пространственные уровни, topology, movement, route planning, first-entry preparation, materialization, visibility, acoustics, carriers, exact temporal integration, persistence, concurrency, migration и release gate

---

## 0. Нормативный статус и правила чтения

### 0.1. Назначение

Документ определяет целевую пространственную архитектуру после materialization v2. Он устраняет смешение масштаба, сцены, позиции и маршрута и задаёт единую реализационную модель:

```text
G0 → G1 → G2 → G3 → G4 → G5 → G6
                                  ↓
                         scene_position_node
```

Где:

```text
G0–G5                 = заранее утверждённая каноническая карта;
generated G5          = конечные party-scoped дополнения из утверждённых templates;
G6                    = materialized scene spaces;
scene_position_node   = устойчивая техническая позиция внутри G6;
movement topology     = физические directed relations;
perception topology   = отдельные visibility/acoustic relations;
dynamic state         = actors, NPC, items, blockers, portals, hazards и overlays;
visual layout         = необязательное представление уже существующей topology.
```

G7 и G8 не вводятся.

### 0.2. Соотношение с active-нормативами

На базовой ревизии действуют документы materialization v2, в том числе:

- `code_driven_world_materialization_architecture.md`;
- `world_base_materialization_table_requirements.md`;
- `read_only_database_and_graph_architecture.md`;
- `map_g0_g4_workflow.txt`;
- `movement_locations_regions.txt`;
- `world_generation_and_turns.txt`;
- `base_turn_orchestration.txt`;
- `time_system.txt`;
- `interface_ux.md`;
- `formulas.md`;
- `infra/world-base/SCHEMA_REFERENCE.md`;
- региональные `G1_SEMANTIC_CATALOG.md`.

Пока раздел 0.4 не выполнен целиком, production runtime обязан следовать active materialization v2. Нельзя брать из этого документа отдельные таблицы, enum, алгоритмы или уровни и смешивать их с v2.

### 0.3. Приоритет внутри документа

Внутри этой редакции действует один порядок:

1. нормативная проза разделов 0–17 задаёт обязанности, инварианты и алгоритмы;
2. приложение A задаёт закрытые словари и state machines;
3. приложение B содержит единственное полное логическое определение каждого implementation contract;
4. приложение C задаёт закрытый реестр typed errors;
5. приложения D–E содержат release checklist и результат внутреннего аудита.

Один `contract_name` объявляется в приложении B ровно один раз. Схемы, примеры и исторические варианты вне приложения B не являются альтернативными contracts. Любой пример обязан иметь явную метку `example_only: true`.

При конфликте между нормативной прозой и contract schema реализация блокируется как `normative_contract_conflict`; разработчик не выбирает удобную трактовку.

### 0.4. Условия активации

Spatial v3 вместе с Temporal World v4 становится production-active только
одной атомарной поставкой P28, когда одновременно:

1. принят ADR materialization v2 → v3;
2. синхронизированы `AGENTS.md`, `.github/AGENTS.md`, профильные нормативы и навигация;
3. обновлены `world_base` и `party_runtime` DDL;
4. generated `SCHEMA_REFERENCE.md` совпадает с фактическим DDL;
5. обновлены JSON Schema, DTO, validators, repositories, importer и save/load;
6. назначен один production owner каждой spatial/movement responsibility;
7. legacy compatibility path либо адаптирован, либо исключён из production composition;
8. выполнена миграция данных и сохранений с rollback plan;
9. пройдены обязательные unit, contract, negative, property, integration и PostgreSQL tests;
10. обновлены module/contract/interface registries и repository graph artifacts;
11. независимый критик вернул `PASS` или допустимый `PASS WITH NOTES`;
12. единственный PR содержит рабочий `README.md`, изменения, результаты проверок, аудит и порядок интеграции.

Частичная активация запрещена.

### 0.5. Подтверждённая исходная ревизия

Редакция сверена с GitHub `main` на commit:

```text
520c0ea8cc366fc16c949a874c710f3547a322f6
```

Read-only копия Google Drive в этом документном проходе не использовалась и не считается подтверждением актуальности. Для release-интеграции любые материалы из неё должны отдельно сверяться с GitHub `main` по пути и SHA; GitHub остаётся каноническим источником.

### 0.6. Граница выполненного прохода

Настоящий документ является архитектурным target и не утверждает, что:

- DDL уже изменён;
- generated schemas уже пересобраны;
- миграции применены;
- tests или PostgreSQL integration выполнены;
- Graphify artifacts пересобраны;
- независимый critic вызван;
- PR создан.

Эти действия входят в release gate, а не в документный аудит.

### 0.7. Критерий нулевого документного аудита

Внутренний цикл считается завершённым с нулём замечаний только если одновременно:

- отсутствуют неразрешённые противоречия между разделами 0–17 и приложениями A–C;
- каждый `contract_name` объявлен ровно один раз, а каждый contract type разрешается в primitive, canonical contract или явно зарегистрированный controlled vocabulary;
- отсутствуют рабочие placeholders, незакрытые schema branches и альтернативные трактовки одного state transition;
- target-правила не выдаются за действующий runtime и не ослабляют active materialization v2 до атомарной активации;
- все выявленные замечания либо исправлены, либо явно вынесены в release-gate limitation без утверждения функциональной готовности.

Ноль замечаний в этом смысле относится только к статической непротиворечивости текста и contracts. Он не означает прохождение DDL, migration, compiler, runtime, PostgreSQL, Graphify или independent critic checks.

### 0.8. Temporal World v4 amendment

Профильный документ
`temporal_world_and_interruptible_activities.md` имеет status `active` после
финальной implementation acceptance. Он задаёт `temporal-world-v1` и
следующую Spatial DTO version `4.3.0-target.1` для exact `GameTimestamp`,
activities, temporal boundaries, domain/NPC/carrier/remote processing,
persistence и post-commit narration.

До атомарного P28 он используется только в target contracts, tests, migration
и shadow composition. Promotion выполнен после полной реализации и
независимого критика, но до final P28 exact-head evidence. Нормативный status
`active` не является production activation: production v2 остаётся sole owner
до атомарного P28.

При temporal-конфликте профильный amendment имеет приоритет над
пространственной прозой §11 и соответствующими Appendix B temporal contracts;
до синхронного изменения этих contracts операция блокируется как
`normative_contract_conflict`.

---

## 1. Архитектурные аксиомы

### 1.1. Код не является автором мира

Во всех подсистемах действует цепочка:

```text
category → regional template → profile → rule → candidate set → persisted instance
```

Код:

- не создаёт неизвестные category/template/profile/rule IDs;
- не придумывает исторические факты, названия, маршруты или владельцев;
- не расширяет candidate set свободным текстом игрока или LLM;
- не ослабляет фильтр при пустом required set;
- не создаёт generic fallback, ближайший аналог или «разумное» значение;
- детерминированно выбирает из утверждённого конечного набора;
- сохраняет IDs, versions, digests, seed и trace;
- возвращает typed data gap и hard block, если обязательный вариант отсутствует.

Пустой обязательный candidate set всегда означает typed data gap и hard block; fallback, ослабление фильтра и LLM repair запрещены.

LLM допускается только для формально bounded decisions, разрешённой конкретизации, аудита, персонажа игрока и прозы из visible context. LLM не пишет в базу и не формирует произвольный patch состояния.

### 1.2. Один уровень — один вопрос масштаба

```text
G0 — в каком историко-географическом регионе?
G1 — в какой территориальной ячейке?
G2 — в какой крупной зоне ячейки?
G3 — в каком устойчивом конкретном месте?
G4 — в какой крупной части места?
G5 — в какой конкретной локальной локации или комплексе?
G6 — в каком непосредственно разыгрываемом пространстве?
position — где именно внутри G6?
```

Функция, материал, опасность, сезонность, право доступа и состояние являются classes/facets/relations, а не дополнительными G-уровнями.

### 1.3. Containment не является movement

```text
contains            = структурная вложенность;
scene_edge          = переход между scene positions;
site_connection     = переход между G5 одного G4;
world_route_segment = физический участок дальнего маршрута;
visibility_link     = устойчивая линия обзора;
acoustic_edge       = путь передачи звука;
visual_edge_path    = способ отрисовки уже существующей relation.
```

Общий parent, близость на canvas или совпадение названий не создают физический переход.

### 1.4. Стоимость принадлежит явному действию

`immediate_action` расходует только action units и не продвигает game time. Он может атомарно изменить endpoint по action-cost `scene_edge` или `site_connection`, но не создаёт непрерывный segment progress и не имеет `traveller_travel_state`. Любое действие, которое должно продвинуть часы, моделируется как `timed_activity` или `timed_traversal`; скрыто добавлять минуты к immediate action запрещено.

Game time расходуется только на:

- `timed_activity`;
- `timed_traversal` по одному physical segment;
- synchronized time slice, который объединяет несколько time-bearing results под одним владельцем часов.

Смена G-ancestor, техническая boundary, endpoint binding или запись новой ancestor projection не добавляют скрытого времени. Если у проходимого segment или time-bearing activity отсутствует явная стоимость, это data gap.

### 1.5. Фактическое состояние отделено от знания

```text
factual topology/location = источник истины для расчётов;
character knowledge       = что персонаж знает, предполагает или ошибочно считает;
visible projection        = player-safe подмножество знания и восприятия;
player input              = намерение, а не факт мира.
```

Навигационная ошибка меняет perceived belief и разрешённый execution outcome, но не переписывает factual topology.

### 1.6. Expansion конечен

Generated G5 создаются только:

- внутри утверждённого G4 expansion profile;
- через конкретный open frontier;
- в пределах slot/template capacities;
- из конечного approved candidate set;
- для `through` chain — до заранее закреплённого terminal ordinal;
- для `branch` — пока `committed_residual_capacity > 0`; generation требует также `reservable_residual_capacity > 0`, а каждый созданный branch-site оставляет ровно один successor frontier до обязательного terminal resolution при окончательном исчерпании committed capacity;
- с обязательным terminal resolution каждого оставшегося frontier.

Бесконечное процедурное продолжение, runtime-создание G4/G1 и скрытый semantic continuation запрещены.

### 1.7. План неизменяем, история append-only

Выбранный готовый путь сохраняется как immutable `party_route_plan`. Изменение corridor, endpoint, carrier, method, static dependency или recovery target создаёт новый plan и execution. Завершённое время, progress, последствия, action runs, activity attempts, traversal interval results и execution events не переписываются.

### 1.8. Один authoritative writer

Materializers, resolvers и validators возвращают proposals/reports. Единственный commit component получает уже утверждённый write set и применяет его атомарно. Ни materializer, ни validator не выбирают альтернативу во время commit.

### 1.9. Семантическая и визуальная готовность независимы

`semantic_ready` требуется runtime. `visual_map_ready` требуется только соответствующему map view. Отсутствие layout не блокирует движение, сохранение или simulation и не разрешает выводить topology из координат UI.

---

## 2. Пространственные уровни и классификация

### 2.1. G0 — историко-географический регион

G0 задаёт крупную историко-географическую рамку: политические, правовые, хозяйственные, культурные, природные и маршрутные системы. Исторические земли, зоны влияния и спорные территории не автоматически становятся отдельными G0; их статус моделируется facets/relations и provenance.

Основной class:

```text
spatial.g0.historical_geographic_region
```

### 2.2. G1 — территориальная ячейка

G1 — технически стабильная ячейка приблизительно `32 × 32 км`. Она не является средневековой административной единицей. `grid_x/grid_y` входят в identity и не являются visual coordinates.

Основной class:

```text
spatial.g1.territorial_grid_cell
```

World revision использует одну grid convention:

```text
grid_east_north_v1:
  grid_x + 1 = east
  grid_x - 1 = west
  grid_y + 1 = north
  grid_y - 1 = south
```

Прямой переход между G1, соприкасающимися только углом, запрещён: такие ячейки не имеют общей physical boundary. Диагональное намерение разрешается только route chain с двумя явно упорядоченными cardinal G1 crossings; UI не может сокращать их до одного diagonal edge.

### 2.3. G2 — крупная зона G1

G2 — крупная пространственно различимая часть G1. Основной class один:

```text
spatial.g2.territorial_zone
```

Различия задают обязательные facets:

```text
shape_id          = areal | linear | network
dominant_basis_id = landform | land_cover | hydrography | settlement | land_use | transport
```

Лес, речной коридор и поселенческая зона не требуют параллельных structural classes.

### 2.4. G3 — устойчивое конкретное место

G3 имеет устойчивую identity, может быть повторно посещён и существует независимо от случайной сцены.

Закрытые classes:

```text
spatial.g3.settlement
spatial.g3.built_site
spatial.g3.natural_feature
spatial.g3.route_site
spatial.g3.resource_site
spatial.g3.recurrent_site
```

`fortified`, `institutional`, `ritual`, `seasonal`, `ruined` и аналогичные признаки являются facets.

### 2.5. G4 — крупная часть конкретного места

G4 — крупная часть одного G3 и scope управления canonical/generated G5.

```text
class    = spatial.g4.sector
shape_id = areal | linear
```

G4 владеет traversal model, directional exits, expansion profile и party expansion ledger. G4 не является зданием, комнатой или микропозицией только из-за названия.

### 2.6. G5 — конкретная локальная локация

G5 — конкретная посещаемая локальная локация, участок или комплекс внутри G4.

Закрытые classes:

```text
spatial.g5.compound
spatial.g5.parcel
```

`compound` содержит не менее двух содержательно самостоятельных structure/G6 slots. `parcel` является локально ограниченным участком без структуры комплекса.

G5 бывает:

```text
canonical
— authored world_base entity;
— существует независимо от партии;
— исторически, маршрутно или структурно значим.

generated
— party-scoped entity;
— создаётся только из approved template через frontier;
— остаётся дочерним исходного G4;
— сохраняется и не генерируется заново.
```

В party runtime обе формы получают `party_g5_site`: canonical site является party projection/overlay canonical G5, generated site — самостоятельным party instance. Это не создаёт вторую canonical identity.

### 2.7. G6 — непосредственно разыгрываемое пространство

G6 является party-scoped scene space:

- внутри одного `party_g5_site`;
- attached scene крупного transport;
- route-anchor scene checkpoint/interruption/migration.

Непересекающиеся physical classes:

```text
spatial.g6.enclosed
spatial.g6.semi_enclosed
spatial.g6.open
spatial.g6.water
```

`vertical_context_id = surface | elevated | subsurface`; `overhead_cover_id = none | partial | full`. Passage, threshold, living, work и storage являются scene roles, а не physical classes.

G6 имеет ровно один host:

```text
fixed G6          → party_g5_site;
attached G6       → transport entity;
route-anchor G6   → party_route_anchor_identity.
```

### 2.8. Scene position

`scene_position_node` — устойчивая техническая вершина внутри G6. Она создаётся только если переход меняет хотя бы одно механически значимое свойство: доступ, движение, обзор, укрытие, свет, hazard, вместимость или interaction capability.

Закрытые position types:

```text
scene_position.threshold
scene_position.passage
scene_position.central
scene_position.boundary_edge
scene_position.structural_feature_side
scene_position.permanent_cover
scene_position.elevated_overlook
scene_position.fixed_working_reach
scene_position.water_reach
scene_position.hazard_boundary
```

Позиции возле движимого предмета или NPC не являются устойчивыми и моделируются placement/relative relations.

### 2.9. Spatial class и facets

Каждая spatial entity имеет ровно один основной `spatial_class_id`. Независимые признаки хранятся как facets: function, landform, land cover, water context, route role, access, hazard, temporality, evidence и другие утверждённые dimensions.

Если inclusion/exclusion rules не дают единственного класса:

```text
classification_gap → hard block
```

### 2.10. Containment rules

Разрешённая fixed chain:

```text
G0 contains G1
G1 contains G2
G2 contains G3
G3 contains G4
G4 contains canonical/generated G5
party_g5_site hosts fixed G6
G6 contains scene_position_node
```

Дополнительные host chains:

```text
transport hosts attached G6
route_anchor_identity hosts route-anchor G6
```

Same-level containment (`G4 contains G4`, `G5 contains G5`, `G6 contains G6`) запрещён. Полный ancestor chain является derived read model и не хранится как второй источник истины.

---

## 3. Хранилища и источники истины

### 3.1. `world_base`

После активации v3 read-only `world_base` хранит:

- canonical G0–G5 и их containment;
- physical world routes, route points, segments и boundary contracts;
- universal categories;
- regional permissions/templates;
- G4 expansion profiles, slots, limits и terminal policies;
- G6/position/movement/visibility/acoustic templates;
- orientation, environment, cost и recheck profiles;
- action/activity/mode-transition/recovery contracts;
- provenance, applicability, versions и readiness metadata.

Runtime не изменяет `world_base`.

### 3.2. `party_runtime`

`party_runtime` хранит:

- party projections canonical G5 и generated G5;
- scene baselines, G6, positions и materialized relations;
- frontiers, continuation chains, reservations и ledgers;
- endpoint bindings и transit/route anchors;
- actor/cohort/transport locations and attachments;
- immutable plans и mutable executions;
- append-only action/activity/traversal history;
- NPC, items, containers, property and placements;
- navigation beliefs and visible read models;
- materialization traces, version pins, idempotency and change sets;
- visual layouts, если они party-specific.

### 3.3. Нормализация

Любой ID или plural relation, участвующий в filtering, JOIN, integrity, uniqueness, limits, pathfinding, visibility, acoustics или concurrency, хранится нормализованно. Array/JSONB допускается только для immutable snapshot, closed expression без скрытых IDs, validation report, trace metadata и presentation payload.

Обозначение `relation_set<T>` в приложении B означает отдельную child/binding table, а не JSON-массив в основной строке.

### 3.4. Cross-database references

Если `world_base` и `party_runtime` находятся в разных PostgreSQL databases, world reference проверяется application commit gate по:

```text
stable ID + world revision + explicit version pin + catalog/bundle digest
```

Невалидируемое текстовое поле не считается заменой FK.

### 3.5. Single-source matrix

| Вопрос | Единственный источник истины |
|---|---|
| canonical containment G0–G5 | direct parent relation в `world_base` |
| generated G5 identity | `party_g5_site` |
| scene materialization identity | active committed `party_scene_baseline` |
| exact scene endpoint | role-aware party endpoint binding |
| route order | `world_route_point` + `world_route_segment` |
| route departure from G4 | `world_route_endpoint_binding` role `from` |
| physical static cost/environment/orientation | physical segment + pinned profiles |
| current root carrier location | `party_journey_location` |
| attachment-derived actor location | active attachment chain + root carrier location |
| current journey state | `party_route_plan_execution` |
| active in-segment progress | `traveller_travel_state` |
| completed interval history | `party_traversal_interval_result` |
| character-perceived direction/location | `navigation_belief` |
| frontier readiness | `expansion_frontier` + active `scene_frontier_binding` |
| immutable prepared endpoint set | `preparation_snapshot` |
| claim ownership of prepared resources | `preparation_claim` |
| time advancement | committed step result/change set |

Derived caches require source digest, equality validator and rebuild procedure.


---

## 4. World topology, routes and orientation

### 4.1. Orientation frame

Каждая world revision имеет один root frame:

```text
world_azimuth_mdeg_v1:
  0       = north
  90000   = east
  180000  = south
  270000  = west
  direction increases clockwise
  range   = 0..359999 integer millidegrees
```

Local frame связывается с parent frame через clockwise north offset. Frame graph acyclic. World azimuth вычисляется:

```text
world_azimuth_mdeg
= (local_azimuth_mdeg + cumulative_clockwise_north_offset_mdeg) mod 360000
```

Curved orientation profile stores ordered progress points. Every non-final point declares interpolation to the next point as `shortest_arc`, `clockwise_arc` or `counterclockwise_arc`; therefore a transition through 0° is deterministic and never uses raw linear subtraction. Reverse profile is a separate approved record and satisfies:

```text
reverse(p) = forward(1_000_000 - p) + 180000 mod 360000
```

with inverted vertical direction.

UI rotation, node order, title and visual layout не являются factual orientation.

### 4.2. Intended, factual and perceived direction

Система различает:

```text
intended direction = нормализованное намерение actor;
factual bearing     = orientation approved physical segment at current progress;
perceived bearing   = значение navigation_belief.
```

`direction_context_id` обозначает approved semantic corridor: cardinal direction, upstream/downstream, along-road, along-shore, toward-landmark и другие controlled values. Semantic context преобразуется в factual bearing только через конкретный approved segment orientation profile. Ambiguous free text is resolved only by clarification or a finite player-safe option set; it never creates a new context and never authorizes LLM/first-row route selection.

### 4.3. G4 traversal model

Каждый G4 имеет:

```text
traversal_model = enclosed | bounded | through_area
```

- `enclosed`: выход возможен только по explicit connections;
- `bounded`: локальные branches и конечные explicit exits;
- `through_area`: физически протяжённая область с конечным набором corridor contexts.

Для каждого outward traversable context `through_area` обязан иметь один или несколько approved `g4_directional_exit`. Отсутствие exit или реальной physical boundary является authoring data gap.

### 4.4. Directional exit

`g4_directional_exit` утверждает способ завершить один corridor context внутри G4:

```text
world_route_exit  → canonical exit G5 + один или несколько authored route departures;
physical_boundary → реальная непроходимая природная/искусственная граница.
```

Один gateway может обслуживать несколько direction contexts и routes. Один context может иметь несколько alternatives. Runtime возвращает конечный option set и не выбирает route по nearest/first/layout heuristic.

### 4.5. World route

`world_route` — directed authoring container ровно одного конечного пути от одного canonical G5 endpoint к одному canonical G5 endpoint. Route не является physical segment и не имеет единого terrain/time value.

Одна route содержит:

```text
point[0] = endpoint_from
segment[0]
point[1]
...
segment[n-1]
point[n] = endpoint_to
```

Инварианты:

- ровно один `endpoint_from` ordinal 0;
- ровно один `endpoint_to` с максимальным ordinal;
- `segment[i]` соединяет `point[i]` с `point[i+1]`;
- branch/cycle внутри route запрещены;
- развилка моделируется несколькими route IDs через canonical junction;
- reverse direction является отдельной route;
- одна endpoint pair может иметь любое конечное число distinct routes.

### 4.6. Physical segment

Только physical segment владеет:

- transition environment;
- movement orientation;
- baseline movement method;
- movement-method cost profile;
- base time;
- dynamic recheck policy;
- risk and availability conditions;
- factual spatial context.

Physical segment kinds:

```text
scene_edge
site_connection
world_route_segment
```

Механически значимое изменение environment, method/carrier regime, jurisdiction, G0/G1 context, boundary regime, orientation или recheck policy создаёт новый segment.

`capacity`, если задана, означает максимум одновременно находящихся на time-cost segment root movement owners. Attached actors/cohorts не считаются повторно. Для action-cost relation capacity ограничивает число root owners, допускаемых одной атомарной transition; постоянная вместимость destination определяется position/site contracts. Null capacity означает отсутствие именно механического лимита relation и не разрешает `capacity_reduction` blocker.

### 4.7. Site connection

`g5_site_connection` соединяет два `party_g5_site` только внутри одного G4. Cross-G4 movement через site connection запрещён. Reverse direction является отдельной record.

Endpoint positions задаются двумя role-aware bindings:

```text
from → position source site;
to   → position target site.
```

Если физически существует несколько entrances, создаются distinct connections или routes, а не priority list одной связи.

### 4.8. Scene edge

`scene_movement_edge` соединяет две positions. Edge directed; обратный переход отдельный. Edge может пересекать границу G6 внутри одного scene host, но не заменяет site/world endpoint bindings.

### 4.9. Route endpoint binding

`world_route_endpoint_binding` является единственной authoring relation между route и canonical G5 endpoint.

Rules:

```text
role=from
→ route_point kind endpoint_from;
→ directional_exit_id required;
→ departure-compatible scene slot required.

role=to
→ route_point kind endpoint_to;
→ directional_exit_id null;
→ arrival-compatible scene slot required.
```

Party-specific exact position хранится в `party_world_route_endpoint_position_binding`. Route ID, role и slot не дублируются: они выводятся из pinned authoring binding.

### 4.10. Route point and transit anchor

Internal route point является authored topology, но не автоматически сценой. Если persisted plan использует internal point между steps, party создаёт один `party_transit_anchor` на `(party, route point, route point version)`.

Transit anchor:

- является factual location-bearing endpoint;
- не имеет G6;
- не раскрывает свободный выбор направления;
- хранит arrival/departure side contexts and one authored switch phase;
- хранит active side для любого internal point; при равных side contexts переключение является no-op;
- может иметь checkpoint departures только из approved templates.

Scene-level checkpoint/interruption использует отдельный route-anchor aggregate.

### 4.11. Boundary crossing

Любое механически значимое изменение factual context между adjacent route segments находится в internal route point и использует один authored side-switch phase. Изменение только G2/G3/G4 corridor, weather scope или event pool фиксируется в `route_point_context_snapshot` без `boundary_crossing_contract`. Изменение G0, G1 или jurisdiction дополнительно требует `boundary_crossing_contract`, который фиксирует inbound/outbound segment versions, from/to context digests и тот же switch phase.

Boundary:

- не имеет собственной длительности;
- не скрывает физический segment;
- меняет active side/context только в одной атомарной transition;
- требует matched spatial/jurisdiction transition contract;
- не проходима при `pending`, `conflict` или `blocked` authoring state.

В boundary transit anchor `arrival_side` означает контекст inbound segment до перехода, а `departure_side` — контекст outbound segment после перехода. Эти названия относятся к направлению движения по route, а не к географическим «внутри/снаружи».

Boundary kinds disjoint:

- `g1_internal` — cardinal G1 change внутри одного G0 без jurisdiction change;
- `g0_external` — G0 change (и неизбежно G1 change) без jurisdiction change;
- `jurisdiction_only` — jurisdiction change при неизменных G0/G1;
- `combined` — spatial G0/G1 change одновременно с jurisdiction change.

Один combined contract заменяет unordered pair spatial + jurisdiction transitions.

### 4.12. Route context

Каждый world route segment имеет ровно один fixed factual context. Scene edge внутри moving transport использует `carrier_derived_context`: world context берётся из pinned root transport travel state, а interior G6 topology остаётся неизменной.

### 4.13. Portal and temporary closure

Дверь, ворота, люк, шлагбаум и другой управляемый проём представлены одной `portal_entity`. Movement, visibility и acoustic relations ссылаются на неё.

Temporary closure задаётся portal state, condition или blocker. Она не меняет base relation status на destroyed. `destroyed` применяется только к физически уничтоженной topology.

Movement availability вычисляется в фиксированном порядке:

```text
base relation lifecycle
→ exhaustive portal-state rule
→ availability condition
→ active blockers
→ capacity/occupancy check
```

Любой применимый `full` blocker закрывает relation. Если действуют только `capacity_reduction`, effective capacity равна минимуму base capacity и всех declared reduced capacities; значения не суммируются и не выбираются по first-row order. Occupancy выводится под locks из active travel states, authoritative journey locations, actor carrier positions and entity placements с их pinned capacity units; отдельный неподтверждённый counter не является источником истины.

---

## 5. Конечное расширение G4 generated G5

### 5.1. Назначение

Expansion лениво детализирует обычные участки внутри G4. Он не заменяет authored canonical G5, directional exits, world routes или boundary contracts.

### 5.2. Expansion profile

Один approved `g4_expansion_profile` задаёт:

- finite slots;
- allowed templates per slot;
- per-template limits;
- adjacency/connectivity rule sets;
- deterministic seed policy;
- terminal policies;
- version/provenance.

Независимый `max_generated_g5` запрещён. Верхняя граница равна сумме `slot.max_instances`, а фактическая достижимая capacity может быть меньше из-за shared template limits.

Для concurrency используются две разные производные величины, обе вычисляемые deterministic max-flow по committed generated sites, slot/template limits и normalized relations:

```text
committed_residual_capacity
= сколько экземпляров ещё может быть окончательно закоммичено без учёта technical reservations;

reservable_residual_capacity
= сколько единиц можно зарезервировать сейчас после учёта active reservations.
```

`committed_residual_capacity = 0` означает окончательное исчерпание и разрешает terminal resolution. `committed_residual_capacity > 0` при `reservable_residual_capacity = 0` означает только временный reservation conflict и не разрешает закрывать frontier.

### 5.3. Slot roles

```text
through
— конечная continuation chain к одному exact directional exit;
— direction_context_id, directional_exit_id, length rule and matching terminal policy required.

branch
— конечная локальная боковая ветвь;
— terminal policy required;
— continuation chain and ordinal absent.
```

Один concrete through slot связан ровно с одним directional exit. Альтернативные exits представлены несколькими slots/options.

### 5.4. Terminal ordinal

До первого expansion through chain детерминированно выбирается и сохраняется:

```text
terminal_ordinal ∈ {0, 1, ..., slot.max_instances}
```

`0` означает немедленное terminal resolution без generated G5.

Rule:

```text
frontier.ordinal < terminal_ordinal
→ materialize exactly one generated G5 and successor frontier ordinal+1;

frontier.ordinal = terminal_ordinal
→ generation forbidden; execute terminal resolution;

frontier.ordinal > terminal_ordinal
→ integrity error.
```

Terminal choice никогда не пересчитывается после изменения catalogs.

### 5.5. Static capacity proof

Profile нельзя approve, пока validator не докажет для каждого allowed terminal ordinal:

1. каждый slot имеет непустой approved candidate set;
2. candidate принадлежит declared template limit;
3. существует целочисленное распределение shared slot capacities по template limits;
4. adjacency/connectivity constraints выполнимы;
5. through chain достигает terminal target;
6. branch не может сделать through exit недостижимым;
7. terminal resolution остаётся возможной при исчерпании generated capacity;
8. generation resolution creates exactly one successor frontier: for `through` at ordinal+1 in the same chain, for `branch` in an approved branch slot; terminal resolution creates none;
9. никакая ветвь не требует fallback.

Для `branch` статическая проверка дополнительно доказывает конечность committed capacity. Runtime generation допускается только при положительных committed и reservable capacities; нулевая reservable capacity при положительной committed capacity является временной блокировкой, а terminal policy разрешена только при нулевой committed capacity.

Проверка только суммы capacities недостаточна. Используется deterministic bipartite/max-flow feasibility check по нормализованным slot-template relations.

### 5.6. Frontier

`expansion_frontier` — unresolved topology boundary, а не movement segment. Он не имеет времени, environment или travel state.

Open frontier указывает:

- source site;
- concrete scene position через active `scene_frontier_binding`;
- slot;
- chain and ordinal для `through`;
- current state version.

Одна through chain имеет не более одного open frontier.

### 5.7. Capacity reservation

Concurrent frontier resolution использует `expansion_capacity_reservation`.

Reservation:

- создаётся под locks до deterministic choice commit;
- резервирует один slot unit и один selected template unit;
- имеет TTL только как technical lease policy, не как semantic fallback;
- commit превращает reservation в consumed generated instance;
- rollback/retry освобождает или переиспользует reservation по idempotency key;
- expired reservation не удаляет уже committed site.

### 5.8. Topology-only resolution

`ResolveFrontierTopology` выполняет:

```text
load frontier/profile and normalized capacity state under global locks
→ load chain only for a through frontier
→ validate expected versions and, for generation, the one-unit reservation
→ through: ordinal < terminal means generation; ordinal = terminal means terminal resolution
→ branch: committed>0 and reservable>0 means generation; committed>0 and reservable=0 means temporary block; committed=0 means terminal resolution
→ for generation, build the approved non-empty candidate set and deterministically select one template
→ create generated G5 + scene baseline + G6 + positions + relations
→ for connection terminal resolution, resolve the exact target party site
→ if world_route_exit lacks its canonical party projection, create that projection from the pinned canonical G5
→ materialize any missing mandatory target endpoint scene/position from the one approved pinned profile
→ create the site connection and both exact role-aware endpoint bindings
→ consume source frontier
→ for generation, apply exactly one g5_successor_frontier_rule:
     through site = exactly one through_successor;
     branch site = exactly one branch_frontier
→ commit all topology atomically without moving traveller or advancing time.
```

Если branch committed/reservable capacity положительна, но required candidate set пуст, это data gap, а не terminal resolution. Если committed capacity положительна, но reservable capacity равна нулю из-за active reservations, команда возвращает временную блокировку без topology mutation. Если applicable successor rule отсутствует или неоднозначен, вся topology transaction блокируется.

Connection terminal resolution не может оставить dangling site connection. Для `connect_existing` target identity уже существует. Если active scene baseline отсутствует, mandatory endpoint scene/position может быть материализован в той же transaction; существующий active baseline не дополняется и обязан уже разрешать exact endpoint slot. Для `world_route_exit` transaction детерминированно создаёт или переиспользует party projection exact canonical exit G5 и materializes only its required endpoint scene/position. Ноль или несколько scene/profile matches блокируют всю transaction; partial projection, connection или binding не сохраняются. Эти действия не являются movement и не продвигают time.

Команда «исследовать и войти» раскладывается:

```text
A. ResolveFrontierTopology
B. NewPathQuery
C. PersistAndExecuteOrdinaryTraversal
```

B/C не используют старый movement option. Failure B/C не отменяет корректно committed topology A.

### 5.9. Terminal resolution

Разрешены только:

```text
connect_existing
— connection к одному explicit existing party site того же G4;
— if no active baseline exists, the mandatory endpoint scene/position is materialized atomically from the pinned approved profile; an existing baseline must already resolve the slot and is never augmented;

world_route_exit
— connection к created-or-reused party projection exact canonical exit G5;
— projection, mandatory endpoint scene/position, connection and endpoint bindings commit atomically;
— конкретная world route выбирается позднее movement resolver;

physical_boundary
— approved boundary entity and closed frontier.
```

Terminal resolution не выбирает route, не начинает journey, не перемещает actor и не изменяет time.

### 5.10. Expansion ledger

Ledger хранит profile/version/state version, но не authoritative counters. Usage и readiness выводятся из normalized instances/frontiers/reservations.

```text
capacity_state = available | exhausted | blocked_by_gap
topology_state = open | finalized
```

`exhausted` не означает `finalized`: каждый оставшийся frontier должен пройти terminal resolution.

### 5.11. Ordinary content only

Expansion template описывает обычное физическое пространство. Тайник, засада, руины, клад, лагерь или сюжетное событие появляются только по отдельному approved causal rule и candidate set.

---

## 6. G6 materialization and preparation

### 6.1. Scene baseline

Каждый scene host имеет не более одного active `party_scene_baseline` в рамках party. Baseline фиксирует template/version, materializer version, catalog digest, source kind и created change set.

Re-entry читает baseline. Template update не создаёт второй baseline и не меняет старую party автоматически.

### 6.2. Допустимые triggers

G6 materialization запускается только:

- при target preparation до activation plan;
- вместе с creation generated G5;
- при подготовке approved reusable checkpoint;
- при interruption scene creation;
- при explicit migration;
- при explicit traced repair.

Ordinary arrival к обязательному endpoint не является моментом lazy materialization. Если endpoint нужен executable plan, он должен быть готов до plan activation.

### 6.3. Target preparation

Для option с `requires_preparation` выполняется отдельная idempotent transaction:

```text
PrepareTargetSnapshot
→ materialize all mandatory endpoint/transfer scene members
→ resolve exact position bindings
→ pin dependencies and digests
→ persist immutable preparation_snapshot
→ return new path query state.
```

Preparation:

- не перемещает traveller;
- не продвигает time;
- не раскрывает hidden scene игроку;
- сохраняет валидные reusable baselines при отказе от journey;
- не допускает partial ready snapshot;
- не заменяется opaque token.

Plan pin-ит snapshot ID and digest, но не mutable claim state version. Execution создаёт отдельный `preparation_claim`.

### 6.4. Preparation members

Member kinds:

```text
endpoint
— exact resolved endpoint snapshot;

transfer_scene
— exact scene baseline, G6 and position needed for multimodal transfer.
```

`share_mode`:

```text
reusable            → many execution claims allowed;
execution_exclusive → one nonterminal claim at a time.
```

Duplicate members with equal kind and dependency digest запрещены.

### 6.5. Role-aware endpoint slots

Scene template объявляет named slots:

```text
slot_key
endpoint_role = departure | arrival | both
required_position_slot_key
required_position_instance_ordinal
```

Materialization обязана разрешить каждый required slot ровно в одну position. Ноль или несколько matches — typed hard error. First row, nearest position and generic threshold fallback запрещены.

### 6.6. Generated G5 transaction

Creation generated G5 атомарно включает:

- `party_g5_site`;
- scene baseline;
- required G6;
- positions;
- scene movement/visibility/acoustic relations;
- site connection;
- role-aware endpoint bindings;
- allowed successor frontier.

Traveller movement не входит в эту transaction.

Terminal `connect_existing`/`world_route_exit` transaction follows the same endpoint-completeness rule: both connection endpoints and active bindings exist at commit. It may create an absent target baseline with the exact mandatory endpoint scene and, only for `world_route_exit`, create the exact canonical party projection. An existing active baseline is immutable and must already resolve the required endpoint slot exactly once. It does not create generated content, choose a world route, move a traveller or advance time.

### 6.7. Topological homogeneity of G6

Scene template задаёт:

```text
intra_g6_visibility_mode = default_clear | explicit
acoustic_uniformity      = uniform
```

`default_clear` допустим только для устойчиво прямого обзора и имеет one default distance band. Для густого леса, большого склада, извилистого passage и другой неоднородной среды используется `explicit` либо пространство делится на несколько G6.

Если внутри G6 устойчивое расстояние/преграда меняет movement time, hearing, access, hazard или line of sight, G6 разделяется.

### 6.8. Stable and dynamic relations

Stable structures and terrain создают positions and base relations. Movable items, NPC, temporary cover, smoke, debris and temporary blockage создают placements/modifiers/blockers, не новую permanent topology.

### 6.9. Repair and migration

Ordinary entry никогда не запускает repair/migration. Explicit procedure обязана pin-ить old/new digests, reason, mapping, change set and rollback information.

---

## 7. Visibility, acoustics and interaction

### 7.1. Visibility model

Полный all-pairs graph не хранится.

```text
same G6 + default_clear
→ base line of sight exists for every permitted position pair;
→ наличие устойчивого pair-specific occluder делает template невалидным для `default_clear` и требует `explicit` либо разделения G6;

same G6 + explicit
→ visibility exists only by explicit directed link;

different G6
→ explicit directed link required.
```

Runtime result:

```text
base geometry
+ portal state
+ target lighting
+ stable cover
+ dynamic occlusion
+ concealment
+ weather/smoke
= clear | partial | none
```

Освещение не меняет geometry direction. Asymmetry требует physical basis: height, slit, one-way aperture, cover shape or directed opening.

### 7.2. Acoustic model

Base acoustic edges соединяют G6. G6 обязан быть acoustically uniform. Target ambient noise применяется ровно один раз после least-loss path.

```text
remaining = loudness
          - minimum transmission loss
          - target ambient noise
          - pinned temporary condition/event modifiers
```

```text
remaining >= 2 → clear
remaining == 1 → indistinct
remaining <= 0 → inaudible
```

Portal state добавляет declared loss или blocks branch. Temporary acoustic changes may come only from pinned `condition_profile_ref`, environment overlays or persisted/transient `sound_event` consequences accepted by the resolver; свободный числовой modifier запрещён. Permanent sound-proof boundary represented by absent edge.

### 7.3. World perception signals

Дальние колокола, дым, рынок, огни, лай и аналогичные признаки не распространяются через local G6 graph на километры. Они используют `world_perception_signal` and may reveal approximate direction/zone, но не точный путь.

### 7.4. Interaction

Отдельный persistent interaction graph не хранится. Capability target + current position + movement/visibility/access state дают:

```text
within_reach
— current position satisfies capability;

requires_step
— существует хотя бы один currently executable one-edge movement,
  после которого capability удовлетворяется;

visible_only
— target perceived, но reach отсутствует;

blocked
— нет разрешённой capability или executable reach path.
```

`requires_step` не означает visual proximity и не требует, чтобы такой edge был единственным. После движения capability проверяется заново.

### 7.5. Hidden information boundary

Player-facing projection не содержит:

- hidden nodes and routes;
- factual corridor при ошибочном belief;
- hidden target G5/G6;
- raw blockers, candidate sets and diagnostics;
- future guaranteed outcomes.

Narrator получает только approved visible context.


---

## 8. Location, carriers and attached scenes

### 8.1. Root location relation

Authoritative world location хранится только в `party_journey_location` для root movement owner, который не attached к другому carrier.

Location XOR:

```text
scene          → scene_position_id required;
transit_anchor → transit_anchor_id required;
in_transit     → travel_state_id required.
```

Ancestor G0–G6 chain является derived projection.

### 8.2. Carrier attachment graph

Допустимые active chains:

```text
actor → cohort
actor → transport
cohort → transport
actor → cohort → transport
```

Transport не attached к другому carrier. Graph acyclic, maximum depth 2.

Attached subject не имеет собственной `party_journey_location`. Его factual world location выводится из root carrier. Наличие одновременно active attachment и own location row является corruption and hard block.

### 8.3. Cohort

Walking/riding cohort — реальный movement carrier:

- имеет одну root location, если не attached к transport;
- имеет immutable membership snapshot per plan;
- определяет pace through approved cohort rule;
- запрещает independent world-travel execution active member;
- join/leave/split/merge updates membership, attachments and locations atomically;
- a scene-located cohort uses one formation anchor while interacting members receive exact actor carrier positions in the same scene host;
- split creates new cohort ID and never copies active execution implicitly.

Death не перемещает corpse автоматически; placement/transport решается explicit rule or bounded decision.

### 8.4. Transport

Transport entity имеет world location and optional attached G6. Attached G6 and positions сохраняют IDs while transport moves. Их world context derives from transport location/travel state.

Interior scene разрешена только template-ам, где внутри транспорта действительно разыгрывается самостоятельная topology. Ordinary small boat, cart or sled remains entity without G6 unless catalog explicitly permits interior scene.

### 8.5. Actor inside moving transport

Actor внутри attached transport scene:

- не имеет own world location row;
- имеет active attachment to transport or cohort→transport;
- имеет `party_actor_carrier_position`, если interior G6 materialized;
- derives G0/G1/weather/jurisdiction from transport travel state;
- может выполнять `journey_scope=carrier_local` actions and scene movement, если capability and safety allow;
- не может одновременно иметь independent `journey_scope=world_travel` execution.

Transport world-travel and passenger carrier-local executions may coexist as state because they affect different scopes. An immediate carrier-local action may commit independently without advancing the clock. A time-bearing carrier-local activity or traversal while the root transport is moving must participate in one synchronized time slice with the root transport interval; it may not advance the party clock independently. Commit locks the party clock, root transport and affected actors in global order. A cohort member without a carrier-local position is not scene-addressable; before that member can interact in the interior, an approved placement rule must atomically create the exact `party_actor_carrier_position`.

### 8.6. Carrier-local physical context

Scene edge inside moving transport uses `carrier_derived_context`. At action commit resolver pins:

- root carrier identity;
- attachment versions;
- current transport location/travel state version;
- context resolution policy version.

Action does not alter transport segment progress unless its explicit completion effect does so through a separate approved world-travel command.

### 8.7. Mounts

Mounted is not posture. Riding is represented by carrier/attachment or a specialized `mounted_relation` only when the mount does not act as a full journey carrier. The same actor/mount pair cannot be represented simultaneously by two authoritative mechanisms.

### 8.8. Entity placement and relative position

Entity placement identifies physical location inside a scene. Relative positions such as `using_cover`, `behind`, `beside`, `grappling` are dynamic relations and never replace actor/carrier location.

---

## 9. Path query, readiness and immutable plans

### 9.1. Path query

Path query receives explicit:

- journey owner and journey scope;
- factual start endpoint;
- exactly one target request or intended direction;
- knowledge scope;
- cost mode;
- capability context;
- expected state versions.

Target request is discriminated as factual `spatial_ref` or character-facing `knowledge_spatial_ref`. Exactly one of `target_request` and `intended_direction_id` is non-null. Player-known or misidentified target never подменяется factual ID во входе; factual resolution выполняется resolver-ом и сохраняется отдельно с dependency pins.

### 9.2. Mechanical readiness and knowledge visibility

These dimensions are independent:

```text
mechanical_readiness = ready
                     | requires_frontier_resolution
                     | requires_preparation
                     | temporarily_blocked
                     | data_gap

knowledge_visibility = visible | hidden | misidentified
```

A mechanically ready route may be hidden. A visible rumored route may be mechanically blocked or absent from factual topology.

### 9.3. Normative readiness matrix

| Readiness | Executable | Steps | Additional payload |
|---|---:|---|---|
| `ready` | yes | non-empty | none |
| `requires_preparation` | no | empty | preparation proposal |
| `requires_frontier_resolution` | no | empty | topology command proposal |
| `temporarily_blocked` | no | empty | finite blocking reasons |
| `data_gap` | no | empty | at least one hard-block reason |

Topology/preparation commit never mutates the old option. A new path query returns a new option with `derived_from_option_id`.

### 9.4. Movement endpoints

Persisted endpoint kinds:

```text
scene_position
site_connection_endpoint
world_route_endpoint
transit_anchor
route_anchor_scene
stranded_state
```

`stranded_state` is allowed only as source of approved rescue, repair or migration plan. It is never an ordinary destination and never returned as a normal movement option.

Unresolved authoring endpoint is candidate-only and cannot be written into executable plan.

### 9.5. Step kinds

```text
immediate_action
— atomic action cost; no segment progress;

timed_activity
— time-consuming operation without continuous physical-segment progress;
— departure and arrival are identical unless one pinned completion effect performs an exact endpoint/mode transition;

timed_traversal
— physical progress along exactly one physical segment.
```

Portage preparation/loading may be timed activity. Portage movement itself is timed traversal.

### 9.6. Journey scope

```text
world_travel
— changes root actor/cohort/transport world location or segment progress;

carrier_local
— action or scene movement inside attached carrier scene;
— cannot include world-route/site-connection traversal;
— may coexist with root transport world-travel execution.
```

A plan has one scope and one immutable journey owner, which is also the movement carrier of every traversal step. Mixed scope or root-carrier ownership change requires separate commands/plans linked by parent command idempotency.

### 9.7. Endpoint-kind matrix

| Step/relation | Departure | Arrival |
|---|---|---|
| scene edge | scene position | scene position |
| site connection | site connection endpoint | site connection endpoint |
| first world-route segment | world route endpoint | transit anchor or world route endpoint for one-segment route |
| internal world-route segment | transit anchor | transit anchor |
| last world-route segment | transit anchor or world route endpoint for one-segment route | world route endpoint |
| action/activity | contract-declared location-bearing kind | contract-declared location-bearing kind |
| rescue from stranded | stranded state | contract-declared safe endpoint |

Departure/arrival endpoint snapshots must correspond exactly to physical segment source/target and pinned versions.

### 9.8. Route plan proposal

A ready option contains ordered step proposals with resolved candidate endpoints and complete static dependencies. Proposal is not persisted as authoritative plan until:

- all mandatory preparations are committed;
- endpoint candidates are resolved to persisted endpoint refs;
- dependency pins complete;
- carrier/capability contracts pass;
- canonical digest validates.

### 9.9. Immutable route plan

`party_route_plan` contains:

- owner and scope;
- source snapshot;
- original target request or intended direction;
- resolved factual target and resolution pins for target-based plans;
- world/catalog/planning versions;
- optional preparation snapshot ID/digest;
- ordered immutable steps;
- canonical serialization digest.

Plan lifecycle is `ready|superseded|retired`; execution lifecycle is separate. Plan payload and steps never mutate. Only the declared lifecycle fields may transition once from `ready` to `superseded` or `retired`, with state version and change-set trace; the canonical plan digest excludes those lifecycle fields.

### 9.10. Static dependency pinning

Every mechanically relevant dependency is represented by explicit `dependency_pin_set`, not only opaque aggregate digest. A single aggregate version is allowed only if DB guarantees atomic version bump for every mechanically relevant child.

Pinned dependencies include, as applicable:

- route, point, segment and endpoint binding;
- G5/site/scene baseline/G6/position;
- environment, orientation, cost and recheck profiles;
- action/activity/mode-transition/completion effect contracts;
- boundary contract;
- carrier attachment/cohort membership snapshot;
- preparation snapshot members.

### 9.11. Multimodal transition

Board, disembark, load, unload, transfer control and cohort formation change are explicit mode-transition contracts embedded in:

- `immediate_action`, if action-cost;
- `timed_activity`, if time-cost.

Mode-transition contract does not own a second completion effect. Completion effect has one owner: step snapshot.

A mode transition that changes whether the plan owner is root-authoritative or attached must be the final step of the current plan. Its completion commits the exact handoff endpoint and attachment/location change. Further world travel starts a new plan owned by the resulting root carrier; further carrier-local movement may start a new carrier-local plan owned by an attached actor. `load`, `unload`, `transfer_control` and `change_cohort_formation` may be non-final only when the current plan owner keeps the same valid ownership mode and scope. A plan never silently transfers execution ownership.

### 9.12. Selection and activation

Only `ready && executable=true` option can create plan. Activation transaction:

```text
validate current versions and endpoint snapshots
→ reserve preparation claim if present
→ persist immutable plan and steps
→ persist execution status=planned
→ append planned event
→ optionally dispatch first step as deterministic child command.
```

Default first-step dispatch is a separate child command. Failure before the `planned → active` transition leaves the execution `planned`; a committed step attempt that blocks first appends `activated`, then its terminal run and `wait_started`, leaving the execution `waiting_at_anchor`. If plan creation and dispatch are explicitly composed in one transaction, any pre-commit failure rolls back the whole composition and no plan/execution row remains. No other branch is allowed.

---

## 10. Execution state machines

### 10.1. Execution current state

`party_route_plan_execution` is the sole mutable journey current-state row. Every transition appends `party_route_plan_execution_event`.

Allowed statuses:

```text
planned
active
waiting_at_anchor
suspended_at_scene
stranded_in_transit
completed
aborted
superseded
```

Field-state matrix is normative in appendix A. Invalid field combination is corruption, not a recoverable default.

### 10.2. Planned and active

`planned` has step 0 and one current endpoint. `active` is interpreted by current step kind:

```text
active immediate_action
→ current endpoint present; no active travel/activity state;

active timed_activity
→ current endpoint + active activity execution;

active timed_traversal
→ active travel state; current endpoint null.
```

For actor inside moving transport executing carrier-local action, actor world location is attachment-derived; execution still stores its local departure endpoint snapshot.

### 10.3. Immediate action

Execution:

```text
validate endpoint, contract, action units and expected versions
→ compute deterministic result
→ apply one atomic change set
→ append party_action_step_run
→ append execution event
→ advance step or complete execution.
```

Each run is append-only and terminal. `completed` advances the step. `blocked` moves the execution to `waiting_at_anchor` on the same endpoint and step. `failed` follows the pinned action-contract transition: wait on the same endpoint or abort at the same factual location. A retryable wait may create a new attempt with the next ordinal. Retry with the same idempotency key returns the same attempt result.

### 10.4. Timed activity

`party_timed_activity_execution` is mutable cumulative state; each committed slice creates one append-only `party_timed_activity_attempt`.

Rules:

- exactly one nonterminal activity execution exists for the current activity step;
- cumulative elapsed and remaining duration are exact reduced rationals whose sum equals the integer planned total;
- pause closes the current attempt, sets `party_timed_activity_execution.status=paused`, and keeps the route execution `active` on the same step and endpoint;
- resume creates a new append-only attempt;
- completion effect and step advance commit atomically;
- `blocked` commits zero elapsed time, leaves the activity execution `active`, and moves the route execution to `waiting_at_anchor` on the same endpoint; resumption reuses that activity execution and creates the next attempt;
- `failed` closes the current activity execution and follows the pinned activity-contract transition: `waiting_at_anchor` on the same endpoint or `aborted` at that location;
- if a failed activity transitions to `waiting_at_anchor` and is later retried, resume creates a new activity-execution series member linked to the failed predecessor; it copies the exact cumulative/remaining state and never reactivates or rewrites the failed row;
- the only v4.2 failure-time policy is `retain_committed_elapsed`; already committed exact time never rolls back;
- direct-clock attempts advance the exact party timestamp by their actual rational elapsed time; synchronized carrier-local attempts persist exact elapsed time but the root transport slice owns the single clock update.

No open domain attempt row is persisted. In-progress technical ownership is an idempotency lease, not semantic state.

### 10.5. Timed traversal start

Start validates:

- execution and current step;
- exact departure endpoint;
- physical segment and all dependency pins;
- carrier/root attachment consistency;
- selected movement method;
- boundary and next-context readiness where required;
- a departure dynamic-access snapshot covering portal, blocker and immediate availability.

If the departure gate is blocked, no travel state or interval result is created; the owner remains at the exact departure endpoint and execution becomes `waiting_at_anchor`. Otherwise, atomically:

- creates `traveller_travel_state` at progress 0;
- updates root location to `in_transit` unless passenger remains attached scene-located by projection;
- marks execution active with travel state;
- appends step-start event.

### 10.6. Interval execution

One interval attempt is processed under idempotency lease:

```text
load immutable step + travel state
→ capture dynamic snapshot
→ compute planned exact progress/time
→ execute deterministic recheck/hazard/navigation rules
→ choose exactly one terminal interval outcome
→ commit append-only interval result + time/progress/consequences
→ update travel/execution/location state atomically.
```

There is no persistent `result_kind=active` interval row. Crash before commit leaves no domain result; retry uses same lease/input digest.

### 10.7. Segment completion

At `actual_progress_after_ppm = 1_000_000`:

- interval outcome must be `segment_completed`;
- travel state closes as `completed`;
- root carrier is placed at exact arrival endpoint;
- execution step advances or completes;
- route-point active side is switched according to its context snapshot and, for G0/G1/jurisdiction changes, the matching boundary contract;
- one execution event records location snapshot.

Dispatch of next step is a deterministic child operation. If it fails after arrival, execution becomes `waiting_at_anchor`; completed segment remains committed.

### 10.8. Pause

`paused_in_transit` outcome:

- commits actual progress/time of current interval;
- keeps travel state active with status `paused_in_transit`;
- preserves exact cumulative time and last confirmed endpoint;
- keeps execution `active` with null current endpoint and the same active travel-state ID;
- resume creates a new interval and dynamic snapshot.

To avoid ambiguous execution status, target model uses:

```text
execution.status = active
travel_state.status = paused_in_transit
```

until an anchor is actually reached. `waiting_at_anchor` always means a real endpoint exists and no travel state is active.

### 10.9. Interruption at anchor


`route_anchor_identity.resolution_kind` describes whether the checkpoint/interruption disposition is unresolved, reusable or terminal. It does not describe scene materialization: an `unresolved` interruption anchor already has a committed scene baseline and active location binding.

`interrupted_at_anchor` outcome atomically:

- creates or resolves one approved route-anchor aggregate;
- closes travel state as `interrupted_to_anchor`;
- places root carrier at route-anchor scene endpoint;
- sets execution `suspended_at_scene`;
- appends exactly one `suspended` execution event linked to the terminal interval result and the same change set.

If required interruption scene cannot be materialized, the outcome is `stranded`, not a guessed anchor.

### 10.10. Stranded in transit

`stranded_in_transit` preserves:

- exact segment and progress;
- cumulative rational time;
- pinned static context;
- last dynamic snapshot digest;
- carrier and attachment versions;
- reason code.

Ordinary progress, normal path query and arbitrary interaction are blocked. Allowed operations:

- authoring repair;
- admin migration;
- approved rescue plan whose source endpoint is exact `stranded_state`.

No nearest endpoint, midpoint, free return or silent teleport is allowed.

### 10.11. Waiting, suspension and terminal states

```text
waiting_at_anchor
→ exact scene/transit/route-anchor endpoint; no active travel/activity;

suspended_at_scene
→ active usable route-anchor scene; no active run;

completed
→ final scene/transit endpoint; no current step/run;

aborted
→ final scene/transit/route-anchor location snapshot; direct abort from raw in-transit or stranded state is forbidden;

superseded
→ final location snapshot transferred to exactly one successor execution.
```

### 10.12. Replan, continuation and supersession

A successor plan begins only from:

- scene position;
- transit anchor;
- route-anchor scene;
- exact stranded state under an approved rescue, repair or migration policy.

`waiting_at_anchor` may resume the same immutable plan because its current step and exact endpoint are unchanged. `suspended_at_scene` and `stranded_in_transit` do not resume the old execution directly: continuation creates a new immutable plan and execution whose source endpoint snapshot equals the exact `handoff_endpoint_snapshot` in the predecessor's suspension/stranded execution event, then atomically marks the old execution `superseded`. For terminal predecessor states the source equals `final_location_snapshot.handoff_endpoint_snapshot`.

Old plan/execution remain readable. Supersession graph is acyclic and one-to-one. A new execution does not rewrite old progress, time or consequences.

### 10.13. Recovery transitions

Authoring recovery template resolves to party binding with exact source, target and cost step.

```text
source == target
→ cost step may be absent only if no location/time changes;

source != target
→ exactly one executable action/activity/traversal step required.
```

Free relocation is forbidden. Recovery target must be authored or materialized through approved preparation, never selected by nearest/safest heuristic.

---

## 11. Time, dynamic conditions and recheck outcomes

### 11.1. Baseline time

`base_minutes` includes permanent geometry, normal surface, ordinary gradient and normal path quality for one baseline movement method. These facts are not multiplied again as dynamic conditions.

Other movement methods use one approved rational method factor. If another method changes geometry/access/destination or needs unrelated absolute duration, authoring creates a separate segment/route variant.

### 11.2. Dynamic factor model

Exact interval duration:

```text
base_minutes
× method_factor
× environment_factor
× load_factor
× body_factor
× pace_factor
× interval_progress_fraction
+ explicit_additive_delays
```

Rules:

- every multiplicative numerator and denominator is positive;
- at most one resolved factor per kind;
- `environment_factor` is one approved composite/worst applicable factor for weather, light and transient terrain state;
- mud, snow, darkness and similar conditions are not multiplied independently unless a higher-priority formula is explicitly changed by ADR;
- legal waiting, ferry queue, lock operation and similar fixed additions are additive delays, not multiplicative factors;
- every additive delay has a versioned `application_scope` and stable `occurrence_key`; the same occurrence is committed at most once under idempotency;
- `segment_once` and `step_once` delays cannot reappear in later technical slices, while `interval_once` delays must be produced by the exact interval recheck;
- missing or duplicated occurrence identity is `time_delay_occurrence_invalid`;
- factor source and version are pinned;
- no factor can create zero or negative time;
- time updater receives exact rational elapsed time plus the derived number of crossed whole-minute boundaries and does not recalculate terrain.

### 11.3. Dynamic snapshot

Each interval captures immutable:

- turn/calendar and exact game timestamp;
- weather/light/environment overlays;
- portal/access state;
- carrier condition and body state;
- load and pace;
- selected method;
- resolved factors and delays;
- dependency pins and canonical digest.

Future segment conditions are not frozen by the route plan. They are captured when that segment/interval starts.

### 11.4. Slicing-independent rational arithmetic

Every traversal interval and timed-activity attempt stores exact reduced rational elapsed time and cumulative step elapsed time. `game_timestamp` has exact rational sub-minute precision; whole minutes are a derived event boundary, not the authoritative clock value.

For a result whose `clock_commit_mode=direct_party_clock`:

```text
world_time_after = world_time_before + actual_exact_elapsed
crossed_whole_minute_boundaries
  = whole_minute_index(world_time_after)
  - whole_minute_index(world_time_before)
```

`whole_minute_index` is the monotonically increasing absolute project-calendar minute number. The exact timestamp addition is associative, so splitting one physical duration into any number of technical slices produces the same final timestamp and the same total number of crossed minute boundaries. No terminal ceil, per-step minimum minute or private rounding carry is permitted.

For `clock_commit_mode=shared_root_transport_clock`, the local result persists its exact elapsed time but sets `crossed_whole_minute_boundaries=0`; the synchronized root result alone advances the exact party timestamp and records the crossed boundaries. A later change from shared to direct clock ownership advances only the still-unelapsed exact duration and therefore cannot double-count time already covered by the root slice.

A positive sub-minute result may cross zero whole-minute boundaries while still advancing the exact game timestamp. Minute-indexed events run only for crossed boundaries; exact-timestamp timers compare against the exact timestamp.

### 11.5. Progress invariants

For every interval result:

```text
0 <= progress_before < 1_000_000
progress_before <= actual_progress_after <= planned_progress_after <= 1_000_000

progressed or segment_completed
→ actual_progress_after > progress_before;

paused_in_transit, interrupted_at_anchor or stranded
→ actual_progress_after >= progress_before;
→ equality is allowed only when the control/interruption/data-gap outcome occurs before further physical advancement;

blocked_before_progress
→ actual_progress_after = progress_before;
→ actual traversal time and additive delay are zero;
→ travel/execution/location state remains otherwise unchanged.
```

A zero-exact-time result with unchanged progress is allowed only for explicit pause/interruption/stranded control semantics above or `blocked_before_progress`; it crosses no minute boundary. A positive sub-minute physical-progress result advances the exact timestamp even when it crosses zero whole-minute boundaries. `actual_progress_after=1_000_000` is legal only for `segment_completed`; every other outcome is committed below the terminal progress value.

Next interval starts exactly at previous actual progress. `interval_ordinal` increases only after a committed result. Technical retries reuse the same pending ordinal through the idempotency lease and create no separate domain attempt ordinal.

### 11.6. Exhaustive interval outcomes

Exactly one outcome is persisted:

| Outcome | Progress/time | Travel state | Execution/location |
|---|---|---|---|
| `progressed` | positive progress; time per formula | active | active in transit |
| `segment_completed` | progress = 1,000,000 | closed completed | arrival endpoint; advance step |
| `paused_in_transit` | zero or positive progress/time as resolved; no hidden delay | paused in transit | execution active; no anchor |
| `interrupted_at_anchor` | zero or positive progress/time as resolved | closed interrupted | suspended at exact route-anchor scene |
| `stranded` | zero or positive progress/time as resolved | stranded | execution stranded in transit |
| `blocked_before_progress` | no progress; zero traversal time | unchanged at the same progress | execution remains active in transit; no location change |

There are no alternatives such as “in transit or anchor” inside one row. A failure that cannot safely preserve the current in-transit state maps to `stranded` or `interrupted_at_anchor`; a failure before travel-state creation produces no interval result and leaves the owner at the departure endpoint.

When navigation, hazard and blocker signals coexist, one versioned composition policy selects the final outcome in this order. A non-completion control outcome is committed strictly below `1_000_000`; if validated physical progress reaches the prepared arrival endpoint, completion dominates pause/interruption signals at that same boundary.

```text
1. unresolved data gap before a valid arrival commit             → stranded below terminal progress;
2. validated actual progress reaches 1_000_000                   → segment_completed;
3. approved interruption request with a resolved anchor          → interrupted_at_anchor;
4. explicit pause request                                        → paused_in_transit;
5. blocker with zero committed progress                           → blocked_before_progress;
6. otherwise                                                      → progressed.
```

Within one priority, stable source priority and stable rule ID order are part of the composition policy. No runtime first-row choice is allowed.

### 11.7. Hazard and navigation resolution

Hazard resolution returns:

- consequence IDs;
- exact additive delay/factor changes;
- one finite control effect (`none|pause|interrupt|strand`);
- optional approved interruption anchor policy when the control effect is `interrupt`.

The shared versioned composition policy, not the hazard rule alone, selects the one persisted interval outcome.

Navigation resolution may:

- preserve segment;
- alter perceived bearing;
- apply approved delay/consequence;
- pause;
- interrupt at approved anchor;
- strand on data gap.

It may not select another corridor, route or segment inside the same immutable plan. Corridor change requires an anchor/stranded recovery source and new plan.

### 11.8. Route-point context transition timing

Every internal route point switches side context at its authored phase:

```text
inbound_completion
or
outbound_dispatch
```

For a G0/G1/jurisdiction boundary the phase is additionally pinned by `boundary_crossing_contract`; lower-scope context transitions use the same state machine without that boundary contract. The switch consumes zero own minutes. Context after switch must equal the side context pinned by transit anchor and adjacent segment. Any mismatch blocks arrival or dispatch.

### 11.9. Time update integration

Every committed time-bearing step sends existing time system:

- exact rational elapsed time and crossed whole-minute boundaries;
- action/segment digest;
- activity intensity;
- factual context;
- consequence/change-set refs.

Time system updates body, NPC, weather, place and events exactly once. Idempotent retry cannot advance clock twice.

### 11.10. Synchronized time inside a moving carrier

When a carrier-local timed activity or scene traversal occurs while the root transport has an active world-travel state, the orchestrator creates one synchronized slice:

```text
one root transport traversal interval
+ zero or more carrier-local timed results
+ one shared exact world-time update
+ one atomic change set
```

Rules:

- the root interval is the clock owner while transport progress is active;
- planned slice duration ends at the earliest root recheck/segment boundary, local activity completion, local traversal completion or explicit synchronized recheck boundary; therefore no participant completes inside an uncommitted slice;
- every local participant is advanced by the same exact elapsed time, capped by its own remaining duration;
- if the root result has zero actual elapsed time, non-blocked local participants commit no attempt/interval result and their state is unchanged; local zero-time results are allowed only for an explicit local blocked/paused/failed control outcome;
- the exact clock update and crossed-minute count are committed once, never once per participant;
- a local completion effect is applied only at the synchronized slice boundary before the next slice is planned;
- if the root interval stops early because of pause, interruption or stranded outcome, every positive-time local result receives the same actual elapsed time and resolves deterministically as completed, progressed, paused or failed under its pinned local contract; a blocked result and a contract-valid failure-before-elapsed record zero time;
- a local blocked or failed outcome does not alter root progress unless its pinned contract contains an explicit root-carrier effect;
- local consequences and transport consequences share one time-update boundary;
- when transport is stationary at an endpoint or its travel state is `paused_in_transit`, one carrier-local timed execution may own the party clock; it advances no transport progress and uses the pinned stationary/paused carrier context;
- a carrier-local timed command blocks if neither an active synchronized root interval nor a stationary/paused carrier context exists;
- independent asynchronous clock advancement is forbidden.


---

## 12. Materialization pipeline and commit ownership

### 12.1. Components

```text
SpatialContextLoader
— reads approved immutable inputs through explicit ports;

SpatialMaterializer
— pure relative to persistence;
— builds deterministic proposal from approved candidates;

SpatialProposalValidator
— validates topology, limits, bindings and versions;
— never repairs or selects alternatives;

TraversalResolver
— resolves one immutable step against explicit dynamic snapshot;

TraversalCommitValidator
— validates progress, time, location and execution invariants;
— never creates topology;

CrossDomainValidator
— validates NPC/item/container/property compatibility with spatial slots;

CombinedWritePlanBuilder
— combines approved write sets without semantic choice;

CombinedAtomicCommitter
— sole DB writer for the transaction.
```

### 12.2. Stage isolation

Every stage has formal input, output, typed errors, declared dependencies and side-effect classification. A semantic stage must not:

- read hidden global state;
- mutate input;
- call the next stage;
- access DB/network/filesystem/LLM without explicit port;
- invent missing facts;
- convert error into success;
- perform unrelated operations.

Orchestrator controls sequence and stop/repair routing but contains no world-generation or movement business logic.

### 12.3. Materialization input

Input contains only explicit immutable snapshots:

- party and world revision;
- historical applicability frame;
- `stable_environment_context_snapshot` for durable topology facts;
- exact G0/G1 plus one trigger-specific G4 or typed host scope;
- trigger and, for migration/repair, one approved administrative mapping contract;
- approved catalog bundle and digest;
- profile/rule dependency pins;
- existing party spatial snapshot digest;
- versioned random source descriptor;
- expected state-version set.

Current weather, light, body, load and transient portal state do not select permanent topology. They affect traversal availability/dynamic snapshot only.

### 12.4. Deterministic candidate selection

```text
approved records
→ filter by profile/slot/region/period/stable durable conditions
→ stable sort by ID
→ canonical candidate digest
→ deterministic single choice or versioned RandomSource
→ trace selected/rejected candidates
```

Empty required set produces `spatial_candidate_gap`. Retry under identical input, algorithm, seed and digest returns identical proposal.

### 12.5. Materialization result

Result is named DTO and contains:

- success/blocked status;
- created G5 sites;
- scene baselines/G6/positions;
- movement/visibility/acoustic relations;
- endpoint/frontier bindings;
- frontier/chain/reservation mutations;
- materialization choices and trace;
- validation report;
- proposed write set.

Public `object`, `Record<string, unknown>` and untyped patch are forbidden when structure is known.

### 12.6. Commit rechecks

Under locks, validators recheck:

- idempotency key and canonical input digest;
- expected state versions;
- world/catalog/profile/rule pins;
- baseline uniqueness;
- frontier/chain ordinal and capacity reservation;
- route continuity and endpoint-role matrix;
- plan/step digest and dependency pins;
- execution/current-step state matrix;
- carrier/attachment/root location consistency;
- relation and destination capacity from locked authoritative travel/location/placement rows;
- interval progress/time monotonicity;
- boundary context;
- change-set/time ownership.

Validator does not choose alternate candidate, route, anchor, consequence or recovery target.

### 12.7. Cross-domain materialization

Spatial materialization creates stable slots first. NPC, item, container and property materializers consume those slots in separate deterministic stages. One atomic commit may include all approved outputs, but no stage may infer another domain's semantic content.

### 12.8. Forbidden actions

Materializer/resolver may not:

- create unknown class/template/profile/rule;
- infer topology from title or layout;
- create generic G5/G6/boundary;
- create permanent position near movable entity;
- exceed limits;
- create frontier outside slot rules;
- materialize G4/G1 from direction request;
- pass pending boundary;
- rematerialize saved scene on entry;
- move traveller during topology-only resolution;
- write before commit gate.

---

## 13. Persistence, concurrency and idempotency

### 13.1. Global lock order

Every state-changing transaction acquires locks in this order:

```text
1. party turn/clock;
2. journey owner and all affected actor/cohort/transport keys, sorted by typed key;
3. route-plan execution and current activity/travel state;
4. affected G4 keys, sorted by g4_id;
5. scene baseline, physical relation, portal, blocker, position/placement, endpoint, frontier, reservation and anchor keys, sorted by typed key;
6. change-set, event and idempotency rows.
```

Skipping or reversing order is `lock_order_violation`.

### 13.2. Idempotency

Each state-changing command has:

- party ID;
- operation kind;
- idempotency key;
- optional parent key;
- canonical input digest;
- expected state-version-set digest;
- committed result change-set ID or terminal failure code/digest;
- technical lease and status.

Same key + same digest returns prior result. Same key + different digest is `idempotency_conflict`. Composed command derives deterministic child keys from parent key and operation ordinal.

### 13.3. Transaction boundaries

Required atomic groups:

- target preparation snapshot and all mandatory members;
- generated G5 topology resolution;
- terminal frontier resolution;
- plan creation + planned execution + initial event;
- immediate action result + effects + ordinal advance;
- timed activity attempt + elapsed time + completion effect;
- traversal interval result + progress/time/body/events/location;
- synchronized root-transport interval and carrier-local timed results;
- interruption anchor aggregate + suspension;
- attachment/membership/location transition;
- execution supersession linkage.

Topology resolution and subsequent movement are separate commands unless a composed transaction explicitly contains every ordinary traversal gate and cost.

### 13.4. Uniqueness predicates

At minimum DDL/deferrable validators enforce:

```text
UNIQUE one non-superseded party canonical G5 projection per stable canonical G5;
UNIQUE active scene baseline per party + typed host;
UNIQUE generated site per source frontier;
UNIQUE continuation chain per initial frontier;
UNIQUE one open frontier per through chain;
UNIQUE active endpoint binding per relation + role;
UNIQUE active transit anchor per party + route point version;
UNIQUE plan step ordinal;
UNIQUE one nonterminal world-travel execution per root owner;
UNIQUE one nonterminal carrier-local execution per actor;
UNIQUE one active/paused/stranded travel state per execution step;
UNIQUE one active/paused activity execution per execution step across an activity series;
UNIQUE activity series ordinal and one successor per failed activity execution;
UNIQUE execution event ordinal;
UNIQUE interval result ordinal;
UNIQUE preparation member ordinal and digest identity;
UNIQUE one active outgoing attachment per subject;
UNIQUE one actor carrier-local position per actor;
UNIQUE idempotency operation key.
```

Exact SQL predicates are generated from appendix A status sets; prose synonyms are not accepted.

### 13.5. Current state versus history

Mutable current-state rows:

- journey location;
- attachments and carrier positions;
- expansion frontier/chain/reservation state;
- execution;
- activity execution;
- travel state;
- portal/blocker/placement state.

Append-only or immutable history:

- immutable route-plan payloads/steps; only the separately declared plan lifecycle fields may change once;
- execution events;
- action runs;
- activity attempts;
- traversal interval results;
- materialization choices/traces;
- change sets and audit records.

Closed history is never reactivated.

### 13.6. Logical storage ownership

`world_base` minimum domains:

```text
canonical spatial G0–G5;
routes/points/segments/endpoints/contexts/boundaries;
orientation/environment/cost/recheck profiles;
expansion profiles/slots/templates/limits/terminal policies;
scene/position/relation templates;
action/activity/mode-transition/recovery contracts;
visual authoring layouts;
provenance/readiness/version graph.
```

`party_runtime` minimum domains:

```text
party G5 sites and overlays;
scene baselines/G6/positions/relations;
frontiers/chains/reservations/ledgers;
endpoint bindings/transit anchors/route anchors;
preparation snapshots/claims;
plans/steps/executions/events;
action/activity/traversal histories;
locations/attachments/cohorts/transport placements;
NPC/items/containers/property;
knowledge/navigation beliefs/public projections;
idempotency/change sets/events/materialization traces.
```

Separate actor and transport travel-state tables are forbidden.

### 13.7. Save/load guarantee

Active journey reload must succeed from party rows and pinned deprecated authoring records. It must not require mutable latest catalog data. Missing pinned record/version is a hard migration gap, not permission to use latest.

---

## 14. Visual layouts and player projection

### 14.1. Layout is presentation

Layout stores scope, dimensions, node rectangles and optional edge paths. It never creates containment, movement, visibility, acoustics, distance, bearing or reach.

`layout_x/layout_y` are distinct from G1 `grid_x/grid_y`.

### 14.2. Player map

Player map is generated from character-known subgraph. It must not:

- reserve space for hidden nodes;
- reveal hidden route geometry;
- show unknown endpoint placeholder;
- use hidden nodes to stabilize layout;
- reveal factual corridor when perceived belief differs.

### 14.3. Layout versions

Visual revision is excluded from semantic materialization digest. Layout change cannot rematerialize scene or invalidate route plan. `generated_preview` cannot become approved automatically.

---

## 15. Migration from active materialization v2

### 15.1. Migration inventory

Every existing record receives explicit mapping:

```text
old path/type/level
→ target kind/level/class
→ canonical/generated/not-applicable origin
→ keep/reclassify/convert/migrate/deprecate/hard-gap action
→ reason, evidence and review status.
```

No inference by name alone.

### 15.2. Spatial mapping

Typical, not automatic, mapping:

```text
old large G4 sector
→ target G4;

old G4 representing courtyard/building/local parcel
→ target canonical G5;

old party G5 minilocation
→ target G6 or scene position according to physical scale;

old stable scene anchor
→ scene position stable basis or endpoint slot;

old anchor on movable item/NPC
→ entity placement or relative position;

old building shell
→ stable_structure hosting G6;

old route
→ scene edge, site connection or world route segment chain according to scale.
```

Every ambiguous case is hard gap.

### 15.3. Existing party G5

Each v2 baseline is classified as:

- party projection of an approved new canonical G5;
- generated G5 with explicit migration-only source mapping;
- hard gap.

Migration-only source does not become runtime fallback. Original baseline/version/seed/trace remains auditable.

### 15.4. Journey migration

Existing active movement is classified:

```text
reconstructable
— exact physical segment, direction, carrier and progress can be proven;

safe explicit anchor
— approved migration policy places traveller at a named source/target/checkpoint;

ambiguous
— hard block.
```

Nearest node, arbitrary midpoint and estimated route are forbidden.

### 15.5. Route migration

Migrated route requires:

- complete ordered point/segment chain;
- exactly one from/to endpoint binding;
- role-aware scene slots;
- explicit segment context/environment/orientation/cost/recheck;
- boundary row for each G0/G1/jurisdiction change;
- explicit reverse route where physically applicable.

Legacy route-level terrain/time and duplicate exit-route relation are transformed or reported as gaps; they are not copied as authoritative fields.

### 15.6. Version pins

Migration preserves or creates explicit pins for:

- world revision and historical frame;
- catalog/profile/rule versions and digests;
- route/point/segment/binding versions;
- scene baseline/template/materializer/RNG versions;
- cost/environment/orientation/recheck contracts;
- action/activity/mode-transition contracts;
- algorithms and migration version;
- active dynamic snapshot/cumulative rational state;
- cohort/attachment snapshot.

Missing pin is `migration_version_gap`.

### 15.7. Compatibility boundary

During migration, exactly one production owner handles each responsibility. Package-oriented and legacy `src/world/**` paths may coexist only behind one explicit adapter and cannot independently write spatial state.

ADR records:

- production owner;
- compatibility adapter;
- deprecation deadline;
- rollback procedure;
- test matrix proving no dual-write divergence.

### 15.8. Migration acceptance

Required evidence:

- zero dangling refs;
- zero route discontinuities/branches/cycles;
- zero missing contexts/boundaries;
- zero ambiguous endpoint slots;
- zero active journey without exact location/plan;
- zero double travel ownership;
- all gaps typed and blocked;
- import/readback digests match;
- rollback tested on local PostgreSQL.

---

## 16. Integration map and order

### 16.1. Normative documents

One PR updates at least:

```text
AGENTS.md
.github/AGENTS.md

code_driven_world_materialization_architecture.md
world_base_materialization_table_requirements.md
read_only_database_and_graph_architecture.md
map_g0_g4_workflow.txt or approved renamed successor
movement_locations_regions.txt
world_generation_and_turns.txt
base_turn_orchestration.txt
time_system.txt
interface_ux.md
formulas.md
llm_documentation_navigation.md
code_critic_invocation_rule.txt
regional G1_SEMANTIC_CATALOG.md
```

The old file name may remain as compatibility alias, but content must consistently describe canonical G0–G5 authoring after activation.

### 16.2. DDL and generated artifacts

Update:

- `infra/world-base/schema.sql` and ordered schema parts;
- party runtime DDL/migrations;
- field descriptions;
- generated `SCHEMA_REFERENCE.md`;
- import manifests and JSON Schemas;
- contract/public-interface registries;
- `MODULE_INDEX.md`, ownership map and module docs;
- RAG/knowledge-source manifests and digests;
- repository graph artifacts.

Generated schema reference is regenerated from actual DDL and never hand-edited.

### 16.3. Module ownership

Target responsibility:

```text
@rus/space-map
→ typed spatial refs, containment, route topology, contexts and endpoint contracts;

@rus/movement-routes
→ path query, plan creation, method/time resolution, progress and navigation outcomes;

@rus/materialization
→ deterministic stable topology materialization and traces;

@rus/contracts
→ shared discriminated contracts/errors only;

turn orchestrator
→ command sequence, locks, idempotency and commit composition;

presentation/knowledge
→ player-safe projection, not factual topology creation.
```

Duplicate route/endpoint/materialization logic in apps or compatibility paths is prohibited.

### 16.4. Implementation order

```text
1. ADR and red contract tests;
2. shared types/JSON Schemas;
3. world DDL and authoring validators;
4. party DDL and repositories;
5. migration/read adapters;
6. movement resolver and immutable plans;
7. action/activity/traversal executors;
8. spatial materializer and preparation;
9. turn/time/events integration;
10. knowledge/UI projection;
11. generated artifacts and full migration;
12. targeted/full/PostgreSQL tests;
13. independent critic; fixes → retest → reaudit;
14. atomic activation.
```

### 16.5. Working README and one PR

The task uses one `README.md` recording:

- objective and baseline commit;
- mandatory files read;
- RAG/Graphify queries actually executed;
- changed files/contracts/modules;
- design decisions and conflicts;
- migration/integration order;
- checks actually run and exact results;
- critic cycles;
- known gaps and rollback.

No additional PR is created for the same chat task.

---

## 17. Acceptance criteria

### 17.1. Classification and containment

- exact G0–G6 definitions;
- no G7/G8 active enum;
- one class plus orthogonal facets;
- one direct parent/host;
- no same-level containment;
- no movable-object stable position;
- classification ambiguity hard-blocks.

### 17.2. Route topology

- endpoint binding is sole authored route-endpoint relation;
- each route has one continuous finite chain;
- same endpoint pair may have multiple routes;
- site connection never crosses G4;
- every segment has context/environment/orientation/method/time/recheck;
- every boundary has exact adjacent segment versions and matched contract;
- no hidden time for G-level change.

### 17.3. Expansion

- terminal ordinal includes 0 and is pinned once;
- generation only while ordinal is less than terminal;
- one open successor per chain;
- shared capacities pass assignment proof;
- reservation prevents concurrent over-allocation;
- frontier resolution changes neither location nor time;
- terminal resolution does not choose world route;
- connection terminal resolution atomically creates/reuses exact target projection, endpoint scene and both bindings;
- data gap never falls back.

### 17.4. Scene materialization

- one active baseline per typed host;
- mandatory endpoint preparation completes before plan activation;
- exact role-aware slots resolve uniquely;
- repeat entry does not rematerialize;
- generated G5 transaction creates complete topology;
- attached transport scene retains IDs and derives world context;
- dynamic object never creates permanent position.

### 17.5. Planning and execution

- target/direction XOR;
- readiness and knowledge visibility independent;
- unresolved endpoint absent from executable plan;
- dependency pin completeness;
- immutable plan and append-only history;
- exact endpoint-kind matrix;
- explicit carrier/method/mode transitions;
- root-carrier ownership changes terminate the current immutable plan and continue only through an exact handoff/new plan;
- no corridor replacement inside plan;
- deterministic state transition for every interval outcome;
- stranded state save/load and rescue only by exact source.

### 17.6. Time

- permanent terrain counted once;
- one composite environment factor, not unbounded stacking;
- additive delays separated;
- all factors positive and pinned;
- total duration independent of interval slicing;
- a positive sub-minute interval advances exact time and triggers minute-indexed events only when a whole-minute boundary is crossed;
- clock advances exactly once with matching committed progress/activity.

### 17.7. Carriers

- active attached subject has no own world location;
- attachment graph acyclic and depth-limited;
- walking cohort owns one location;
- member cannot independently world-travel;
- passenger local action can coexist with transport travel only in carrier-local scope;
- time-bearing passenger action uses one synchronized slice and one exact clock update;
- one actor carrier position across all root carriers;
- split/merge/join/leave atomic.

### 17.8. Visibility, sound and interaction

- no coordinate-derived relations;
- explicit/default-clear visibility modes;
- target ambient acoustic noise applied once;
- local sound separated from world signals;
- interaction derived from capability and current topology;
- hidden topology excluded from player projection.

### 17.9. Persistence and concurrency

- field-state matrices enforced;
- exact partial unique predicates;
- global lock order tested;
- idempotent parent/child retries;
- no open semantic interval row;
- save/load active journey without latest catalog;
- no dual writer or dual travel ownership;
- trace and version pins round-trip.

### 17.10. Migration and release

- migration inventory complete;
- ambiguous mappings hard-block;
- DDL/schema/reference reproducible;
- importer dry-run/apply/readback/rollback pass;
- targeted, negative, property, integration and full tests pass;
- PostgreSQL integration passes;
- critic returns `PASS` or acceptable `PASS WITH NOTES`;
- all documents and regional catalogs synchronized;
- atomic activation verified.


---

# Приложение A. Закрытые словари и state machines

## A.1. Primitive types

```text
stable_id              = non-empty immutable UTF-8 string with domain prefix policy
positive_integer       = integer >= 1
non_negative_integer   = integer >= 0
ppm                     = integer 0..1_000_000
azimuth_mdeg            = integer 0..359_999
half_width_mdeg         = integer 0..180_000
sha256_hex              = 64 lowercase hexadecimal characters
game_timestamp         = exact project calendar timestamp with reduced rational sub-minute precision and total ordering
system_timestamp       = UTC technical timestamp for leases and transaction ownership
rational                = numerator >= 0, denominator >= 1, reduced form
positive_rational       = numerator >= 1, denominator >= 1, reduced form
state_version           = integer >= 1, increased on every mutable semantic change
authoring_version       = immutable non-empty version string
relation_set<T>         = normalized child/binding rows, never in-row JSON array
snapshot_list<T>        = ordered immutable serialized list allowed only inside snapshot
```

All canonical serialization uses UTF-8, sorted object keys, declared relation ordering, no presentation fields and no floating-point numbers.

## A.2. Authoring status

```text
approved   = may be referenced by new plans/materializations
deprecated = readable by existing pins, excluded from new selection
retired    = readable only by explicit migration/legacy tooling
```

Draft/proposed/conflict records may exist in authoring workflows but never enter runtime approved candidate sets.

## A.3. Runtime topology status

```text
active      = complete and usable
inactive    = complete but temporarily not selected/usable by lifecycle
superseded  = replaced by explicit newer identity
retired     = retained for history; new use forbidden
destroyed   = physical identity destroyed
```

Temporary closure of a physical relation uses conditions/blockers/portal state, not `inactive` or `destroyed` unless lifecycle itself changed.

## A.4. Journey execution status and field matrix

| Status | `current_step_ordinal` | `current_endpoint_ref` | `active_travel_state_id` | `active_activity_execution_id` | `suspension_endpoint_ref` | `final_location_snapshot` | Terminal turn |
|---|---|---|---|---|---|---|---|
| `planned` | `0` | required | null | null | null | null | null |
| `active` + action | required | departure endpoint | null | null | null | null | null |
| `active` + activity | required | departure endpoint | null | required | null | null | null |
| `active` + traversal active/paused | required | null | required | null | null | null | null |
| `waiting_at_anchor` | required | required | null | null | null | null | null |
| `suspended_at_scene` | required | route-anchor scene | null | null | same endpoint | null | null |
| `stranded_in_transit` | required | null | stranded travel state | null | null | null | null |
| `completed` | null | null | null | null | null | required scene/transit endpoint | required |
| `aborted` | null | null | null | null | null | required valid journey location snapshot | required |
| `superseded` | null | null | null | null | null | required valid journey location snapshot | required |

`active` step subtype derives from immutable current plan step. It is not a second status enum.

### A.4.1. Allowed execution transitions

| From | To | Exact gate |
|---|---|---|
| absent | `planned` | immutable plan, steps and required preparation claim committed |
| `planned` | `active` | first step dispatch succeeds |
| `planned` | `aborted` | explicit abort before first step |
| `active` | `active` | step start/progress/pause or nonterminal step completion with immediate next-step activation |
| `active` | `waiting_at_anchor` | current attempt blocks or a completed step leaves the owner at an exact endpoint before next dispatch |
| `active` | `suspended_at_scene` | interruption commits an approved route-anchor scene |
| `active` | `stranded_in_transit` | exact in-transit state is preserved because an approved interruption anchor cannot be materialized |
| `active` | `completed` | final plan step completes at a valid scene or transit endpoint |
| `active` | `aborted` | current step is action/activity at an exact endpoint and the pinned failure/abort contract preserves that endpoint; active traversal must first interrupt or strand |
| `active` | `superseded` | replan starts from an exact location-bearing endpoint; raw non-stranded in-transit supersession is forbidden |
| `waiting_at_anchor` | `active` | same immutable plan dispatches its current step from the stored endpoint |
| `waiting_at_anchor` | `aborted` | explicit abort at the stored endpoint |
| `waiting_at_anchor` | `superseded` | successor plan source equals the stored endpoint snapshot |
| `suspended_at_scene` | `aborted` | explicit abort at the suspension scene |
| `suspended_at_scene` | `superseded` | successor recovery/replan source equals the suspension endpoint snapshot |
| `stranded_in_transit` | `superseded` | approved rescue, repair or migration successor source equals the exact stranded snapshot |

`completed`, `aborted` and `superseded` are terminal and have no outgoing transition. `suspended_at_scene` and `stranded_in_transit` never transition directly back to `active`; continuation creates a new immutable plan and successor execution. `paused_in_transit` is not an execution status: the execution remains `active` while the travel state is paused.

### A.4.2. Execution-event mapping

| `event_kind` | Required transition and exclusive gate |
|---|---|
| `planned` | absent → `planned`; event ordinal `0` |
| `activated` | `planned` → `active` only |
| `step_progressed` | `active` → `active`; positive nonterminal timed-activity or traversal progress without pause or step completion |
| `step_paused` | `active` → `active`; current activity or travel state becomes paused |
| `step_completed` | `active` → `active`; a non-final step completes and the next step is activated in the same change set |
| `wait_started` | `active` → `waiting_at_anchor`; no other event kind represents this transition |
| `suspended` | `active` → `suspended_at_scene` |
| `stranded` | `active` → `stranded_in_transit` |
| `resumed` | `waiting_at_anchor` → `active` only |
| `completed` | `active` → `completed`; final plan step completed |
| `aborted` | `planned`, endpoint-bearing `active`, `waiting_at_anchor` or `suspended_at_scene` → `aborted`, subject to A.4.1 |
| `superseded` | `active`, `waiting_at_anchor`, `suspended_at_scene` or `stranded_in_transit` → `superseded`, subject to A.4.1 |

The table is injective for every status-changing transition: one transition has exactly one event kind. `step_progressed`, `step_paused` and `step_completed` are disjoint by their result gate even though execution status remains `active`. Creation of the first/current run is part of `activated`, `resumed` or the causal step result; it does not create a second execution event.

Every event carries one post-transition factual `journey_location_snapshot`, including in-transit snapshots for active traversal and stranded states. Endpoint-bearing and stranded events carry the exact handoff endpoint snapshot; active/paused non-stranded in-transit events forbid it. Events that do not change factual location repeat the current snapshot; omission is forbidden.

## A.5. Travel-state status

```text
active
paused_in_transit
stranded_in_transit
closed
```

`closed_result` for closed state:

```text
completed
interrupted_to_anchor
superseded
```

Closed travel state is append-only history and never reactivated. A stranded travel state remains `stranded_in_transit` after its execution is superseded until the successor recovery command atomically leaves that exact source; that command then closes the old travel state as `superseded`.

## A.6. Timed-activity status

```text
active
paused
completed
failed
aborted
```

Only `active|paused` are nonterminal. `paused` activity has no open attempt row and resumes through a new append-only attempt.

## A.7. Movement readiness

```text
ready
requires_frontier_resolution
requires_preparation
temporarily_blocked
data_gap
```

Mapping to `executable` is fixed by section 9.3.

## A.8. Knowledge visibility

```text
visible
hidden
misidentified
```

`misidentified` means the actor-facing label/destination belief differs from factual endpoint. It does not alter factual route or option identity.

## A.9. Step kinds

```text
immediate_action
timed_activity
timed_traversal
```

One step has exactly one matching static snapshot payload.

## A.10. Journey scopes

```text
world_travel
carrier_local
```

Carrier-local plans cannot include `site_connection` or `world_route_segment` traversal.

## A.11. Endpoint kinds

```text
scene_position
site_connection_endpoint
world_route_endpoint
transit_anchor
route_anchor_scene
stranded_state
```

`stranded_state` is source-only for rescue/repair/migration.

## A.12. Interval outcomes

```text
progressed
segment_completed
paused_in_transit
interrupted_at_anchor
stranded
blocked_before_progress
```

No other interval outcome is valid. Navigation/hazard/data-gap classifications are separate reason fields.

## A.13. Frontier status and resolution

```text
status          = open | consumed | closed
resolution_kind = generated_site | existing_site | world_route_exit | physical_boundary | null
```

`open` requires null resolution; `consumed|closed` require one resolution kind and exact resolved target/binding fields according to contract.

## A.14. Preparation claim status

```text
reserved
consumed
released
failed
```

`consumed|released|failed` are terminal.

## A.15. Route-anchor usability

A route-anchor scene is usable exactly when:

```text
identity.status = active
AND location_binding.status = active
AND identity.resolution_kind IN (
  unresolved,
  reusable_checkpoint,
  persistent_consequence
)
```

`ephemeral_resolved` is not usable.

## A.16. Cost kinds

```text
action
time
```

`timed_traversal` always uses `time`. A short discrete spatial transition over an action-cost `scene_edge` or `site_connection` is an `immediate_action`: it may change endpoint atomically, but has no continuous segment progress or game-time cost. `timed_activity` uses `time` without physical segment progress.

## A.17. Data-gap severity

```text
hard_block
repair_required
migration_required
```

No gap severity authorizes fallback. Severity selects only the allowed remediation workflow.

---

# Приложение B. Канонические implementation contracts

## B.0. Rules

Every block below is the sole logical declaration of its `contract_name`.

Notation:

```text
required T       = non-null T
optional T       = nullable T
relation_set<T>  = normalized child relation rows
snapshot_list<T> = immutable ordered embedded snapshot list
XOR              = exactly one branch is populated
UNIQUE            = database constraint or deferrable commit validator
```

Physical table names may differ, but fields, identity, nullability, relations and invariants may not be weakened.

Global persistence rules:

- every mutable row starts with `state_version=1` and increments it on each semantic mutation;
- when both `created_change_set_id` and `updated_change_set_id` exist, they are equal at creation;
- a terminal/deactivation change-set field is null before the corresponding terminal transition and immutable afterward;
- all party-runtime references belong to the same `party_id` unless a contract explicitly names a cross-party administrative operation; this document defines none;
- every authoring version belongs to exactly one world revision/version graph;
- every mechanically relevant authoring dependency is either an explicit versioned_ref field or one normalized authoring_dependency_edge; a bare stable ID never selects a version implicitly;
- all authoring references in one aggregate belong to one compatible world revision/version graph;
- normalized relation rows participate in the parent canonical digest in their declared canonical order.
- every pseudo-type named `controlled_*` maps before activation to exactly one finite versioned vocabulary in the shared contract/vocabulary registry; the mapping records registry path, version and digest, and an unmapped or open-ended vocabulary is `controlled_vocabulary_gap`;
- deterministic proposal stages may preallocate entity, change-set and trace IDs, but preallocation creates no persisted fact; every preallocated ID must occur in the same validated `combined_write_plan` and becomes existent only after atomic commit.

### B.0.1. Canonical controlled-vocabulary binding

The following binding is normative for spatial architecture v4.2 contract activation. The aggregate registry digest is `05c51f8def16803c589c3e061653c42104359ed6583ff5c6d47ba86c23d4574a`. IDs are case-sensitive; aliases and free-text substitutions are forbidden. A consumer may narrow the listed registry but may not extend it. Any registry change requires a new version and digest while pinned historical versions remain readable.

| Pseudo-type | Registry ID | Registry path | Version | Digest |
|---|---|---|---|---|
| `controlled_dependency_role` | `spatial.contract.dependency_role` | `data/contracts/spatial-v3/controlled-vocabularies.v1.json` | `1.0.0` | `cde00b4d7858894d68982f14ff29441064645b99944403321aeac38c1597468e` |
| `controlled_direction_context` | `spatial.traversal.direction_context` | `data/contracts/spatial-v3/controlled-vocabularies.v1.json` | `1.0.0` | `468c7055d08e3ad5dded4da9c341cf7cdf6c58f2595408c91b79f5a10f4e23c1` |
| `controlled_endpoint_kind` | `spatial.movement.endpoint_kind` | `data/contracts/spatial-v3/controlled-vocabularies.v1.json` | `1.0.0` | `9fc491b7a09ac581d8c21dcd6c5ead19007490eda6908b2935c18414e6b6b958` |
| `controlled_entity_kind` | `spatial.contract.entity_kind` | `data/contracts/spatial-v3/controlled-vocabularies.v1.json` | `1.0.0` | `88e7932c36271c54245dbd89eb2a09cad9d0052918f069f74645fd95b041f289` |
| `controlled_movement_method` | `spatial.movement.method` | `data/contracts/spatial-v3/controlled-vocabularies.v1.json` | `1.0.0` | `2049fc6f848959fb52fcb6c875f3e5f07c42c2e97fbb290088456bcf37c357e0` |
| `controlled_pace_mode` | `spatial.movement.pace` | `data/contracts/spatial-v3/controlled-vocabularies.v1.json` | `1.0.0` | `d86502f307c0d04c01e525171da750f8c7774969f1611839215b81d400550c3d` |
| `controlled_position_type` | `spatial.scene.position_type` | `data/contracts/spatial-v3/controlled-vocabularies.v1.json` | `1.0.0` | `463322ae12de11d7baf5f7ff39c1282d713d2a1f26588155aa2b2a8d6c3c8624` |
| `controlled_posture_option` | `spatial.scene.posture` | `data/contracts/spatial-v3/controlled-vocabularies.v1.json` | `1.0.0` | `5c0e947008a070c24ef0066f2a0378f14e405a6824e4b2a1c54ff6d2167a7e00` |
| `controlled_progress_point` | `spatial.movement.progress_point` | `data/contracts/spatial-v3/controlled-vocabularies.v1.json` | `1.0.0` | `902ca536cd8875cdb214d1ca16463802b5f8552f099938087450fd6c5ffe01a9` |
| `controlled_risk_tag` | `spatial.movement.visible_risk_tag` | `data/contracts/spatial-v3/controlled-vocabularies.v1.json` | `1.0.0` | `ae8f66775a7380d8800ff1284a4b8eb9f99d43d932fbb18ffe2877a452e4c1d5` |
| `controlled_scene_role` | `spatial.scene.role` | `data/contracts/spatial-v3/controlled-vocabularies.v1.json` | `1.0.0` | `d8e6f72a4dc3872a153e21eb0e04946271af2cc9ee36cc66fbd69473a8380503` |
| `controlled_spatial_function` | `spatial.canonical.function` | `data/contracts/spatial-v3/controlled-vocabularies.v1.json` | `1.0.0` | `19f327f72b910f5fb892d779715209d565127fb8612f7b115b732b2fdaeb8381` |
| `controlled_write_target` | `spatial.runtime.write_target` | `data/contracts/spatial-v3/controlled-vocabularies.v1.json` | `1.0.0` | `056482a5590e2715737435fa353c394c4bdebc9eb4c1932a13c143f594c07f44` |

The machine-readable value sets and consumer constraints are defined by the exact pinned registry file above. Missing file, digest mismatch, empty value set, unknown pseudo-type or unknown value remains `controlled_vocabulary_gap` and blocks activation.


## B.1. Common references, location and authored topology

```yaml
contract_name: entity_ref
storage: embedded_value
fields:
  entity_kind: required controlled_entity_kind
  entity_id: required stable_id
invariants:
  - The allowed entity_kind set is narrowed by every consuming field.
  - Bare string IDs are forbidden in public contracts.
```

```yaml
contract_name: versioned_ref
storage: embedded_value
fields:
  entity_ref: required entity_ref
  authoring_version: required authoring_version
invariants:
  - The referenced authoring record must remain readable while any party pin exists.
```

```yaml
contract_name: version_pin
storage: embedded_value
fields:
  pin_kind: required enum[authoring_version, party_state_version]
  authoring_version: optional authoring_version
  state_version: optional state_version
invariants:
  - authoring_version branch requires authoring_version and null state_version.
  - party_state_version branch requires state_version and null authoring_version.
```

```yaml
contract_name: dependency_pin
storage: normalized_child_or_snapshot_member
fields:
  dependency_role: required controlled_dependency_role
  entity_ref: required entity_ref
  version_pin: required version_pin
invariants:
  - Dependency role must be valid for the owning contract.
```

```yaml
contract_name: dependency_pin_set
storage: immutable_snapshot
fields:
  pins: required snapshot_list[dependency_pin]
  canonical_digest: required sha256_hex
invariants:
  - pins is non-empty.
  - pins are unique by dependency_role, entity_kind and entity_id.
  - canonical order is dependency_role, entity_kind, entity_id.
  - canonical_digest covers all pins and no presentation fields.
```

```yaml
contract_name: authoring_dependency_edge
storage: world_base_relation
identity:
  - source_ref
  - dependency_role
  - target_ref
fields:
  source_ref: required versioned_ref
  dependency_role: required controlled_dependency_role
  target_ref: required versioned_ref
  canonical_ordinal: required non_negative_integer
  provenance_ref: required stable_id
invariants:
  - UNIQUE source_ref, dependency_role and target_ref; canonical_ordinal is unique within source_ref and dependency_role and is contiguous from zero.
  - Source and target belong to one compatible world revision/version graph.
  - The edge is required for every mechanically relevant authoring dependency represented in its parent contract by a stable ID rather than an explicit versioned_ref.
  - The ordered edge set participates in the source aggregate canonical digest and any target-version change requires a new source authoring version.
  - Runtime never resolves a bare stable ID to latest or first row; it follows the pinned source version and this exact edge.
```

```yaml
contract_name: spatial_ref
storage: embedded_value
fields:
  spatial_kind: required enum[canonical_g0, canonical_g1, canonical_g2, canonical_g3, canonical_g4, canonical_g5, party_g5_site, party_g6, scene_position, transit_anchor, route_anchor_scene]
  spatial_id: required stable_id
invariants:
  - The discriminator and target table must agree.
```

```yaml
contract_name: knowledge_spatial_ref
storage: embedded_value
fields:
  knowledge_kind: required enum[known_canonical_area, known_party_site, known_scene_position, known_transit_anchor, known_route_anchor_scene, unknown_area_token]
  knowledge_id: required stable_id
invariants:
  - The reference belongs to the knowledge layer and cannot be used as factual location.
```

```yaml
contract_name: scene_host_ref
storage: embedded_value
fields:
  host_kind: required enum[g5_site, transport, route_anchor_identity]
  host_id: required stable_id
invariants:
  - Exactly one typed host owns a scene baseline.
```

```yaml
contract_name: movement_endpoint_ref
storage: embedded_value
fields:
  endpoint_kind: required enum[scene_position, site_connection_endpoint, world_route_endpoint, transit_anchor, route_anchor_scene, stranded_state]
  endpoint_id: required stable_id
invariants:
  - scene_position identifies scene_position_node; site_connection_endpoint identifies party_site_connection_endpoint_binding; world_route_endpoint identifies party_world_route_endpoint_position_binding; transit_anchor identifies party_transit_anchor; route_anchor_scene identifies party_route_anchor_location_binding; stranded_state identifies traveller_travel_state.
  - stranded_state is allowed only as a rescue, repair or migration source.
  - Every non-stranded endpoint identifies an active location-bearing row at the time it is persisted.
```

```yaml
contract_name: journey_location
storage: embedded_value
fields:
  location_kind: required enum[scene, transit_anchor, in_transit]
  scene_position_id: optional stable_id
  transit_anchor_id: optional stable_id
  travel_state_id: optional stable_id
invariants:
  - scene requires scene_position_id only.
  - transit_anchor requires transit_anchor_id only.
  - in_transit requires travel_state_id only.
```

```yaml
contract_name: journey_location_snapshot
storage: immutable_snapshot
fields:
  location: required journey_location
  location_ownership_mode: required enum[root_authoritative, attachment_derived]
  handoff_endpoint_snapshot: optional endpoint_contract_snapshot
  dependency_pins: required dependency_pin_set
  canonical_digest: required sha256_hex
invariants:
  - Pins resolve every location-bearing dependency.
  - A scene or transit-anchor snapshot requires handoff_endpoint_snapshot resolving the same exact position/anchor and dependency versions.
  - An in-transit snapshot forbids handoff_endpoint_snapshot while travel state is active or paused; a stranded in-transit snapshot requires handoff_endpoint_snapshot kind stranded_state for the same travel state.
  - root_authoritative resolves one matching party_journey_location row for an unattached actor/cohort/transport and is required for transit_anchor or in_transit locations.
  - attachment_derived requires location_kind=scene, an actor subject, one active attachment chain, the exact party_actor_carrier_position and root-carrier dependency pins; the actor has no party_journey_location row.
  - Nonterminal world_travel snapshots are root_authoritative and nonterminal carrier_local snapshots are attachment_derived. A terminal mode transition may switch the ownership mode only in the same atomic change set that changes the attachment/root-location state and completes or supersedes the current execution.
  - Snapshot is immutable and self-diagnostic; canonical_digest includes ownership mode and the optional handoff endpoint.
```

```yaml
contract_name: party_journey_location
storage: party_runtime_mutable
identity:
  - party_id
  - owner_kind
  - owner_id
fields:
  party_id: required stable_id
  owner_kind: required enum[actor, cohort, transport]
  owner_id: required stable_id
  location: required journey_location
  last_confirmed_endpoint_ref: required movement_endpoint_ref
  state_version: required state_version
  updated_change_set_id: required stable_id
invariants:
  - UNIQUE by party_id, owner_kind and owner_id.
  - An actively attached owner has no row.
  - last_confirmed_endpoint_ref is the last real scene/transit/world-route endpoint reached before the current state and never has kind stranded_state; an exact stranded source is derived from location.travel_state_id.
```

```yaml
contract_name: party_carrier_attachment
storage: party_runtime_mutable
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  subject_kind: required enum[actor, cohort]
  subject_id: required stable_id
  carrier_kind: required enum[cohort, transport]
  carrier_id: required stable_id
  formation_slot_id: optional stable_id
  status: required enum[active, released]
  state_version: required state_version
  created_change_set_id: required stable_id
  released_change_set_id: optional stable_id
invariants:
  - Active attachment graph is acyclic with maximum depth two.
  - UNIQUE one active outgoing attachment per party, subject_kind and subject_id.
  - actor to cohort, actor to transport and cohort to transport are allowed; all other chains are forbidden.
  - Active actor-to-cohort attachment requires an active party_cohort_membership for the same actor and cohort.
  - Active cohort-to-transport attachment requires the cohort to exist and forbids a direct world-location row for that cohort.
  - active forbids released_change_set_id; released requires it.
```

```yaml
contract_name: party_actor_carrier_position
storage: party_runtime_mutable
identity:
  - party_id
  - actor_id
fields:
  party_id: required stable_id
  actor_id: required stable_id
  root_carrier_ref: required entity_ref
  local_position_node_id: required stable_id
  attachment_dependency_pins: required dependency_pin_set
  state_version: required state_version
  updated_change_set_id: required stable_id
invariants:
  - UNIQUE by party_id and actor_id across all transports.
  - root_carrier_ref kind is cohort or transport and equals the terminal carrier of the active attachment chain.
  - If root carrier is transport, local_position_node_id belongs to its attached G6.
  - If root carrier is a scene-located cohort, local_position_node_id belongs to the same scene host as the cohort formation anchor.
```

```yaml
contract_name: party_cohort_membership
storage: party_runtime_mutable
identity:
  - party_id
  - cohort_id
  - actor_id
fields:
  party_id: required stable_id
  cohort_id: required stable_id
  actor_id: required stable_id
  membership_role: required enum[leader, member, guard, driver, passenger, dependent]
  status: required enum[active, left, dead]
  joined_at_turn: required non_negative_integer
  ended_at_turn: optional non_negative_integer
  pace_factor_numerator: required positive_integer
  pace_factor_denominator: required positive_integer
  state_version: required state_version
  updated_change_set_id: required stable_id
invariants:
  - UNIQUE one active movement-cohort membership per actor; other social-group relations use different contracts and never this table.
  - left or dead requires ended_at_turn not earlier than joined_at_turn; active requires ended_at_turn null.
  - Every active cohort has exactly one active leader membership.
  - If the cohort has a nonterminal world_travel execution or its party_journey_location is in_transit, every active member has an active actor-to-cohort attachment.
  - While the cohort is stationary and owns no nonterminal world_travel execution, an active member may be detached; then that actor has its own party_journey_location and cannot derive movement from the cohort.
  - dead membership never moves the corpse implicitly; corpse placement or transport is a separate atomic decision.
```

```yaml
contract_name: orientation_reference_frame
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  world_revision_id: required stable_id
  scope_ref: required versioned_ref
  parent_frame_ref: optional versioned_ref
  north_offset_mdeg: required azimuth_mdeg
  status: required enum[approved, deprecated, retired]
  provenance_ref: required stable_id
invariants:
  - scope_ref targets the world revision, one canonical spatial node, scene template or transport template allowed by the frame kind registry.
  - Frame graph is acyclic and never crosses world revisions.
  - Exactly one root frame per world revision scopes the world revision itself, has null parent and zero offset.
  - Every non-root frame has one parent frame and a deterministic transform to the root.
```

```yaml
contract_name: movement_orientation_profile
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  reference_frame_ref: required versioned_ref
  profile_kind: required enum[fixed, curved]
  fixed_local_azimuth_mdeg: optional azimuth_mdeg
  vertical_direction: required enum[level, up, down, mixed]
  reverse_profile_ref: optional versioned_ref
  status: required enum[approved, deprecated, retired]
  provenance_ref: required stable_id
relations:
  points: relation_set[movement_orientation_profile_point]
invariants:
  - fixed requires fixed_local_azimuth_mdeg and no points.
  - curved requires at least two ordered points and null fixed_local_azimuth_mdeg.
  - Reverse profile is a distinct record in the same frame, points back reciprocally and satisfies reverse(p)=forward(1_000_000-p)+180_000 modulo 360_000 with inverted vertical direction.
  - A profile without reverse_profile_ref declares the physical relation one-way.
```

```yaml
contract_name: movement_orientation_profile_point
storage: world_base_relation
identity:
  - profile_id
  - profile_version
  - ordinal
fields:
  profile_id: required stable_id
  profile_version: required authoring_version
  ordinal: required non_negative_integer
  progress_ppm: required ppm
  local_azimuth_mdeg: required azimuth_mdeg
  interpolation_to_next: optional enum[shortest_arc, clockwise_arc, counterclockwise_arc]
invariants:
  - Progress starts at zero, ends at one million and strictly increases.
  - Every non-final point requires interpolation_to_next; the final point forbids it.
  - Arc interpolation handles wrap through zero according to the declared direction.
  - Ordinal is contiguous from zero.
```

```yaml
contract_name: spatial_relative_orientation
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  source_ref: required versioned_ref
  target_ref: required versioned_ref
  reference_frame_ref: required versioned_ref
  relation_kind: required enum[north_of, northeast_of, east_of, southeast_of, south_of, southwest_of, west_of, northwest_of, overlaps, crosses, upstream_of, downstream_of]
  bearing_center_mdeg: optional azimuth_mdeg
  bearing_half_width_mdeg: optional half_width_mdeg
  distance_band_id: optional stable_id
  status: required enum[approved, deprecated, retired]
  provenance_ref: required stable_id
invariants:
  - source_ref and target_ref are canonical spatial records or approved authoring templates in the same world revision/frame scope.
  - Relation supplies context only and never creates a movement edge.
  - Center and half-width are both null or both populated.
```

```yaml
contract_name: g4_directional_exit
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  g4_id: required stable_id
  direction_context_id: required stable_id
  exit_orientation_rule_ref: required versioned_ref
  exit_kind: required enum[world_route_exit, physical_boundary]
  exit_canonical_g5_id: optional stable_id
  boundary_feature_template_ref: optional versioned_ref
  status: required enum[approved, deprecated, retired]
  provenance_ref: required stable_id
invariants:
  - world_route_exit requires exit_canonical_g5_id and forbids boundary_feature_template_ref.
  - physical_boundary requires boundary_feature_template_ref and forbids exit_canonical_g5_id.
  - Exact g4_id and exit_canonical_g5_id versions are carried by authoring_dependency_edge rows of this exit version; the canonical G5 immediate parent is that G4 in the same world revision.
  - Approved world_route_exit has at least one approved from endpoint binding whose canonical G5 and directional exit match this record.
  - This exit version changes when its G4, canonical exit G5, orientation rule or applicable departure-binding set changes mechanically.
```

```yaml
contract_name: world_route
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  route_kind_id: required stable_id
  reverse_route_ref: optional versioned_ref
  availability_condition_set_ref: optional versioned_ref
  risk_profile_ref: optional versioned_ref
  status: required enum[approved, deprecated, retired]
  provenance_ref: required stable_id
invariants:
  - Route is directed, finite and contains exactly one endpoint_from, one endpoint_to and one continuous ordered segment chain with point_count=segment_count+1.
  - No branch or cycle exists inside one route version.
  - Exactly one approved from and to endpoint binding exists for an approved route version.
  - Reverse route, when present, is distinct, independently valid, points back reciprocally and has reversed endpoint/segment order; absence declares a one-way route.
  - Route version changes whenever point, segment, endpoint binding or mechanically relevant route-level dependency changes.
```

```yaml
contract_name: world_route_point
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  world_route_ref: required versioned_ref
  ordinal: required non_negative_integer
  point_kind: required enum[endpoint_from, waypoint, checkpoint, boundary, endpoint_to]
  anchor_policy: required enum[endpoint_binding, ordinary_transit, shared_checkpoint]
  stable_label_id: optional stable_id
  context_switch_phase: optional enum[inbound_completion, outbound_dispatch]
  status: required enum[approved, deprecated, retired]
  provenance_ref: required stable_id
invariants:
  - UNIQUE route version and ordinal.
  - Endpoint_from is ordinal zero and endpoint_to is maximum ordinal.
  - endpoint_from and endpoint_to always use endpoint_binding and require null context_switch_phase.
  - waypoint uses ordinary_transit; checkpoint uses shared_checkpoint; boundary uses ordinary_transit or shared_checkpoint; all internal points require context_switch_phase.
  - A boundary point has exactly one boundary_crossing_contract with the same switch phase; every non-boundary point has none.
  - Version changes when incident segments, side context, anchor policy or boundary contract changes.
```

```yaml
contract_name: world_route_segment
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  world_route_ref: required versioned_ref
  ordinal: required non_negative_integer
  from_route_point_ref: required versioned_ref
  to_route_point_ref: required versioned_ref
  transition_environment_profile_ref: required versioned_ref
  movement_orientation_profile_ref: required versioned_ref
  baseline_movement_method_id: required stable_id
  movement_method_cost_profile_ref: required versioned_ref
  base_minutes: required positive_integer
  dynamic_recheck_policy_ref: required versioned_ref
  capacity: optional positive_integer
  risk_profile_ref: optional versioned_ref
  availability_condition_set_ref: optional versioned_ref
  status: required enum[approved, deprecated, retired]
  provenance_ref: required stable_id
invariants:
  - UNIQUE route version and ordinal.
  - Segment ordinal i connects point ordinal i to i plus one.
  - Segment has exactly one spatial context.
```

```yaml
contract_name: world_route_endpoint_binding
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  world_route_ref: required versioned_ref
  endpoint_role: required enum[from, to]
  route_point_ref: required versioned_ref
  canonical_g5_id: required stable_id
  directional_exit_ref: optional versioned_ref
  scene_endpoint_slot_key: required stable_id
  status: required enum[approved, deprecated, retired]
  provenance_ref: required stable_id
invariants:
  - Exactly one from and one to binding per approved route version.
  - from requires endpoint_from point and directional_exit_ref; canonical_g5_id has an exact authoring_dependency_edge, equals the directional exit canonical G5 and has the exit G4 as parent.
  - to requires endpoint_to point and null directional_exit_ref.
  - Slot role is compatible with endpoint role and belongs to the approved scene materialization profile of the canonical G5.
  - Binding version changes when the canonical G5 endpoint contract, slot or directional exit changes mechanically.
```

```yaml
contract_name: world_route_segment_spatial_context
storage: world_base_authoring
identity:
  - segment_id
  - segment_version
fields:
  segment_id: required stable_id
  segment_version: required authoring_version
  g0_id: required stable_id
  g1_id: required stable_id
  g2_id: optional stable_id
  g3_id: optional stable_id
  g4_corridor_id: optional stable_id
  jurisdiction_profile_ref: optional versioned_ref
  weather_scope_id: required stable_id
  event_pool_profile_ref: optional versioned_ref
  status: required enum[approved, deprecated, retired]
  provenance_ref: required stable_id
invariants:
  - UNIQUE one context per segment version.
  - A segment does not cross a G0 or G1 boundary internally.
  - Any authored change of populated G2, G3, G4 corridor, jurisdiction, weather scope or event pool occurs between segments at a route point; only G0/G1/jurisdiction changes require a boundary contract.
```

```yaml
contract_name: boundary_crossing_contract
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  boundary_kind: required enum[g1_internal, g0_external, jurisdiction_only, combined]
  route_ref: required versioned_ref
  route_point_ref: required versioned_ref
  inbound_segment_ref: required versioned_ref
  outbound_segment_ref: required versioned_ref
  from_context_digest: required sha256_hex
  to_context_digest: required sha256_hex
  transition_contract_ref: required versioned_ref
  switch_phase: required enum[inbound_completion, outbound_dispatch]
  directionality: required enum[directed]
  status: required enum[approved, deprecated, retired]
  provenance_ref: required stable_id
invariants:
  - Route point is the exact shared endpoint of adjacent inbound and outbound segments.
  - Context digests equal the adjacent segment contexts.
  - transition_contract_ref targets an approved spatial_transition_contract matching both contexts and route kind.
  - g1_internal requires equal G0, distinct cardinal-adjacent G1 and equal jurisdiction.
  - g0_external requires distinct G0, distinct G1 and equal jurisdiction.
  - jurisdiction_only requires equal G0/G1 and distinct jurisdiction context.
  - combined requires a spatial change valid as either g1_internal or g0_external plus a distinct jurisdiction context in the same ordered transition.
  - switch_phase=inbound_completion makes the departure side active in the boundary transit anchor after inbound completion; switch_phase=outbound_dispatch keeps the arrival side active until outbound dispatch commits.
  - The boundary has zero own time.
```

```yaml
contract_name: party_world_route_endpoint_position_binding
storage: party_runtime_mutable
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  source_endpoint_binding_ref: required versioned_ref
  scene_baseline_id: required stable_id
  g5_site_id: required stable_id
  position_id: required stable_id
  status: required enum[active, inactive, superseded]
  state_version: required state_version
  activated_change_set_id: required stable_id
  deactivated_change_set_id: optional stable_id
invariants:
  - UNIQUE one active row per party and source endpoint binding version.
  - Position belongs to scene baseline of the projected canonical G5.
  - Derived route, role and slot values match authoring binding.
  - active forbids deactivated_change_set_id; inactive and superseded require it.
```

```yaml
contract_name: g5_site_connection
storage: party_runtime_mutable_lifecycle
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  from_site_id: required stable_id
  to_site_id: required stable_id
  passage_type_id: required stable_id
  transition_environment_profile_ref: required versioned_ref
  movement_orientation_profile_ref: required versioned_ref
  cost_kind: required enum[action, time]
  action_units: optional positive_integer
  baseline_movement_method_id: optional stable_id
  movement_method_cost_profile_ref: optional versioned_ref
  base_minutes: optional positive_integer
  dynamic_recheck_policy_ref: optional versioned_ref
  capacity: optional positive_integer
  risk_profile_ref: optional versioned_ref
  portal_entity_id: optional stable_id
  availability_condition_set_ref: optional versioned_ref
  reverse_connection_id: optional stable_id
  status: required enum[active, superseded, destroyed]
  state_version: required state_version
  created_change_set_id: required stable_id
  updated_change_set_id: required stable_id
  terminal_change_set_id: optional stable_id
invariants:
  - Source and target sites have the same parent G4.
  - action requires action_units and null time fields.
  - time requires method, cost profile, base_minutes and recheck policy and null action_units.
  - portal_entity_id requires availability_condition_set_ref that exhaustively resolves movement for portal states open, closed, locked and destroyed; the portal belongs to one endpoint scene baseline and is compatible with both endpoint bindings.
  - No portal permits availability_condition_set_ref only for non-portal conditions.
  - Reverse connection, when present, is a distinct row in the same party with swapped sites and a reciprocal reverse_connection_id.
  - capacity_reduction is permitted only when capacity is explicitly populated.
  - active forbids terminal_change_set_id; superseded and destroyed require it.
```

```yaml
contract_name: party_site_connection_endpoint_binding
storage: party_runtime_mutable
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  site_connection_id: required stable_id
  endpoint_role: required enum[from, to]
  g5_site_id: required stable_id
  position_id: required stable_id
  source_slot_key: required stable_id
  status: required enum[active, inactive, superseded]
  state_version: required state_version
  activated_change_set_id: required stable_id
  deactivated_change_set_id: optional stable_id
invariants:
  - UNIQUE one active binding per party, connection and role.
  - from belongs to connection source site; to belongs to target site.
  - Slot role matches endpoint role.
  - active forbids deactivated_change_set_id; inactive and superseded require it.
```

```yaml
contract_name: scene_endpoint_slot
storage: world_base_authoring
identity:
  - scene_template_id
  - scene_template_version
  - slot_key
fields:
  scene_template_id: required stable_id
  scene_template_version: required authoring_version
  slot_key: required stable_id
  endpoint_role: required enum[departure, arrival, both]
  required_position_slot_key: required stable_id
  required_position_instance_ordinal: required non_negative_integer
  status: required enum[approved, deprecated, retired]
invariants:
  - required_position_slot_key exists in the same scene template version and required_position_instance_ordinal is below that position template instance_count.
  - A required slot resolves to exactly one position in an active baseline.
  - The slot version is the enclosing scene template version; changing role or position target requires a new scene template version.
```


## B.2. Party G5, expansion, scenes and perception

```yaml
contract_name: party_g5_site
storage: party_runtime_mutable_lifecycle
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  origin: required enum[canonical, generated]
  parent_g4_id: required stable_id
  canonical_g5_ref: optional versioned_ref
  generated_template_ref: optional versioned_ref
  expansion_slot_ref: optional versioned_ref
  source_frontier_id: optional stable_id
  generation_ordinal: optional non_negative_integer
  direction_context_id: optional stable_id
  continuation_chain_id: optional stable_id
  continuation_ordinal: optional non_negative_integer
  status: required enum[active, destroyed, superseded]
  state_version: required state_version
  created_change_set_id: required stable_id
  updated_change_set_id: required stable_id
  terminal_change_set_id: optional stable_id
  superseded_by_site_id: optional stable_id
invariants:
  - canonical requires canonical_g5_ref and null generated fields.
  - generated requires template, slot, source_frontier and generation_ordinal and null canonical_g5_ref.
  - generation_ordinal is the zero-based committed slot-unit ordinal within party, parent G4 and expansion slot; it is assigned under capacity locks, is contiguous across committed generated sites in that slot and is independent of through continuation_ordinal.
  - generated through-site requires direction, chain and continuation ordinal; branch-site forbids them.
  - For a through site, continuation_ordinal equals source frontier ordinal plus one and never exceeds chain terminal_ordinal.
  - origin, parent, source template/canonical ref, frontier and generation identity fields are immutable after creation.
  - UNIQUE one non-superseded canonical projection per party and stable canonical G5 ID, independent of authoring version.
  - UNIQUE one generated site per party and source_frontier_id.
  - UNIQUE party_id, parent_g4_id, expansion_slot_ref and generation_ordinal for generated sites.
  - active forbids terminal_change_set_id and superseded_by_site_id.
  - destroyed requires terminal_change_set_id and forbids superseded_by_site_id.
  - superseded is permitted only for canonical origin, requires terminal_change_set_id and superseded_by_site_id pointing to one same-party successor projection of the same stable canonical G5 under an approved migration/repair mapping.
  - Supersession links are one-to-one, acyclic and immutable.
```

```yaml
contract_name: g4_expansion_profile
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  g4_id: required stable_id
  adjacency_rule_set_ref: required versioned_ref
  connectivity_rule_set_ref: required versioned_ref
  seed_policy_ref: required versioned_ref
  status: required enum[approved, deprecated, retired]
  provenance_ref: required stable_id
relations:
  template_limits: relation_set[expansion_profile_template_limit]
  slots: relation_set[expansion_slot]
invariants:
  - Exactly one approved profile version is selected for one exact G4 revision identified by authoring_dependency_edge, and this profile version changes when that G4 revision or any mechanically relevant child relation changes.
  - No independent max_generated_g5 field exists.
  - Approval requires the static capacity proof from section 5.5.
```

```yaml
contract_name: expansion_profile_template_limit
storage: world_base_relation
identity:
  - profile_id
  - profile_version
  - template_ref
fields:
  profile_id: required stable_id
  profile_version: required authoring_version
  template_ref: required versioned_ref
  max_count: required positive_integer
invariants:
  - Every slot-template relation references one declared limit.
```

```yaml
contract_name: expansion_slot
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  profile_ref: required versioned_ref
  g4_id: required stable_id
  continuation_role: required enum[through, branch]
  direction_context_id: optional stable_id
  directional_exit_ref: optional versioned_ref
  max_instances: required positive_integer
  continuation_length_rule_ref: optional versioned_ref
  terminal_policy_ref: required versioned_ref
  status: required enum[approved, deprecated, retired]
relations:
  allowed_templates: relation_set[expansion_slot_template]
invariants:
  - through requires direction, directional exit and length rule and requires terminal policy kind world_route_exit or physical_boundary matching that exit.
  - branch forbids direction, directional exit and length rule and requires terminal policy kind connect_existing or physical_boundary.
  - g4_id equals the owning profile G4 and every related authoring record belongs to the same world revision.
  - allowed_templates is finite and non-empty.
```

```yaml
contract_name: expansion_slot_template
storage: world_base_relation
identity:
  - slot_id
  - slot_version
  - template_ref
fields:
  slot_id: required stable_id
  slot_version: required authoring_version
  template_ref: required versioned_ref
  selection_weight: required positive_integer
  compatibility_rule_ref: optional versioned_ref
invariants:
  - Template is declared by the owning profile limit relation.
```

```yaml
contract_name: continuation_length_rule
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  selection_kind: required enum[fixed, deterministic_weighted]
  status: required enum[approved, deprecated, retired]
  provenance_ref: required stable_id
relations:
  candidates: relation_set[continuation_length_candidate]
invariants:
  - Candidate set is finite and non-empty.
  - fixed has exactly one candidate.
```

```yaml
contract_name: continuation_length_candidate
storage: world_base_relation
identity:
  - rule_id
  - rule_version
  - terminal_ordinal
fields:
  rule_id: required stable_id
  rule_version: required authoring_version
  terminal_ordinal: required non_negative_integer
  weight: required positive_integer
invariants:
  - terminal_ordinal is not greater than max_instances of every approved slot that references this rule; otherwise the rule cannot be approved for that slot.
  - Candidate order for deterministic selection is ascending terminal_ordinal.
```

```yaml
contract_name: party_continuation_chain
storage: party_runtime_mutable
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  g4_id: required stable_id
  slot_ref: required versioned_ref
  initial_frontier_id: required stable_id
  terminal_ordinal: required non_negative_integer
  length_rule_ref: required versioned_ref
  candidate_digest: required sha256_hex
  choice_trace_id: required stable_id
  status: required enum[active, terminal_resolved]
  state_version: required state_version
  created_change_set_id: required stable_id
  updated_change_set_id: required stable_id
  terminal_change_set_id: optional stable_id
invariants:
  - UNIQUE by party_id and initial_frontier_id.
  - slot_ref resolves a through expansion slot; branch frontiers do not use this contract.
  - terminal_ordinal is selected before first generated site and never changes.
  - Chain and initial frontier are created atomically with preallocated IDs.
  - At most one open frontier belongs to the chain.
  - active forbids terminal_change_set_id; terminal_resolved requires it and has no open frontier.
```

```yaml
contract_name: expansion_frontier
storage: party_runtime_mutable
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  g4_id: required stable_id
  source_g5_site_id: required stable_id
  slot_ref: required versioned_ref
  direction_context_id: optional stable_id
  continuation_chain_id: optional stable_id
  continuation_ordinal: optional non_negative_integer
  status: required enum[open, consumed, closed]
  resolution_kind: optional enum[generated_site, existing_site, world_route_exit, physical_boundary]
  resolved_site_connection_id: optional stable_id
  resolved_boundary_entity_id: optional stable_id
  state_version: required state_version
  created_change_set_id: required stable_id
  resolved_change_set_id: optional stable_id
invariants:
  - through slot requires chain, direction and ordinal; branch forbids chain, direction and ordinal.
  - open requires null resolution, resolved fields and resolved_change_set_id.
  - consumed with generated_site, existing_site or world_route_exit requires resolved_site_connection_id and forbids boundary entity.
  - closed with physical_boundary requires resolved_boundary_entity_id and forbids site connection.
  - No other status/resolution combination is valid.
  - For a through frontier, ordinal never exceeds chain terminal_ordinal; generated_site is permitted only below it and terminal resolution only at it.
  - For a branch frontier, generated_site requires positive committed_residual_capacity, positive reservable_residual_capacity and a consumed one-unit reservation, then creates exactly one successor branch frontier. Terminal resolution requires committed_residual_capacity zero. Positive committed capacity with zero reservable capacity is a temporary block, never terminal exhaustion.
```

```yaml
contract_name: scene_frontier_binding
storage: party_runtime_mutable
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  position_id: required stable_id
  frontier_id: required stable_id
  access_condition_set_ref: optional versioned_ref
  status: required enum[active, inactive, superseded]
  state_version: required state_version
  activated_change_set_id: required stable_id
  deactivated_change_set_id: optional stable_id
invariants:
  - UNIQUE one active position binding per frontier.
  - active forbids deactivated_change_set_id; inactive and superseded require it.
  - Binding is an interaction point and has no time, environment or travel state.
```

```yaml
contract_name: expansion_capacity_reservation
storage: party_runtime_mutable_lease
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  g4_id: required stable_id
  profile_ref: required versioned_ref
  slot_ref: required versioned_ref
  selected_template_ref: required versioned_ref
  frontier_id: required stable_id
  idempotency_record_id: required stable_id
  status: required enum[reserved, consumed, released, expired]
  expires_at: required system_timestamp
  state_version: required state_version
  terminal_change_set_id: optional stable_id
invariants:
  - UNIQUE one nonterminal reservation per frontier.
  - Active reservations count against slot and template reservable_residual_capacity but never reduce committed_residual_capacity.
  - reserved requires null terminal_change_set_id and counts against reservable capacity.
  - consumed, released and expired require terminal_change_set_id.
  - consumed references a committed generated site through the frontier resolution change set.
  - released is explicit rollback/cancellation; expired is lease expiry reclaimed under locks.
  - Expiry never invalidates committed topology.
```

```yaml
contract_name: party_g4_expansion_ledger
storage: party_runtime_mutable
identity:
  - party_id
  - g4_id
fields:
  party_id: required stable_id
  g4_id: required stable_id
  profile_ref: required versioned_ref
  state_version: required state_version
  updated_change_set_id: required stable_id
invariants:
  - Ledger has no authoritative counters or exhausted flag.
  - Usage is derived from generated sites, frontiers and nonterminal reservations.
```

```yaml
contract_name: party_scene_baseline
storage: party_runtime_mutable_lifecycle
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  host_ref: required scene_host_ref
  source_kind: required enum[canonical_template, generated_template, transport_template, route_checkpoint, interruption_scene, migration, repair]
  scene_template_ref: required versioned_ref
  materialization_trace_id: required stable_id
  materializer_version: required authoring_version
  catalog_digest: required sha256_hex
  status: required enum[active, superseded, destroyed]
  state_version: required state_version
  created_change_set_id: required stable_id
  updated_change_set_id: required stable_id
  terminal_change_set_id: optional stable_id
invariants:
  - UNIQUE one active baseline per party and typed host.
  - canonical_template and generated_template require host kind g5_site matching the site origin.
  - transport_template requires host kind transport.
  - route_checkpoint and interruption_scene require host kind route_anchor_identity matching the anchor kind.
  - migration and repair require host kind and source mapping declared by the approved administrative contract in the materialization trace.
  - Host, source, template, materializer and catalog identity fields are immutable after creation.
  - active forbids terminal_change_set_id; superseded and destroyed require it.
  - A template change does not create another active baseline without migration or repair.
```

```yaml
contract_name: party_g6_instance
storage: party_runtime_mutable_lifecycle
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  scene_baseline_id: required stable_id
  source_scene_template_ref: required versioned_ref
  scene_slot_key: required stable_id
  enclosing_stable_structure_id: optional stable_id
  host_ref: required scene_host_ref
  physical_class_id: required enum[spatial.g6.enclosed, spatial.g6.semi_enclosed, spatial.g6.open, spatial.g6.water]
  primary_scene_role_id: required stable_id
  vertical_context_id: required enum[surface, elevated, subsurface]
  overhead_cover_id: required enum[none, partial, full]
  intra_g6_visibility_mode: required enum[default_clear, explicit]
  default_visibility_distance_band: optional enum[near, short, medium]
  acoustic_uniformity: required enum[uniform]
  status: required enum[active, superseded, destroyed]
  state_version: required state_version
  created_change_set_id: required stable_id
  updated_change_set_id: required stable_id
  terminal_change_set_id: optional stable_id
relations:
  secondary_scene_roles: relation_set[controlled_scene_role]
invariants:
  - UNIQUE scene_baseline_id and scene_slot_key.
  - Active G6 requires an active scene baseline; superseding or destroying the baseline atomically makes all child G6 non-active.
  - Baseline, source template, slot, enclosing structure and host identity fields are immutable after creation.
  - source_scene_template_ref equals the scene baseline template, scene_slot_key identifies one g6_template_slot in that version, and the materialized class, role, vertical, cover, visibility and acoustic fields equal that slot.
  - host_ref equals the baseline host_ref.
  - default_clear requires a default distance band; explicit forbids it.
  - active forbids terminal_change_set_id; superseded and destroyed require it.
```

```yaml
contract_name: scene_position_node
storage: party_runtime_mutable_lifecycle
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  g6_instance_id: required stable_id
  position_type_id: required enum[scene_position.threshold, scene_position.passage, scene_position.central, scene_position.boundary_edge, scene_position.structural_feature_side, scene_position.permanent_cover, scene_position.elevated_overlook, scene_position.fixed_working_reach, scene_position.water_reach, scene_position.hazard_boundary]
  template_slot_key: required stable_id
  template_instance_ordinal: required non_negative_integer
  stable_basis_ref: optional entity_ref
  capacity: required positive_integer
  access_class_id: required stable_id
  light_profile_ref: optional versioned_ref
  hazard_profile_ref: optional versioned_ref
  status: required enum[active, destroyed, superseded]
  state_version: required state_version
  created_change_set_id: required stable_id
  updated_change_set_id: required stable_id
  terminal_change_set_id: optional stable_id
relations:
  posture_options: relation_set[controlled_posture_option]
invariants:
  - UNIQUE g6_instance_id, template_slot_key and template_instance_ordinal.
  - template_instance_ordinal is in 0..instance_count-1 of the exact scene_position_template.
  - stable_basis_ref cannot target a movable entity.
  - Temporary unavailability is expressed by conditions or blockers, not lifecycle status.
  - active forbids terminal_change_set_id; superseded and destroyed require it.
```

```yaml
contract_name: scene_movement_edge
storage: party_runtime_mutable_lifecycle
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  scene_baseline_id: required stable_id
  source_scene_template_ref: required versioned_ref
  source_edge_slot_key: required stable_id
  from_position_id: required stable_id
  to_position_id: required stable_id
  passage_type_id: required stable_id
  transition_environment_profile_ref: required versioned_ref
  movement_orientation_profile_ref: required versioned_ref
  cost_kind: required enum[action, time]
  action_units: optional positive_integer
  baseline_movement_method_id: optional stable_id
  movement_method_cost_profile_ref: optional versioned_ref
  base_minutes: optional positive_integer
  dynamic_recheck_policy_ref: optional versioned_ref
  capacity: optional positive_integer
  portal_entity_id: optional stable_id
  availability_condition_set_ref: optional versioned_ref
  reverse_edge_id: optional stable_id
  status: required enum[active, superseded, destroyed]
  state_version: required state_version
  created_change_set_id: required stable_id
  updated_change_set_id: required stable_id
  terminal_change_set_id: optional stable_id
invariants:
  - UNIQUE scene_baseline_id and source_edge_slot_key.
  - source_scene_template_ref equals the scene baseline template and source_edge_slot_key resolves one scene_movement_edge_template whose endpoints and static fields equal this row.
  - action and time payloads are XOR as in g5_site_connection.
  - portal_entity_id requires availability_condition_set_ref that exhaustively resolves movement for portal states open, closed, locked and destroyed; no portal permits a condition set only for non-portal availability.
  - Reverse edge, when present, is a distinct row in the same party with swapped positions and a reciprocal reverse_edge_id.
  - Edge endpoints belong to G6 instances under the same scene host and baseline.
  - active forbids terminal_change_set_id; superseded and destroyed require it.
```

```yaml
contract_name: visibility_link
storage: party_runtime_mutable_lifecycle
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  scene_baseline_id: required stable_id
  source_scene_template_ref: required versioned_ref
  source_link_slot_key: required stable_id
  from_position_id: required stable_id
  to_position_id: required stable_id
  quality: required enum[clear, partial]
  distance_band: required enum[near, short, medium, long, remote]
  portal_entity_id: optional stable_id
  condition_profile_ref: optional versioned_ref
  reverse_link_id: optional stable_id
  status: required enum[active, superseded, destroyed]
  state_version: required state_version
  created_change_set_id: required stable_id
  updated_change_set_id: required stable_id
  terminal_change_set_id: optional stable_id
invariants:
  - UNIQUE scene_baseline_id and source_link_slot_key.
  - source_scene_template_ref equals the scene baseline template and source_link_slot_key resolves one visibility_link_template whose endpoints and static fields equal this row.
  - Missing link means no explicit base visibility relation.
  - portal_entity_id requires condition_profile_ref that exhaustively resolves visibility for portal states open, closed, locked and destroyed.
  - reverse_link_id, when present, points to a distinct same-party link with swapped positions and reciprocal ID.
  - Directed asymmetry without a reverse link requires stable physical basis in template provenance.
  - active forbids terminal_change_set_id; superseded and destroyed require it.
```

```yaml
contract_name: g6_acoustic_profile
storage: party_runtime_mutable
identity:
  - party_id
  - g6_instance_id
fields:
  party_id: required stable_id
  g6_instance_id: required stable_id
  ambient_noise: required enum[0, 1, 2]
  acoustic_uniformity: required enum[uniform]
  state_version: required state_version
  updated_change_set_id: required stable_id
invariants:
  - UNIQUE one profile per party and G6 instance; usability derives from the active G6 lifecycle.
  - ambient_noise is the persistent baseline of the receiving G6; temporary noise is a runtime modifier/event and does not overwrite this row.
```

```yaml
contract_name: acoustic_edge
storage: party_runtime_mutable_lifecycle
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  scene_baseline_id: required stable_id
  source_scene_template_ref: required versioned_ref
  source_edge_slot_key: required stable_id
  from_g6_instance_id: required stable_id
  to_g6_instance_id: required stable_id
  base_loss: required enum[0, 1, 2]
  portal_entity_id: optional stable_id
  closed_extra_loss: optional enum[0, 1, 2, blocked]
  reverse_edge_id: optional stable_id
  condition_profile_ref: optional versioned_ref
  status: required enum[active, superseded, destroyed]
  state_version: required state_version
  created_change_set_id: required stable_id
  updated_change_set_id: required stable_id
  terminal_change_set_id: optional stable_id
invariants:
  - UNIQUE scene_baseline_id and source_edge_slot_key.
  - source_scene_template_ref equals the scene baseline template and source_edge_slot_key resolves one acoustic_edge_template whose G6 endpoints and static fields equal this row.
  - No portal requires null closed_extra_loss and may use condition_profile_ref only for non-portal conditions.
  - portal_entity_id requires closed_extra_loss and condition_profile_ref that exhaustively resolves acoustic behavior for open, closed, locked and destroyed states.
  - reverse_edge_id, when present, points to a distinct same-party edge with swapped G6 endpoints and reciprocal ID.
  - Permanently blocked boundary has no edge.
  - active forbids terminal_change_set_id; superseded and destroyed require it.
```

```yaml
contract_name: portal_entity
storage: party_runtime_mutable
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  scene_baseline_id: required stable_id
  portal_template_ref: required versioned_ref
  state: required enum[open, closed, locked, destroyed]
  controller_entity_ref: optional entity_ref
  state_version: required state_version
  created_change_set_id: required stable_id
  updated_change_set_id: required stable_id
invariants:
  - UNIQUE scene_baseline_id and portal_template_ref.
  - portal_template_ref belongs to the scene baseline template.
  - Every referencing movement, visibility and acoustic relation carries an exhaustive state-resolution contract for open, closed, locked and destroyed.
  - A portal state change atomically revalidates all referencing relations; no subsystem invents a default state effect.
```

```yaml
contract_name: movement_edge_blocker
storage: party_runtime_mutable_lifecycle
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  relation_ref: required entity_ref
  relation_dependency_pins: required dependency_pin_set
  blocker_entity_ref: required entity_ref
  block_kind: required enum[full, capacity_reduction]
  reduced_capacity: optional positive_integer
  activation_condition_ref: optional versioned_ref
  status: required enum[active, removed]
  state_version: required state_version
  created_change_set_id: required stable_id
  updated_change_set_id: required stable_id
  terminal_change_set_id: optional stable_id
invariants:
  - relation_ref kind is scene_edge, site_connection or world_route_segment and relation_dependency_pins identify its exact party state or authoring version.
  - capacity_reduction requires the base relation to declare explicit positive capacity and reduced_capacity strictly below it; full forbids reduced_capacity.
  - Missing base capacity with capacity_reduction is relation_capacity_undefined and never implies unlimited or guessed capacity.
  - activation_condition_ref, when present, controls whether an active blocker currently applies.
  - Applicable blockers compose deterministically: any full blocker wins; otherwise effective capacity is the minimum declared reduced_capacity, never a sum or first-row choice.
  - active forbids terminal_change_set_id; removed requires it and never reactivates.
  - Blocker never changes the base relation to destroyed.
```

```yaml
contract_name: entity_placement
storage: party_runtime_mutable
identity:
  - party_id
  - entity_ref
fields:
  party_id: required stable_id
  entity_ref: required entity_ref
  placement_kind: required enum[scene_position, inside_entity, on_entity, attached_to_entity, moored_at_position, parked_at_position]
  position_node_id: optional stable_id
  host_entity_ref: optional entity_ref
  occupies_capacity: required non_negative_integer
  visibility_modifier_ref: optional entity_ref
  interaction_profile_ref: optional versioned_ref
  state_version: required state_version
  updated_change_set_id: required stable_id
invariants:
  - UNIQUE one authoritative placement per party and entity. A multi-part structure uses one root entity placement plus separately identified child entities; it never receives multiple authoritative rows.
  - scene_position requires position_node_id and forbids host_entity_ref.
  - inside_entity, on_entity and attached_to_entity require host_entity_ref, forbid position_node_id and derive scene position recursively.
  - moored_at_position and parked_at_position require position_node_id and may name a stable host_entity_ref.
  - visibility_modifier_ref, when present, targets a same-party visibility_modifier and its current state is pinned by the consuming read/commit.
  - Placement graph is acyclic and resolves to exactly one active scene position or attached-carrier scene.
```

```yaml
contract_name: relative_position
storage: party_runtime_mutable
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  actor_id: required stable_id
  relation: required enum[using_cover, behind, in_front_of, beside, under, overlooking, grappling]
  target_entity_ref: required entity_ref
  against_position_id: optional stable_id
  direction_context_id: optional stable_id
  valid_while_condition_ref: required versioned_ref
  state_version: required state_version
  updated_change_set_id: required stable_id
invariants:
  - Relative position never replaces authoritative location or attachment.
  - Actor and target resolve to the same scene interaction scope while the relation is valid.
  - A location, target-placement or controlling-condition change atomically revalidates or deletes the relation; stale rows are forbidden.
  - against_position_id, when present, belongs to that same scene scope.
```

```yaml
contract_name: knowledge_fact_reference
storage: normalized_child_or_snapshot_member
fields:
  fact_ref: required entity_ref
  fact_dependency_pins: required dependency_pin_set
  evidence_kind: required enum[observation, memory, report, inference, correction]
  epistemic_value: required enum[supports, contradicts, uncertain]
  exactness: required enum[exact, approximate]
  acquired_at_turn: required non_negative_integer
  source_event_ref: optional entity_ref
invariants:
  - fact_ref belongs to the character knowledge domain and never becomes a factual spatial location by itself.
  - exact requires approved exact source semantics; report or inference is approximate unless an explicit knowledge rule upgrades it.
  - source_event_ref, when present, belongs to the same party and is included in fact_dependency_pins.
  - A correction may contradict an older fact without deleting that historical knowledge record.
```

```yaml
contract_name: navigation_belief
storage: party_runtime_mutable_knowledge
identity:
  - party_id
  - character_id
fields:
  party_id: required stable_id
  character_id: required stable_id
  perceived_area_ref: optional knowledge_spatial_ref
  perceived_direction_id: optional stable_id
  perceived_bearing_mdeg: optional azimuth_mdeg
  perceived_vertical_direction: optional enum[level, up, down, mixed]
  confidence: required enum[exact, high, rough, low, lost]
  updated_at_turn: required non_negative_integer
  state_version: required state_version
  updated_change_set_id: required stable_id
relations:
  source_facts: relation_set[knowledge_fact_reference]
invariants:
  - Belief may be false without changing factual topology or location.
  - exact requires a non-null perceived area or direction supported by exact source facts.
  - lost forbids confidence claims of exact topology; perceived fields may remain as explicitly uncertain beliefs but player projection labels them as non-factual.
  - Every update is derived only from knowledge-visible facts and perception outcomes.
```

```yaml
contract_name: world_perception_signal
storage: party_runtime_mutable
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  source_spatial_ref: required spatial_ref
  source_dependency_pins: required dependency_pin_set
  signal_type_id: required stable_id
  strength_profile_ref: required versioned_ref
  weather_dependency_ref: optional versioned_ref
  route_or_direction_context_id: optional stable_id
  active_condition_ref: required versioned_ref
  state_version: required state_version
  updated_change_set_id: required stable_id
invariants:
  - Signal source and strength dependencies are pinned and compatible with the source spatial scope.
  - Signal may reveal approximate direction or area, not an exact route by itself.
  - Temporary activation changes this runtime row/condition only and never creates movement topology.
```

```yaml
contract_name: interaction_capability
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  target_kind: required controlled_entity_kind
  action_id: required stable_id
  required_relation: required enum[same_position, adjacent_position, visible]
  access_condition_set_ref: optional versioned_ref
  state_condition_set_ref: optional versioned_ref
  status: required enum[approved, deprecated, retired]
relations:
  allowed_position_types: relation_set[controlled_position_type]
invariants:
  - Capability stores requirements, not a cached interaction result.
  - same_position resolves only from equal current position; adjacent_position requires at least one currently traversable directed scene edge to an allowed position; visible requires an actual current visibility result.
  - Empty allowed_position_types means the relation alone is sufficient; otherwise the resolved actor position type must be in the set.
  - Access and state conditions are rechecked at action commit.
```

```yaml
contract_name: factual_spatial_context_snapshot
storage: immutable_snapshot
fields:
  context_ref: required entity_ref
  dependency_pins: required dependency_pin_set
  g0_id: required stable_id
  g1_id: required stable_id
  g2_id: optional stable_id
  g3_id: optional stable_id
  g4_id: optional stable_id
  jurisdiction_profile_ref: optional versioned_ref
  weather_scope_id: required stable_id
  event_pool_profile_ref: optional versioned_ref
  canonical_digest: required sha256_hex
invariants:
  - Ancestor IDs match the pinned factual context and one world revision.
  - g4_id requires g3_id and g2_id; g3_id requires g2_id.
  - context_ref kind is narrowed by the consuming contract to segment context, scene host context, transport travel state or route-anchor context.
  - canonical_digest covers all IDs, profiles and dependency pins.
```

```yaml
contract_name: route_point_context_snapshot
storage: immutable_snapshot
fields:
  source_route_ref: required versioned_ref
  source_route_point_ref: required versioned_ref
  point_kind: required enum[ordinary, checkpoint, boundary]
  arrival_side_context: required factual_spatial_context_snapshot
  departure_side_context: required factual_spatial_context_snapshot
  boundary_crossing_contract_ref: optional versioned_ref
  switch_phase: required enum[inbound_completion, outbound_dispatch]
  default_wait_side: required enum[arrival, departure]
  canonical_digest: required sha256_hex
invariants:
  - boundary requires boundary contract; ordinary and checkpoint forbid it.
  - source route point is internal; point_kind maps waypoint to ordinary, checkpoint to checkpoint and boundary to boundary.
  - arrival_side_context equals the exact inbound segment context and departure_side_context equals the exact outbound segment context.
  - switch_phase equals the source route point context_switch_phase.
  - switch_phase=inbound_completion requires default_wait_side=departure; outbound_dispatch requires default_wait_side=arrival.
  - Ordinary and checkpoint side contexts may differ only in G2/G3/G4, weather scope or event pool; any G0, G1 or jurisdiction difference requires point_kind=boundary.
  - Equal side contexts are allowed and make the switch a no-op.
  - For boundary, arrival/departure context digests equal the crossing contract from/to digests respectively, source route/point refs equal that contract's route/point refs, and switch phases match.
```

```yaml
contract_name: party_transit_anchor
storage: party_runtime_mutable_lifecycle
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  source_route_point_ref: required versioned_ref
  anchor_role: required enum[ordinary_waypoint, boundary_wait, shared_checkpoint]
  context_snapshot: required route_point_context_snapshot
  active_side: required enum[arrival, departure]
  allowed_departure_dependency_pins: required dependency_pin_set
  status: required enum[active, superseded, retired]
  state_version: required state_version
  created_change_set_id: required stable_id
  updated_change_set_id: required stable_id
  terminal_change_set_id: optional stable_id
invariants:
  - UNIQUE one active anchor per party and route point version.
  - anchor_role matches context_snapshot point_kind so that ordinary_waypoint maps to ordinary, boundary_wait maps to boundary and shared_checkpoint maps to checkpoint.
  - On creation and on every committed arrival, active_side is set to context_snapshot.default_wait_side.
  - ordinary_waypoint pins exactly one authored continuation departure and exposes no alternative.
  - boundary_wait pins the one departure authorized by the boundary contract; dispatch applies the shared context-switch state machine before leaving.
  - shared_checkpoint pins the default authored continuation; every additional departure is represented only by party_checkpoint_route_departure.
  - Every allowed departure originates at source_route_point_ref and is compatible with context_snapshot.departure_side_context.
  - If switch_phase=outbound_dispatch, dispatch atomically changes active_side from arrival to departure before leaving; inbound_completion anchors are already on departure side. No role changes active_side by any other rule.
  - active forbids terminal_change_set_id; superseded and retired require it.
```

```yaml
contract_name: party_route_anchor_identity
storage: party_runtime_mutable_lifecycle
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  anchor_kind: required enum[shared_checkpoint, interruption, migration_checkpoint]
  source_transit_anchor_id: optional stable_id
  source_execution_id: optional stable_id
  source_step_ordinal: optional non_negative_integer
  source_segment_progress_ppm: optional ppm
  source_dependency_pins: required dependency_pin_set
  factual_context_snapshot: required factual_spatial_context_snapshot
  status: required enum[active, inactive, superseded, destroyed]
  resolution_kind: required enum[unresolved, reusable_checkpoint, ephemeral_resolved, persistent_consequence]
  state_version: required state_version
  created_change_set_id: required stable_id
  updated_change_set_id: required stable_id
  terminal_change_set_id: optional stable_id
invariants:
  - shared_checkpoint requires source_transit_anchor_id, forbids execution/step/progress fields and uses resolution_kind=reusable_checkpoint.
  - interruption requires execution, step and progress below one million; source_transit_anchor_id is allowed only when interruption occurs exactly at that anchor.
  - migration_checkpoint requires source_dependency_pins to include the approved migration mapping, permits only source fields named by that mapping and uses resolution_kind=persistent_consequence.
  - unresolved requires anchor_kind=interruption and status=active and means only that the interruption disposition/continuation is unresolved; the scene baseline and active location binding already exist and are usable.
  - reusable_checkpoint requires anchor_kind=shared_checkpoint and status active or inactive.
  - ephemeral_resolved requires anchor_kind=interruption, status=inactive or superseded and is never usable.
  - persistent_consequence requires anchor_kind=interruption or migration_checkpoint and status active or inactive.
  - factual_context_snapshot is immutable and resolves the route-anchor scene world context without reading mutable source state.
  - Identity and its initial active location binding are committed in one transaction with preallocated IDs; no partial aggregate may persist.
  - active and inactive forbid terminal_change_set_id; superseded and destroyed require it.
```

```yaml
contract_name: party_route_anchor_location_binding
storage: party_runtime_mutable_lifecycle
identity:
  - id
fields:
  id: required stable_id
  route_anchor_id: required stable_id
  scene_baseline_id: required stable_id
  g6_instance_id: required stable_id
  position_node_id: required stable_id
  dependency_pins: required dependency_pin_set
  status: required enum[active, inactive, superseded, destroyed]
  state_version: required state_version
  activated_change_set_id: required stable_id
  deactivated_change_set_id: optional stable_id
invariants:
  - UNIQUE one active location binding per route anchor.
  - Position belongs to the declared G6 and active baseline.
  - Binding lifecycle cannot be more usable than identity lifecycle; active requires identity active, inactive requires identity active or inactive, and superseded/destroyed require the same terminal identity status.
  - active forbids deactivated_change_set_id; inactive, superseded and destroyed require it.
  - Usability follows appendix A.15.
```


## B.3. Query, readiness, preparation and immutable plans

```yaml
contract_name: physical_segment_ref
storage: embedded_value
fields:
  segment_kind: required enum[scene_edge, site_connection, world_route_segment]
  segment_id: required stable_id
invariants:
  - The discriminator matches the target relation domain.
```

```yaml
contract_name: versioned_physical_segment_ref
storage: embedded_value
fields:
  segment_ref: required physical_segment_ref
  version_pin: required version_pin
invariants:
  - world_route_segment uses an authoring version pin.
  - scene_edge and site_connection use party state-version pins.
```

```yaml
contract_name: movement_capability_context
storage: immutable_request
fields:
  cohort_membership_snapshot_pin: optional dependency_pin
  load_state_pin: optional dependency_pin
  root_carrier_attachment_pins: optional dependency_pin_set
relations:
  allowed_movement_methods: relation_set[controlled_movement_method]
  available_transport_pins: relation_set[dependency_pin]
  equipment_state_pins: relation_set[dependency_pin]
  legal_access_fact_pins: relation_set[dependency_pin]
  allowed_pace_modes: relation_set[controlled_pace_mode]
invariants:
  - Every selected plan method, carrier and pace is present in this context.
  - Empty allowed_movement_methods makes physical traversal unavailable.
```

```yaml
contract_name: expected_state_version
storage: immutable_request_member
fields:
  entity_ref: required entity_ref
  state_version: required state_version
invariants:
  - Only mutable party entities use expected state versions.
```

```yaml
contract_name: expected_state_version_set
storage: immutable_request
fields:
  entries: required snapshot_list[expected_state_version]
  canonical_digest: required sha256_hex
invariants:
  - Entries are unique and canonically ordered by entity kind and ID.
  - Empty set is allowed only for a read-only request with no mutable dependencies.
```

```yaml
contract_name: movement_target_request
storage: immutable_request_value
fields:
  target_kind: required enum[factual_spatial, knowledge_spatial]
  factual_target_ref: optional spatial_ref
  knowledge_target_ref: optional knowledge_spatial_ref
invariants:
  - factual_spatial requires factual_target_ref and forbids knowledge_target_ref.
  - knowledge_spatial requires knowledge_target_ref and forbids factual_target_ref.
  - A knowledge target is an intention/belief token and cannot be used as factual topology or an executable endpoint without a separate pinned resolution.
```

```yaml
contract_name: path_query
storage: immutable_request
fields:
  request_id: required stable_id
  party_id: required stable_id
  request_kind: required enum[ordinary, rescue, repair, migration]
  journey_owner_ref: required entity_ref
  journey_scope: required enum[world_travel, carrier_local]
  start_endpoint_ref: required movement_endpoint_ref
  target_request: optional movement_target_request
  intended_direction_id: optional stable_id
  knowledge_subject_ref: optional entity_ref
  recovery_binding_ref: optional entity_ref
  administrative_authorization_pins: optional dependency_pin_set
  knowledge_scope: required enum[factual, character_known, admin]
  cost_mode: required enum[action, time, segmented]
  capability_context: required movement_capability_context
  expected_state_versions: required expected_state_version_set
  planning_state_version: required state_version
  canonical_digest: required sha256_hex
invariants:
  - journey_owner_ref kind is actor, cohort or transport.
  - world_travel requires the owner to be a root movement owner with no active outgoing carrier attachment and with one authoritative party_journey_location.
  - carrier_local requires journey_owner_ref kind actor, an active attachment chain to the exact scene host containing start_endpoint_ref, and start_endpoint_ref kind scene_position.
  - expected_state_versions contains every party-state dependency pin in the capability, owner, attachment and start-endpoint context.
  - target_request and intended_direction_id are XOR.
  - knowledge_scope factual or admin requires factual_spatial target_request when a target is used and forbids knowledge_subject_ref.
  - knowledge_scope character_known requires knowledge_subject_ref kind actor and a knowledge_spatial target_request when a target is used; the target token belongs to that actor's knowledge layer, and expected_state_versions pins the relevant belief/knowledge state.
  - ordinary requires knowledge_scope factual or character_known, a non-stranded start_endpoint_ref, and forbids recovery_binding_ref and administrative_authorization_pins.
  - rescue requires knowledge_scope factual, start_endpoint_ref kind stranded_state, factual_spatial target_request, null intended_direction_id and recovery_binding_ref kind party_recovery_transition_binding; the target equals the binding target, the binding is active and pinned in expected_state_versions, and administrative_authorization_pins is null.
  - repair and migration require knowledge_scope admin, null recovery_binding_ref and non-empty administrative_authorization_pins that authorize the exact owner, source endpoint, target/direction and remediation kind.
  - repair and migration may start from any exact location-bearing endpoint allowed by the authorization; ordinary turn runtime cannot issue either request kind.
  - A rescue option begins with the exact executable cost step of the selected recovery binding and cannot choose a different source, target or free relocation.
  - character_known scope never exposes hidden factual routes in returned presentation fields.
  - canonical_digest covers every request field, capability relation, authorization pin and expected-state version in canonical order.
```

```yaml
contract_name: movement_blocking_reason
storage: immutable_snapshot_member
fields:
  reason_code: required stable_id
  severity: required enum[temporary, hard_block, repair_required, migration_required]
  subject_ref: optional entity_ref
  dependency_pins: optional dependency_pin_set
  player_safe_message_key: optional stable_id
  diagnostic_message: required string
invariants:
  - temporary is permitted only for temporarily_blocked readiness; hard_block, repair_required and migration_required are permitted only for data_gap readiness.
  - repair_required and migration_required identify the only authorized remediation class and never enable ordinary retry fallback.
  - player_safe_message_key cannot reveal hidden topology or state.
```

```yaml
contract_name: movement_cost_summary
storage: immutable_snapshot
fields:
  cost_kind: required enum[action, time, segmented]
  action_units_min: optional positive_integer
  action_units_max: optional positive_integer
  minutes_min: optional rational
  minutes_max: optional rational
  precision: required enum[exact, bounded, unknown]
  canonical_digest: required sha256_hex
invariants:
  - Every populated minimum is not greater than its maximum; populated minute bounds are positive reduced rationals and therefore support exact sub-minute costs.
  - action requires action-unit bounds and null minute bounds.
  - time requires minute bounds and null action-unit bounds.
  - segmented requires at least one populated dimension and may populate both.
  - exact requires equal min and max for every populated dimension.
  - bounded requires both bounds for every populated dimension.
  - unknown requires all numeric bounds null, is not executable and accompanies a blocking reason.
```

```yaml
contract_name: movement_risk_summary
storage: immutable_snapshot
fields:
  risk_class: required enum[none, low, moderate, high, extreme, unknown]
  knowledge_precision: required enum[exact, rough, rumor, hidden]
  canonical_digest: required sha256_hex
relations:
  visible_risk_tags: relation_set[controlled_risk_tag]
invariants:
  - Summary contains only information permitted by knowledge visibility.
  - knowledge_precision=hidden requires risk_class=unknown and an empty visible_risk_tags set.
  - knowledge_precision=rumor may expose only rumor-authorized tags and cannot claim risk_class=none.
  - risk_class=unknown does not mean no risk.
```

```yaml
contract_name: expansion_capacity_reservation_request
storage: immutable_command_payload
fields:
  party_id: required stable_id
  g4_id: required stable_id
  profile_ref: required versioned_ref
  slot_ref: required versioned_ref
  frontier_id: required stable_id
  selected_template_ref: required versioned_ref
  requested_units: required enum[1]
invariants:
  - This request is valid only for materialize_next_g5.
  - The selected template belongs to the slot, committed_residual_capacity is positive and one unit remains in reservable_residual_capacity under the locked snapshot.
```

```yaml
contract_name: frontier_topology_command_proposal
storage: immutable_command_proposal
fields:
  command_id: required stable_id
  frontier_id: required stable_id
  command_kind: required enum[materialize_next_g5, resolve_terminal_connection, resolve_world_route_exit_connection, create_physical_boundary]
  reservation_request: optional expansion_capacity_reservation_request
  terminal_policy_ref: optional versioned_ref
  resolved_terminal_target_ref: optional entity_ref
  resolved_terminal_target_pins: optional dependency_pin_set
  expected_state_versions: required expected_state_version_set
  idempotency_key: required stable_id
  canonical_digest: required sha256_hex
invariants:
  - expected_state_versions contains the exact frontier and, for through slots, continuation-chain versions.
  - materialize_next_g5 requires reservation_request and forbids terminal fields. For a through frontier its ordinal is below the chain terminal ordinal; for a branch frontier locked committed_residual_capacity and reservable_residual_capacity are both positive and the approved candidate set permits the reserved template.
  - Terminal commands forbid reservation_request and require terminal_policy_ref plus exact target ref/pins. A through frontier is terminal exactly at chain terminal ordinal. A branch frontier is terminal only when committed_residual_capacity is zero. Empty required candidates with positive committed/reservable capacity remain a hard gap; positive committed capacity with zero reservable capacity produces a temporary reservation block.
  - resolve_terminal_connection target is an existing party_g5_site in the same G4.
  - resolve_world_route_exit_connection target is the exact canonical exit G5 declared by the directional exit.
  - Terminal connection dependency pins include the exact target-site identity/projection rule and mandatory endpoint scene/profile dependencies; commit may create only the canonical projection and endpoint members explicitly implied by those pins.
  - create_physical_boundary target is the exact approved boundary feature template.
```

```yaml
contract_name: preparation_command_proposal
storage: immutable_command_proposal
fields:
  command_id: required stable_id
  planning_request_id: required stable_id
  planning_request_digest: required sha256_hex
  party_id: required stable_id
  proposed_member_set_digest: required sha256_hex
  expected_state_versions: required expected_state_version_set
  idempotency_key: required stable_id
  canonical_digest: required sha256_hex
relations:
  required_member_proposals: relation_set[preparation_member_proposal]
invariants:
  - planning_request_digest equals the originating path_query canonical_digest.
  - Member proposals form a finite non-empty set in contiguous ordinal order.
  - canonical_digest covers command fields and ordered member digests.
  - Proposal does not move traveller or advance time.
```

```yaml
contract_name: preparation_member_proposal
storage: immutable_command_member
fields:
  ordinal: required non_negative_integer
  member_kind: required enum[endpoint, transfer_scene]
  source_authoring_ref: required versioned_ref
  share_mode: required enum[execution_exclusive, reusable]
  dependency_pins: required dependency_pin_set
  member_digest: required sha256_hex
invariants:
  - Ordinals are contiguous from zero within a proposal.
  - Equal member_kind and dependency digest cannot appear twice.
```

```yaml
contract_name: movement_option
storage: immutable_response
fields:
  option_id: required stable_id
  planning_request_id: required stable_id
  path_query_digest: required sha256_hex
  party_id: required stable_id
  journey_owner_ref: required entity_ref
  journey_scope: required enum[world_travel, carrier_local]
  request_kind: required enum[ordinary, rescue, repair, migration]
  recovery_binding_ref: optional entity_ref
  administrative_authorization_pins: optional dependency_pin_set
  knowledge_scope: required enum[factual, character_known, admin]
  knowledge_subject_ref: optional entity_ref
  derived_from_option_id: optional stable_id
  target_request: optional movement_target_request
  intended_direction_id: optional stable_id
  resolved_factual_target_ref: optional spatial_ref
  target_resolution_dependency_pins: optional dependency_pin_set
  mechanical_readiness: required enum[ready, requires_frontier_resolution, requires_preparation, temporarily_blocked, data_gap]
  knowledge_visibility: required enum[visible, hidden, misidentified]
  executable: required boolean
  topology_command_proposal: optional frontier_topology_command_proposal
  preparation_command_proposal: optional preparation_command_proposal
  cost_summary: required movement_cost_summary
  risk_summary: required movement_risk_summary
  knowledge_basis: required enum[objective, exact, rough, rumor, inferred]
  expected_state_versions: required expected_state_version_set
  canonical_digest: required sha256_hex
relations:
  blocking_reasons: relation_set[movement_blocking_reason]
  proposed_steps: relation_set[route_plan_step_proposal]
invariants:
  - planning_request_id, path_query_digest, party_id, request kind, journey owner/scope, recovery/administrative authorization, knowledge_scope and knowledge_subject_ref exactly copy the originating path_query.
  - knowledge_scope=character_known requires knowledge_subject_ref kind actor; factual and admin forbid it.
  - ready requires executable true, non-empty steps, empty blocking reasons and null command proposals.
  - target_request and intended_direction_id are copied from the path query and remain XOR; direction-based options have null factual target fields.
  - A ready target-based option requires resolved_factual_target_ref and target_resolution_dependency_pins. For factual_spatial request the resolved target equals the requested factual target; for knowledge_spatial request the mapping is pinned and may differ without changing the knowledge token.
  - requires_frontier_resolution requires executable false, topology proposal, null preparation proposal and empty steps.
  - requires_preparation requires executable false, preparation proposal, null topology proposal and empty steps.
  - temporarily_blocked requires executable false, null command proposals, empty steps and only temporary blocking reasons with at least one row.
  - data_gap requires executable false, null command proposals, empty steps and at least one hard_block, repair_required or migration_required reason.
  - knowledge visibility never changes mechanical readiness; player-facing projection exposes a selectable token only for visible or intentionally misidentified options, while hidden options remain internal to factual/admin or bounded navigation resolution.
  - derived_from_option_id, when present, references an option with the same planning_request_id and path_query_digest, request kind, party, owner, scope, authorization, target/direction and knowledge subject, invalidated by exactly one committed preparation or topology command.
  - canonical_digest covers request kind and authorization binding, request/party/owner binding, target request and factual resolution, readiness, visibility, ordered reasons/steps/proposals, costs, risks and expected state versions.
```

```yaml
contract_name: route_plan_step_proposal
storage: immutable_response_member
fields:
  ordinal: required non_negative_integer
  step_kind: required enum[immediate_action, timed_activity, timed_traversal]
  departure_endpoint_ref: required movement_endpoint_ref
  arrival_endpoint_ref: required movement_endpoint_ref
  static_contract_snapshot: required route_plan_step_static_snapshot
invariants:
  - Ordinals are contiguous from zero.
  - Endpoints satisfy the step-kind and physical-segment matrix, including the single-owner endpoint-transition rules of party_route_plan_step.
  - A proposal marked ready contains no unresolved authoring endpoint.
```

```yaml
contract_name: endpoint_contract_snapshot
storage: immutable_snapshot
fields:
  endpoint_ref: required movement_endpoint_ref
  dependency_pins: required dependency_pin_set
  resolved_scene_baseline_id: optional stable_id
  resolved_position_id: optional stable_id
  resolved_transit_anchor_id: optional stable_id
  resolved_travel_state_id: optional stable_id
  route_point_context_digest: optional sha256_hex
  canonical_digest: required sha256_hex
invariants:
  - scene_position requires resolved_scene_baseline_id and resolved_position_id and forbids transit-anchor, travel-state and route-point-context fields.
  - site_connection_endpoint requires resolved_scene_baseline_id and resolved_position_id, pins the endpoint binding, and forbids transit-anchor, travel-state and route-point-context fields.
  - world_route_endpoint requires resolved_scene_baseline_id and resolved_position_id, pins the route endpoint binding, and forbids transit-anchor, travel-state and route-point-context fields.
  - transit_anchor requires resolved_transit_anchor_id equal to endpoint_ref.endpoint_id and route_point_context_digest and forbids scene, position and travel-state fields.
  - route_anchor_scene requires resolved_scene_baseline_id and resolved_position_id plus anchor identity/binding pins and forbids transit-anchor, travel-state and route-point-context fields.
  - stranded_state requires resolved_travel_state_id equal to endpoint_ref.endpoint_id and forbids all scene, position, transit-anchor and route-point-context fields.
  - Every resolved party entity state version is included in dependency_pins.
  - canonical_digest covers endpoint_ref, all resolved fields and dependency pins.
```

```yaml
contract_name: physical_segment_spatial_context_snapshot
storage: immutable_snapshot
fields:
  context_mode: required enum[fixed_world_context, carrier_derived_context]
  segment_ref: required versioned_physical_segment_ref
  fixed_context: optional factual_spatial_context_snapshot
  root_carrier_ref: optional entity_ref
  attachment_dependency_pins: optional dependency_pin_set
  resolution_policy_version: optional authoring_version
  segment_dependency_pins: required dependency_pin_set
  canonical_digest: required sha256_hex
invariants:
  - fixed_world_context requires fixed_context and forbids carrier fields.
  - carrier_derived_context requires root_carrier_ref, attachment_dependency_pins and resolution_policy_version, requires root_carrier_ref kind transport and forbids fixed_context.
  - carrier_derived_context is allowed only for a scene_edge inside an attached transport scene; actor/cohort attachment chains resolve to that root transport.
  - This static snapshot pins identity and resolution policy, not a future carrier location; each run/attempt/interval pins the actually resolved factual context at execution time.
```

```yaml
contract_name: action_step_static_snapshot
storage: immutable_snapshot
fields:
  action_contract_ref: required versioned_ref
  relation_ref: optional entity_ref
  action_units: required positive_integer
  movement_capacity_units: optional positive_integer
  mode_transition_contract_ref: optional versioned_ref
  completion_effect_contract_ref: optional versioned_ref
  dependency_pins: required dependency_pin_set
  canonical_digest: required sha256_hex
invariants:
  - Referenced contract has action cost.
  - relation_ref, when present, targets an action-cost scene_edge or site_connection, requires movement_capacity_units and includes the exact relation plus actor/cohort/transport footprint rule in dependency_pins; null relation_ref forbids movement_capacity_units.
  - An unassisted actor uses one unit under the pinned baseline footprint rule; cohort/transport units come only from an approved formation/carrier profile.
  - Completion effect has this step as its only owner.
```

```yaml
contract_name: timed_activity_static_snapshot
storage: immutable_snapshot
fields:
  activity_contract_ref: required versioned_ref
  planned_total_minutes: required positive_integer
  mode_transition_contract_ref: optional versioned_ref
  completion_effect_contract_ref: optional versioned_ref
  dependency_pins: required dependency_pin_set
  canonical_digest: required sha256_hex
invariants:
  - Referenced contract has time cost and no physical segment progress.
  - Completion effect has this step as its only owner.
```

```yaml
contract_name: timed_traversal_static_snapshot
storage: immutable_snapshot
fields:
  physical_segment_ref: required versioned_physical_segment_ref
  selected_movement_method_id: required stable_id
  movement_carrier_ref: required entity_ref
  movement_capacity_units: required positive_integer
  environment_profile_ref: required versioned_ref
  orientation_profile_ref: required versioned_ref
  cost_profile_ref: required versioned_ref
  recheck_policy_ref: required versioned_ref
  factual_context_snapshot: required physical_segment_spatial_context_snapshot
  dependency_pins: required dependency_pin_set
  canonical_digest: required sha256_hex
invariants:
  - movement_carrier_ref kind is actor, cohort or transport.
  - The referenced physical segment has cost_kind=time.
  - Selected method is allowed by the pinned capability context; movement_capacity_units is deterministically derived from the selected actor/cohort/transport footprint profile included in dependency_pins.
  - Physical segment, profiles and context pins are mutually consistent.
```

```yaml
contract_name: route_plan_step_static_snapshot
storage: immutable_snapshot
fields:
  snapshot_kind: required enum[immediate_action, timed_activity, timed_traversal]
  action_snapshot: optional action_step_static_snapshot
  activity_snapshot: optional timed_activity_static_snapshot
  traversal_snapshot: optional timed_traversal_static_snapshot
  canonical_digest: required sha256_hex
invariants:
  - Exactly one payload matching snapshot_kind is populated.
  - canonical_digest includes the populated payload.
```

```yaml
contract_name: preparation_snapshot
storage: party_runtime_immutable
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  planning_request_id: required stable_id
  planning_request_digest: required sha256_hex
  immutable_members_digest: required sha256_hex
  canonical_digest: required sha256_hex
  created_at_turn: required non_negative_integer
  created_change_set_id: required stable_id
relations:
  members: relation_set[preparation_snapshot_member]
invariants:
  - Members are finite, non-empty, contiguous by ordinal and immutable.
  - Every member is fully materialized, location-bearing where applicable and dependency-valid at snapshot creation.
  - UNIQUE planning_request_id, planning_request_digest and immutable_members_digest.
  - canonical_digest covers party, request ID/digest, ordered member digests and creation-independent immutable fields.
```

```yaml
contract_name: preparation_snapshot_member
storage: party_runtime_immutable_relation
identity:
  - preparation_snapshot_id
  - ordinal
fields:
  preparation_snapshot_id: required stable_id
  ordinal: required non_negative_integer
  member_kind: required enum[endpoint, transfer_scene]
  source_authoring_ref: required versioned_ref
  resolved_endpoint_snapshot: optional endpoint_contract_snapshot
  resolved_scene_baseline_id: optional stable_id
  resolved_g6_instance_id: optional stable_id
  resolved_position_id: optional stable_id
  dependency_pins: required dependency_pin_set
  share_mode: required enum[execution_exclusive, reusable]
  member_digest: required sha256_hex
invariants:
  - endpoint requires resolved_endpoint_snapshot and forbids scene fields.
  - transfer_scene requires all scene fields and forbids resolved_endpoint_snapshot; the position belongs to the declared G6 and active scene baseline.
  - Ordinals are contiguous from zero.
  - Duplicate member_kind plus dependency-pin digest is forbidden within one snapshot.
  - member_digest covers kind, source, resolved payload, share mode and dependency pins.
```

```yaml
contract_name: preparation_claim
storage: party_runtime_mutable
identity:
  - id
fields:
  id: required stable_id
  preparation_snapshot_id: required stable_id
  route_plan_execution_id: required stable_id
  claim_status: required enum[reserved, consumed, released, failed]
  state_version: required state_version
  reserved_change_set_id: required stable_id
  terminal_change_set_id: optional stable_id
invariants:
  - UNIQUE one claim per route_plan_execution_id.
  - The execution plan references the same preparation_snapshot_id and digest; plans without a preparation snapshot have no claim.
  - If any snapshot member is execution_exclusive, at most one reserved claim may reference that snapshot; a snapshot whose members are all reusable permits multiple reserved claims.
  - reserved is required for every nonterminal execution whose plan has a preparation snapshot.
  - completed execution terminates the claim as consumed; aborted or superseded execution terminates it as released; dependency-validation failure terminates it as failed and aborts the execution.
  - consumed, released and failed require terminal_change_set_id; reserved forbids it.
  - Only reserved may transition, exactly once, to one terminal claim status.
```

```yaml
contract_name: party_route_plan
storage: party_runtime_immutable_payload_with_lifecycle
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  journey_owner_ref: required entity_ref
  journey_scope: required enum[world_travel, carrier_local]
  request_kind: required enum[ordinary, rescue, repair, migration]
  recovery_binding_ref: optional entity_ref
  administrative_authorization_pins: optional dependency_pin_set
  planning_request_id: required stable_id
  path_query_digest: required sha256_hex
  option_id: required stable_id
  knowledge_scope: required enum[factual, character_known, admin]
  knowledge_subject_ref: optional entity_ref
  source_endpoint_snapshot: required endpoint_contract_snapshot
  target_request: optional movement_target_request
  resolved_factual_target_ref: optional spatial_ref
  target_resolution_dependency_pins: optional dependency_pin_set
  intended_direction_id: optional stable_id
  world_revision_id: required stable_id
  catalog_digest: required sha256_hex
  planning_algorithm_version: required authoring_version
  planning_state_version: required state_version
  planning_context_dependency_pins: required dependency_pin_set
  preparation_snapshot_id: optional stable_id
  preparation_snapshot_digest: optional sha256_hex
  canonical_serialization_digest: required sha256_hex
  status: required enum[ready, superseded, retired]
  superseded_by_plan_id: optional stable_id
  retired_reason_code: optional stable_id
  lifecycle_state_version: required state_version
  created_change_set_id: required stable_id
  lifecycle_change_set_id: required stable_id
  created_at_turn: required non_negative_integer
relations:
  steps: relation_set[party_route_plan_step]
invariants:
  - journey_owner_ref kind is actor, cohort or transport.
  - world_travel requires a root owner with no active outgoing attachment; carrier_local requires an actor owner, an active attachment chain and a scene-position source inside that carrier scene.
  - planning_request_id, path_query_digest, option_id, request kind, recovery/administrative authorization, owner, scope, knowledge_scope, knowledge subject, target request and intended direction equal the selected ready movement_option and its originating path_query.
  - knowledge_scope=character_known requires knowledge_subject_ref kind actor; factual and admin forbid it. A knowledge_spatial target request is valid only in character_known scope.
  - ordinary forbids recovery_binding_ref and administrative_authorization_pins; rescue requires recovery_binding_ref and forbids administrative authorization; repair/migration require administrative_authorization_pins and forbid recovery_binding_ref.
  - A stranded source is valid only for rescue, repair or migration. Rescue target and first cost step equal the pinned recovery binding exactly.
  - planning_state_version is the pinned version of the party planning/read-model projection; planning_context_dependency_pins covers the owner, capability context, source endpoint, knowledge subject/state where applicable and every mutable planning dependency accepted from the path query.
  - target_request and intended_direction_id are XOR.
  - A target-based plan requires resolved_factual_target_ref and target_resolution_dependency_pins; a direction-based plan forbids both.
  - For factual_spatial target_request, resolved_factual_target_ref equals the requested factual target. For knowledge_spatial target_request, the original knowledge token is preserved and its factual resolution is separately pinned.
  - Preparation ID and digest are both null or both populated and equal one immutable preparation snapshot whose planning_request_id and planning_request_digest match this plan.
  - Steps are non-empty and immutable.
  - canonical_serialization_digest covers immutable plan payload, ordered steps and all nested snapshot digests; it excludes status, successor, retirement and lifecycle audit fields.
  - ready forbids superseded_by_plan_id and retired_reason_code.
  - superseded requires superseded_by_plan_id and forbids retired_reason_code; the successor plan source endpoint snapshot equals the predecessor execution's exact handoff endpoint snapshot and points back through its execution supersession link.
  - retired requires retired_reason_code and forbids superseded_by_plan_id.
  - Lifecycle transition is only ready to superseded or ready to retired; terminal lifecycle states never change again and the plan-supersession graph is acyclic.
  - Only lifecycle fields may mutate; every lifecycle mutation increments lifecycle_state_version and updates lifecycle_change_set_id.
  - source_endpoint_snapshot equals the first step departure snapshot.
  - For target-based plans, the last arrival snapshot resolves inside resolved_factual_target_ref under the pinned world revision.
  - Every timed_traversal step movement_carrier_ref equals journey_owner_ref.
  - Any mode transition that changes the plan owner's root-authoritative versus attached status is the final plan step; continuation uses a new plan and the post-transition owner/scope from its exact handoff endpoint.
  - carrier_local plan contains no site_connection or world_route_segment traversal.
```

```yaml
contract_name: party_route_plan_step
storage: party_runtime_immutable_relation
identity:
  - route_plan_id
  - ordinal
fields:
  route_plan_id: required stable_id
  ordinal: required non_negative_integer
  step_kind: required enum[immediate_action, timed_activity, timed_traversal]
  departure_endpoint_snapshot: required endpoint_contract_snapshot
  arrival_endpoint_snapshot: required endpoint_contract_snapshot
  static_contract_snapshot: required route_plan_step_static_snapshot
invariants:
  - Ordinals are contiguous from zero.
  - step_kind equals static_contract_snapshot.snapshot_kind.
  - For an immediate_action with different departure and arrival endpoints, exactly one endpoint-transition owner exists: either its action snapshot relation_ref resolves one exact action-cost scene_edge/site_connection with matching endpoints, or its pinned completion_effect_contract declares that exact endpoint transformation. A relation-moving step may still have other completion effects, but they cannot perform a second endpoint change.
  - For a timed_activity, departure and arrival endpoints are identical unless its pinned completion_effect_contract declares the one exact endpoint transformation; the activity itself has no physical-segment progress.
  - For a timed_traversal, departure and arrival snapshots equal the source and target of the one pinned physical segment, and movement_carrier_ref equals the parent plan journey_owner_ref.
  - Every adjacent pair has identical previous-arrival and next-departure endpoint snapshot digests. Any endpoint transformation owned by a step completion effect is already represented in that step's arrival snapshot; it never authorizes a discontinuity between steps.
  - Endpoints obey appendix A.11 and section 9.7.
```


## B.4. Execution, time, dynamic rechecks and recovery

```yaml
contract_name: transition_environment_profile
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  environment_class_id: required stable_id
  permanent_cost_basis_id: required stable_id
  dynamic_environment_rule_set_ref: required versioned_ref
  status: required enum[approved, deprecated, retired]
  provenance_ref: required stable_id
invariants:
  - Permanent geometry and normal surface contributions are already represented by physical segment base_minutes.
  - Dynamic rule set resolves at most one composite environment factor.
```

```yaml
contract_name: movement_method_cost_profile
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  baseline_movement_method_id: required stable_id
  status: required enum[approved, deprecated, retired]
  provenance_ref: required stable_id
relations:
  options: relation_set[movement_method_cost_option]
invariants:
  - Exactly one baseline option exists.
  - Missing selected method blocks traversal.
```

```yaml
contract_name: movement_method_cost_option
storage: world_base_relation
identity:
  - profile_id
  - profile_version
  - movement_method_id
fields:
  profile_id: required stable_id
  profile_version: required authoring_version
  movement_method_id: required stable_id
  cost_mode: required enum[baseline, rational_factor]
  factor_numerator: optional positive_integer
  factor_denominator: optional positive_integer
invariants:
  - baseline matches profile baseline method and has null factor.
  - rational_factor requires both positive factor fields.
```

```yaml
contract_name: dynamic_recheck_policy
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  policy_kind: required enum[segment_once, fixed_progress_slices, explicit_progress_points]
  progress_slice_ppm: optional positive_integer
  status: required enum[approved, deprecated, retired]
  provenance_ref: required stable_id
relations:
  explicit_progress_points: relation_set[controlled_progress_point]
invariants:
  - segment_once forbids slice and explicit points.
  - fixed_progress_slices requires progress_slice_ppm in 1..1000000 and forbids explicit points.
  - explicit_progress_points requires a finite strictly increasing set inside 1..999999 and null slice.
  - Slicing policy cannot change final duration under identical factor sequence.
```

```yaml
contract_name: action_contract
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  action_kind_id: required stable_id
  cost_kind: required enum[action]
  failure_location_policy: required enum[preserve_departure]
  failure_execution_transition: required enum[waiting_at_anchor, aborted]
  status: required enum[approved, deprecated, retired]
  provenance_ref: required stable_id
relations:
  allowed_departure_endpoint_kinds: relation_set[controlled_endpoint_kind]
  allowed_arrival_endpoint_kinds: relation_set[controlled_endpoint_kind]
invariants:
  - Contract cannot advance physical segment progress.
  - blocked or failed action preserves the exact departure endpoint in this contract version.
```

```yaml
contract_name: activity_contract
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  activity_kind_id: required stable_id
  cost_kind: required enum[time]
  interruption_policy_ref: required versioned_ref
  failure_time_retention_policy: required enum[retain_committed_elapsed]
  failure_execution_transition: required enum[waiting_at_anchor, aborted]
  status: required enum[approved, deprecated, retired]
  provenance_ref: required stable_id
relations:
  allowed_endpoint_kinds: relation_set[controlled_endpoint_kind]
invariants:
  - Activity has no physical segment progress.
  - Failure never rolls back already committed exact elapsed time and preserves the departure endpoint.
```

```yaml
contract_name: movement_mode_transition_contract
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  transition_kind: required enum[board, disembark, load, unload, transfer_control, change_cohort_formation]
  cost_kind: required enum[action, time]
  source_carrier_kind: optional enum[actor, cohort, transport]
  target_carrier_kind: optional enum[actor, cohort, transport]
  status: required enum[approved, deprecated, retired]
  provenance_ref: required stable_id
invariants:
  - board requires source_carrier_kind actor or cohort and target_carrier_kind transport.
  - disembark requires source_carrier_kind transport and target_carrier_kind actor or cohort.
  - load and unload require both carrier-kind fields null; cargo/source/target identities belong to the owning completion effect.
  - transfer_control requires both carrier-kind fields transport.
  - change_cohort_formation requires both carrier-kind fields cohort.
  - Contract changes attachment, formation or control only through its owning step completion effect.
  - Any transition whose completion changes the current plan owner's root-authoritative versus attached status is permitted only on the final step; the contract never transfers an active execution to another owner.
  - Contract contains no independent completion-effect reference.
```

```yaml
contract_name: completion_effect_contract
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  effect_kind_id: required stable_id
  atomicity_scope_id: required stable_id
  status: required enum[approved, deprecated, retired]
  provenance_ref: required stable_id
relations:
  allowed_write_targets: relation_set[controlled_write_target]
invariants:
  - Every runtime effect is owned by exactly one plan step snapshot.
  - Effect cannot select new semantic candidates during commit.
```

```yaml
contract_name: interruption_anchor_policy
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  anchor_kind: required enum[shared_checkpoint, interruption]
  scene_template_ref: required versioned_ref
  source_progress_rule_id: required stable_id
  reuse_policy_id: required stable_id
  status: required enum[approved, deprecated, retired]
  provenance_ref: required stable_id
invariants:
  - Policy resolves a finite authored scene candidate set.
  - Empty required scene candidate strands the traveller; it does not choose another anchor.
```

```yaml
contract_name: party_route_plan_execution
storage: party_runtime_mutable
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  route_plan_id: required stable_id
  journey_owner_ref: required entity_ref
  journey_scope: required enum[world_travel, carrier_local]
  status: required enum[planned, active, waiting_at_anchor, suspended_at_scene, stranded_in_transit, completed, aborted, superseded]
  current_step_ordinal: optional non_negative_integer
  current_endpoint_ref: optional movement_endpoint_ref
  active_travel_state_id: optional stable_id
  active_activity_execution_id: optional stable_id
  suspension_endpoint_ref: optional movement_endpoint_ref
  final_location_snapshot: optional journey_location_snapshot
  abort_reason_code: optional stable_id
  supersedes_execution_id: optional stable_id
  superseded_by_execution_id: optional stable_id
  started_at_turn: optional non_negative_integer
  terminal_at_turn: optional non_negative_integer
  state_version: required state_version
  updated_change_set_id: required stable_id
invariants:
  - Field-state combination exactly matches appendix A.4.
  - Every status transition is listed in appendix A.4.1 and appends exactly one event matching the injective mapping in appendix A.4.2 in the same change set.
  - Owner and scope equal the immutable plan.
  - current_endpoint_ref equals the endpoint dictated by the immutable current step and completed effects.
  - suspension_endpoint_ref, when populated, is a usable route_anchor_scene.
  - UNIQUE one execution per route_plan_id.
  - planned requires null started_at_turn and terminal_at_turn; every other nonterminal status requires started_at_turn and null terminal_at_turn.
  - completed, aborted and superseded require started_at_turn and terminal_at_turn not earlier than started_at_turn.
  - aborted requires abort_reason_code; other statuses forbid it.
  - superseded requires superseded_by_execution_id; the successor supersedes_execution_id points back to this execution.
  - supersedes_execution_id is null only for an initial execution; when populated, the predecessor is superseded, points back through superseded_by_execution_id and its final source snapshot equals this plan source snapshot.
  - Successor source endpoint snapshot equals the predecessor event/final-location handoff_endpoint_snapshot according to the transition; comparison of unlike snapshot types is forbidden.
  - Every execution event and final/suspension snapshot uses the ownership mode matching the post-transition party location/attachment state; a root/attached mode switch is legal only on the terminal mode-transition change set described by the immutable step.
  - Supersession links are one-to-one and acyclic.
  - At most one nonterminal world_travel execution exists per root owner.
  - A nonterminal world_travel execution owner has no active outgoing carrier attachment; this applies to actor-to-cohort, actor-to-transport and cohort-to-transport chains.
  - carrier_local requires journey_owner_ref kind actor, and at most one nonterminal carrier_local execution exists per actor.
  - The carrier-local actor has an active attachment chain whose root carrier and scene host match every current endpoint and execution-context snapshot.

```

```yaml
contract_name: party_route_plan_execution_event
storage: party_runtime_append_only
identity:
  - execution_id
  - event_ordinal
fields:
  execution_id: required stable_id
  event_ordinal: required non_negative_integer
  event_kind: required enum[planned, activated, step_progressed, step_paused, step_completed, wait_started, suspended, stranded, resumed, completed, aborted, superseded]
  from_status: optional enum[planned, active, waiting_at_anchor, suspended_at_scene, stranded_in_transit, completed, aborted, superseded]
  to_status: required enum[planned, active, waiting_at_anchor, suspended_at_scene, stranded_in_transit, completed, aborted, superseded]
  step_ordinal: required non_negative_integer
  location_snapshot: required journey_location_snapshot
  causal_result_ref: optional entity_ref
  change_set_id: required stable_id
  idempotency_record_id: required stable_id
  occurred_at_turn: required non_negative_integer
invariants:
  - Ordinals are contiguous from zero and event ordinal zero has event_kind planned, null from_status, to_status planned and null causal_result_ref.
  - Every event after ordinal zero requires non-null from_status.
  - Event kind, statuses and run/result gate match exactly one row of appendix A.4.2 and an allowed transition of appendix A.4.1.
  - step_progressed, step_paused, step_completed, wait_started, suspended, stranded and completed require the exact causal run/result ref; activated, resumed and planned forbid it; aborted and superseded permit it only when a committed run/result caused the transition.
  - location_snapshot presence and value match the post-transition execution field-state matrix.
  - change_set_id is the same atomic change set that changed the execution row and, when present, committed causal_result_ref.
  - Event is immutable.
```

```yaml
contract_name: party_action_step_run
storage: party_runtime_append_only
identity:
  - id
fields:
  id: required stable_id
  execution_id: required stable_id
  plan_step_ordinal: required non_negative_integer
  attempt_ordinal: required non_negative_integer
  action_snapshot: required action_step_static_snapshot
  departure_endpoint_snapshot: required endpoint_contract_snapshot
  arrival_endpoint_snapshot: required endpoint_contract_snapshot
  execution_context_snapshot: required factual_spatial_context_snapshot
  result_kind: required enum[completed, blocked, failed]
  result_code: required stable_id
  result_change_set_id: required stable_id
  idempotency_record_id: required stable_id
  occurred_at_turn: required non_negative_integer
invariants:
  - UNIQUE by execution, plan step and attempt ordinal.
  - Attempt ordinals are contiguous from zero.
  - At most one completed run exists per execution and step.
  - action_snapshot equals the immutable plan-step action snapshot.
  - execution_context_snapshot is resolved at commit from the endpoint or current root carrier and is pinned by the same change set.
  - blocked and failed runs keep arrival endpoint equal to departure endpoint.
  - Run is terminal and immutable; blocked or retryable failed runs do not advance the step.
```

```yaml
contract_name: party_timed_activity_execution
storage: party_runtime_mutable
identity:
  - id
fields:
  id: required stable_id
  route_plan_execution_id: required stable_id
  plan_step_ordinal: required non_negative_integer
  series_ordinal: required non_negative_integer
  predecessor_activity_execution_id: optional stable_id
  activity_snapshot: required timed_activity_static_snapshot
  original_total_minutes: required positive_integer
  cumulative_elapsed_numerator: required non_negative_integer
  cumulative_elapsed_denominator: required positive_integer
  remaining_time_numerator: required non_negative_integer
  remaining_time_denominator: required positive_integer
  next_attempt_ordinal: required non_negative_integer
  status: required enum[active, paused, completed, failed, aborted]
  state_version: required state_version
  updated_change_set_id: required stable_id
  terminal_change_set_id: optional stable_id
invariants:
  - activity_snapshot equals the immutable plan-step activity snapshot and original_total_minutes equals its planned_total_minutes.
  - UNIQUE route_plan_execution_id, plan_step_ordinal and series_ordinal.
  - The initial row has series_ordinal zero and null predecessor. A later row requires series_ordinal=predecessor.series_ordinal+1, references a failed predecessor for the same route execution and step, and copies its exact cumulative elapsed and remaining time as the new initial state.
  - Every series row starts with next_attempt_ordinal zero; attempt ordinals are local to that activity-execution row and never continue across a failed predecessor.
  - One failed predecessor has at most one successor; lineage is acyclic and terminal rows never reactivate.
  - Cumulative and remaining fractions are reduced, use exact rational minutes and sum exactly to original_total_minutes.
  - next_attempt_ordinal equals the number of committed attempts.
  - active and paused require positive remaining time and forbid terminal_change_set_id.
  - completed requires zero remaining time and terminal_change_set_id.
  - failed and aborted require terminal_change_set_id; their remaining time may be positive. A failed row may receive a successor only when its pinned activity contract selected waiting_at_anchor.
  - Latest attempt mapping is exact; progressed or blocked leaves status active, paused sets paused, completed sets completed and failed sets failed, while explicit abort between attempts sets aborted without fabricating an attempt.
  - The route execution field active_activity_execution_id references this row only while route execution status is active on the same timed-activity step and this activity status is active or paused. When a blocked attempt moves the route execution to waiting_at_anchor, that field is cleared but this nonterminal row is reused on resume. When a failed attempt moves the route execution to waiting_at_anchor, resume creates the next linked series row instead.
  - UNIQUE one nonterminal activity execution per journey execution and step across the full series.
```

```yaml
contract_name: party_timed_activity_attempt
storage: party_runtime_append_only
identity:
  - activity_execution_id
  - attempt_ordinal
fields:
  activity_execution_id: required stable_id
  attempt_ordinal: required non_negative_integer
  remaining_before_numerator: required positive_integer
  remaining_before_denominator: required positive_integer
  planned_time_numerator: required positive_integer
  planned_time_denominator: required positive_integer
  actual_time_numerator: required non_negative_integer
  actual_time_denominator: required positive_integer
  remaining_after_numerator: required non_negative_integer
  remaining_after_denominator: required positive_integer
  cumulative_time_before_numerator: required non_negative_integer
  cumulative_time_before_denominator: required positive_integer
  cumulative_time_after_numerator: required non_negative_integer
  cumulative_time_after_denominator: required positive_integer
  crossed_whole_minute_boundaries: required non_negative_integer
  clock_commit_mode: required enum[direct_party_clock, shared_root_transport_clock]
  synchronized_time_slice_result_id: optional stable_id
  execution_context_snapshot: required factual_spatial_context_snapshot
  result_kind: required enum[progressed, completed, paused, blocked, failed]
  result_code: required stable_id
  dynamic_dependency_pins: required dependency_pin_set
  result_change_set_id: required stable_id
  idempotency_record_id: required stable_id
  occurred_at_turn: required non_negative_integer
invariants:
  - No active/open result exists and all rational values are reduced.
  - planned time is not greater than remaining-before time; actual time is between zero and planned time.
  - remaining after equals remaining before minus actual time; cumulative after equals cumulative before plus actual time.
  - progressed requires positive actual time and positive remaining-after time.
  - completed requires positive actual time and zero remaining-after time.
  - paused permits zero or positive actual time and requires positive remaining-after time.
  - blocked requires zero actual time, unchanged remaining/cumulative time and zero crossed whole-minute boundaries.
  - failed follows retain_committed_elapsed; already committed exact time is never rolled back.
  - direct_party_clock forbids synchronized_time_slice_result_id; its result change set advances the exact party timestamp by actual_time and crossed_whole_minute_boundaries is derived from the before/after absolute minute indexes.
  - shared_root_transport_clock requires synchronized_time_slice_result_id and crossed_whole_minute_boundaries zero; the referenced synchronized slice owns the one exact party-clock update.
  - execution_context_snapshot is the endpoint context or the current pinned root-transport context for the exact slice.
  - Attempt ordinals are contiguous from zero and match the activity execution next_attempt_ordinal before commit.
```

```yaml
contract_name: traveller_travel_state
storage: party_runtime_mutable_history_preserving
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  route_plan_execution_id: required stable_id
  plan_step_ordinal: required non_negative_integer
  movement_carrier_ref: required entity_ref
  segment_progress_ppm: required ppm
  cumulative_actual_time_numerator: required non_negative_integer
  cumulative_actual_time_denominator: required positive_integer
  next_interval_ordinal: required non_negative_integer
  intended_direction_id: optional stable_id
  navigation_state: required enum[on_course, deviating, lost]
  last_confirmed_endpoint_ref: required movement_endpoint_ref
  last_dynamic_snapshot_digest: optional sha256_hex
  status: required enum[active, paused_in_transit, stranded_in_transit, closed]
  stranded_reason_code: optional stable_id
  closed_result: optional enum[completed, interrupted_to_anchor, superseded]
  state_version: required state_version
  updated_change_set_id: required stable_id
  closed_change_set_id: optional stable_id
invariants:
  - movement_carrier_ref kind is actor, cohort or transport and equals the immutable traversal-step carrier.
  - New state starts with progress zero, exact cumulative time zero and next_interval_ordinal zero.
  - last_confirmed_endpoint_ref is the real departure/last reached endpoint and never has kind stranded_state.
  - active and paused_in_transit require progress below one million and forbid stranded_reason_code, closed_result and closed_change_set_id.
  - stranded_in_transit requires progress below one million and stranded_reason_code and forbids closed fields.
  - closed requires closed_result and closed_change_set_id.
  - closed_result=completed requires progress one million and null stranded_reason_code.
  - closed_result=interrupted_to_anchor requires progress below one million and null stranded_reason_code.
  - closed_result=superseded requires progress below one million and stranded_reason_code because only exact stranded recovery may supersede an in-transit state.
  - closed state cannot be reactivated.
  - UNIQUE one active, paused or stranded state per execution step.
```

```yaml
contract_name: resolved_rational_factor
storage: immutable_snapshot_member
fields:
  factor_kind: required enum[method, environment, load, body, pace]
  numerator: required positive_integer
  denominator: required positive_integer
  source_dependency_pins: required dependency_pin_set
  canonical_digest: required sha256_hex
invariants:
  - At most one factor of each kind appears in one dynamic snapshot.
  - environment is the one approved composite or worst-applicable factor.
  - Fraction is stored in reduced form.
```

```yaml
contract_name: resolved_additive_delay
storage: immutable_snapshot_member
fields:
  delay_kind: required enum[legal_wait, queue, portal_operation, transfer_wait, hazard_delay, navigation_delay, other]
  application_scope: required enum[interval_once, segment_once, step_once, synchronized_slice_once]
  occurrence_key: required stable_id
  other_delay_kind_id: optional stable_id
  exact_minutes_numerator: required non_negative_integer
  exact_minutes_denominator: required positive_integer
  source_dependency_pins: required dependency_pin_set
  canonical_digest: required sha256_hex
invariants:
  - Delay is additive and cannot be encoded as a multiplicative factor.
  - delay_kind=other requires an approved controlled other_delay_kind_id included in source_dependency_pins; every named delay kind forbids it.
  - occurrence_key is unique within the owning operation scope and is consumed at most once under idempotency.
  - segment_once and step_once cannot recur in later technical slices; interval_once belongs to the exact recheck result; synchronized_slice_once is owned by one synchronized slice.
  - Zero delay is omitted unless required for an auditable explicit outcome.
```

```yaml
contract_name: traversal_dynamic_snapshot
storage: immutable_snapshot
fields:
  snapshot_turn: required non_negative_integer
  exact_game_timestamp: required game_timestamp
  runtime_calendar_snapshot_ref: required entity_ref
  weather_state_ref: optional entity_ref
  light_state_ref: optional entity_ref
  environment_overlay_state_ref: optional entity_ref
  portal_access_state_ref: optional entity_ref
  carrier_condition_ref: optional entity_ref
  body_state_ref: optional entity_ref
  load_state_ref: optional entity_ref
  pace_mode_id: required stable_id
  selected_movement_method_id: required stable_id
  resolved_factual_context_snapshot: required factual_spatial_context_snapshot
  resolved_factors: required snapshot_list[resolved_rational_factor]
  additive_delays: required snapshot_list[resolved_additive_delay]
  dependency_pins: required dependency_pin_set
  canonical_digest: required sha256_hex
invariants:
  - Factor kinds are unique and additive delay occurrence_key values are unique.
  - resolved_factual_context_snapshot equals the static fixed context or the exact current root-carrier context resolved under the pinned carrier-derived policy.
  - Snapshot contains no raw mutable version string outside dependency pins.
  - Snapshot is captured at interval start and immutable.
```

```yaml
contract_name: party_traversal_interval_result
storage: party_runtime_append_only
identity:
  - route_plan_execution_id
  - plan_step_ordinal
  - interval_ordinal
fields:
  id: required stable_id
  route_plan_execution_id: required stable_id
  plan_step_ordinal: required non_negative_integer
  interval_ordinal: required non_negative_integer
  progress_before_ppm: required ppm
  planned_progress_after_ppm: required ppm
  actual_progress_after_ppm: required ppm
  planned_time_numerator: required positive_integer
  planned_time_denominator: required positive_integer
  actual_time_numerator: required non_negative_integer
  actual_time_denominator: required positive_integer
  cumulative_time_before_numerator: required non_negative_integer
  cumulative_time_before_denominator: required positive_integer
  cumulative_time_after_numerator: required non_negative_integer
  cumulative_time_after_denominator: required positive_integer
  crossed_whole_minute_boundaries: required non_negative_integer
  clock_commit_mode: required enum[direct_party_clock, shared_root_transport_clock]
  synchronized_time_slice_result_id: optional stable_id
  dynamic_snapshot: required traversal_dynamic_snapshot
  result_kind: required enum[progressed, segment_completed, paused_in_transit, interrupted_at_anchor, stranded, blocked_before_progress]
  result_code: required stable_id
  navigation_resolution: optional navigation_resolution
  hazard_resolution: optional hazard_resolution
  outcome_composition_policy_version: required authoring_version
  outcome_composition_trace_digest: required sha256_hex
  interruption_anchor_id: optional stable_id
  result_change_set_id: required stable_id
  idempotency_record_id: required stable_id
  occurred_at_turn: required non_negative_integer
invariants:
  - No active/open result exists and all rational values are reduced.
  - progress_before_ppm is below one million; planned progress is strictly greater than progress before.
  - actual progress is between progress before and planned progress.
  - cumulative actual time after equals cumulative actual time before plus actual interval time.
  - Interval ordinal equals travel-state next_interval_ordinal before commit; after commit next_interval_ordinal equals interval_ordinal plus one.
  - progressed requires progress_before < actual_progress_after < one million and positive exact actual time.
  - segment_completed requires planned_progress_after_ppm=actual_progress_after_ppm=one million and positive exact actual time; no other outcome permits actual progress one million.
  - paused_in_transit, interrupted_at_anchor and stranded require actual progress below one million; equality with progress_before is allowed only when the control outcome occurs before further physical advancement.
  - interrupted_at_anchor requires interruption_anchor_id resolving to an active usable route anchor; all other outcomes forbid it.
  - blocked_before_progress has unchanged progress/cumulative time, zero actual time and zero crossed whole-minute boundaries, and changes only travel-state next_interval_ordinal/state-version audit fields.
  - direct_party_clock advances the exact party timestamp by actual_time under section 11.4; crossed_whole_minute_boundaries is derived from the result change-set timestamps; synchronized_time_slice_result_id is null for a standalone result and otherwise names the synchronized slice for which this interval is the root clock owner.
  - shared_root_transport_clock requires synchronized_time_slice_result_id and crossed_whole_minute_boundaries zero; the referenced synchronized slice owns the exact party-clock update.
  - result_kind equals the deterministic composition of navigation, hazard, data-gap, blocker and progress signals under outcome_composition_policy_version.
```

```yaml
contract_name: synchronized_time_slice_result
storage: party_runtime_append_only
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  root_transport_execution_id: required stable_id
  root_traversal_interval_result_id: required stable_id
  exact_elapsed_numerator: required non_negative_integer
  exact_elapsed_denominator: required positive_integer
  crossed_whole_minute_boundaries: required non_negative_integer
  world_time_before: required game_timestamp
  world_time_after: required game_timestamp
  dependency_pins: required dependency_pin_set
  result_change_set_id: required stable_id
  idempotency_record_id: required stable_id
relations:
  carrier_local_result_refs: relation_set[entity_ref]
invariants:
  - The root execution has journey_scope=world_travel and owner kind transport.
  - The root interval result uses direct_party_clock, names this synchronized slice ID and owns crossed_whole_minute_boundaries.
  - Every local activity-attempt or traversal-interval result belongs to a carrier_local execution attached to the same root transport, uses shared_root_transport_clock, names this slice ID and has zero local crossed whole-minute boundaries.
  - All linked results are committed by result_change_set_id and share one world-time boundary.
  - exact_elapsed equals the root interval actual exact time and every linked local result with positive actual time; a linked zero-time result is allowed only for blocked or contract-valid failed-before-elapsed semantics. The root interval advances the exact party timestamp once and supplies the one crossed-minute count.
  - If the root result is blocked_before_progress, exact_elapsed is zero, carrier_local_result_refs is empty and every local execution remains unchanged.
  - Planned slice end is the earliest root/local completion or recheck boundary, so every completion occurs exactly at that boundary.
  - A blocked local result may use zero elapsed time but cannot shorten or alter root progress without an explicit root-carrier effect in its pinned contract.
  - world_time_after minus world_time_before equals exact_elapsed; crossed_whole_minute_boundaries equals the difference of their absolute whole-minute indexes.
  - The record is immutable.
```

```yaml
contract_name: navigation_resolution
storage: immutable_snapshot
fields:
  resolution_kind: required enum[on_course, perceived_deviation, factual_deviation, factual_delay, pause, interrupt, strand]
  factual_bearing_delta_mdeg: optional integer
  perceived_bearing_delta_mdeg: optional integer
  additive_delay: optional resolved_additive_delay
  consequence_rule_ref: optional versioned_ref
  interruption_anchor_policy_ref: optional versioned_ref
  canonical_digest: required sha256_hex
invariants:
  - Resolution cannot change physical segment, route, endpoint or plan.
  - on_course forbids both deltas, delay, consequence and interruption policy.
  - perceived_deviation requires perceived_bearing_delta_mdeg and forbids factual_bearing_delta_mdeg, delay, consequence and interruption policy.
  - factual_deviation requires factual_bearing_delta_mdeg, may include perceived delta, delay or consequence, and forbids interruption policy.
  - factual_delay requires additive_delay or consequence_rule_ref and forbids both bearing deltas and interruption policy.
  - pause permits delay or consequence but forbids interruption policy.
  - interrupt requires interruption_anchor_policy_ref.
  - strand forbids interruption_anchor_policy_ref and records its exact data-gap/consequence reason in the owning interval result.
  - factual bearing delta, when present, stays inside the current segment orientation envelope.
  - pause, interrupt and strand are control requests consumed by the interval composition policy.
```

```yaml
contract_name: hazard_resolution
storage: immutable_snapshot
fields:
  hazard_rule_ref: required versioned_ref
  consequence_set_ref: required versioned_ref
  additive_delay: optional resolved_additive_delay
  control_effect: required enum[none, pause, interrupt, strand]
  interruption_anchor_policy_ref: optional versioned_ref
  canonical_digest: required sha256_hex
invariants:
  - Hazard resolution is finite and returns exactly one control effect.
  - interrupt requires interruption_anchor_policy_ref; none, pause and strand forbid it.
  - Consequence application is part of the same interval change set.
  - Final interval outcome is selected only by the shared composition policy.
```

```yaml
contract_name: checkpoint_departure_template
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  source_anchor_kind: required enum[shared_checkpoint, interruption]
  source_resolution_kind: required enum[reusable_checkpoint, persistent_consequence]
  target_selector_kind: required enum[route_point_role, canonical_exit_role, specific_authoring_endpoint]
  target_selector_value: required stable_id
  required_cost_contract_ref: optional versioned_ref
  status: required enum[approved, deprecated, retired]
  provenance_ref: required stable_id
invariants:
  - Template contains no party IDs.
  - shared_checkpoint pairs with reusable_checkpoint; interruption pairs with persistent_consequence.
  - Selector resolves a finite authored candidate set.
```

```yaml
contract_name: recovery_transition_template
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  source_selector_kind: required enum[interruption_anchor, checkpoint_anchor, transit_anchor_role, stranded_snapshot]
  target_selector_kind: required enum[source_endpoint, previous_checkpoint, canonical_safe_exit, specific_authoring_endpoint]
  target_selector_value: optional stable_id
  required_cost_contract_ref: optional versioned_ref
  status: required enum[approved, deprecated, retired]
  provenance_ref: required stable_id
invariants:
  - Template contains no party IDs.
  - source_endpoint target selector forbids target_selector_value; every other target selector requires it.
  - Non-identical source and target require a cost contract; an identical source/target template may omit it only when neither location nor time changes.
  - Every selector resolves a finite approved set; nearest, safest or first-row heuristic selection is forbidden.
```

```yaml
contract_name: party_checkpoint_route_departure
storage: party_runtime_mutable_lifecycle
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  source_endpoint_snapshot: required endpoint_contract_snapshot
  source_anchor_id: required stable_id
  template_ref: required versioned_ref
  resolved_target_endpoint_snapshot: required endpoint_contract_snapshot
  resolved_cost_step_snapshot: optional route_plan_step_static_snapshot
  status: required enum[active, inactive, superseded]
  state_version: required state_version
  created_change_set_id: required stable_id
  terminal_change_set_id: optional stable_id
invariants:
  - source_endpoint_snapshot kind is route_anchor_scene, resolves source_anchor_id and pins the active identity/location binding.
  - Equal source and target may omit cost only when neither location nor time changes; differing endpoints require exactly one cost step.
  - The cost step, when present, is validated together with the declared source and target snapshots and cannot select another endpoint.
  - UNIQUE active departure by source anchor and template version.
  - active forbids terminal_change_set_id; inactive and superseded require it.
```

```yaml
contract_name: party_recovery_transition_binding
storage: party_runtime_mutable_lifecycle
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  source_endpoint_snapshot: required endpoint_contract_snapshot
  target_endpoint_snapshot: required endpoint_contract_snapshot
  template_ref: required versioned_ref
  executable_cost_step_snapshot: optional route_plan_step_static_snapshot
  status: required enum[active, consumed, superseded]
  state_version: required state_version
  created_change_set_id: required stable_id
  terminal_change_set_id: optional stable_id
invariants:
  - Equal source and target may omit cost only when neither location nor time changes.
  - Different source and target require exactly one executable cost step.
  - The cost step endpoints and physical relation, when present, exactly match the binding source and target snapshots.
  - active forbids terminal_change_set_id; consumed and superseded require it.
  - Only active may transition once to consumed or superseded.
  - Free relocation is forbidden.
```


## B.5. Materialization, commit, idempotency and visual projection

```yaml
contract_name: stable_environment_context_snapshot
storage: immutable_snapshot
fields:
  scope_ref: required entity_ref
  dependency_pins: required dependency_pin_set
  canonical_digest: required sha256_hex
relations:
  durable_fact_pins: relation_set[dependency_pin]
invariants:
  - durable_fact_pins is finite and contains only approved landform, land-cover, hydrography, built-form or other topology-stable facts.
  - Weather, light, body, load, temporary access, damage overlay and party belief are forbidden.
  - scope_ref and every durable fact belong to the materialization world revision and trigger scope.
  - canonical_digest covers the canonically ordered fact pins and scope.
```

```yaml
contract_name: historical_applicability_frame
storage: immutable_snapshot
fields:
  frame_id: required stable_id
  period_id: required stable_id
  exact_year: optional integer
  world_revision_id: required stable_id
  dependency_pins: required dependency_pin_set
  canonical_digest: required sha256_hex
relations:
  region_scope_ids: relation_set[stable_id]
invariants:
  - Frame is approved before use and does not contain runtime weather or party state.
  - region_scope_ids is non-empty.
  - exact_year, when present, lies inside period_id and inside the world revision historical range.
  - dependency_pins include the period, every region scope and the world revision.
```

```yaml
contract_name: runtime_calendar_snapshot
storage: immutable_snapshot
fields:
  snapshot_id: required stable_id
  exact_game_timestamp: required game_timestamp
  season_id: required stable_id
  daylight_phase_id: required stable_id
  calendar_version: required authoring_version
  canonical_digest: required sha256_hex
invariants:
  - season_id and daylight_phase_id are the unique values resolved from exact_game_timestamp by calendar_version.
  - Snapshot is used for dynamic execution and does not select permanent topology.
```

```yaml
contract_name: random_source_descriptor
storage: immutable_request
fields:
  algorithm_id: required stable_id
  algorithm_version: required authoring_version
  seed_context_digest: required sha256_hex
  seed_value_digest: required sha256_hex
invariants:
  - algorithm_id/version is approved for the calling materializer or resolver.
  - seed context canonicalization is versioned and includes every declared deterministic scope component.
  - Raw secret seed material need not be exposed, but deterministic reproduction must be possible in authorized tooling.
```

```yaml
contract_name: spatial_admin_mapping_contract
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  remediation_kind: required enum[migration, repair]
  scope_kind: required enum[g4, scene_host]
  mapping_rule_ref: required versioned_ref
  allowed_output_kind_set_ref: required versioned_ref
  status: required enum[approved, deprecated, retired]
  provenance_ref: required stable_id
invariants:
  - Contract is finite, deterministic and contains no runtime fallback.
  - scope_kind declares exactly which materialization input scope field is required.
  - Empty mapping candidate set is a hard migration or repair gap.
```

```yaml
contract_name: spatial_materialization_input
storage: immutable_request
fields:
  request_id: required stable_id
  party_id: required stable_id
  world_revision_id: required stable_id
  historical_frame: required historical_applicability_frame
  stable_environment_context: required stable_environment_context_snapshot
  g0_id: required stable_id
  g1_id: required stable_id
  g4_id: optional stable_id
  target_host_ref: optional scene_host_ref
  administrative_contract_ref: optional versioned_ref
  trigger: required enum[new_game, target_preparation, frontier_resolution, transport_scene_preparation, checkpoint_preparation, interruption, migration, repair]
  approved_catalog_bundle_ref: required versioned_ref
  catalog_digest: required sha256_hex
  profile_rule_dependency_pins: required dependency_pin_set
  existing_spatial_snapshot_digest: required sha256_hex
  random_source: required random_source_descriptor
  expected_state_versions: required expected_state_version_set
  canonical_input_digest: required sha256_hex
invariants:
  - Input contains no current weather, body, load or temporary access state for permanent topology selection.
  - stable_environment_context scope and pins match the exact trigger scope and world revision.
  - new_game requires g4_id and a deterministically preallocated target_host_ref kind g5_site that is created in the same semantic write plan; it forbids administrative_contract_ref.
  - target_preparation requires g4_id plus an existing active target_host_ref kind g5_site and forbids administrative_contract_ref.
  - frontier_resolution requires g4_id, forbids target_host_ref and administrative_contract_ref, and pins the exact frontier/chain/profile state.
  - transport_scene_preparation requires target_host_ref kind transport and forbids g4_id and administrative_contract_ref.
  - checkpoint_preparation and interruption require target_host_ref kind route_anchor_identity and forbid g4_id and administrative_contract_ref.
  - migration and repair require an approved spatial_admin_mapping_contract of the matching remediation kind; scope_kind=g4 requires g4_id and null target_host_ref, while scope_kind=scene_host requires target_host_ref and null g4_id.
  - g0_id and g1_id equal the pinned factual context of the required G4 or host scope.
  - trigger scope determines the only permitted output entity kinds.
```

```yaml
contract_name: materialization_choice
storage: party_runtime_append_only
identity:
  - id
fields:
  id: required stable_id
  materialization_run_id: required stable_id
  choice_role: required stable_id
  candidate_digest: required sha256_hex
  selected_ref: required versioned_ref
  random_source: required random_source_descriptor
  choice_ordinal: required non_negative_integer
  created_change_set_id: required stable_id
relations:
  rejected_candidate_refs: relation_set[versioned_ref]
invariants:
  - Candidate set is finite, unique and stably sorted before selection.
  - selected_ref does not occur in rejected_candidate_refs.
  - The canonical digest of selected_ref union rejected_candidate_refs equals candidate_digest.
  - Choice is deterministic for identical input and random source.
```

```yaml
contract_name: materialization_trace
storage: party_runtime_append_only
identity:
  - run_id
fields:
  run_id: required stable_id
  request_id: required stable_id
  party_id: required stable_id
  trigger: required enum[new_game, target_preparation, frontier_resolution, transport_scene_preparation, checkpoint_preparation, interruption, migration, repair]
  world_revision_id: required stable_id
  materializer_version: required authoring_version
  catalog_digest: required sha256_hex
  canonical_input_digest: required sha256_hex
  canonical_output_digest: required sha256_hex
  validation_report_digest: required sha256_hex
  created_change_set_id: required stable_id
  occurred_at_turn: required non_negative_integer
relations:
  dependency_pins: relation_set[dependency_pin]
  choice_ids: relation_set[stable_id]
invariants:
  - Trace is append-only and sufficient to reproduce candidate filtering, sorting and selection.
  - trigger equals the source materialization input trigger.
  - canonical_output_digest covers the canonical semantic proposal payload and typed output refs while excluding trace fields, validation report, change-set IDs and digest fields, so no self-referential digest exists.
  - validation_report_digest equals the exact report persisted in the same audit/semantic change set.
  - Every choice_id belongs to this run and is persisted in created_change_set_id.
```

```yaml
contract_name: spatial_validation_finding
storage: immutable_report_member
fields:
  finding_code: required stable_id
  severity: required enum[error, warning, note]
  subject_ref: optional entity_ref
  message: required string
  dependency_pins: optional dependency_pin_set
invariants:
  - warning or note cannot waive a hard invariant.
```

```yaml
contract_name: spatial_validation_report
storage: immutable_report
fields:
  report_id: required stable_id
  result: required enum[pass, pass_with_notes, fail]
  report_digest: required sha256_hex
relations:
  findings: relation_set[spatial_validation_finding]
invariants:
  - pass has an empty finding set.
  - fail has at least one error.
  - pass_with_notes has no errors and at least one warning or note.
  - report_digest covers result and the canonically ordered finding set.
```

```yaml
contract_name: frontier_topology_resolution_result
storage: immutable_result
fields:
  result_kind: required enum[generated_site, existing_site, world_route_exit, physical_boundary]
  source_frontier_id: required stable_id
  created_g5_site_id: optional stable_id
  resolved_target_g5_site_id: optional stable_id
  created_site_connection_id: optional stable_id
  created_boundary_entity_id: optional stable_id
  successor_frontier_id: optional stable_id
  traveller_location_changed: required enum[false]
  time_advanced: required enum[false]
  result_digest: required sha256_hex
invariants:
  - generated_site requires created_g5_site_id, resolved_target_g5_site_id equal to that site, and created_site_connection_id; it forbids boundary entity.
  - For a through source frontier, generated_site requires exactly one successor_frontier_id with ordinal source+1, including the case source=terminal_ordinal-1; that successor is the terminal frontier.
  - For a branch source frontier, generated_site requires exactly one successor_frontier_id in the approved branch slot; terminal results forbid it.
  - existing_site and world_route_exit require resolved_target_g5_site_id and created_site_connection_id and forbid created_g5_site_id, boundary entity and successor frontier.
  - existing_site target is the exact pre-existing party site selected by the terminal policy. world_route_exit target is a created-or-reused canonical-origin party site whose canonical_g5_ref equals the directional-exit canonical G5.
  - Every created site connection has both active role-aware endpoint bindings at commit; any target projection, baseline, G6 or position created for those bindings belongs to the same atomic result change set. An existing active baseline is never augmented; zero or multiple slot matches roll back the transaction.
  - physical_boundary requires created_boundary_entity_id and forbids both G5-site fields, site connection and successor frontier.
  - The source frontier resolution fields and lifecycle status are updated atomically to the matching result kind.
  - Topology resolution never moves a traveller or advances time.
```

```yaml
contract_name: spatial_materialization_result
storage: immutable_result
fields:
  request_id: required stable_id
  status: required enum[success, blocked]
  transition_result: optional frontier_topology_resolution_result
  trace: required materialization_trace
  validation_report: required spatial_validation_report
  proposed_write_set_digest: required sha256_hex
  canonical_output_digest: required sha256_hex
relations:
  created_entity_refs: relation_set[entity_ref]
  created_relation_refs: relation_set[entity_ref]
  mutated_entity_refs: relation_set[entity_ref]
  blocking_reasons: relation_set[movement_blocking_reason]
invariants:
  - success requires pass or pass_with_notes validation, an empty blocking-reason set and preallocated semantic output refs exactly matching a semantic_commit write plan; no output ref exists as a party fact before commit.
  - blocked requires fail validation or at least one hard blocking reason, null transition_result and empty semantic created/mutated ref sets; its write plan is blocked_audit and may append only trace, choices, report, idempotency and change-set audit rows.
  - transition_result is populated only for a successful frontier_resolution trigger.
  - canonical_output_digest equals trace.canonical_output_digest and covers only the non-self-referential canonical semantic proposal payload.
  - proposed_write_set_digest equals the associated combined write plan write_set_digest.
  - Result never contains untyped generic objects.
```

```yaml
contract_name: combined_write_plan
storage: immutable_commit_input
fields:
  plan_id: required stable_id
  party_id: required stable_id
  write_plan_kind: required enum[semantic_commit, blocked_audit]
  operation_kind: required stable_id
  canonical_input_digest: required sha256_hex
  expected_state_versions: required expected_state_version_set
  validation_report_digest: required sha256_hex
  write_set_digest: required sha256_hex
  idempotency_record_id: required stable_id
relations:
  insert_refs: relation_set[entity_ref]
  update_refs: relation_set[entity_ref]
  append_refs: relation_set[entity_ref]
invariants:
  - Plan contains no semantic alternatives.
  - insert, update and append sets are pairwise disjoint and canonically ordered.
  - semantic_commit requires a pass/pass_with_notes validator report and may contain approved domain writes.
  - blocked_audit requires a blocked result, has empty domain insert/update sets and appends only trace, choice, report, idempotency and change-set audit rows; it changes no world state or game time.
  - Every mutable update has an expected state version; inserts and append-only rows do not.
  - write_set_digest covers all three ordered sets and exact serialized row payloads.
  - Only CombinedAtomicCommitter may apply the plan.
```

```yaml
contract_name: idempotency_record
storage: party_runtime_mutable_technical
identity:
  - party_id
  - operation_kind
  - idempotency_key
fields:
  id: required stable_id
  party_id: required stable_id
  operation_kind: required stable_id
  idempotency_key: required stable_id
  parent_idempotency_key: optional stable_id
  canonical_input_digest: required sha256_hex
  expected_state_versions_digest: required sha256_hex
  result_change_set_id: optional stable_id
  failure_code: optional stable_id
  failure_digest: optional sha256_hex
  status: required enum[pending, committed, failed]
  lease_expires_at: optional system_timestamp
  state_version: required state_version
invariants:
  - Same key and different input digest is idempotency_conflict.
  - pending requires lease_expires_at and forbids result/failure fields.
  - committed requires result_change_set_id, forbids failure fields and has null lease_expires_at.
  - failed requires failure_code and failure_digest, forbids result_change_set_id and has null lease_expires_at.
  - Same key and same digest returns the committed result, the same terminal failure, or in_progress while an unexpired pending lease exists.
  - An expired pending lease may be reclaimed only by compare-and-swap on state_version; reclaim preserves key and canonical input digest.
  - expected_state_versions_digest matches the validated command snapshot.
  - pending lease is technical ownership and not a domain execution/run state.
  - A deterministic domain-level blocked result is committed with its blocked-audit change set; status=failed is reserved for terminal technical failure that produced no domain result or change set.
```

```yaml
contract_name: party_change_set
storage: party_runtime_append_only
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  operation_kind: required stable_id
  parent_change_set_id: optional stable_id
  idempotency_record_id: required stable_id
  world_time_before: required game_timestamp
  world_time_after: required game_timestamp
  canonical_write_digest: required sha256_hex
  committed_at_turn: required non_negative_integer
relations:
  affected_entity_refs: relation_set[entity_ref]
invariants:
  - world_time_after is not earlier than world_time_before.
  - Exact timestamp difference equals the one direct-clock or synchronized-root actual elapsed time for time-bearing operations; non-time and blocked-audit operations keep both timestamps equal.
  - The clock-owning result crossed_whole_minute_boundaries equals the difference of the absolute whole-minute indexes of these timestamps; every shared local result records zero.
  - parent_change_set_id, when present, references the same party, forms an acyclic parent/child command tree and cannot change idempotency ownership.
  - canonical_write_digest equals the applied combined write plan write_set_digest.
  - Change set is immutable.
```

```yaml
contract_name: visual_layout
storage: logical_contract_materialized_in_exactly_one_presentation_domain
identity:
  - id
  - layout_revision
fields:
  id: required stable_id
  storage_domain: required enum[world_base, party_runtime]
  party_id: optional stable_id
  scope_kind: required enum[world_overview, G0, G1, G2, G3, G4, G5, G6]
  scope_ref: optional spatial_ref
  child_kind: required enum[G0, G1, G2, G3, G4, G5, G6, scene_position]
  layout_width: required positive_integer
  layout_height: required positive_integer
  origin: required enum[top_left]
  x_axis: required enum[right]
  y_axis: required enum[down]
  layout_revision: required authoring_version
  status: required enum[draft, approved, deprecated, generated_preview]
  audience: required enum[authoring, diagnostic, player_projection]
relations:
  nodes: relation_set[visual_layout_node]
  edge_paths: relation_set[visual_edge_path]
invariants:
  - world_base requires null party_id, audience authoring or diagnostic, and permits only world_overview through G4 scopes; its G4 children are canonical G5.
  - party_runtime requires party_id and audience diagnostic or player_projection; it may scope a canonical G0–G4 reference for a party projection and permits G4 to party G5, party G5 to party G6, and party G6 to scene_position.
  - world_overview requires null scope_ref and child_kind G0; every other scope_kind requires a scope_ref of the declared scale and domain-compatible discriminator.
  - Child-kind matrix is exact: world_overview to G0, G0 to G1, G1 to G2, G2 to G3, G3 to G4, G4 to G5, G5 to G6 and G6 to scene_position. `world_base` cannot instantiate G5-to-G6 or G6-to-position layouts because G6 is party-scoped.
  - Child node and edge-path rows are stored in the same presentation storage domain as the parent layout; semantic refs may cross to pinned canonical scope where the party projection rule explicitly permits it.
  - Layout revision is excluded from semantic materialization digest.
  - generated_preview cannot be promoted automatically.
```

```yaml
contract_name: visual_layout_node
storage: presentation_relation
identity:
  - layout_id
  - layout_revision
  - target_ref
fields:
  layout_id: required stable_id
  layout_revision: required authoring_version
  target_ref: required spatial_ref
  layout_x: required non_negative_integer
  layout_y: required non_negative_integer
  layout_width: required positive_integer
  layout_height: required positive_integer
  z_index: required integer
  label_anchor: required enum[center, top, right, bottom, left]
invariants:
  - Target belongs to the layout scope and its spatial kind equals the parent layout child-kind mapping.
  - In world_base layouts target is canonical. In party_runtime layouts G5/G6/scene_position targets belong to the same party, while upper canonical scope refs are allowed only as pinned projection parents.
  - Coordinates do not imply any semantic relation.
```

```yaml
contract_name: visual_edge_path
storage: presentation_relation
identity:
  - id
fields:
  id: required stable_id
  layout_id: required stable_id
  layout_revision: required authoring_version
  relation_ref: required entity_ref
  relation_kind: required enum[movement, visibility, acoustic, site_connection, world_route]
  path_points: required snapshot_list[visual_path_point]
invariants:
  - Referenced semantic relation exists and belongs to the layout scope.
  - movement accepts scene_movement_edge; visibility accepts visibility_link; acoustic accepts acoustic_edge; site_connection accepts g5_site_connection; world_route accepts world_route.
  - At least two path points are present in contiguous ordinal order.
  - Path geometry does not change semantic relation.
```

```yaml
contract_name: visual_path_point
storage: immutable_snapshot_member
fields:
  ordinal: required non_negative_integer
  layout_x: required non_negative_integer
  layout_y: required non_negative_integer
invariants:
  - Ordinals are contiguous from zero.
```


## B.6. Supporting spatial and runtime contracts

```yaml
contract_name: canonical_spatial_node
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  world_revision_id: required stable_id
  scale_level: required enum[G0, G1, G2, G3, G4, G5]
  spatial_class_id: required stable_id
  parent_ref: optional versioned_ref
  primary_function_id: optional stable_id
  shape_id: optional stable_id
  regional_template_ref: optional versioned_ref
  grid_x: optional integer
  grid_y: optional integer
  grid_convention_ref: optional versioned_ref
  evidence_status: required stable_id
  status: required enum[approved, deprecated, retired]
  provenance_ref: required stable_id
relations:
  secondary_functions: relation_set[controlled_spatial_function]
  facets: relation_set[spatial_facet_binding]
invariants:
  - G0 has null parent; G1 through G5 have one versioned parent at the immediately preceding scale in the same world revision.
  - G1 requires grid_x, grid_y and grid_convention_ref; every other scale forbids them.
  - UNIQUE world_revision_id, parent G0 identity, grid_x and grid_y for G1.
  - G1 grid coordinates are semantic identity coordinates and are not visual coordinates.
  - Same-level containment is forbidden.
  - Class is allowed at scale_level and compatible with parent class.
  - A canonical G5 compound has an approved structure or scene-profile proof of at least two independently meaningful parts.
  - Every approved canonical G5 that can be used as a runtime endpoint has exactly one applicable approved scene_materialization_profile under the active revision; zero or multiple profiles block readiness.
  - Classification ambiguity blocks approval.
```

```yaml
contract_name: spatial_facet_binding
storage: world_base_relation
identity:
  - spatial_node_id
  - spatial_node_version
  - facet_dimension_id
  - facet_value_id
fields:
  spatial_node_id: required stable_id
  spatial_node_version: required authoring_version
  facet_dimension_id: required stable_id
  facet_value_id: required stable_id
  source_ref: required stable_id
invariants:
  - Cardinality follows the controlled facet dimension.
  - A facet never changes scale level or primary spatial class.
```

```yaml
contract_name: g4_traversal_profile
storage: world_base_authoring
identity:
  - g4_id
  - g4_version
fields:
  g4_id: required stable_id
  g4_version: required authoring_version
  traversal_model: required enum[enclosed, bounded, through_area]
  status: required enum[approved, deprecated, retired]
relations:
  traversable_direction_contexts: relation_set[controlled_direction_context]
  directional_exit_refs: relation_set[versioned_ref]
invariants:
  - g4_id resolves through one exact authoring_dependency_edge of this profile version.
  - through_area has at least one applicable exit for every outward context.
  - physical through context ends in a world-route exit or an approved real boundary.
```

```yaml
contract_name: expansion_terminal_policy
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  policy_kind: required enum[connect_existing, world_route_exit, physical_boundary]
  existing_target_rule_ref: optional versioned_ref
  directional_exit_ref: optional versioned_ref
  boundary_feature_template_ref: optional versioned_ref
  status: required enum[approved, deprecated, retired]
  provenance_ref: required stable_id
invariants:
  - connect_existing requires existing_target_rule_ref only.
  - world_route_exit requires directional_exit_ref only.
  - physical_boundary requires boundary_feature_template_ref only.
  - Existing target rule must resolve exactly one already materialized site in the same G4 under the locked party snapshot.
  - Zero or multiple targets produce terminal_target_gap; no nearest or first-row selection is allowed.
```

```yaml
contract_name: party_g5_state_overlay
storage: party_runtime_mutable
identity:
  - party_id
  - g5_site_id
fields:
  party_id: required stable_id
  g5_site_id: required stable_id
  access_state_id: required stable_id
  damage_state_id: required stable_id
  occupation_state_id: required stable_id
  state_version: required state_version
  updated_change_set_id: required stable_id
relations:
  condition_refs: relation_set[entity_ref]
invariants:
  - g5_site_id resolves one active or terminal party_g5_site; for canonical origin the overlay never mutates the world_base G5 record.
  - access_state_id, damage_state_id, occupation_state_id and condition_refs come from approved controlled state catalogs and are mutually compatible under the exact site context.
  - Temporary route closure belongs to relation/portal/blocker state, not site destruction.
```

```yaml
contract_name: party_travel_cohort
storage: party_runtime_mutable_lifecycle
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  leader_actor_id: required stable_id
  membership_snapshot_version: required state_version
  status: required enum[forming, active, dissolved]
  state_version: required state_version
  created_change_set_id: required stable_id
  updated_change_set_id: required stable_id
  dissolved_change_set_id: optional stable_id
invariants:
  - forming has no nonterminal journey execution and may have incomplete membership; it becomes active only in the same transaction that establishes one active leader and at least one active member.
  - active has one active leader membership matching leader_actor_id, at least one active member and one authoritative location unless attached to a transport.
  - dissolved requires dissolved_change_set_id, has no active membership, attachment or nonterminal journey execution and cannot reactivate.
  - forming and active forbid dissolved_change_set_id.
  - membership_snapshot_version increments atomically on every join, leave, death, role, pace, split or merge change and is pinned by movement plans.
```

```yaml
contract_name: start_position_binding
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  canonical_g5_ref: required versioned_ref
  scene_template_ref: required versioned_ref
  scene_endpoint_slot_key: required stable_id
  start_profile_ref: required versioned_ref
  status: required enum[approved, deprecated, retired]
  provenance_ref: required stable_id
invariants:
  - Slot belongs to scene_template_ref, is arrival-compatible and resolves the exact required position-template instance declared by that scene_endpoint_slot.
  - Scene template is permitted by the canonical G5 materialization profile.
  - Start preparation resolves exactly one party world-route-independent scene position.
  - start_profile_ref is approved in the same world-revision graph and start selection obeys its season, access, character and safety constraints.
```

```yaml
contract_name: party_actor_posture
storage: party_runtime_mutable
identity:
  - party_id
  - actor_id
fields:
  party_id: required stable_id
  actor_id: required stable_id
  posture: required enum[standing, sitting, crouching, prone]
  location_dependency_pins: required dependency_pin_set
  state_version: required state_version
  updated_change_set_id: required stable_id
invariants:
  - location_dependency_pins resolve exactly one current scene position, either from the actor's direct scene journey location or from party_actor_carrier_position under an active attachment chain.
  - Posture is valid for the current position posture options.
  - Movement updates or invalidates posture atomically with the location change.
  - An actor without a scene-addressable position, including an attached actor without a carrier-local position, has no posture row.
```

```yaml
contract_name: mounted_relation
storage: party_runtime_mutable
identity:
  - party_id
  - actor_id
fields:
  party_id: required stable_id
  actor_id: required stable_id
  mount_entity_id: required stable_id
  riding_position_id: required stable_id
  state_version: required state_version
  updated_change_set_id: required stable_id
invariants:
  - Mounted relation is used only when the mount is not modeled as the actor's full journey carrier.
  - riding_position_id is the exact active scene position occupied by the mount's authoritative entity_placement, and the actor's direct or attachment-derived scene position is the same position.
  - The same movement fact cannot coexist with an actor-to-mount carrier attachment, another active mounted_relation for the actor, or a second authoritative mount placement.
  - Mount movement, dismount, incapacitation or placement invalidation updates/removes this relation and the actor position atomically; rider capacity is enforced by the approved mount profile.
```

```yaml
contract_name: sound_event
storage: runtime_event_or_party_runtime_append_only
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  persistence_kind: required enum[transient, persisted]
  source_position_id: required stable_id
  source_position_dependency_pins: required dependency_pin_set
  source_context_snapshot: required factual_spatial_context_snapshot
  exact_created_timestamp: required game_timestamp
  loudness: required enum[1, 2, 3, 4]
  sound_class_id: required stable_id
  created_at_turn: required non_negative_integer
  duration_class: required enum[instant, brief, sustained]
  expires_at_turn: optional non_negative_integer
  consequence_ref: optional entity_ref
  created_change_set_id: optional stable_id
invariants:
  - source_position_dependency_pins resolve the exact active source position at exact_created_timestamp; source_context_snapshot pins its factual world context.
  - transient is never written to party storage and forbids created_change_set_id; it may use only duration_class=instant.
  - persisted requires created_change_set_id and at least one of expires_at_turn or consequence_ref.
  - expires_at_turn, when present, is not earlier than created_at_turn.
  - Persisted instant sound is allowed only when delayed processing or consequence requires it.
```

```yaml
contract_name: visibility_modifier
storage: party_runtime_mutable
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  source_entity_ref: required entity_ref
  affected_scope_ref: required spatial_ref
  modifier_kind: required enum[occlusion, concealment, smoke, glare, darkness]
  condition_ref: required versioned_ref
  source_dependency_pins: required dependency_pin_set
  state_version: required state_version
  updated_change_set_id: required stable_id
invariants:
  - Modifier changes runtime visibility result but not the base geometry relation.
  - Source entity, condition and affected scope are compatible and resolve within the same party scene/world context.
  - Deactivation/removal follows the pinned condition; it never rewrites visibility_link topology.
```



## B.7. Authoring templates and transition contracts

```yaml
contract_name: spatial_transition_contract
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  transition_kind: required enum[g1_adjacency, g0_external, jurisdiction_only, combined]
  from_g0_id: required stable_id
  from_g1_id: required stable_id
  to_g0_id: required stable_id
  to_g1_id: required stable_id
  grid_delta_x: optional integer
  grid_delta_y: optional integer
  legal_customs_profile_ref: optional versioned_ref
  status: required enum[approved, deprecated, retired]
  provenance_ref: required stable_id
relations:
  allowed_route_kind_ids: relation_set[stable_id]
invariants:
  - from/to G0 and G1 stable IDs each have exact authoring_dependency_edge rows in this contract version.
  - g1_adjacency keeps G0 equal, changes G1 by one cardinal grid delta of absolute length one and forbids legal_customs_profile_ref.
  - g0_external changes G0 and G1, forbids grid deltas and legal_customs_profile_ref, and represents one explicit external transition without jurisdiction change.
  - jurisdiction_only keeps both G0 and G1 equal, forbids grid deltas and requires legal_customs_profile_ref.
  - combined requires legal_customs_profile_ref and combines a valid g1_adjacency or g0_external spatial change with jurisdiction change under one ordered contract; implicit decomposition is forbidden.
  - Approved contract has a non-empty allowed route-kind set.
```

```yaml
contract_name: g5_generation_template
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  g5_class_id: required enum[spatial.g5.compound, spatial.g5.parcel]
  regional_template_ref: required versioned_ref
  scene_materialization_profile_ref: required versioned_ref
  status: required enum[approved, deprecated, retired]
  provenance_ref: required stable_id
relations:
  successor_frontier_rules: relation_set[g5_successor_frontier_rule]
invariants:
  - Successor rule set is finite and non-empty.
  - Every generated site context resolves exactly one successor rule: through sites create one same-chain successor and branch sites create one branch successor.
  - A compound profile proves at least two independently meaningful structure or G6 slots.
```

```yaml
contract_name: g5_successor_frontier_rule
storage: world_base_relation
identity:
  - g5_template_id
  - g5_template_version
  - ordinal
fields:
  g5_template_id: required stable_id
  g5_template_version: required authoring_version
  ordinal: required non_negative_integer
  successor_kind: required enum[through_successor, branch_frontier]
  target_expansion_slot_ref: required versioned_ref
  scene_endpoint_slot_key: required stable_id
  condition_rule_ref: optional versioned_ref
invariants:
  - Both kinds require target slot and scene endpoint compatible with that slot.
  - through_successor requires the target slot to equal the source through slot and preserves the same continuation chain while incrementing ordinal by one.
  - branch_frontier requires a target slot with continuation_role=branch in the same G4 expansion profile and creates no continuation chain or ordinal.
  - For every approved materialized context exactly one successor rule applies; zero matches is a data gap and multiple matches are an authoring ambiguity.
  - A generated through-chain site requires the applicable rule to be through_successor; a generated branch site requires branch_frontier.
  - Every generated site creates exactly one successor frontier; only terminal resolution creates none.
  - Ordinals are contiguous from zero.
```

```yaml
contract_name: scene_materialization_profile
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  source_kind: required enum[canonical_g5, g5_generation_template, transport_template, route_anchor_template]
  source_ref: required versioned_ref
  selection_rule_ref: required versioned_ref
  status: required enum[approved, deprecated, retired]
  provenance_ref: required stable_id
relations:
  candidates: relation_set[scene_materialization_candidate]
invariants:
  - source_ref kind exactly matches source_kind.
  - Candidate set is finite and non-empty before approval.
  - Selection uses stable sorting, candidate digest and versioned RandomSource or a single deterministic candidate.
  - Profile version changes when source, rule or candidate membership/weight/applicability changes.
```

```yaml
contract_name: scene_materialization_candidate
storage: world_base_relation
identity:
  - profile_id
  - profile_version
  - scene_template_ref
fields:
  profile_id: required stable_id
  profile_version: required authoring_version
  scene_template_ref: required versioned_ref
  weight: required positive_integer
  applicability_rule_ref: optional versioned_ref
invariants:
  - profile_id/profile_version identify the parent scene_materialization_profile and scene_template_ref is approved, belongs to the same compatible world-revision graph and is one of that profile version's finite candidates.
  - Applicability may depend only on approved historical, regional and durable stable conditions.
  - Runtime weather, current light, body and load cannot filter this candidate.
```

```yaml
contract_name: scene_template
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  regional_template_ref: required versioned_ref
  status: required enum[approved, deprecated, retired]
  provenance_ref: required stable_id
relations:
  stable_structure_templates: relation_set[stable_structure_template]
  portal_templates: relation_set[portal_template]
  g6_slots: relation_set[g6_template_slot]
  endpoint_slots: relation_set[scene_endpoint_slot]
  position_templates: relation_set[scene_position_template]
  movement_edge_templates: relation_set[scene_movement_edge_template]
  visibility_link_templates: relation_set[visibility_link_template]
  acoustic_edge_templates: relation_set[acoustic_edge_template]
invariants:
  - Every referenced slot key resolves inside this template version.
  - Every required endpoint slot resolves to exactly one declared position-template instance by slot key plus instance ordinal.
  - Template graph passes connectivity and no-orphan validation.
```

```yaml
contract_name: stable_structure_template
storage: world_base_relation
identity:
  - scene_template_id
  - scene_template_version
  - structure_slot_key
fields:
  scene_template_id: required stable_id
  scene_template_version: required authoring_version
  structure_slot_key: required stable_id
  structure_class_id: required stable_id
  material_profile_ref: required versioned_ref
  state_profile_ref: required versioned_ref
  evidence_ref: required stable_id
invariants:
  - scene_template_id/version identify one approved scene_template version; every referenced material/state profile belongs to its compatible authoring version graph.
  - Structure is a physical entity and does not create a new G-level.
  - Slot key is unique inside one scene template version.
```

```yaml
contract_name: portal_template
storage: world_base_authoring
identity:
  - id
  - version
fields:
  id: required stable_id
  version: required authoring_version
  scene_template_ref: required versioned_ref
  portal_slot_key: required stable_id
  portal_class_id: required stable_id
  default_state: required enum[open, closed, locked]
  controlling_structure_slot_key: optional stable_id
  status: required enum[approved, deprecated, retired]
  provenance_ref: required stable_id
invariants:
  - UNIQUE scene template version and portal_slot_key.
  - scene_template_ref targets one approved scene_template version in the same authoring graph as every controlling structure/relation template.
  - controlling_structure_slot_key, when present, exists in the same scene template.
  - Every relation that uses the portal references this exact template version.
```

```yaml
contract_name: g6_template_slot
storage: world_base_relation
identity:
  - scene_template_id
  - scene_template_version
  - scene_slot_key
fields:
  scene_template_id: required stable_id
  scene_template_version: required authoring_version
  scene_slot_key: required stable_id
  physical_class_id: required enum[spatial.g6.enclosed, spatial.g6.semi_enclosed, spatial.g6.open, spatial.g6.water]
  primary_scene_role_id: required stable_id
  vertical_context_id: required enum[surface, elevated, subsurface]
  overhead_cover_id: required enum[none, partial, full]
  intra_g6_visibility_mode: required enum[default_clear, explicit]
  default_visibility_distance_band: optional enum[near, short, medium]
  acoustic_uniformity: required enum[uniform]
  enclosing_structure_slot_key: optional stable_id
relations:
  secondary_scene_role_ids: relation_set[stable_id]
invariants:
  - scene_template_id/version identify one approved scene_template version and scene_slot_key is unique within it.
  - default_clear requires default distance band, forbids pair-specific permanent occluders and implies clear base geometry for all permitted position pairs; explicit forbids the default band.
  - enclosing structure slot, when present, exists in the same scene template.
  - One slot materializes exactly one G6 instance; repeated spaces use distinct stable slot keys.
```

```yaml
contract_name: scene_position_template
storage: world_base_relation
identity:
  - scene_template_id
  - scene_template_version
  - position_slot_key
fields:
  scene_template_id: required stable_id
  scene_template_version: required authoring_version
  g6_scene_slot_key: required stable_id
  position_slot_key: required stable_id
  instance_count: required positive_integer
  position_type_id: required enum[scene_position.threshold, scene_position.passage, scene_position.central, scene_position.boundary_edge, scene_position.structural_feature_side, scene_position.permanent_cover, scene_position.elevated_overlook, scene_position.fixed_working_reach, scene_position.water_reach, scene_position.hazard_boundary]
  stable_basis_template_ref: optional entity_ref
  capacity: required positive_integer
  access_class_id: required stable_id
  light_profile_ref: optional versioned_ref
  hazard_profile_ref: optional versioned_ref
relations:
  posture_options: relation_set[controlled_posture_option]
invariants:
  - Referenced G6 slot exists in the same scene template.
  - Stable basis can reference only a stable structure/terrain slot in the same template and cannot be a movable item or NPC template.
  - Position exists only when it changes at least one mechanically relevant property.
  - instance_count is exact; materializer creates ordinals 0 through instance_count-1 and no others.
```

```yaml
contract_name: scene_movement_edge_template
storage: world_base_relation
identity:
  - scene_template_id
  - scene_template_version
  - edge_slot_key
fields:
  scene_template_id: required stable_id
  scene_template_version: required authoring_version
  edge_slot_key: required stable_id
  from_position_slot_key: required stable_id
  to_position_slot_key: required stable_id
  passage_type_id: required stable_id
  transition_environment_profile_ref: required versioned_ref
  movement_orientation_profile_ref: required versioned_ref
  cost_kind: required enum[action, time]
  action_units: optional positive_integer
  baseline_movement_method_id: optional stable_id
  movement_method_cost_profile_ref: optional versioned_ref
  base_minutes: optional positive_integer
  dynamic_recheck_policy_ref: optional versioned_ref
  capacity: optional positive_integer
  portal_template_ref: optional versioned_ref
  reverse_edge_slot_key: optional stable_id
  availability_condition_set_ref: optional versioned_ref
invariants:
  - Endpoint position slots exist in the same scene template.
  - portal_template_ref, when present, belongs to the same scene template version.
  - action requires action_units and forbids baseline method, cost profile, base minutes and recheck policy.
  - time forbids action_units and requires baseline method, cost profile, base minutes and recheck policy.
  - portal_template_ref requires availability_condition_set_ref that exhaustively maps open, closed, locked and destroyed movement behavior.
  - Reverse edge slot, when present, identifies a distinct template row with swapped endpoints and reciprocal reverse slot; absence declares a one-way edge.
```

```yaml
contract_name: visibility_link_template
storage: world_base_relation
identity:
  - scene_template_id
  - scene_template_version
  - link_slot_key
fields:
  scene_template_id: required stable_id
  scene_template_version: required authoring_version
  link_slot_key: required stable_id
  from_position_slot_key: required stable_id
  to_position_slot_key: required stable_id
  quality: required enum[clear, partial]
  distance_band: required enum[near, short, medium, long, remote]
  portal_template_ref: optional versioned_ref
  condition_profile_ref: optional versioned_ref
  reverse_link_slot_key: optional stable_id
invariants:
  - Position slots exist in the same scene template.
  - portal_template_ref, when present, belongs to the same scene template version and requires condition_profile_ref that exhaustively maps open, closed, locked and destroyed visibility behavior.
  - reverse_link_slot_key, when present, identifies a distinct row with swapped endpoints and reciprocal reverse slot.
  - Directed asymmetry without a reverse link requires explicit stable physical basis in provenance.
```

```yaml
contract_name: acoustic_edge_template
storage: world_base_relation
identity:
  - scene_template_id
  - scene_template_version
  - edge_slot_key
fields:
  scene_template_id: required stable_id
  scene_template_version: required authoring_version
  edge_slot_key: required stable_id
  from_g6_scene_slot_key: required stable_id
  to_g6_scene_slot_key: required stable_id
  base_loss: required enum[0, 1, 2]
  portal_template_ref: optional versioned_ref
  closed_extra_loss: optional enum[0, 1, 2, blocked]
  reverse_edge_slot_key: optional stable_id
  condition_profile_ref: optional versioned_ref
invariants:
  - G6 slots exist in the same scene template.
  - portal_template_ref, when present, belongs to the same scene template version.
  - No portal requires null closed_extra_loss and permits only non-portal condition_profile_ref.
  - portal_template_ref requires closed_extra_loss and condition_profile_ref that exhaustively maps open, closed, locked and destroyed acoustic behavior.
  - reverse_edge_slot_key, when present, identifies a distinct row with swapped G6 endpoints and reciprocal reverse slot.
  - Permanently blocked boundary is represented by absent edge template.
```

```yaml
contract_name: party_stable_structure
storage: party_runtime_mutable_lifecycle
identity:
  - id
fields:
  id: required stable_id
  party_id: required stable_id
  scene_baseline_id: required stable_id
  host_ref: required scene_host_ref
  source_scene_template_ref: required versioned_ref
  structure_slot_key: required stable_id
  physical_state_id: required stable_id
  status: required enum[active, superseded, destroyed]
  state_version: required state_version
  created_change_set_id: required stable_id
  updated_change_set_id: required stable_id
  terminal_change_set_id: optional stable_id
invariants:
  - UNIQUE scene_baseline_id and structure_slot_key.
  - source_scene_template_ref equals the scene baseline template and the structure slot exists in it.
  - Host equals the scene-baseline host.
  - Structure may enclose or provide stable basis for G6/positions but never becomes a G-level.
  - active forbids terminal_change_set_id; superseded and destroyed require it.
```

---

# Приложение C. Typed error registry

Каждая ошибка содержит `error_code`, `severity`, `subject_ref`, diagnostic dependency pins, player-safe message key where applicable and remediation class. Generic exception text не является public contract.

| Error code | Meaning | Required reaction |
|---|---|---|
| `normative_contract_conflict` | Prose and canonical schema conflict | Stop implementation; amend norm |
| `classification_gap` | Spatial class is not unique | Hard block authoring/approval |
| `spatial_candidate_gap` | Required materialization candidate set is empty | Hard block; authoring repair |
| `terminal_target_gap` | Frontier terminal target cannot be resolved | Hard block topology resolution |
| `terminal_endpoint_preparation_gap` | Exact terminal target cannot produce one complete endpoint scene/binding set | Roll back entire topology transaction |
| `continuation_terminal_ordinal_invalid` | Ordinal outside `0..max_instances` or state mismatch | Reject commit |
| `continuation_capacity_violation` | Slot/template assignment cannot satisfy limits | Reject profile or commit |
| `expansion_reservation_conflict` | Concurrent capacity lease conflicts | Retry from fresh state; no alternate choice |
| `expansion_capacity_temporarily_reserved` | Committed capacity remains but active reservations leave no reservable unit | Return temporarily blocked; do not terminal-resolve |
| `route_contract_missing` | Required route/profile/boundary contract absent | Hard block planning |
| `route_endpoint_invalid` | Route endpoint role, point, G5 or slot mismatch | Reject authoring/commit |
| `movement_endpoint_kind_invalid` | Endpoint kind not allowed by step/relation | Reject plan |
| `journey_handoff_snapshot_invalid` | Successor source does not equal the predecessor's exact handoff endpoint snapshot | Reject supersession/recovery |
| `route_chain_discontinuous` | Point/segment ordinal or endpoint mismatch | Reject route |
| `route_cycle_or_branch` | Branch or cycle inside one route | Reject route |
| `route_segment_context_gap` | Physical segment lacks one factual context | Hard block planning |
| `boundary_crossing_contract_gap` | Crossing lacks matched exact contract | Hard block dispatch |
| `scene_endpoint_slot_missing` | Required slot resolves to zero positions | Block materialization |
| `scene_endpoint_slot_ambiguous` | Required slot resolves to more than one position | Block materialization |
| `duplicate_departure_source` | More than one active binding where exactly one is required | Reject commit |
| `movement_method_cost_missing` | Selected method has no approved cost option | Block traversal |
| `movement_capability_missing` | Owner/carrier lacks required method/equipment/access | Block option or execution |
| `mode_transition_contract_missing` | Carrier transition lacks explicit contract | Block plan |
| `time_factor_invalid` | Factor is nonpositive, duplicated or unpinned | Reject interval |
| `time_delay_occurrence_invalid` | Additive delay lacks unique scope/occurrence identity or is applied more than once | Reject time-bearing result |
| `relation_capacity_undefined` | Capacity reduction targets a relation without explicit base capacity | Reject blocker/commit |
| `portal_state_contract_gap` | Portal-linked relation lacks exhaustive open/closed/locked/destroyed behavior | Block scene readiness |
| `controlled_vocabulary_gap` | A `controlled_*` pseudo-type has no exact finite versioned registry mapping | Block contract activation |
| `knowledge_target_resolution_gap` | Character-facing target cannot be resolved to one pinned factual target where execution requires it | Return data_gap; do not guess |
| `knowledge_fact_reference_invalid` | Navigation belief cites an unpinned or incompatible knowledge fact | Reject knowledge update |
| `time_accumulator_invalid` | Exact timestamp arithmetic, cumulative elapsed time or crossed-minute count does not reconcile | Reject interval |
| `orientation_frame_cycle` | Frame parent graph contains a cycle | Reject authoring |
| `orientation_profile_invalid` | Fixed/curved/reverse profile violates constraints | Reject authoring |
| `route_plan_snapshot_missing` | Static step or endpoint snapshot incomplete | Reject plan |
| `route_plan_version_pin_missing` | Mechanically relevant dependency unpinned | Reject plan |
| `authoring_dependency_pin_missing` | Bare authoring ID has no exact dependency edge/version | Reject authoring aggregate or pinned read |
| `route_plan_digest_mismatch` | Canonical serialization differs from digest | Reject read/commit |
| `route_plan_execution_conflict` | Execution field-state or owner uniqueness invalid | Reject commit |
| `travel_interval_conflict` | Interval ordinal/progress/outcome invalid | Reject commit |
| `activity_retry_lineage_invalid` | Timed-activity retry reactivates history or fails to copy exact cumulative/remaining state | Reject resume/commit |
| `travel_interruption_unresolved` | Interruption outcome has no exact usable anchor | Convert deterministically to stranded |
| `movement_anchor_unresolved` | Replan/recovery source is not location-bearing | Block request |
| `target_preparation_failed` | Mandatory endpoint/transfer scene not ready | Plan remains non-executable |
| `preparation_claim_conflict` | Exclusive prepared member already claimed | Retry/replan; no stealing |
| `cohort_membership_conflict` | Membership/leader/snapshot inconsistent | Block movement |
| `attachment_graph_invalid` | Attachment cycle, depth or kind violation | Block movement |
| `dual_location_owner` | Attached subject also owns world location | Treat as corruption; block |
| `journey_location_ownership_mismatch` | Snapshot ownership mode disagrees with post-transition root location or attachment state | Reject commit; no implicit conversion |
| `dual_execution_owner` | Conflicting active world-travel executions | Reject activation |
| `stranded_rescue_contract_missing` | No approved rescue from exact stranded state | Remain stranded; authoring repair |
| `idempotency_conflict` | Same key with different input digest | Reject request |
| `state_version_conflict` | Optimistic state version changed | Re-resolve from fresh state |
| `lock_order_violation` | Transaction violates global lock order | Abort transaction |
| `migration_mapping_gap` | Legacy entity has no exact target mapping | Block migration item |
| `migration_version_gap` | Required historical version pin is missing | Block save migration |
| `generated_schema_mismatch` | DDL, generated reference and contracts disagree | Block release |
| `hidden_information_leak` | Player projection contains hidden factual data | Reject presentation package |
| `visual_layout_gap` | Requested visual representation absent | Block only that map view |

Multiple valid routes or exits are normal option multiplicity and do not produce an ambiguity error. Ambiguity is an error only where a contract requires exactly one binding.

---

# Приложение D. Release checklist

## D.1. Baseline and norms

```text
[ ] GitHub main commit fixed in README and ADR.
[ ] Root AGENTS.md read completely.
[ ] .github/AGENTS.md read completely.
[ ] All conditional documents from both AGENTS files read.
[ ] Documentation navigation and regional semantic catalog read.
[ ] RAG and Graphify queries actually executed and recorded, or unavailable dependency explicitly blocks release.
[ ] Norm conflict register is empty.
```

## D.2. Contracts and data

```text
[ ] Every public contract has one declaration.
[ ] Every referenced contract type resolves; every `controlled_*` type has one finite versioned registry mapping.
[ ] No working placeholder or unresolved schema branch remains.
[ ] Every mechanically relevant authoring reference is an explicit versioned ref or normalized dependency edge.
[ ] JSON Schema/DTO/validator/DDL nullability and enums match appendix B.
[ ] Queryable plural relations are normalized.
[ ] Generated schema reference matches actual DDL digest.
[ ] Route, endpoint, route-point context-switch and boundary validators pass.
[ ] Expansion capacity proof passes for every approved profile.
[ ] Regional canonical G5 inventories and directional exits are complete.
[ ] Empty required candidate sets hard-block.
```

## D.3. Runtime

```text
[ ] One production spatial owner and one writer are configured.
[ ] Required target preparation occurs before plan activation.
[ ] Frontier topology resolution never moves traveller or advances time.
[ ] Action, activity and traversal executors use separate state contracts.
[ ] Timed-activity failed-retry lineage preserves exact elapsed/remaining time and never reactivates history.
[ ] No persistent open interval-result row exists.
[ ] Exact rational time is slice-independent and every additive delay occurrence is applied at most once.
[ ] Boundary switch has zero own time and exact side context.
[ ] Carrier attachment and root-location projection pass.
[ ] Any mode transition that changes root/attached ownership ends the current plan and hands off through a new plan without execution transfer.
[ ] Stranded save/load/rescue behavior passes.
[ ] Player projection contains no hidden topology.
[ ] Knowledge-target requests preserve the player-facing token and pin any factual resolution separately.
[ ] Portal-linked relations define exhaustive behavior for all portal states.
[ ] Active blocker composition and relation/position capacity are deterministic under locks.
[ ] Journey continuation compares exact handoff endpoint snapshots, not unlike location DTOs.
```

## D.4. Persistence and concurrency

```text
[ ] Partial unique predicates match appendix A statuses.
[ ] Global lock-order tests pass.
[ ] Parent/child idempotency retry returns identical results.
[ ] Same idempotency key with different digest is rejected.
[ ] Clock cannot advance without a matching committed result.
[ ] Concurrent frontier resolutions cannot exceed capacity.
[ ] Branch terminal resolution uses committed exhaustion; temporary reservations only block.
[ ] Concurrent movement and topology resolution cannot create free movement.
[ ] Active journey reload needs no mutable latest catalog state.
```

## D.5. Migration and integration

```text
[ ] Full v2 inventory and explicit mapping produced.
[ ] Ambiguous records are hard-blocked.
[ ] Legacy and package-oriented paths do not dual-write.
[ ] Import dry-run, apply, readback and rollback pass on PostgreSQL.
[ ] New-game and existing-save E2E pass.
[ ] Required docs, regional catalogs and module ownership maps synchronized.
[ ] Working README contains exact checks and critic cycles.
```

## D.6. Verification gate

```text
[ ] Contract unit tests passed.
[ ] Negative invariant tests passed.
[ ] Property tests for time slicing and route continuity passed.
[ ] Targeted package tests passed.
[ ] Full project tests passed.
[ ] PostgreSQL integration passed.
[ ] Generated artifacts reproduced without diff.
[ ] Independent critic returned PASS or acceptable PASS WITH NOTES.
```

Any unchecked mandatory item keeps this document `target`.

---

# Приложение E. Внутренний аудит редакции

## E.1. Аудит исходной редакции 4.0

Первый проход обнаружил следующие группы implementation-level замечаний:

1. active materialization v2 и target v3 были описаны как частично совмещаемые;
2. одинаковые contracts имели полные определения в разделах 0–35 и replacement-версии в разделе 36;
3. metadata ошибочно утверждала недоступность GitHub;
4. исторические номера 3.8/3.9/4.0 смешивались с текущим release plan;
5. readiness использовала два несовместимых имени preparation state;
6. actor/transport location существовали параллельно с generic journey location;
7. boundary crossing имел две competing schemas;
8. preparation bundle и preparation snapshot/claim сосуществовали;
9. interval одновременно описывался как persistent open row и как terminal-only result;
10. terminal ordinal `0` разрешался алгоритмом, но запрещался типом одного proposal;
11. terminal resolution требовал generated template даже без generation;
12. recheck table содержала неоднозначные outcomes «одно из двух»;
13. endpoint snapshot дублировал discriminator;
14. actor carrier position не запрещал несколько одновременных transport rows;
15. canonical layer не закреплял execution uniqueness по owner/scope;
16. lock order не везде начинался с party clock;
17. factor numerator допускал нулевое время;
18. additive delays смешивались с multiplicative factors;
19. target/direction XOR не был единственно зафиксирован;
20. stranded rescue не имел точного endpoint kind;
21. initial interval ordinal был неоднозначен;
22. progress monotonicity не была полной;
23. arrival materialization противоречила mandatory predeparture preparation;
24. queryable plural relations местами предлагались как embedded arrays;
25. integration plan ссылался на исторические contracts вместо текущей версии;
26. requires-step ошибочно требовал ровно один edge;
27. historical audit sections дублировали норматив и могли участвовать в code generation.

Все перечисленные группы устранены в разделах 0–17 и единственном contract catalog приложения B.

## E.2. Повторный статический аудит

Редакция 4.2 получена из загруженной редакции 4.1 и прошла восемь последовательных циклов «аудит → исправление → повторный аудит»:

1. **Структурный цикл:** устранены незамкнутые contract references, рабочий placeholder и неявные discriminator mappings.
2. **Movement-contract цикл:** формализованы action-cost movement, knowledge-target resolution, portal-state behavior, relation capacity и additive-delay occurrence.
3. **Route-state цикл:** введена единая side-context state machine для внутренних route points и сравнение handoff endpoint snapshots одного типа.
4. **Execution цикл:** исправлены failed-retry lineage timed activity и смена root/attached ownership без переноса активного execution.
5. **Expansion цикл:** устранён необязательный branch successor; каждый generated site создаёт ровно один successor frontier до terminal resolution.
6. **Concurrency цикл:** разделены committed и reservable capacity; временная reservation больше не может преждевременно закрыть branch frontier.
7. **Terminal-topology цикл:** закреплено атомарное создание или переиспользование exact target party projection, endpoint scene и обеих endpoint bindings.
8. **Synchronized-time цикл:** исчерпывающе определены positive-time и zero-time local results при общем root-transport clock.

После восьмого исправления выполнен отдельный финальный проход без внесения смысловых правок. Проверены разделы 0–17, state machines приложения A, все implementation contracts приложения B, typed errors приложения C и release boundary приложения D.

Финальный машинный статический прогон:

```text
markdown_lines: 6799
markdown_fences: 538
markdown_fences_balanced: true
yaml_contract_blocks: 160
yaml_parse_errors: 0
duplicate_yaml_keys: 0
contract_names: 160
duplicate_contract_names: 0
unresolved_contract_type_refs: 0
headings: 213
duplicate_headings: 0
typed_error_codes: 58
duplicate_typed_error_codes: 0
working_placeholders: 0
trailing_whitespace_lines: 0
unresolved_document_findings: 0
```

Неразрешённых документных замечаний в пределах критерия раздела 0.7: **0**.

## E.3. Ограничение результата

Внутренний документный аудит проверяет только непротиворечивость этой Markdown-редакции. Он не заменяет DDL generation, compiler/typecheck, runtime tests, PostgreSQL migration, Graphify regeneration или независимый project critic. Поэтому статус остаётся `target`.
