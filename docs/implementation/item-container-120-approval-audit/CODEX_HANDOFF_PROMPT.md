# Codex handoff: complete approval of all 120 item/container templates

Работай только в существующем PR #17 репозитория `PavelSlaven/Novgorod1230`.

- Branch: `chatgpt/item-container-120-approval-audit`
- Base commit at task start: `8c9e8db9b275e2be9b9e5eb28b59c49e8baef068`
- Existing source ledger: `docs/implementation/item-container-120-approval-audit/SOURCE_RESEARCH_LEDGER.json`
- Single work log: `docs/implementation/item-container-120-approval-audit/README.md`

Не создавай новый PR. Не добавляй Spatial v3, P28, new-game preflight, runtime cutover или миграцию старых партий. Scope — только историко-редакторская и техническая готовность полной когорты 120 item/container templates, их atomic approval и Stage 3C promotion без activation.

## Обязательное начало

1. Открой и полностью прочитай актуальные `AGENTS.md` и `.github/AGENTS.md` из текущего `main`.
2. Выполни все обязательные чтения и Repository Intelligence требования из них.
3. Полностью прочитай как минимум:
   - `data/knowledge-source/corpus/DOCUMENTS/development_rules.txt`;
   - `data/knowledge-source/corpus/DOCUMENTS/code_critic_invocation_rule.txt`;
   - `data/knowledge-source/corpus/DOCUMENTS/code_driven_world_materialization_architecture.md`;
   - `data/knowledge-source/corpus/DOCUMENTS/world_base_materialization_table_requirements.md`;
   - `data/knowledge-source/corpus/DOCUMENTS/llm_documentation_navigation.md`;
   - `data/knowledge-source/corpus/DOCUMENTS/items_and_property.txt`;
   - `data/knowledge-source/corpus/DOCUMENTS/character_inventory_equipment.txt`;
   - `data/knowledge-source/corpus/DOCUMENTS/npc_inventory_item_marks.txt`;
   - `data/knowledge-source/corpus/DOCUMENTS/information_sources_llm_prompts.md`.
4. Зафиксируй repository root, remote, branch, HEAD, `origin/main`, версии инструментов и отсутствие несвязанных изменений.
5. Выполни RAG и Graphify queries для точных информационных потребностей:
   - all-120 editorial readiness and atomic promotion;
   - item/container source bindings and claim scopes;
   - physical parameter, quantity and compatibility profiles;
   - Stage 3C promotion and PostgreSQL integration.
6. Сверь ledger с актуальным `main`. Если `main` изменился содержательно, обнови ledger и README до продолжения.

## Нормативный результат

Approval разрешён только если одновременно:

- cohort содержит ровно 102 item и 18 container templates;
- каждый template имеет reviewed claim-scoped bindings для обязательных scopes;
- подтверждены период и регион;
- подтверждены либо явно ограничены типология, материалы и конструкция;
- физические параметры полностью заполнены и проверены;
- закрыты 12 quantity profiles;
- закрыты compatibility/content/nesting/access rules для 18 containers;
- региональные permissions, profile membership и G4 materialization rules образуют полную approved dependency closure;
- all-120 readiness возвращает `approval_cohort_ready=true` и `ready_for_editorial_approval_count=120`;
- PostgreSQL dry-run/apply/readback/rollback проходят;
- профильные и полные тесты проходят;
- независимый критик возвращает `PASS` или допустимый `PASS WITH NOTES`;
- approval plan переводит всю когорту и её dependency closure атомарно; partial approval запрещён.

При любом незакрытом обязательном пункте оставь статусы `draft`, не ослабляй gate и обнови README точным hard block.

## Этап 1. Получить и зафиксировать источники

Используй `SOURCE_RESEARCH_LEDGER.json` только как карту доступа, а не как доказательство claims.

Для каждой из 11 source groups:

1. Получи легально доступную цифровую копию или доступ через библиотечный просмотрщик.
2. Зафиксируй stable source record, bibliography, URL/identifier и checksum локального файла, если файл скачан.
3. Не используй source family вместо конкретного source record.
4. Не используй поисковый snippet, вторичный пересказ или каталог книги как page/object-level evidence.
5. Для каждого из 120 templates найди конкретные страницы, таблицы, рисунки, каталожные номера или музейные объекты.
6. Если источник подтверждает только broad presence, так и зафиксируй; не расширяй claim до узкой типологии, материала, размеров, commonness или социальной доступности.
7. При отсутствии достаточного evidence добавь typed gap и останови approval для всей когорты.

