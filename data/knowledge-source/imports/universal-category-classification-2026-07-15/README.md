# Universal category classification — единый отчёт PR №7

**Ветка:** `chatgpt/universal-category-classification`
**PR:** `#7`, draft, base `main`
**Статус policy:** `proposed`
**Охваченные этапы:** 1, 2, 3A, inventory foundation 3B-1 и редакторский каталог 120 предметов

## 1. Цель работы

Ввести контролируемую цепочку:

```text
category → template → profile → rule → instance
```

и подготовить техническую и редакторскую основу, при которой:

- код не придумывает категории, историю и отсутствующие варианты;
- runtime использует только approved, version-pinned и region/period-applicable records;
- предметы, контейнеры и ownership materialize детерминированно из утверждённых profiles/rules;
- пустой required candidate set создаёт data gap и hard block;
- существующие party instances не рематериализуются автоматически;
- draft authoring не влияет на runtime до import/readiness/approval.

Текущий PR не выполняет production import, legacy cutover, runtime command activation или повышение policy в `active`.

## 2. Изученные нормативы

Перед текущим редакторским проходом повторно прочитаны актуальные версии `main`:

- `AGENTS.md`;
- `.github/AGENTS.md`;
- `development_rules.txt`;
- `code_critic_invocation_rule.txt`;
- `code_driven_world_materialization_architecture.md`;
- `world_base_materialization_table_requirements.md`;
- `llm_documentation_navigation.md`;
- `items_and_property.txt`;
- `character_inventory_equipment.txt`;
- `npc_inventory_item_marks.txt`;
- `weapons_and_armor.txt`;
- `information_sources_llm_prompts.md`.

Также изучены текущие Stage 3B-1 документы и единый README ветки.

## 3. Этапы 1–3A — classification foundation

В рамках PR ранее реализованы:

- proposed universal classification policy и references;
- `classification_schemes`, labels и scheme mappings;
- расширенный `universal_categories` layer;
- нормализованные item/container facet bindings;
- item classification migration inventory contract;
- JSON Schema, importer и materialization-readiness gates;
- SQL guards и generated schema documentation;
- сохранение legacy fields до отдельного cutover.

Universal category сама по себе не доказывает историческую применимость. Для runtime требуется отдельное regional/period permission.

## 4. Inventory foundation

Технический inventory foundation завершён в этом же PR до начала текущего редакторского прохода.

Реализованы:

- normalized inventory profiles;
- обязательные item/container placements;
- topology validation;
- inventory zones;
- масса, нагрузка, hands state и access;
- packing slots;
- immutable transfer planner;
- Stage 16 inventory trace;
- Stage 24/25 persistence boundaries;
- visible-only inventory panel;
- fail-closed quantity, mass, placement, physical-position, equipment-slot, path, cycle и packing gaps.

Последний зафиксированный аудит этого технического этапа: `PASS WITH NOTES`.

### 4.1. Фактически зафиксированные проверки inventory foundation

- `npm test` — PASS;
- world-catalog — 52/52;
- Stage 2–8 — 6/6;
- Stage 16 — 17/17;
- Stage 24 — число в прежних отчётах расходилось между 20/20 и 21/21 и должно сверяться по конкретному test output;
- Stage 25 — 19/19;
- integration — 21 PASS / 5 SKIP;
- docs/schema/corpus/architecture/generated checks — PASS;
- GitHub Actions на SHA `8f0f4a1e7b93da16b6fdb0bfa8829bcd2a3eee1f` — success, включая PostgreSQL 16 service и исполнение world-base DDL.

Отдельная party-runtime PostgreSQL integration локально не была подтверждена. Browser E2E пропущен из-за отсутствия Chromium.

## 5. Этап 3B-1 — редакторский каталог 120 предметов

### 5.1. Решение по исторической проверке

Для широкого template принят упрощённый gate:

```text
предмет этого общего типа мог встречаться
в Новгородской земле около 1230 года
и не является явным анахронизмом
```

