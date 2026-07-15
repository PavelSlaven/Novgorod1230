# Universal category classification — этапы 1–2

## Цель

Зарегистрировать proposed-норматив в canonical corpus и реализовать только базовый слой controlled vocabulary: schemes, universal categories, labels, external mappings и relations. Документ остаётся `proposed`; предметные каталоги и runtime materializer не меняются.

## Изученные файлы

- `AGENTS.md`, `.github/AGENTS.md` и обязательные active-нормативы materialization, world base, graph/read-only, documentation navigation и code critic;
- данный policy и `CLASSIFICATION_REFERENCES.md`;
- `infra/world-base/schema.sql`, `schema/*.sql`, `SCHEMA_REFERENCE.md`, field descriptions и schema generator;
- `tools/world-catalog-workflow` readiness/import contracts и тесты;
- manifest/schema/validation, module registry и public export `@rus/world-catalog-workflow`.

## Исходное состояние и gap analysis

- Уже были: `universal_categories` (`id`, `domain`, `parent_category_id`, `title`, `status`), `universal_category_relations`, `region_category_options`, manifest/catalog import metadata и read-only grants.
- Уже выполнялось: FK-derived readiness/import order, manifest digest checks, regional permission как отдельный слой и fail-closed readiness при пустых required datasets.
- Отсутствовали: `classification_schemes`, `category_labels`, `category_scheme_mappings`; stable code, facet, definition, scoped labels, controlled mapping/relation types, hierarchy-cycle guards, validation external scheme/dangling category и classification importer adapter.
- Свободный `TEXT` остаётся во множестве предметных доменов (`landscape_group`, material/occupation/profile fields и др.); предметная нормализация не выполнялась.
- Plural IDs сейчас встречаются в JSONB (например `compatible_*_ids`, `allowed_*`, `required_*`, skill/material/land-use lists). Их relation-table миграция отложена до этапов 3–8.

## Принятые решения

- Канонические proposed-документы: `corpus/DOCUMENTS/universal_category_classification_policy.md` и приложение `universal_category_classification_references.md`; исходные импортные документы сохранены как provenance.
- External mapping — только справочная FK-связь. Он не создаёт `region_category_options`, не является materialization rule и не создаёт live runtime dependency.
- Runtime candidate остаётся зависимым от approved `region_category_options`; deprecated/replaced category readiness отклоняет.
- Иерархии ограничены SQL trigger и importer validation; циклы parent и `broader`/`narrower` блокируются.
- Расширен существующий публичный `@rus/world-catalog-workflow`, а не создан второй импортёр.

## Структура результата

- DDL: `classification_schemes`, `category_labels`, `category_scheme_mappings`; расширенная `universal_categories`; controlled relations/mappings и DB guards.
- Authoring JSON Schema: пять schema v1 для schemes, categories, labels, relations и mappings.
- Import/readiness: typed validation, FK-derived load order, pure dry-run, transactional adapter apply с readback count/digest gate.
- Generated schema reference: только штатной командой, без ручного редактирования.

## Изменённые файлы

- Canonical corpus и навигация: `data/knowledge-source/corpus-manifest.json`, `corpus/DOCUMENTS/{README.md,llm_documentation_navigation.md,universal_category_classification_policy.md,universal_category_classification_references.md}` и их generated graph/RAG manifests.
- База: `infra/world-base/schema/09.sql`, пояснения полей, generated `infra/world-base/SCHEMA_REFERENCE.md`, проверка и ожидаемое число таблиц (`111`) в schema/CI tests.
- Контракт: пять JSON Schema в `schemas/materialization/`, `materialization-readiness.js`, public export и module registry/generated module index.
- Проверки: `classification-catalog.test.js`, positive readiness fixture и integration contracts.
- Этот README и точечная правка formatting в исходных provenance-документах.

## Порядок интеграции

1. Редактор создаёт pinned scheme/category datasets и manifest.
2. Выполняется JSON Schema, cross-reference, cycle и manifest validation в dry-run.
3. Approved dataset применяется одной транзакцией; readback count/digest обязателен.
4. Отдельный regional/period permission может сделать approved category кандидатом.
5. Только последующие этапы добавляют предметные profile/rule bindings.

## Проверки

Успешно выполнены после финального изменения DDL:

- `npm run world-db:schema-doc` и `npm run world-db:schema-doc-check` — generated reference совпадает с DDL: 111 tables, digest `85a3cad74116dabc1a9cebe605ebef0338d62f9f6482fa8fd78779dbe24f3ac3`.
- `npm run test:world-catalog` — 39/39 PASS, включая positive и negative classification/importer tests.
- `npm run test:integration` — 21 PASS, 5 SKIP: tests требуют externally configured integration PostgreSQL.
- `npm run architecture:check` — PASS.
- `npm run knowledge:check-corpus` — PASS: 30 canonical documents.
- PostgreSQL 16 manual integration — полный `schema.sql` entrypoint создал 111 tables; mixed `parent_category_id` + `narrower` cycle был отклонён trigger.
- `git diff --check main` — PASS после устранения provenance whitespace.

`npm test` и `npm run docs:check` запускались, но documentation validation блокируется существующими неотслеживаемыми пользовательскими данными вне изменения (`data/regional-summary-cache/` и `data/world-sessions/`); изменения этапа их не трогают. Отдельные доступные unit, integration, schema и corpus проверки выше прошли.

