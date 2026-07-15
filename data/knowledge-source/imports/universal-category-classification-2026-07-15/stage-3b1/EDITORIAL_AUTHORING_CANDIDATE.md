# Этап 3B-1 — редакторский authoring candidate

**Статус пакета:** `prepared_not_applied`  
**Статус записей:** `draft` / `needs_review`  
**Регион:** `region_novgorod_land`  
**Период-кандидат:** `1200-01-01` — `1299-12-31`  
**Целевая дата игры:** около 1230 года  
**Policy:** остаётся `proposed`

## 0. Правовой статус результата

Этот файл не является production seed и не разрешает runtime использовать перечисленные категории. Он фиксирует подготовленный редакторский смысл для последующей технической материализации в JSON datasets.

Ни одна запись ниже не имеет статуса `approved`, потому что в текущем сеансе не выполнена постраничная сверка археологических публикаций и не проведён importer/readiness audit.

## 1. Candidate source records

Идентификаторы ниже являются предлагаемыми project IDs и должны быть сверены с существующим `source_records` перед импортом.

| Candidate source ID | Библиографическая запись | Назначение | Статус | Ограничения |
|---|---|---|---|---|
| `src_stage3b1_kolchin_iron_1959` | Б. А. Колчин. «Железообрабатывающее производство Новгорода Великого». Материалы и исследования по археологии СССР, 1959 | железные изделия, инструменты и технология железообработки | `needs_review` | нужны страницы и каталожные номера для каждого типа |
| `src_stage3b1_kolchin_wood_1968` | Б. А. Колчин. «Новгородские древности. Деревянные изделия». САИ Е1-55, 1968 | деревянные бытовые изделия и деревообработка | `needs_review` | не утверждать породу дерева и точную датировку без страницы |
| `src_stage3b1_medvedev_weapons_1959` | А. Ф. Медведев. «Оружие Новгорода Великого», 1959 | луки, стрелы и иные категории вооружения | `needs_review` | требуется проверка точной библиографической записи, страниц и датировок |
| `src_stage3b1_novgorod_wider_context` | M. Brisbane, N. Makarov, E. Nosov, eds. «Medieval Novgorod in Its Wider Context» | широкий археологический и региональный контекст | `needs_review` | не использовать вместо предметного каталога находок |
| `src_stage3b1_items_normative` | `items_and_property.txt`, `character_inventory_equipment.txt`, `npc_inventory_item_marks.txt` | игровые свойства, владение, доступ, состояние и контейнеры | `approved_project_rule` | не является историческим доказательством |
| `src_stage3b1_weapons_normative` | `weapons_and_armor.txt` | игровая функция оружия и снаряжения | `approved_project_rule` | не является археологическим доказательством |

## 2. Controlled vocabulary proposal

### 2.1. Object type

| Category ID | Preferred label | Definition | Scope note | Status |
|---|---|---|---|---|
| `item.object_type.utility_knife` | хозяйственный нож | ручной клинковый инструмент общего бытового применения | не означает боевой кинжал или конкретную археологическую типологию | `draft` |
| `item.object_type.working_axe` | рабочий топор | топор как инструмент рубки и обработки древесины | не означает боевой топор | `draft` |
| `item.object_type.whetstone` | точильный камень | абразивный каменный предмет для правки режущей кромки | минералогический тип не задан | `draft` |
| `item.object_type.wooden_spoon` | деревянная ложка | деревянный столовый или кухонный предмет с чашечкой и рукоятью | форма не привязана к конкретному типу находки | `draft` |
| `item.object_type.wooden_bowl` | деревянная миска | открытый деревянный сосуд для еды или подачи пищи | не включает ведро, ковш и закрытые ёмкости | `draft` |
| `item.object_type.cooking_pot` | горшок для приготовления пищи | керамический сосуд, предназначенный для нагревания или приготовления пищи | точная керамическая группа не задана | `draft` |
| `item.object_type.sewing_needle` | швейная игла | тонкий ручной инструмент для проведения нити через материал | конкретный размер и форма ушка не заданы | `draft` |
| `item.object_type.spindle_whorl` | пряслице | грузик веретена, стабилизирующий вращение при прядении | материал и форма задаются отдельными фасетами | `draft` |
| `item.object_type.firesteel` | кресало | железный ударный инструмент для получения искр | не включает трут и камень как автоматически присутствующие предметы | `draft` |
| `item.object_type.fishhook` | рыболовный крючок | крючковый предмет для ловли рыбы на лесу или шнур | размер и целевая рыба не заданы | `draft` |
| `item.object_type.bow` | лук | упругое метательное оружие для запуска стрел | конструктивный тип и социальная доступность не заданы | `draft` |
| `item.object_type.arrow` | стрела | древковый снаряд для лука | наконечник, оперение и тип применения требуют отдельных данных | `draft` |

