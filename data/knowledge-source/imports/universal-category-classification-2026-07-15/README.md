# Universal category classification — единый отчёт PR №7

**Ветка:** `chatgpt/universal-category-classification`
**Статус PR:** `draft`
**Статус policy:** `proposed`
**Охваченные этапы:** 1, 2, 3A и редакторская часть 3B-1

## 1. Цель работы

Ввести единый контролируемый классификационный слой для проекта, реализовать базовые DDL/import/readiness-контракты, подготовить нормализованную предметную модель и сформировать минимальный исторически обоснованный authoring candidate для предметов Новгородской земли XIII века.

Документ не объявляет policy `active`, не выполняет production import или legacy cutover. Stage 16 изменён только для fail-closed packing-slots precheck; Stage 8 и existing party instances не изменяются.

## 2. Изученные нормативы и подсистемы

Изучены актуальные версии:

- `AGENTS.md`;
- `.github/AGENTS.md`;
- `development_rules.txt`;
- `code_critic_invocation_rule.txt`;
- `code_driven_world_materialization_architecture.md`;
- `world_base_materialization_table_requirements.md`;
- `llm_documentation_navigation.md`;
- `read_only_database_and_graph_architecture.md`;
- `items_and_property.txt`;
- `character_inventory_equipment.txt`;
- `npc_inventory_item_marks.txt`;
- `npc_generation_profiles.txt`;
- `weapons_and_armor.txt`;
- `information_sources_llm_prompts.md`;
- world-base DDL, generated schema reference, importer/readiness, JSON Schema, Stage 8/16 contracts и tests.

## 3. Основные архитектурные решения

Сохраняется модель:

```text
category → template → profile → rule → instance
```

Зафиксированы правила:

- universal category не подтверждает историческую применимость;
- runtime использует только approved, version-pinned и region/period-applicable records;
- external mapping не создаёт regional permission;
- неизвестное или неоднозначное legacy значение становится `data_gap` или `migration_conflict`;
- пустой required candidate set является hard block;
- код и LLM не создают неизвестные категории;
- существующие party instances не рематериализуются;
- legacy fields не удаляются до отдельного cutover.

## 4. Этапы 1–2 — proposed policy и базовый classification layer

Выполнено:

- proposed policy и reference appendix зарегистрированы в canonical corpus и навигации;
- добавлены `classification_schemes`, `category_labels`, `category_scheme_mappings`;
- расширены `universal_categories`;
- ограничены relation/mapping types;
- добавлены SQL cycle guards;
- добавлены пять базовых authoring JSON Schema;
- реализованы manifest/cross-reference validation, dry-run, transactional adapter и readiness checks;
- `SCHEMA_REFERENCE.md` перегенерирован штатно.

Фактические проверки этапов 1–2:

- `test:world-catalog` — 39/39 PASS;
- `test:integration` — 21 PASS, 5 SKIP из-за отсутствия externally configured PostgreSQL;
- schema documentation/check — PASS;
- architecture check — PASS;
- corpus check — PASS;
- PostgreSQL 16 entrypoint — PASS, 111 tables;
- code critic — PASS после correction cycle.

## 5. Этап 3A — item/container classification framework

### 5.1. Gap analysis

Машинно значимые legacy `TEXT` в `item_templates`:

```text
item_type
function
typical_material
weight_band
size_band
durability
quality_band
value_band
rarity
legal_status
visibility_default
access_default
marking_default
risk_default
```

Legacy plural JSONB:

```text
typical_owner_roles
typical_holder_roles
typical_locations
typical_containers
skill_use
attribute_use
possible_modifiers
failure_risks
damage_or_wear_rules
```

### 5.2. Реализовано

- `item_template_category_bindings`;
- `container_template_facet_bindings`;
- `container_content_category_relations`;
- `item_classification_migration_inventory`;
- пять предметных authoring JSON Schema, включая equipment entries;
- fail-closed importer/readiness для active/replaced categories, compatibility, equipment XOR/FK/domain, regional/revision/period permission и primary-function exclusivity;
- legacy fields сохранены;
- Stage 8, Stage 16, pipeline order и party instances не изменены;
- схема расширена до 115 tables.

Фактические проверки этапа 3A:

- targeted item/container — 6/6 PASS;
- `test:world-catalog` — 45/45 PASS;
- `test:stage2-8` — 6/6 PASS;
- `test:stage16` — 13/13 PASS;
- `test:integration` — 21 PASS, 5 SKIP;
- schema documentation/check — PASS, 115 tables;
- PostgreSQL 16 schema entrypoint — PASS;
- architecture, corpus, generated artifact и diff checks — PASS;
- code critic — PASS WITH NOTES.

`npm test` и documentation validation не прошли из-за существующих untracked данных в `data/regional-summary-cache/` и `data/world-sessions/`. Эти данные не изменялись и не входят в PR.

## 6. Этап 3B-1 — редакторский authoring candidate

### 6.1. Добавленные документы

- `stage-3b1/STAGE_3B1_PLAN.md` — подробный план, hard gaps, порядок интеграции и критерии допуска;
- `stage-3b1/EDITORIAL_AUTHORING_CANDIDATE.md` — источники, controlled vocabulary proposal, 12 item templates, draft regional permission plan, blocked container proposals и migration boundary.

### 6.2. Минимальный предметный scope

Подготовлены draft candidates:

1. хозяйственный нож;
2. рабочий топор;
3. точильный камень;
4. деревянная ложка;
5. деревянная миска;
6. глиняный горшок для приготовления пищи;
7. железная швейная игла;
8. каменное пряслице;
9. железное кресало;
10. железный рыболовный крючок;
11. лук;
12. стрела.

Для каждого зафиксированы stable ID proposal, object type, primary function, materials, technique, use context, confidence, источники и ограничения.

### 6.3. Источники

Использованы как candidate references:

- Б. А. Колчин, `Железообрабатывающее производство Новгорода Великого`, 1959;
- Б. А. Колчин, `Новгородские древности. Деревянные изделия`, 1968;
- А. Ф. Медведев, `Оружие Новгорода Великого`, 1959;
- `Medieval Novgorod in Its Wider Context` — широкий контекст;
- действующие игровые нормативы проекта.

Page-level evidence в этом чате не получено. Поэтому все исторические records и permissions остаются `draft`/`needs_review`; `approved` не присваивается.

### 6.4. Каноническая граница миграции

Проверены:

- `data/world-base-sources/rus13-base-v1.manifest.json`;
- `tools/rus13-world-base-importer/world_base_importer_v1/config/world_base_import_manifest_v1.json`.

Tracked bundle не содержит item/container datasets. Текущий migration coverage:

```text
canonical legacy rows available: 0
mapped: 0
data gaps from canonical rows: 0
migration conflicts from canonical rows: 0
deferred external/local rows: unknown until export
```

Это не означает, что локальная PostgreSQL/NocoDB пуста. Для неё требуется отдельный tracked export и reviewed mapping.

### 6.5. Выявленные hard gaps

#### `CONTAINER_MATERIAL_FACET_MISSING` — закрыт технически

`container_template_facet_bindings` теперь допускает независимый `material` facet. Исторические container proposals всё ещё не approved: для них нет page-level evidence.

#### `CONTAINER_CAPACITY_UNIT_UNDEFINED` — закрыт технически

`container_templates.capacity` теперь означает положительную внутреннюю вместимость в packing slots. Closed policy строго равна `{version:1,mode:"packing_slots",unit:"packing_slot"}`; это не масса, литры или inventory slots персонажа.

#### `CONTAINER_COMPATIBILITY_TOO_COARSE`

Совместимость жидкости или сыпучего содержимого зависит от материала, конструкции, закрытия и состояния, а не только от формы контейнера.

#### `PAGE_LEVEL_SOURCE_VERIFICATION_REQUIRED`

Без страниц и каталожных номеров нельзя утверждать точные разновидности, размеры, материалы, технологию, частотность или социальную распространённость.

### 6.6. Решение по контейнерам

Подготовлены, но заблокированы proposals:

- ведро;
- бочка/кадь;
- мешок;
- кошель/небольшая сумка;
- сундук/ларь.

Они не преобразованы в import rows и не получили исторически выдуманную capacity.

### 6.7. Проверки этапа 3B-1

В этом чате выполнены только редакторские проверки authoring candidate:

- уникальность proposal IDs;
- одна primary function на item template;
- отсутствие составных material+form категорий;
- полнота ссылок внутри предложения;
- явные sources/confidence/limits;
- отсутствие guessed legacy mappings;
- отсутствие container fallback.

Не выполнялись:

- финальная JSON Schema validation репозиторных datasets;
- importer dry-run/apply;
- PostgreSQL integration;
- Stage 8/16 tests;
- generated artifacts;
- full test suite;
- code critic для 3B-1.

Эти проверки должен выполнить Codex после устранения hard gaps и преобразования редакторского candidate в versioned JSON datasets.

## 7. Порядок дальнейшей интеграции

1. Codex сверяет branch head и обязательные нормативы.
2. Подтверждает page-level historical evidence для container templates.
3. Экспортирует фактические local item/container records, если они существуют.
4. Получает page-level source evidence.
5. Экспортирует фактические local item/container records, если они существуют.
6. Формирует reviewed migration inventory.
7. Создаёт JSON datasets и manifest с реальными digests.
8. Запускает schema/cross-reference/import/readiness/PostgreSQL/Stage 8/16/full tests.
9. Перегенерирует generated artifacts штатными командами.
10. Вызывает code critic с предыдущим `PASS WITH NOTES` и полным diff.

## 7A. Этап 3B-1 — фактическая инвентаризация Codex

- PR head до начала реализации: `8b139ca3b883a54308bd70d30b99612ec0a14d11`; локальный
  `af8cbc2` был позади и fast-forward выполнен до актуального draft PR head.
- Проверены `container_templates.capacity`, DDL, readiness, Stage 8/16, party schemas,
  tracked world-base bundle, importer manifest и source datasets. Точного runtime consumer
  integer `capacity` не найден: он встречается в DDL и test fixtures; Stage 16 и party
  persistence не используют его как измеряемую величину.
- `container_templates.capacity` формализован как внутренняя вместимость в packing slots;
  `packing_slot_cost` задаёт внешний размер контейнера. Closed policy v1 строго равна
  `{version: 1, mode: "packing_slots", unit: "packing_slot"}`. Это не масса, литры или
  inventory slots персонажа. Предмет использует единственный approved `size_band` binding:
  `ceil(quantity / packing_bundle_size) × packing_slot_cost`; fallback `1`, сокращение quantity
  и скрытое создание контейнера запрещены.
- `container_template_facet_bindings` расширен независимым `material` facet. Form и
  material остаются раздельными; container proposals всё ещё не импортируются, потому что
  page-level historical evidence и formal construction/compatibility data отсутствуют.
- Tracked canonical item/container authoring rows: 0; local PostgreSQL/NocoDB canonical
  export не настроен. Зафиксирован gap `EXTERNAL_LEGACY_ROWS_UNAVAILABLE`; migration
  inventory для tracked scope остаётся пустым, без заявления о coverage внешних строк.
- Граница изменения: DDL/schema/importer validation/Stage 16/test fixtures/documentation для
  material facet и packing slots v1. Не создаются draft historical datasets до
  page-level source support; не выполняются production import, apply, runtime activation,
  cutover или rematerialization.

## 8. Оставшиеся задачи

- получить page-level evidence и подготовить import-ready historical datasets для 3B;
- 3B-2: отдельный legacy cutover только после полного coverage report;
- этап 4: строения, помещения и G5;
- этап 5: ландшафт, вода и землепользование;
- этап 6: NPC;
- этап 7: социальные категории, профессии, навыки и знания;
- этап 8: упрощённые животные;
- этап 9: полный migration/activation gate и возможное повышение policy в `active` после PASS.

## 7B. Этап 3B-1 — packing slots v1

### Реализовано

- `container_templates.capacity` и `packing_slot_cost` — положительные integer; policy закрыта
  точным JSON `{version:1,mode:"packing_slots",unit:"packing_slot"}`.
- Packing metadata предмета существует только на `size_band` binding: положительные
  `packing_slot_cost` и `packing_bundle_size`. Approved template без одного size binding —
  hard block; два binding — active ambiguity.
- `calculatePackingSlots` является чистой публичной функцией:
  `required_slots = ceil(quantity / packing_bundle_size) × packing_slot_cost`.
