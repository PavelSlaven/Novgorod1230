# Этап 3B-1 — редакторский authoring candidate предметного каталога

**Статус пакета:** `editorial_catalog_prepared_not_applied`
**Статус записей:** `draft` / `needs_review`
**Регион:** `region_novgorod_land`
**Целевая дата:** около 1230 года
**Policy:** `proposed`

## 1. Назначение и граница

Этот документ регистрирует содержательный результат историко-редакторского прохода. Полный перечень вынесен в:

- `ITEM_CATALOG_120.md` — ровно 120 item/container template candidates;
- `HISTORICAL_SOURCE_REGISTER.md` — evidence classes, source families и gaps;
- `STAGE_3B1_PLAN.md` — порядок формирования, проверки и последующей интеграции.

Этот редакторский источник не является production seed и не изменяет runtime. Его техническое воплощение — отдельный supplemental bundle с 20 versioned JSON datasets и manifest/digests. Все записи остаются `draft`; promotion, runtime activation и materialization не разрешены до отдельных gates и явного approval.

## 2. Упрощённый исторический gate

Для общего template достаточно установить:

```text
объект этого широкого типа мог встречаться
в Новгородской земле около 1230 года
и не является явным анахронизмом
```

Обязательны:

```text
stable ID
+ широкое определение
+ evidence class
+ source family
+ region/period scope
+ confidence/status
+ ограничения утверждения
```

Постраничная типологическая проверка требуется только для узких утверждений: точной конструкции, разновидности, датировки, материала, размеров, массы, техники, частотности или социальной распространённости.

Основной gap переименован:

```text
PAGE_LEVEL_SOURCE_VERIFICATION_REQUIRED
→ HISTORICAL_PRESENCE_EVIDENCE_REQUIRED
```

Старый gap не удаляется как понятие: он сохраняется в более узком виде `NARROW_TYPOLOGY_EVIDENCE_REQUIRED`.

## 3. Состав каталога

| Группа | Количество | Содержание |
|---|---:|---|
| контейнеры и хранение | 18 | кошели, сумки, мешок, корзины, коробки, лари, сосуды, колчан, ножны, футляр |
| домашний быт и кухня | 15 | нож, ложка, посуда, котёл, ступка, сито, жернов и другие принадлежности |
| ремесло и текстиль | 20 | плотницкие, кузнечные и текстильные инструменты |
| земледелие и рыболовство | 15 | орудия обработки земли и рыболовные снасти |
| огонь, свет и дорога | 8 | кресало, кремень, трут, растопка, светильники, верёвка |
| одежда, личные и религиозные вещи | 16 | одежда, обувь, пояс, расчёска, бритва, зеркало, крест |
| пища, сырьё и товары | 12 | хлеб, зерно, соль, рыба, мясо, сыр, мёд, вода, воск |
| письменность, торговля и запирание | 7 | весы, гири, ключ, замок, печать/пломба, береста, писало |
| оружие и защита | 9 | лук, стрелы, копьё, меч, боевой топор, ударное оружие, щит, шлем, кольчуга |
| **Итого** | **120** | 18 containers + 102 items |

## 4. Ключевые редакторские решения

1. Мешок, затягивающийся кошель, поясная сумка и небольшая мягкая сумка являются отдельными container templates.
2. Материал не входит в object-type ID. `pouch` и `leather` должны храниться раздельными facet bindings.
3. Ножны, колчан и игольник — специализированные контейнеры.
4. Стационарные лари, кадки и бочки не считаются личным инвентарём только потому, что существуют как templates.
5. Рабочий и боевой топоры разделены по функции, профилю владельца и социальному риску.
6. Кресало, кремень и трут являются отдельными предметами и не создаются скрытым bundle fallback.
7. Пища, вода и сырьё являются quantity-bearing resources; они требуют контейнера, spoilage и ownership profiles.
8. Сильное оружие и защита требуют role/status/property/legal rules; историческое существование не означает обычную доступность.
9. Точные масса, packing cost, capacity, цена и materialization weight не выводятся из правдоподобия.
10. Любой runtime instance по-прежнему требует цепочку `category → template → profile → rule → instance`.