Постраничная типологическая проверка не требуется для самого факта существования широкого типа. Она остаётся обязательной, если утверждаются:

- точная конструкция или археологическая разновидность;
- конкретный материал экземпляра;
- точные масса или размеры;
- узкая датировка;
- техника производства;
- историческая частотность;
- социальная распространённость.

Все новые строки остаются `draft`. Упрощение проверки не означает автоматического `approved`.

### 5.2. Новые документы

В `stage-3b1/` поддерживаются:

- `STAGE_3B1_PLAN.md` — границы, этапы, таблицы и критерии готовности;
- `HISTORICAL_SOURCE_REGISTER.md` — evidence classes, source families и gaps;
- `ITEM_CATALOG_120.md` — полный перечень 120 stable template ID proposals;
- `EDITORIAL_AUTHORING_CANDIDATE.md` — сводный статус, решения и порядок технической интеграции.

### 5.3. Состав каталога

| Группа | Количество |
|---|---:|
| контейнеры и хранение | 18 |
| домашний быт и кухня | 15 |
| ремесло и текстиль | 20 |
| земледелие и рыболовство | 15 |
| огонь, свет и дорога | 8 |
| одежда, личные и религиозные вещи | 16 |
| пища, сырьё и товары | 12 |
| письменность, торговля и запирание | 7 |
| оружие и защита | 9 |
| **Итого** | **120** |

Из них:

```text
container templates = 18
item templates = 102
unique stable IDs = 120
```

Каталог включает мешок, затягивающийся кошель, поясную сумку с клапаном и небольшую мягкую сумку.

### 5.4. Принятые решения

- форма контейнера и материал являются разными facet bindings;
- ножны, колчан и игольник являются специализированными контейнерами;
- рабочий и боевой топоры разделены по функции и профилю;
- кресало, кремень и трут остаются отдельными предметами;
- пища, вода и сырьё требуют quantity/container/spoilage profiles;
- стационарные лари, кадки и бочки не становятся личным inventory автоматически;
- оружие и броня требуют role/status/property/legal rules;
- historical presence не задаёт packing cost, mass, price или commonness.

## 6. Evidence model

Используются классы:

- `direct_novgorod`;
- `direct_novgorod_or_rus_period`;
- `rus_period_with_novgorod_context`;
- `comparative_period`.

Source families отделяют:

- железо, дерево и текстиль;
- бытовую утварь и керамику;
- контейнеры и кожаные изделия;
- земледелие и рыболовство;
- огонь, освещение и дорожный быт;
- пищу и торговые товары;
- бересту, писала, весы, гири, замки и пломбы;
- вооружение;
- проектные игровые нормативы.

Проектные нормативы не используются как историческое доказательство.

## 7. Сохраняющиеся gaps

- `HISTORICAL_PRESENCE_EVIDENCE_REQUIRED` — нет достаточного общего основания присутствия;
- `NARROW_TYPOLOGY_EVIDENCE_REQUIRED` — требуется узкая типология или датировка;
- `COMMONNESS_NOT_ESTABLISHED` — нельзя назначать историческую частотность;
- `PHYSICAL_PARAMETER_EVIDENCE_REQUIRED` — неизвестны размеры/масса и нет утверждённой процедуры вывода;
- `CONTAINER_COMPATIBILITY_TOO_COARSE` — совместимость зависит от материала, конструкции, закрытия и состояния;
- `CANONICAL_LEGACY_ROWS_UNAVAILABLE` — tracked bundle не содержит external/local legacy rows.

Технические gaps container material facet и packing-capacity semantics закрыты ранее inventory foundation.

## 8. Каноническая граница миграции

Tracked GitHub bundle не содержит legacy item/container datasets, пригодных для reviewed mapping.

Текущий migration inventory:

```text
canonical legacy rows available: 0
mapped: 0
data gaps from canonical rows: 0
migration conflicts from canonical rows: 0
deferred external/local rows: unknown until export
```

Это не доказывает отсутствие строк в локальной PostgreSQL или NocoDB. Они должны быть экспортированы как отдельный versioned input.