- Import/readiness проверяет exact policy, положительные integer, отсутствие packing metadata
  вне `size_band`, missing/ambiguous size binding и minimum profile content, превышающее capacity.
- Category-only required content разрешается только в ровно один approved template (через
  `item_templates.category_id` либо approved `object_type` binding); отсутствие или
  неоднозначность дают hard block `CONTAINER_CONTENT_CATEGORY_TEMPLATE_UNRESOLVED`, а не
  неявное допущение о packing size.
- Stage 16 до audit/commit проверяет выбранные items и nested containers; `CONTAINER_CAPACITY_EXCEEDED`
  содержит template, capacity, used slots и line breakdown. Trace хранится в evidence code precheck.

### Фактически выполненные проверки и аудит packing slots v1

- `npm run test:world-catalog` — PASS, 52/52;
- `npm run test:stage16` — PASS, 15/15;
- `npm run test:stage2-8` — PASS, 6/6;
- `npm run test:integration` — PASS, 21 passed / 5 skipped (PostgreSQL-dependent cases);
- `npm run world-db:schema-check`, `npm run world-db:schema-doc-check`, `npm run architecture:check`
  и `npm run knowledge:check-corpus` — PASS; schema reference: 115 tables, digest
  `6e2bbf17e0794ab1173cb26dd99126c691f7c8fbb6712eda97417cb3d2c2adda`;
- в чистом detached worktree `npm run docs:generate`, `npm run docs:check` и полный `npm test`
  — PASS; browser e2e пропущен из-за отсутствующего Chromium;
- `git diff --check main` — PASS. Реальный PostgreSQL 16 entrypoint/integration не запущен:
  Docker Compose заблокирован отсутствующим `POSTGRES_PASSWORD`, `psql` не установлен.
- Code critic: первый проход — `CHANGES REQUIRED` (category-only content не имел детерминированного
  template для расчёта capacity); исправление и тест добавлены, повторный аудит — `PASS`.

### Не выполнено и остаётся открытым

- историческое approval, production import, cutover и runtime activation не выполнялись;
- `CONTAINER_COMPATIBILITY_TOO_COARSE`, `PAGE_LEVEL_SOURCE_VERIFICATION_REQUIRED` и
  `EXTERNAL_LEGACY_ROWS_UNAVAILABLE` остаются открытыми;
- full historical catalog, migration existing local rows и rematerialization party instances — только этап 3B;
- Cairn SRD v1 допускается лишь как вдохновение абстрактной игровой механики, не исторический источник.

## 9. Текущий итог

Этапы 1–3A реализованы технически и проверены в объёме, указанном выше. В этом чате выполнена содержательная редакторская часть 3B-1. Она подготовила предметный каталог-кандидат и выявила блокирующие дефекты контейнерной модели, но не объявлена import-ready и не активирована.

## 10. Stage 3B-1 — inventory foundation v1: исходное состояние и gap analysis

### Цель и границы

Реализуется только технический каркас личного инвентаря: нормализованная topology
instances, независимые packing slots / масса / руки / access, чистое планирование
переносов и visible-only presentation projection. Outward используется только как
игровое вдохновение: экипировка, quick container и основной переносимый контейнер
разделены; историческим источником он не является. Historical authoring rows,
production import, legacy cutover, rematerialization и runtime command activation не
входят в этот этап.

### Фактическая схема и существующие контракты

- `party_runtime.party_items` хранит template/profile/category, quantity, condition и
  legal status; `party_item_placements` уже имеет PK `(party_id,item_id)` и SQL
  exactly-one target (`anchor`, `container`, NPC holder или character holder).
- `party_runtime.party_containers` уже хранит exactly-one anchor/parent/holder target
  и SQL self-containment block, но не имеет нормализованных carrying/equipment facts.
- `party_ownership` уже разделяет owner/controller от holder; `party_visible_read_models`
  — единственная versioned public projection.
- `item_template_category_bindings` содержит единственный approved `size_band` и packing
  metadata; `container_templates` содержит exact packing-slots v1 policy. Их расчёт
  повторно не реализуется.

### Gaps до inventory foundation