### 2.2. Primary function

| Category ID | Preferred label | Definition | Status |
|---|---|---|---|
| `item.primary_function.cutting` | резание | разделение материала режущей кромкой | `draft` |
| `item.primary_function.chopping` | рубка | нанесение рубящих ударов для разделения древесины или иного материала | `draft` |
| `item.primary_function.sharpening` | заточка | восстановление или формирование режущей кромки абразивом | `draft` |
| `item.primary_function.eating` | приём пищи | непосредственное использование при еде | `draft` |
| `item.primary_function.food_serving` | подача пищи | удержание и подача готовой пищи | `draft` |
| `item.primary_function.cooking` | приготовление пищи | тепловая обработка или приготовление пищи в сосуде | `draft` |
| `item.primary_function.sewing` | шитьё | соединение или обработка материала нитью | `draft` |
| `item.primary_function.spinning` | прядение | изготовление нити вращением веретена | `draft` |
| `item.primary_function.fire_starting` | высекание огня | получение искр для разжигания огня | `draft` |
| `item.primary_function.fishing` | рыболовство | ловля рыбы крючковой снастью | `draft` |
| `item.primary_function.ranged_attack` | дистанционный выстрел | запуск снаряда в цель с расстояния | `draft` |
| `item.primary_function.projectile_ammunition` | снаряд для лука | использование как расходуемый снаряд метательного оружия | `draft` |

### 2.3. Materials

| Category ID | Preferred label | Definition | Exclusions | Status |
|---|---|---|---|---|
| `item.material.iron` | железо | железный материал без утверждения точного химического состава | не считать автоматически сталью | `draft` |
| `item.material.wood` | древесина | древесный материал без утверждения породы | кора и лыко — отдельные материалы | `draft` |
| `item.material.stone` | камень | природный каменный материал без минералогической конкретизации | не включает обожжённую глину | `draft` |
| `item.material.fired_clay` | обожжённая глина | керамический материал, полученный формовкой и обжигом глины | не задаёт конкретную керамическую традицию | `draft` |

### 2.4. Manufacturing technique

| Category ID | Preferred label | Definition | Status |
|---|---|---|---|
| `item.technique.forging` | ковка | формование металлического изделия пластической обработкой нагретого металла | `draft` |
| `item.technique.wood_carving` | резьба/вырезание по дереву | формование деревянного изделия удалением материала режущим инструментом | `draft` |
| `item.technique.stone_grinding` | обработка камня абразивом | придание каменному предмету рабочей формы шлифованием или правкой | `draft` |
| `item.technique.ceramic_forming_firing` | формовка и обжиг керамики | изготовление сосуда из глины с последующим обжигом | `draft` |

### 2.5. General game facets

Следующие значения являются игровыми классификационными bands и не утверждают историческую частотность:

| Facet | Candidate categories |
|---|---|
| `condition` | `item.condition.serviceable`, `item.condition.worn`, `item.condition.damaged`, `item.condition.broken` |
| `quality_band` | `item.quality.ordinary`, `item.quality.good`, `item.quality.poor` |
| `size_band` | `item.size.small`, `item.size.medium`, `item.size.large` |
| `mass_band` | `item.mass.light`, `item.mass.medium`, `item.mass.heavy` |
| `use_context` | `item.context.household`, `item.context.craft`, `item.context.textile`, `item.context.fishing`, `item.context.hunting_or_combat` |