Создай нормализованный extraction ledger с одной строкой на каждый `(template_id, claim_scope, source_record_id, locator)` и как минимум полями:

```text
binding_id
template_id
source_record_id
claim_scope
page_start/page_end либо object/table/figure/catalog locator
claim_summary
region_scope
period_scope
material_scope
construction_scope
parameter_scope
confidence
review_status
status
review_notes
```

Не копируй большие фрагменты источников. Храни краткий claim summary и точный locator.

## Этап 2. Проверить исторические claims

Для каждого template раздельно проверь:

1. `historical_presence`;
2. `narrow_typology`;
3. `dating_and_region`;
4. `material`;
5. `construction`;
6. `commonness_and_access`.

Правила:

- сравнительный древнерусский источник без новгородской привязки не доказывает региональную commonness;
- широкий диапазон X–XV вв. не доказывает применимость к 1230 году без датировочного интервала, включающего 1230 год;
- иллюстрация предмета не доказывает массу, размеры или распространённость без подписи/каталожного описания;
- единичная находка может подтверждать присутствие, но не обычность;
- социальная доступность оружия, дорогих вещей и культовых предметов должна быть связана с approved role/status/property/legal rules.

## Этап 3. Утвердить физические параметры

Проверь существующие draft inventory profiles, не создавая второй механизм.

Для items обязательны:

```text
mass_grams
length_mm
width_mm
height_or_thickness_mm
carry_form
external_hand_cost
packing_slot_cost
packing_bundle_size
condition_model
```

Для containers обязательны:

```text
empty_mass_grams
external_dimensions_mm
internal_dimensions_or_capacity
carry_form
external_hand_cost
packing_slot_cost
packing_bundle_size
closure_model
access_model
mobility
nesting_rules
condition_model
```

Используй три допустимых режима:

- `source_measured`: точное значение связано с page/object evidence;
- `source_bounded`: источник задаёт диапазон, category or size band;
- `reviewed_gameplay_estimate`: источник не даёт точного значения, но редактор явно утверждает ограниченный gameplay estimate с методикой, диапазоном и notes.

Нельзя:

- выдавать gameplay estimate за историческое измерение;
- использовать скрытое среднее или ноль;
- переносить размер одного объекта на весь template без явно утверждённого диапазона;
- утверждать параметры без review metadata.

## Этап 4. Закрыть quantity profiles

Полностью обработай 12 templates из `QUANTITY_CONTAINER_GAPS.json`.

Для каждого задай:

```text
quantity_unit_id
dimension
minimum_quantity
maximum_quantity
mass_or_volume_per_unit
stackability
partial_consumption
historical_measure_bindings
measure_conversion_rules
packaging_constraints
default_quantity_policy.mode = explicit_only
```

Историческая мера не обязательна, если template использует современную внутреннюю SI-нормализацию, но тогда historical display/conversion не должна выдумываться. Hidden default quantity запрещён.

## Этап 5. Закрыть 18 container templates

Для каждого container проверь и нормализуй:

- material и lining;
- physical capacity;
- closure и access;
- portability/mobility;
- nesting;
- content category relations;
- совместимость с liquid, wet goods, dry bulk, hot, sharp, long и fragile contents;
- matching-template constraints для quiver, knife sheath, sword scabbard и needle case.

Пустой контейнер допустим только как explicit candidate. Не создавай содержимое автоматически из названия контейнера.

## Этап 6. Создать claim-scoped bindings и dependency closure

Обнови существующие datasets/schemas через штатный generator или существующие public modules. Не создавай параллельный approval workflow.

Для каждого template обеспечь:

- reviewed source bindings для всех обязательных scopes;
- category bindings/facets;
- inventory/quantity/content profiles;
- region category permission;
- item/container profile membership;
- property/equipment/content dependencies;
- соответствующий G4 item/container materialization rule;
- отсутствие зависимости от `draft` или missing record.

Source records и bindings должны иметь точные status/review status и provenance. Generated digests пересчитай штатным генератором.

## Этап 7. Readiness и approval plan

Используй существующие:

- `buildCatalogEditorialReadinessReport`;
- `buildEditorialEvidenceReviewPlan`;
- `buildCoherentEditorialApprovalPlan`;
- `buildAllTemplateRevisionPromotionPlan`.

Не ослабляй проверки в `editorial-readiness.js` и `all-template-promotion.js` ради прохождения данных.

Порядок:

1. Сгенерировать readiness report.
2. Проверить exact 120 IDs и digest.
3. Получить `approval_cohort_ready=true`.
4. Сформировать evidence review plan и применить только ожидаемые transitions.
5. Повторно сгенерировать readiness после reviewed bindings.
6. Сформировать coherent all-120 approval plan.
7. Approval attestation должен быть связан с exact readiness report digest. Не подделывай human attestation. Если текущая инструкция пользователя не считается достаточной формальной аттестацией по контракту, подготовь payload и запроси одно явное подтверждение у PavelSlaven перед применением.
8. Сформировать Stage 3C promotion plan в новую revision без activation.

## Этап 8. PostgreSQL и тесты

Запускай только локальные тестовые PostgreSQL databases, не operator/production DB.

Минимальный набор команд уточни по актуальному `package.json`, затем фактически выполни относящиеся к scope команды, включая:

```powershell
npm ci
npm run repo-intel:ensure
npm run repo-intel:status
npm run test:world-catalog
npm run world-db:schema-check
npm run world-db:import:stage3b1:dry-run
npm run world-db:up
npm run world-db:import:stage3b1:integration
npm run docs:check
npm run test:docs
npm run knowledge:check
npm test
```

Дополнительно выполни штатные Stage 3C promotion dry-run/apply/readback/rollback команды или tests, найденные через Repository Intelligence. Не придумывай имя команды: используй существующий CLI/public API. Проверь:

- clean install;
- schema validation;
- cross references;
- insert-only apply;
- transactional rollback при mismatch;
- readback counts/digests;
- repeat apply/idempotency согласно существующему контракту;
- неизменность parent revision;
- отсутствие activation;
- ровно 120 approved templates в новой revision;
- отсутствие draft dependency в closure.

После финальных изменений один раз выполни clean-clone acceptance, если это требует актуальный `AGENTS.md`.

## Этап 9. Независимый критик

Вызови независимого критика по `code_critic_invocation_rule.txt`. Передай ему:

- все изменённые данные, code/schema changes и generated artifacts;
- normative documents;
- extraction ledger и claims;
- readiness/approval/promotion reports;
- PostgreSQL logs;
- test results;
- список файлов и diff.

При `CHANGES REQUIRED` или `REJECT`:

```text
исправление
→ профильные tests
→ повторная индексация при необходимости
→ повторный аудит
```

Продолжай до `PASS` или допустимого `PASS WITH NOTES`.

## Этап 10. Atomic approval и завершение PR

Только после всех предыдущих gates:

1. Атомарно переведи всю когорту 120 templates и полную dependency closure из `draft` в `approved` существующим approval plan.
2. Создай новую version-pinned world revision через Stage 3C promotion.
3. Не активируй revision и не меняй runtime owner.
4. Выполни transactional apply/readback и проверь exact digests/counts.
5. Обнови единственный `docs/implementation/item-container-120-approval-audit/README.md`:
   - цель;
   - изученные документы;
   - RAG/Graphify queries;
   - source extraction result;
   - изменённые файлы;
   - принятые решения;
   - readiness totals;
   - фактически выполненные commands;
   - PostgreSQL result;
   - critic verdict;
   - branch/commit/PR;
   - remaining gaps.
6. Удали или явно пометь устаревшими прежние blocked reports, если штатный generator не заменяет их автоматически; не оставляй взаимоисключающие канонические статусы.
7. Проверь `git diff --check`, staged scope и отсутствие несвязанных изменений.
8. Push только в branch PR #17. Не создавай новый PR и не merge самостоятельно без прямого указания пользователя.

## Условие остановки

При невозможности подтвердить хотя бы один обязательный claim или dependency:

- не утверждай ни один template;
- не создавай фиктивный binding;
- не понижай обязательность fields;
- не подменяй source page библиографической карточкой;
- не создавай fallback;
- оставь PR draft;
- обнови README точным списком template IDs, claim scopes и причин hard block.