Обязательный code-critic audit: PASS после цикла замечаний по manifest payload boundary, фактическому исполнению JSON Schema, non-blank DDL fields, active ambiguity, обязательному `title` и mixed hierarchy cycle.

## Известные ограничения

- Нет domain datasets, regional permissions или migration существующих JSONB/free-text fields.
- Нет изменения Stage 13–16, party runtime и существующих партий.
- Proposed policy не повышен в `active`.

## Оставшиеся этапы

3. Предметы, материалы, контейнеры.
4. Строения, помещения, G5.
5. Ландшафт, вода, землепользование.
6. NPC.
7. Социальные категории, профессии, навыки, знания.
8. Упрощённые животные.
9. Полный import/migration/activation gate и допустимое повышение policy.

## Этап 3A — предметы, материалы и контейнеры

### Изученные файлы и исходная схема

Изучены profile-нормативы `items_and_property.txt`, `character_inventory_equipment.txt`,
`npc_inventory_item_marks.txt`, `npc_generation_profiles.txt`, `weapons_and_armor.txt`,
контракты Stage 8/16, party persistence, world-base DDL, materialization importer/readiness,
JSON Schema, module/public/contract registries и связанные tests. Фактическая модель уже
содержит `item_templates`, `container_templates`, item/container content/profile sets,
property profiles/rules, equipment profile entries и G4 item/container rules.

### Gap analysis

- Машинно значимые legacy `TEXT` в `item_templates`: `item_type`, `function`,
  `typical_material`, `weight_band`, `size_band`, `durability`, `quality_band`,
  `value_band`, `rarity`, `legal_status`, `visibility_default`, `access_default`,
  `marking_default`, `risk_default`. `title`, `summary`, `game_use`, `limits` остаются
  описательными и не участвуют в classification filtering.
- Legacy plural JSONB: `typical_owner_roles`, `typical_holder_roles`,
  `typical_locations`, `typical_containers`, `skill_use`, `attribute_use`,
  `possible_modifiers`, `failure_risks`, `damage_or_wear_rules`; container/property
  `access_policy` и `claim_conditions` — versioned policy payload, а не ID relations.
- Уже есть category/template/profile/rule/instance разделение: `universal_categories` —
  category; item/container templates — template; profile entries и property profiles —
  profile; G4 tables — rule; party runtime — instance. Эти специализированные таблицы
  сохраняются и не дублируются.
- Не удаляем и не заполняем legacy fields: нет подтверждённого historical mapping для
  существующих значений. Stage 8/16 и порядок new-game pipeline остаются без изменений.

### Решение и миграционная стратегия

Добавляется только normalised binding layer для item/container facets и compatibility,
плюс fail-closed importer/readiness и migration inventory. Переход формален:

`legacy field → explicit reviewed binding → validation-only/dual-read → migration report → future cutover`.

Неизвестное legacy значение даёт typed data gap, неоднозначное — migration conflict;
никаких guessed mappings, implicit deletes, rematerialization существующих party instances
или external AAT lookups. Массовое создание categories/templates и исторически обоснованные
regional/period permissions остаются этапу 3B.

### Изменённые файлы

- `infra/world-base/schema/10.sql`, field descriptions и generated `SCHEMA_REFERENCE.md`:
  четыре таблицы binding/compatibility/migration inventory; schema теперь содержит 115 tables.
- Пять authoring JSON Schema в `schemas/materialization/` для item bindings,
  container facets/content compatibility, equipment entries и migration inventory.
- `tools/world-catalog-workflow`: public contract, manifest/FK validation, typed readiness
  and migration assessment, module contract и TDD tests.
- CI/schema expected counts, generated module/schema manifests и этот README.

### Проверки и аудит

- Targeted item/container test — 6/6 PASS; `test:world-catalog` — 45/45 PASS.
- `test:stage2-8` — 6/6 PASS; `test:stage16` — 13/13 PASS.
- `test:integration` — 21 PASS, 5 SKIP (external integration PostgreSQL is not configured).
- `world-db:schema-doc`/`--check` — PASS: 115 tables, digest
  `7f4a4c2a951cc34af305af047935b4107a9b0cf41a0a83c39e7bb328e90eea02`.
- PostgreSQL 16 manual schema entrypoint — PASS: 115 tables.
- `architecture:check`, `knowledge:check-corpus`, generated artifact checks and
  `git diff --check` — PASS.
- `docs:generate`/full `npm test` remain blocked by pre-existing untracked data in
  `data/regional-summary-cache/` and `data/world-sessions/`; no project file was changed
  to mask this environment condition.
- Mandatory code-critic audit — PASS WITH NOTES after a correction cycle. The audit verified
  replaced/deprecated category gates, active-only compatibility, equipment XOR/FK/domain checks,
  region/revision/period permission gates and primary-function exclusivity. Notes: full suite
  and docs validation are blocked solely by the pre-existing untracked runtime data above.

### Задачи этапа 3B

1. Подготовить исторически sourced item/material/container categories для Новгородской земли.
2. Создать reviewed bindings и regional/period permissions из источников.
3. Обработать migration inventory: resolve gaps/conflicts без guessed mapping.
4. Выполнить отдельно утверждённый cutover legacy fields после report/audit.