Эти категории должны быть определены в JSON с полными `definition`, `scope_note`, `inclusion_rules` и `exclusion_rules` до импорта.

## 3. Item template candidates

| Template ID | Title | Object type | Primary function | Materials | Technique | Use context | Confidence | Historical sources | Limits |
|---|---|---|---|---|---|---|---|---|---|
| `item_tpl_nov_utility_knife_v1` | хозяйственный нож | `item.object_type.utility_knife` | `item.primary_function.cutting` | `item.material.iron` | `item.technique.forging` | household, craft | `medium_high` | Kolchin 1959 | без конкретной формы клинка и без утверждения стали |
| `item_tpl_nov_working_axe_v1` | рабочий топор | `item.object_type.working_axe` | `item.primary_function.chopping` | iron, wood | forging, wood_carving | craft, household | `medium_high` | Kolchin 1959; Kolchin 1968 | не классифицируется как боевой топор |
| `item_tpl_nov_whetstone_v1` | точильный камень | `item.object_type.whetstone` | `item.primary_function.sharpening` | stone | stone_grinding | craft, household | `medium` | Kolchin 1959; broad context | минералогический тип не задан |
| `item_tpl_nov_wooden_spoon_v1` | деревянная ложка | `item.object_type.wooden_spoon` | `item.primary_function.eating` | wood | wood_carving | household | `medium_high` | Kolchin 1968 | порода дерева и конкретная форма не заданы |
| `item_tpl_nov_wooden_bowl_v1` | деревянная миска | `item.object_type.wooden_bowl` | `item.primary_function.food_serving` | wood | wood_carving | household | `medium_high` | Kolchin 1968 | без точного объёма и породы дерева |
| `item_tpl_nov_cooking_pot_v1` | глиняный горшок | `item.object_type.cooking_pot` | `item.primary_function.cooking` | fired_clay | ceramic_forming_firing | household | `medium` | wider context; требуется предметный источник | точная керамическая группа не задана |
| `item_tpl_nov_sewing_needle_v1` | железная швейная игла | `item.object_type.sewing_needle` | `item.primary_function.sewing` | iron | forging | textile, household | `medium` | Kolchin 1959 | форма ушка, размер и датировка требуют страницы |
| `item_tpl_nov_spindle_whorl_v1` | каменное пряслице | `item.object_type.spindle_whorl` | `item.primary_function.spinning` | stone | stone_grinding | textile | `medium` | wider context; требуется предметный источник | материал и тип требуют дополнительной сверки |
| `item_tpl_nov_firesteel_v1` | железное кресало | `item.object_type.firesteel` | `item.primary_function.fire_starting` | iron | forging | household, travel | `medium_high` | Kolchin 1959 | трут и кремень не создаются автоматически |
| `item_tpl_nov_fishhook_v1` | железный рыболовный крючок | `item.object_type.fishhook` | `item.primary_function.fishing` | iron | forging | fishing | `medium` | Kolchin 1959; wider context | размер и оснастка не заданы |
| `item_tpl_nov_bow_v1` | лук | `item.object_type.bow` | `item.primary_function.ranged_attack` | wood | wood_carving | hunting_or_combat | `medium` | Medvedev 1959 | конструкция, статус и распространённость не утверждаются |
| `item_tpl_nov_arrow_v1` | стрела | `item.object_type.arrow` | `item.primary_function.projectile_ammunition` | wood, iron | wood_carving, forging | hunting_or_combat | `medium` | Medvedev 1959; Kolchin 1959 | тип наконечника и оперения не задан |

## 4. Binding rules for Codex materialization

Для каждого template Codex должен сформировать:

- ровно один approved/draft `object_type` binding;
- ровно один `primary_function` binding с `exclusivity_group = primary_function`;
- один или несколько `material` bindings;
- только подтверждённые `manufacturing_technique` bindings;
- отдельные bands и contexts без смешения с object type;
- `requires_regional_permission = true` для исторически ограниченных object/material/technique bindings.