## 9. Состояние до технической реализации Stage 3B-1

Первый редакторский проход изменял или добавлял только Markdown-документы:

- `stage-3b1/STAGE_3B1_PLAN.md`;
- `stage-3b1/HISTORICAL_SOURCE_REGISTER.md`;
- `stage-3b1/ITEM_CATALOG_120.md`;
- `stage-3b1/EDITORIAL_AUTHORING_CANDIDATE.md`;
- этот единый `README.md`.

На тот момент DDL, JSON Schema, importer, runtime code, Stage 8/16, party state и generated artifacts не изменялись. Это историческая запись; последующий технический проход реализован и зафиксирован в разделе 13.

## 10. Проверки редакторского прохода до технической реализации

Фактически выполнены редакторские проверки:

- ровно 120 строк каталога;
- 120 уникальных stable IDs;
- 18 containers и 102 items;
- сумма девяти групп равна 120;
- обязательные мешки и кошели присутствуют;
- каждая строка имеет kind, group, evidence class, source family и `draft` status;
- source families имеют уникальные IDs;
- исторические источники отделены от игровых нормативов;
- не назначены выдуманные цена, масса, packing cost, capacity или commonness;
- old 12-item authoring document синхронизирован с каталогом 120;
- production activation не выполнялась.

Для docs-only редакторского прохода не запускались:

- JSON Schema validation datasets;
- importer dry-run/apply;
- PostgreSQL integration;
- Stage 8/16 tests;
- full `npm test`;
- generated-artifact checks;
- code critic.

Причина: тот проход изменял только редакторскую документацию. Полные проверки технического draft bundle приведены в разделе 13.

## 11. Порядок интеграции после технической реализации

Следующий этап выполняется в том же PR и должен:

1. перечитать обязательные нормативы и проверить актуальный branch head;
2. выполнить supplemental PostgreSQL apply/readback/rollback в disposable PostgreSQL 16 — выполнено; lifecycle остаётся проверкой draft bundle;
3. разрешить individual historical source records и template-source bindings — начато: 15 agriculture/fishing templates имеют нормализованные `record_sources` на существующие source IDs base bundle; остальные 105 требуют individual bibliography;
4. провести material и physical-parameter review;
5. technical draft bulk-good quantity model реализована: 12 profiles используют явную нормализованную единицу `g` и `explicit_only`; historical/editorial review и complete container compatibility остаются;
6. расширить draft item/property/equipment profiles только на verified role/occupation IDs;
7. экспортировать внешние legacy rows и построить reviewed migration inventory;
8. выпустить promotion-readiness report;
9. не повышать policy, revision или records в `active/approved` без всех отдельных gates и прямого указания пользователя.

## 12. Известные ограничения

- 120 строк являются широкими types, а не полной археологической типологией;
- создан один draft project-authoring `source_record`; 15 существующих historical source IDs base bundle привязаны через `record_sources` только как background evidence широкого типа, 105 templates остаются без individual source link;
- individual evidence bindings требуют библиографической сверки;
- commonness/weights не исследованы;
- physical parameters и игровые profiles созданы только как `draft`/`gameplay_estimate` и требуют review;
- container content profiles созданы, но неспециализированная compatibility остаётся deliberately coarse;
- external/local migration inventory отсутствует;
- supplemental dry-run и disposable PostgreSQL 16 apply/readback/digest/rollback/repeat apply пройдены; production import, cutover и runtime activation не начаты;
- PR остаётся draft.

## 13. Этап 3B-1 — технический draft bundle

