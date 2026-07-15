# Этап 3B-1 — план нормализации draft authoring-каталога из 120 предметов

**Статус:** `draft_authoring_bundle_not_activated`
**Дата:** `2026-07-15`
**PR:** `#7`
**Ветка:** `chatgpt/universal-category-classification`
**Целевой регион:** `region_novgorod_land`
**Целевая дата:** около 1230 года

## 1. Цель и граница

Преобразовать редакторский перечень из `ITEM_CATALOG_120.md` в версионированный supplemental authoring bundle:

```text
universal category → template → profile → rule → instance
```

Этот этап создаёт только первые четыре уровня authoring. Он не создаёт party instances, owners/holders конкретных вещей, party placements, G5, runtime commands, массовую legacy migration или re-materialization.

## 2. Источник и historical gate

Для широкого template применяется критерий из `HISTORICAL_SOURCE_REGISTER.md`: тип мог встречаться в Новгородской земле около 1230 года и не является явным анахронизмом. Source family не заменяет конкретный `source_record`; пока bibliography не разрешена, строка остаётся `draft` с `HISTORICAL_PRESENCE_EVIDENCE_REQUIRED`.

Нельзя выводить из этого gate точную типологию, материал экземпляра, массу, размер, технику, цену, частотность, доступность, capacity или quantity.

## 3. Состав bundle

- 120 stable IDs без переименования: 102 item templates и 18 container templates;
- universal categories/labels, item object type + exactly one primary function + context bindings;
- draft regional options для `region_novgorod_land`, с neutral draft weight;
- draft inventory, content, item/property/equipment profiles;
- пустой `item_classification_migration_inventory`, поскольку tracked canonical legacy rows = 0;
- отдельный manifest с canonical digests и `deletion_policy = none`.

## 4. Порядок реализации

1. Проверить PR head и обязательные нормативы.
2. Провести coverage inventory таблиц/схем/importer/readiness/tests.
3. Сформировать source/revision/category/template datasets; не дублировать специализированные словари.
4. Ввести нормализованные binding rows вместо ID JSONB arrays.
5. Описать physical parameter policy и review table; unknown values фиксировать gap.
6. Создать draft permissions, profiles и compatibility only where explicit.
7. Проверить manifest, digests, FK/XOR/unknown tables and dry-run.
8. Выполнить PostgreSQL apply/readback/rollback только в disposable DB.
9. Перегенерировать schema/module/corpus artifacts, пройти tests и code critic.
10. Не повышать records/revision/policy в `approved`/`active`.

## 5. Техническое обновление

`bundle/manifest.json` создан как supplemental manifest `novgorod_1230_item_catalogue_draft_001`. Его validator rejects party/unknown tables, mismatched digests/counts, invalid local/external references, XOR violations and missing/ambiguous required item facets. Он authoring-only и не участвует в runtime candidate loading.

### Фактический статус

```text
Stage 3B-1 technical draft bundle: implemented
supplemental dry-run: PASS
code critic: PASS WITH NOTES
PostgreSQL supplemental integration: PASS (disposable PostgreSQL 16)
promotion: blocked
runtime activation: not started
```

Выполненная реализация охватывает 21 dataset, включая draft categories, regional options, templates, normalized bindings, profiles и 15 `record_sources` links. Предыдущий список шагов в разделе 4 сохраняет историю проектирования; невыполненными остаются promotion gates.

## 6. Promotion gates и отложенные работы

Promotion blocked до individual source-record review для 105 templates, material/physical review, review draft bulk quantity profiles, container compatibility review и отдельного editorial approval. External/local legacy rows требуют export перед Stage 3B migration. Stage 8/16 остаётся на existing approved input and does not load this draft bundle.

Полный перечень текущих gaps и coverage: `DATA_GAPS.md`, `TARGET_TABLE_COVERAGE.md`, `NORMALIZATION_COVERAGE_REPORT.md`, `PHYSICAL_PARAMETER_REVIEW_TABLE.md`, `CODEX_INTEGRATION_REPORT.md`.