- `@rus/items-property` работает с legacy nested `contents`, суммирует только один
  уровень, подставляет mass `0` и не знает normalized placement graph, cycles, hands,
  containment depth или structured inventory errors.
- В authoring нет строго типизированного approved profile, который одновременно
  разрешает mass, `carry_form`, `external_hand_cost` и роль quick/primary container;
  существующие свободные JSONB `state` предназначены только для snapshot/state, не для
  queryable inventory topology.
- Stage 16 материализует scene anchor placements и проверяет packing slots, но не
  выводит initial inventory placement, mass/hands/access trace или exact inventory data
  gap. Stage 24/25 переносят утверждённые rows, однако не имеют inventory-specific
  topology gate/read model contract.
- Presentation показывает generic JSON inventory panel, а не versioned visible-only
  inventory contract; UI не должен стать calculator.
- Межстрочные constraints (cycles, depth, unique primary container, hands, equipment
  exclusivity, same-party parent) требуют application gate; SQL остаётся только для
  row-local FK/CHECK/exactly-one invariants.

### Решение

Расширяется существующий `@rus/items-property`, а не создаётся второй calculator.
Нужные queryable template parameters получают минимальные нормализованные authoring
profiles; `party_item_placements` и `party_containers` остаются source of truth
physical placement. Derived zone, total mass, load, hands, packing usage и access
хранятся только в immutable trace/validated public projection. Неизвестная mass,
placement, template parameter, compatibility или command catalogue оформляется
типизированным hard gap без fallback.

### Реализованный inventory foundation v1

- New normalized authoring tables: `item_template_inventory_profiles` and
  `container_template_inventory_profiles`. Они требуют source/revision, `mass_grams`,
  `carry_form`, `external_hand_cost`, status; контейнер добавляет closed `inventory_role`.
  Никаких исторических rows в них не создано.
- `party_runtime` сохраняет only physical facts: existing exactly-one target, optional
  physical position/equipment slot, container condition/closure и separated character
  controller. Derived inventory zone/totals в DDL не сохраняются.
- `@rus/items-property` экспортирует pure `validateInventoryTopology`,
  `calculateInventoryMass`, `resolveInventoryLoad`, `calculateHandsState`,
  `resolveInventoryAccess`, `deriveInventoryZone`, `calculateContainerUsage`,
  `buildInventoryStackSignature`, `planInventoryTransfer`. `calculateContainerUsage`
  использует existing public `calculatePackingSlots` через explicit injected
  `packing_calculator`, не дублируя формулу и не нарушая architecture boundary.
- Stage 16 получает optional explicit `inventory_foundation`. Если `required=true` и
  candidate/physical profiles отсутствуют, выдаётся `INITIAL_INVENTORY_PLACEMENT_DATA_GAP`;
  иначе precheck сохраняет immutable trace mass/hands/access/capacity. Existing scene-item
  route не меняется и не активирует inventory implicit fallback.
- Stage 24 только переносит approved physical position/slot/closure fields в fixed plan;
  Stage 25 сохраняет generic schema-qualified batches атомарно. Stage 19 не менялся.
- `@rus/presentation` добавляет versioned visible-only `inventory_panel`; он не принимает
  IDs, hidden/unknown contents или diagnostics и не выполняет gameplay calculation.

### Текущие ошибки и неактивированные части

Основные structured errors: `INITIAL_INVENTORY_PLACEMENT_DATA_GAP`,
`ITEM_MASS_DATA_GAP`, `ITEM_CARRY_PROFILE_DATA_GAP`, `INVENTORY_PLACEMENT_AMBIGUOUS`,
`INVENTORY_CYCLE_DETECTED`, `INVENTORY_NESTING_LIMIT_EXCEEDED`,
`INVENTORY_HANDS_EXCEEDED`, `INVENTORY_CARRY_FORM_INCOMPATIBLE`,
`INVENTORY_PRIMARY_CONTAINER_AMBIGUOUS`, `INVENTORY_DROP_ANCHOR_MISSING`,
`CONTAINER_CAPACITY_EXCEEDED`, `STATE_VERSION_MISMATCH`.