## 5. Таблицы технического draft bundle

Редакторский каталог преобразован в нормализованные draft datasets для:

- `universal_categories`;
- `category_labels` и scheme mappings при необходимости;
- `region_category_options`;
- `item_templates`;
- `container_templates`;
- `item_template_category_bindings`;
- `container_template_facet_bindings`;
- `item_template_inventory_profiles`;
- `container_template_inventory_profiles`;
- `container_content_category_relations` и content profiles;
- `region_equipment_profile_entries`;
- `item_profile_sets` / `item_profile_entries`;
- `property_profiles` / `property_profile_rules`;
- G4 item/container materialization rules;
- source/provenance bindings;
- reviewed migration inventory.

Plural references должны стать relation rows, а не массивами ID в JSONB.

## 6. Статусы и gaps

| Область | Статус |
|---|---|
| 120 stable ID proposals | `prepared` |
| historical source families | `prepared_needs_review` |
| individual historical source-record bindings | `blocked_by_historical_review` |
| regional draft permissions | `implemented_draft` |
| item/container profiles | `implemented_draft` |
| compatibility profiles | `blocked_by_review` |
| external legacy migration inventory | `deferred` |
| versioned JSON datasets | `implemented_draft` |
| supplemental dry-run | `pass` |
| PostgreSQL supplemental apply/readback/rollback | `not_run` |
| runtime activation | `not_started` |

Сохраняются gaps:

- `HISTORICAL_PRESENCE_EVIDENCE_REQUIRED`;
- `NARROW_TYPOLOGY_EVIDENCE_REQUIRED`;
- `COMMONNESS_NOT_ESTABLISHED`;
- `MATERIAL_EVIDENCE_REQUIRED`;
- `PHYSICAL_PARAMETER_REVIEW_REQUIRED`;
- `BULK_GOOD_QUANTITY_UNIT_MODEL_REQUIRED`;
- `SUPPLEMENTAL_POSTGRESQL_INTEGRATION_REQUIRED`;
- `CONTAINER_COMPATIBILITY_TOO_COARSE`;
- `CANONICAL_LEGACY_ROWS_UNAVAILABLE`.

## 7. Выполненные редакторские проверки

Фактически проверены:

- ровно 120 строк;
- 120 уникальных stable IDs;
- 18 container templates и 102 item templates;
- сумма групп равна 120;
- мешок и три формы личных сумок/кошелей включены;
- все строки имеют evidence class, source family и `draft` status;
- нет составных category IDs, смешивающих форму, материал, качество и социальный статус;
- не назначены выдуманные частотность, цена, масса, packing cost или capacity;
- editorial source не активирует runtime candidates и не создаёт party state.

Derived supplemental datasets прошли JSON Schema/cross-reference validation, importer dry-run, Stage 8/16 tests, generated-artifact checks и полный test suite; точные команды и результаты приведены в едином `README.md`. PostgreSQL apply/readback/rollback не запускался без disposable `POSTGRES_PASSWORD`. Итоговый code critic: `PASS WITH NOTES`; его единственная note — отсутствующая локальная PostgreSQL integration.

## 8. Следующий этап

Технический draft bundle создан как supplemental manifest в `bundle/`; его validation/dry-run не активируют records и не заменяют required individual historical review. Physical estimates остаются explicit `gameplay_estimate` в review table, а source-family evidence не повышен до source-record proof.

Следующий технический проход должен:

1. выполнить supplemental PostgreSQL lifecycle;
2. связать каждую строку с individual historical source records;
3. завершить material/physical/bulk/container review;
4. классифицировать внешние legacy rows после экспорта;
5. подготовить promotion readiness без activation.
