# Этап 3B-1 — план редакторского наполнения предметного каталога

**Статус:** `prepared_not_applied`  
**Дата:** `2026-07-15`  
**PR:** `#7`  
**Ветка:** `chatgpt/universal-category-classification`

## 1. Цель

Подготовить минимальный исторически обоснованный authoring candidate для предметов, материалов и контейнеров Новгородской земли XIII века. Результат должен быть пригоден для последующей технической сверки, преобразования в versioned JSON datasets, importer dry-run и аудита в Codex.

Этап не выполняет:

- повышение policy из `proposed` в `active`;
- production import;
- legacy cutover;
- изменение Stage 8, Stage 16 или party instances;
- создание предметов из пожелания игрока;
- автоматическое заполнение отсутствующих исторических данных.

## 2. Каноническая граница данных

Проверены tracked bundle и importer manifest:

- `data/world-base-sources/rus13-base-v1.manifest.json`;
- `tools/rus13-world-base-importer/world_base_importer_v1/config/world_base_import_manifest_v1.json`.

В каноническом GitHub bundle нет datasets `item_templates`, `container_templates`, нормализованных item/container bindings или migration inventory. Поэтому этап не имеет права утверждать, что мигрировал существующие строки. Любые записи, существующие только в локальной базе, NocoDB, ignored staging или внешнем authoring-каталоге, должны быть отдельно экспортированы и сопоставлены Codex/operator workflow.

Следствие:

```text
канонические legacy item/container rows = 0 доступных для reviewed mapping;
migration inventory = empty candidate;
external/local rows = отдельный data gap до экспорта.
```

## 3. Нормативная модель

Сохраняется цепочка:

```text
category → template → profile → rule → instance
```

Для каждого исторического кандидата требуется:

```text
stable project ID
+ один фасет
+ определение и scope note
+ источник
+ confidence
+ период
+ региональное разрешение
+ status
```

External mapping не является доказательством исторического присутствия и не создаёт regional permission.

## 4. Минимальный release scope

### 4.1. Предметы

В authoring candidate включены только двенадцать шаблонов:

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

Этот набор покрывает базовый быт, обработку дерева и пищи, текстильную работу, поддержание огня, рыболовство и минимальный набор дальнего оружия. Он не считается полным каталогом материальной культуры Новгорода.

### 4.2. Контейнеры

Рассмотрены формы:

- ведро;
- бочка/кадь как ёмкость;
- мешок;
- кошель/небольшая сумка;
- сундук/ларь.

Они не переводятся в import-ready templates из-за архитектурных gaps, указанных ниже.

## 5. Источники

Используется ограниченный библиографический набор:

- Б. А. Колчин, `Железообрабатывающее производство Новгорода Великого`, 1959;
- Б. А. Колчин, `Новгородские древности. Деревянные изделия`, 1968;
- А. Ф. Медведев, `Оружие Новгорода Великого`, 1959;
- `Medieval Novgorod in Its Wider Context`, ред. M. Brisbane, N. Makarov, E. Nosov — только как широкий археологический контекст;
- действующие нормативы проекта по предметам, инвентарю и оружию — только как игровые требования, не как историческое доказательство.

Полные страницы и каталожные номера находок в текущем сеансе не проверены. Поэтому все исторические записи остаются `draft` или `needs_review`; `approved` не присваивается.

## 6. Фасетная модель

Для предметов подготовлены отдельные значения:

```text
object_type
primary_function
secondary_function
material
manufacturing_technique
physical_form
condition
quality_band
size_band
mass_band
use_context
```

Не создаются составные категории вида `бедный железный хозяйственный нож`.

## 7. Выявленные hard gaps

### 7.1. `CONTAINER_MATERIAL_FACET_MISSING`

`container_template_facet_bindings.facet` не допускает `material`. Из-за этого нельзя корректно выразить:

```text
container_form = bucket
material = wood
```

Создание категорий `wooden_bucket`, `leather_pouch` или `textile_bag` смешало бы форму и материал и нарушило proposed policy.

### 7.2. `CONTAINER_CAPACITY_UNIT_UNDEFINED`

`container_templates.capacity` является обязательным целым числом, но DDL и норматив не задают единицу или семантику. Нельзя достоверно выбрать число, не зная, является ли это литрами, условными slots, массой или количеством предметов.

### 7.3. `CONTAINER_COMPATIBILITY_TOO_COARSE`

Совместимость содержимого связывается с category контейнера. Для жидкостей и сыпучих материалов пригодность зависит не только от формы, но и от материала, конструкции, герметичности и состояния. До решения gaps нельзя утверждать `allowed` для жидкостей как общее свойство формы.

### 7.4. `PAGE_LEVEL_SOURCE_VERIFICATION_REQUIRED`

Библиография подтверждена, но page-level evidence не собрано. Нельзя утверждать точные разновидности, размеры, частотность, древесные породы, состав сплава или социальную распространённость.

### 7.5. `CANONICAL_LEGACY_ROWS_UNAVAILABLE`

Tracked repository не содержит исходных item/container rows. Нельзя завершить migration coverage report для локальной базы без отдельного экспорта.

## 8. Решение по статусам

- исторические item candidates: `draft`;
- regional permissions: `draft`;
- container proposals: `blocked` в редакторском документе, не импортируются;
- migration inventory: пустой для канонического tracked scope;
- policy: `proposed`;
- production readiness: `blocked`.

## 9. Порядок интеграции в Codex

1. Сверить ветку PR №7 и повторно прочитать обязательные нормативы.
2. Исправить README-заголовок и зарегистрировать этот authoring candidate.
3. Решить `CONTAINER_MATERIAL_FACET_MISSING` через TDD, DDL, JSON Schema и readiness validation либо нормативно обосновать другую фасетную модель.
4. Формально определить единицу `container_templates.capacity` или заменить поле на versioned capacity policy.
5. Получить page-level evidence для каждого кандидата и присвоить source IDs из `source_records`.
6. Экспортировать фактические local/NocoDB item/container rows, если они существуют.
7. Сформировать reviewed migration inventory: `mapped | data_gap | migration_conflict | deferred`.
8. Создать versioned datasets и manifest с реальными digests.
9. Выполнить JSON Schema, cross-reference, dry-run, transactional rollback/readback и PostgreSQL проверки.
10. Обновить generated artifacts штатными командами.
11. Вызвать code critic с полным diff и предыдущим `PASS WITH NOTES`.

## 10. Критерий допуска 3B-1

Этап может считаться технически завершённым только после того, как:

- каждый импортируемый item/template имеет page-level source support;
- regional/period permissions проверены;
- container material и capacity semantics формализованы;
- все фактические legacy rows классифицированы;
- importer/readiness работают fail-closed;
- Stage 8/16 не сломаны;
- выполнены тесты и PostgreSQL integration;
- code critic вернул `PASS` или допустимый `PASS WITH NOTES`.

Текущий результат является редакторским authoring candidate, а не завершённым техническим этапом.