`planInventoryTransfer` строит immutable change set для `pick_up`, `put_down`,
`move_to_container`, `take_from_container`, `equip`, `unequip`,
`move_to_quick_container`, `move_to_primary_container`, а также
`drop_primary_container`/`recover_primary_container`. Он проверяет topology, access,
capacity, hands, mass, load и optimistic `state_version`, но не является runtime handler
и ничего не записывает. Неизвестный command остаётся fail-closed
`TURN_INVENTORY_COMMAND_CATALOG_GAP`. Не выполнены historical approval/import, Stage 8
candidate enrichment, production activation, legacy cutover/rematerialization. Открытые
gaps сохраняются:
`PAGE_LEVEL_SOURCE_VERIFICATION_REQUIRED`, `EXTERNAL_LEGACY_ROWS_UNAVAILABLE`,
`CONTAINER_COMPATIBILITY_TOO_COARSE`.

Новые/уточнённые ошибки: `INVENTORY_QUANTITY_INVALID`,
`INVENTORY_TARGET_NOT_FOUND`, `INVENTORY_EQUIPMENT_SLOT_REQUIRED`,
`INVENTORY_LOAD_EXCEEDED`, `PRESENTATION_INVENTORY_INVALID`. Quantity, strength и
derived summary больше не получают скрытое значение по умолчанию.

Физическое размещение теперь строго requires exactly one placement row для каждого
item/container. Для `holder_character_id` обязателен один из closed
`physical_position`; `equipped` требует equipment slot, а slot вне `equipped` запрещён.
Те же инварианты проверяются DDL, pure topology, derived zone/access и Stage 24 write-plan
до любого materialization write.

### Red → Green и выполненные проверки

- Red: `packages/items-property/test/inventory-foundation.test.js` сначала завершился
  ошибкой отсутствующих public exports; `test/modules/stage16-inventory-foundation.test.js`
  — отсутствующим Stage 16 evaluator; `packages/presentation/test/inventory-panel.test.js`
  — отсутствующим panel contract. После добавления fail-closed quantity и общего planner
  inventory-test имел 2 ожидаемых failing assertions: неявный `quantity → 1` и отсутствие
  `move_to_container`; panel-test — отсутствие rejection неполной derived summary.
- Green (дополнительный прогон): inventory/presentation/Stage 16 targeted tests —
  15/15 PASS. `docs:generate`, `docs:check` и `knowledge:check-corpus` в clean worktree
  — PASS; обновлены source и generated legacy inventory manifests для `interface_ux.md`.
- Full-suite correction: `architecture:check` первоначально нашёл запрещённый direct import
  domain → world-catalog и превышение лимита `inventory.js`; `test:knowledge-source`
  нашёл stale `import-history` digest. Исправлено split container-usage boundary,
  explicit calculator injection и synchronized import-history; повторные
  `architecture:check` и `test:knowledge-source` — PASS (20/20).
- Audit correction: критик последовательно выявил missing placement row и player holder
  без physical position. Добавлены typed topology errors, reverse DDL checks,
  Stage 24 reject (`WRITE_PLAN_PHYSICAL_POSITION_REQUIRED`) и negative tests для item,
  container/equipped slot/Stage 24; final повторный аудит ожидается после этого цикла.
- Последующий audit correction: zone projection для item inside container теперь обходит
  полный item → container → parent path, различает root quick/primary container и
  hard-blocks missing/cyclic path. Добавлены quick/primary/nested/missing/cycle tests.
- Green: targeted domain/presentation/Stage 16 tests — 18/18 PASS;
  `npm run test:world-catalog` — 52/52 PASS;
  `npm run test:stage16` — 17/17 PASS; `npm run test:stage24` — 20/20 PASS;
  `npm run test:stage25` — 19/19 PASS; `npm run test:stage2-8` — 6/6 PASS;
  `npm run test:integration` — 21 passed / 5 skipped.
- `npm run world-db:schema-check` and `world-db:schema-doc-check` — PASS, 117 tables,
  digest `81c867c1706be45b8ff3f9064d4b3ab09b70c7a2038d57823bea157c32ef5744`.
- `knowledge:generate` and `knowledge:check-corpus` — PASS. Main-worktree `docs:generate`
  is blocked only by preserved user runtime files under `data/regional-summary-cache/` and
  `data/world-sessions/`; final docs/full suite run is required in a clean worktree.
