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
- Stage 16 до audit/commit проверяет выбранные items и nested containers; `CONTAINER_CAPACITY_EXCEEDED`
  содержит template, capacity, used slots и line breakdown. Trace хранится в evidence code precheck.

### Не выполнено и остаётся открытым

- историческое approval, production import, cutover и runtime activation не выполнялись;
- `CONTAINER_COMPATIBILITY_TOO_COARSE`, `PAGE_LEVEL_SOURCE_VERIFICATION_REQUIRED` и
  `EXTERNAL_LEGACY_ROWS_UNAVAILABLE` остаются открытыми;
- full historical catalog, migration existing local rows и rematerialization party instances — только этап 3B;
- Cairn SRD v1 допускается лишь как вдохновение абстрактной игровой механики, не исторический источник.

## 9. Текущий итог

Этапы 1–3A реализованы технически и проверены в объёме, указанном выше. В этом чате выполнена содержательная редакторская часть 3B-1. Она подготовила предметный каталог-кандидат и выявила блокирующие дефекты контейнерной модели, но не объявлена import-ready и не активирована.