**Starting SHA:** `815b81eb0ef613fd97cf1c16e895d6b7ebbc05d5` (verified against PR #7 before edits).

**Starting SHA текущего прохода:** `5a7d93f71237566073c891df773ac1213a1a5ef7`; актуальный head PR №7 сверён с GitHub перед изменениями. Граница неизменна: policy/revision не активируются, runtime candidates не расширяются, party instances не изменяются.

Новый `stage-3b1/bundle/` — отдельный воспроизводимый supplemental manifest. Он содержит 102 item templates, 18 container templates, 146 draft categories/labels/region options, нормализованные object/function/context bindings, draft inventory profiles, 18 container-content profiles, 16 item profile sets, 10 property profiles, один equipment profile с проверенным `nov_role_guard` и 15 нормализованных `record_sources` links на существующие source IDs parent bundle. Перед dry-run и PostgreSQL lifecycle `parent-source-bundle.js` проверяет SHA-256 parent archive `rus13-base-v1.tar.gz`, SHA-256 извлечённого `source_records_unified_v1.csv` и наличие обеих source records; external IDs не берутся из ручного allowlist. Все SHA-256 digests datasets вычисляются из canonical JSON arrays скриптом `scripts/generate-stage-3b1-bundle.mjs`.

Bundle является только authoring-входом: `approval = draft`, `deletion_policy = none`, все строки со статусом остаются `draft`. `validateSupplementalCatalogBundle` применяет фактические JSON Schema каждого dataset (включая closed fields, enum, `oneOf` и `not`), сверяет `$id` схемы, digest/count, FK и локальные/external references, и отклоняет party/unknown tables, dangling links, invalid XOR rows, отсутствующий object type и ambiguous primary function. `npm run world-db:import:stage3b1:dry-run` не выполняет запись и возвращает фактические counts.

Physical values помечены как `gameplay_estimate` в `PHYSICAL_PARAMETER_REVIEW_TABLE.md`; они не являются историческими измерениями. Пятнадцать agriculture/fishing templates получили background links на существующие historical source records, но это не закрывает `NARROW_TYPOLOGY_EVIDENCE_REQUIRED`; остальные 105 coverage rows сохраняют `HISTORICAL_PRESENCE_EVIDENCE_REQUIRED`. Для 12 bulk templates добавлены draft normalized quantity profiles: canonical `g`, identity conversion, `explicit_only` без скрытого default и deterministic mass input `1 g/g`; историческая мера и editorial review остаются `QUANTITY_PROFILE_REVIEW_REQUIRED`. Ни record, ни revision, ни policy не активированы; Stage 8/16 runtime candidates не изменены, но его explicit inventory-foundation path теперь hard-blocks quantity profile без unit.

Технические artifacts: `TARGET_TABLE_COVERAGE.md`, `PHYSICAL_PARAMETER_AUTHORING_POLICY.md`, `PHYSICAL_PARAMETER_REVIEW_TABLE.md`, `NORMALIZATION_COVERAGE_REPORT.md`, `DATA_GAPS.md`, `CODEX_INTEGRATION_REPORT.md` и `POSTGRESQL_INTEGRATION_REPORT.md`.

Фактически выполнено до current quantity-model прохода: `test:stage16` — 18/18; Stage 2–8 migration tests — 6/6; schema check и generated reference — 119 tables с read-only grants; targeted item quantity test — 12/12; supplemental bundle test — 22/22; supplemental importer dry-run — PASS (23 datasets); disposable PostgreSQL 16 lifecycle — PASS на новой 119-table схеме: apply/readback/digest, rollback, repeat apply и оба DB guards: несоответствие profile/unit dimension и изменение referenced unit dimension. Ранее пройдены Stage 24 — 21/21; Stage 25 — 19/19; domain — 67/67; integration — 21 PASS / 5 SKIP; `npm test` — PASS; schema/docs/corpus/architecture checks — PASS. Browser E2E — 1 SKIP без Chromium. Lint/typecheck scripts в `package.json` отсутствуют.

Обязательный повторный code critic завершился `PASS WITH NOTES`: parent source IDs теперь выводятся только из digest-verified parent archive; unknown source/target/table и ordering links покрыты negative tests. Note: critic повторно проверял unit/contract suite и dry-run, а отдельно PostgreSQL lifecycle опирался на фактически выполненный интеграционный прогон исполнителя. PostgreSQL lifecycle больше не является ограничением: он выполнен в disposable PostgreSQL 16 с явно заданными временными credentials.