До page-level audit все bindings имеют `status = draft`.

## 5. Draft regional permissions

Предлагается создать draft permissions для всех object types из раздела 2.1, материалов и техник, фактически используемых двенадцатью templates.

Общие поля-кандидаты:

```text
world_revision_id = to_be_resolved
region_id = region_novgorod_land
valid_from = 1200-01-01
valid_to = 1299-12-31
status = draft
weight = not historically asserted
applicability = source-bound editorial candidate only
```

`weight` нельзя интерпретировать как частотность до отдельного исследования. Codex должен либо оставить permissions `draft`, либо формально определить нейтральную семантику веса до импорта.

## 6. Container proposals — blocked

| Proposal ID | Form | Probable material | Intended use | Blocking gaps | Status |
|---|---|---|---|---|---|
| `container_proposal_nov_bucket_v1` | ведро | wood | перенос воды и жидкостей | material facet missing; capacity unit undefined; liquid compatibility depends on construction | `blocked` |
| `container_proposal_nov_cask_v1` | бочка/кадь | wood | хранение жидкостей или сыпучих материалов | material facet missing; capacity unit undefined; closure/sealing not formalized | `blocked` |
| `container_proposal_nov_sack_v1` | мешок | textile/bast | перенос сухих и сыпучих материалов | material facet missing; capacity unit undefined | `blocked` |
| `container_proposal_nov_pouch_v1` | кошель/сумка | leather/textile | перенос мелких предметов | material facet missing; capacity unit undefined | `blocked` |
| `container_proposal_nov_chest_v1` | сундук/ларь | wood, metal fittings optional | хранение имущества | material facet missing; capacity unit undefined; locking model must be explicit | `blocked` |

Ни один container proposal не должен быть преобразован в `container_templates` путём назначения произвольного integer capacity.

## 7. Content compatibility proposals

До исправления container model допускаются только редакторские утверждения, не import rows:

- жидкость совместима только с контейнером, для которого доказаны материал, конструкция и достаточная герметичность;
- сухие сыпучие материалы требуют подходящей формы и закрытия;
- острые металлические предметы не считаются обычным содержимым мягкого или пищевого контейнера без отдельного профиля;
- оружие и инструменты не появляются в food container по общему `allowed` relation;
- пустой контейнер допустим только как явно разрешённый candidate content profile.

## 8. Migration inventory and coverage

Канонический tracked bundle не содержит item/container rows. Поэтому текущий отчёт:

```text
canonical legacy rows available: 0
mapped: 0
data gaps from canonical rows: 0
migration conflicts from canonical rows: 0
deferred external/local rows: unknown until export
fully covered templates: 0 production templates
partially covered templates: 0
uncovered templates: unknown until export
```

Это не доказывает отсутствие данных в локальной PostgreSQL/NocoDB. Оно означает только отсутствие канонического versioned input в GitHub.

## 9. Проверки, выполненные в этом чате

Выполнены редакторские локальные проверки candidate model:

- уникальность предложенных IDs;
- один object type и одна primary function на каждый item template;
- отсутствие составных material+form категорий;
- все item bindings ссылаются на предложенные категории;
- все источники и ограничения перечислены;
- container proposals не маскируют hard gaps fallback-значениями;
- migration inventory не содержит выдуманных legacy rows.

Не выполнялись:

- repository JSON Schema validation для финальных datasets;
- importer dry-run/apply;
- PostgreSQL integration;
- Stage 8/16 tests;
- generated artifacts;
- full test suite;
- code critic для этапа 3B-1.

Эти проверки выполняет Codex после преобразования candidate в репозиторные JSON datasets и устранения архитектурных gaps.

## 10. Итог

Текущий пакет даёт:

- минимальный предметный release scope;
- контролируемые определения и stable ID proposals;
- двенадцать item template candidates;
- draft regional permission plan;
- явный источник и уровень уверенности для каждого типа;
- пять контейнерных proposals с hard blocks;
- честный нулевой migration inventory для tracked scope.

Он не даёт production approval, не изменяет runtime и не разрешает legacy cutover.