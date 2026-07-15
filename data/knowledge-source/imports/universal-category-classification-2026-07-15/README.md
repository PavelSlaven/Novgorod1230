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
