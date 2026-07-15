# Политика универсальной категоризации проекта «Русь XIII век»

**Статус:** `proposed`  
**Версия:** `0.1.0`  
**Дата:** `2026-07-15`  
**Область:** универсальные категории, региональные разрешения, шаблоны, профили и правила материализации для NPC, предметов, контейнеров, транспорта, строений, помещений, ландшафтов, водных объектов, землепользования, животных и социальных сущностей.

## 0. Статус и границы документа

Этот документ является проектом нового профильного норматива. Он не становится `active` автоматически и не означает, что текущие DDL, seed-данные, JSON Schema, импортеры, валидаторы и runtime уже приведены в соответствие.

До повышения документа в `active` действуют текущие нормативы проекта, прежде всего:

1. `code_driven_world_materialization_architecture.md`;
2. `world_base_materialization_table_requirements.md`;
3. профильные документы затронутых подсистем;
4. актуальный DDL `infra/world-base/schema.sql` и `infra/world-base/schema/*.sql`.

При конфликте применяется установленный проектом приоритет. Этот документ не разрешает коду, LLM или импортёру создавать отсутствующие категории, исторические факты либо fallback-значения.

## 1. Назначение

Политика вводит единый каркас категоризации, чтобы:

- категории не создавались свободным текстом;
- одинаковые понятия не дублировались под разными названиями;
- разные классификационные оси не смешивались в одной колонке;
- научная классификация не подменяла историческую применимость;
- историческая применимость не зависела от догадки LLM;
- региональные данные могли переиспользовать универсальные понятия;
- materializer получал закрытые, проверенные и version-pinned candidate sets;
- любое отсутствие обязательной категории фиксировалось как data gap и приводило к hard block.

## 2. Базовая архитектурная модель

Во всех доменах сохраняется обязательная цепочка:

```text
category → template → profile → rule → instance
```

### 2.1. Category

Универсальный контролируемый тип или значение одного фасета. Категория отвечает на вопрос: **что это за понятие в общей системе проекта?**

Примеры:

- `item.function.cutting_tool`;
- `material.wood.oak`;
- `building.function.residential`;
- `npc.affect.fear`;
- `social.legal_status.free`;
- `animal.common_type.horse`.

Категория сама по себе не утверждает, что объект существовал в Новгородской земле в 1230 году.

### 2.2. Template

Универсальная или региональная форма категории с параметрами, источниками, ограничениями и периодом применимости.

Примеры:

- исторически допустимый тип ножа;
- новгородская деревянная жилая постройка;
- региональный вариант дорожных саней;
- допустимая форма крестьянской верхней одежды.

### 2.3. Profile

Совместимый набор категорий и шаблонов для определённой области материализации.

Примеры:

- профиль имущества бедного сельского двора;
- профиль внешности взрослого ремесленника;
- профиль помещений кузницы;
- профиль животных при конюшне;
- профиль поведения зависимого работника.

### 2.4. Rule

Условие применения профиля с учётом региона, периода, G4, сезона, времени, владельца, экономической причины и ситуации.

### 2.5. Instance

Конкретный сохранённый объект партии. Он материализуется кодом только из утверждённых данных и не пересоздаётся при повторном осмотре или входе.

## 3. Главное правило научной и исторической обоснованности

Для каждого домена применяются четыре самостоятельных уровня проверки:

```text
научный или профессиональный классификатор
→ определяет тип понятия и его место среди других понятий;

исторический источник
→ подтверждает существование формы, практики или объекта в нужном периоде;

региональное разрешение
→ подтверждает допустимость и распространённость в конкретном регионе;

materialization rule
→ разрешает создание конкретного экземпляра здесь и сейчас.
```

Ни один внешний классификатор сам по себе не доказывает историческое присутствие в Новгородской земле XIII века.

## 4. Контролируемый словарь

Каждая универсальная категория должна иметь:

```text
stable_code
facet
domain
preferred_label
definition
scope_note
broader_category_id
status
classification_version
provenance
```

При необходимости добавляются:

```text
alternative_labels
inclusion_rules
exclusion_rules
related_categories
requires_categories
excluded_categories
external_mappings
replaced_by_category_id
```

### 4.1. Требования к определению

Определение должно:

- описывать один тип понятия;
- быть пригодным для машинной проверки;
- не содержать региональный факт без регионального binding;
- не включать художественную оценку;
- не объединять несколько независимых фасетов;
- указывать границы между близкими понятиями.

### 4.2. Разрешённые отношения категорий

Допустимый базовый набор:

```text
broader
narrower
related
compatible
requires
excludes
equivalent_with_scope
```

Свободные названия отношений запрещены. Иерархические циклы запрещены.

### 4.3. Модель внешних mappings

Для связи с внешними схемами применяется SKOS-подобная модель:

```text
exact
close
broad
narrow
related
```

Внешний mapping является справочной связью, а не заменой проектной категории.

## 5. Фасетная категоризация

Проект не должен создавать составные универсальные категории, объединяющие материал, функцию, состояние, эпоху, социальную принадлежность и качество.

Неправильно:

```text
бедный повреждённый деревянный крестьянский дом
```

Правильно:

```text
building_form       = log_building
primary_function    = residential
primary_material    = wood
condition           = damaged
wealth_context      = poor
social_context      = peasant_household
region_binding      = novgorod_land
period_binding      = 13th_century
```

Каждый фасет хранится отдельно и связывается через template/profile/rule.

## 6. Общие правила внешних классификаторов

### 6.1. Разрешённое применение

Внешний стандарт используется для:

- определения терминов;
- построения иерархии;
- устранения синонимов и дублей;
- междоменного или межрегионального сопоставления;
- указания стабильного внешнего concept ID;
- документирования происхождения классификационной модели.

### 6.2. Запрещённое применение

Запрещено:

- автоматически импортировать весь внешний справочник как approved-каталог;
- считать современное понятие исторически применимым без источников;
- выполнять обязательные live-запросы к внешним сервисам из runtime;
- заменять локальный исторический термин современным эквивалентом без scope note;
- скрывать спорное соответствие под `exact` mapping;
- использовать classification mapping как materialization rule.

### 6.3. Version pinning

Каждая внешняя схема фиксируется через:

```text
scheme_id
title
authority
scheme_version
release_date
canonical_reference
snapshot_digest
license_or_usage_note
status
```

Runtime использует только локально утверждённый snapshot.

## 7. NPC

NPC строится из независимых компонентных профилей. Ни один компонент не должен выводиться из другого без отдельного утверждённого правила.

Обязательная цепочка остаётся:

```text
G4 rule
→ regional NPC archetype/profile set
→ social role / occupation / legal status
→ demographic / name / appearance
→ clothing / equipment
→ knowledge / behavior
→ activity / schedule / relationship
```

### 7.1. Демография

Основные фасеты:

```text
sex
age_band
household_position
marital_or_family_position
health_limitation
mobility_limitation
body_build_band
```

Возраст хранится диапазоном либо конкретным значением экземпляра. Социальные роли не должны автоматически определять пол, возраст или здоровье без исторического регионального правила.

### 7.2. Внешность

Внешность описывается только наблюдаемыми или физически обоснованными признаками:

```text
stature_band
body_build
posture
gait
hair_colour
hair_form
hair_length
facial_hair
eye_colour
visible_skin_tone
facial_shape
hand_condition
teeth_condition
scar_or_mark
injury_or_impairment
occupational_mark
hygiene_state
visible_clothing_state
```

Для антропометрических понятий допускается mapping к ISO 7250-1. Для цвета допускаются нормализованные project labels и при необходимости значения CIE L*a*b*.

Запрещено выводить из внешности:

- характер;
- интеллект;
- моральные качества;
- правовой статус;
- профессию;
- этничность;
- склонность к преступлению;
- достоверность речи.

Физиогномические, расово-типологические и псевдонаучные классификации запрещены.

### 7.3. Устойчивые черты характера

Для машинной основы допускается компактная пятифакторная модель:

```text
openness
conscientiousness
extraversion
agreeableness
emotional_stability
```

Она используется только как профиль устойчивых тенденций. Значения задаются диапазонами или уровнями, а не клиническими диагнозами.

Черты характера не заменяют:

- цели;
- мотивы;
- страхи;
- знания;
- социальные обязательства;
- нормы среды;
- текущее настроение;
- отношение к игроку;
- decision policy.

Социальная категория и профессия могут определять знания, права, обязанности и навыки, но не должны автоматически назначать моральные или личностные качества.

### 7.4. Настроение, тело, оценка ситуации и отношение

Эти состояния не объединяются в один список `mood`.

#### Текущий affect

```text
valence
arousal
control_optional
emotion_category
cause_ref
started_at
expected_decay
```

Базовые emotion categories должны быть закрытым словарём, например:

```text
calm
interest
joy
sadness
fear
anger
disgust
shame
guilt
surprise
```

#### Физиологическое состояние

```text
fatigue
pain
hunger
cold_stress
illness
intoxication
sleepiness
```

#### Ситуационная оценка

```text
perceived_threat
uncertainty
time_pressure
social_exposure
authority_pressure
```

#### Отношение к actor

```text
familiarity
trust
respect
hostility
fear_of_actor
obligation
```

Пример: `устал`, `боится старосты`, `торопится` и `нейтрален к игроку` — четыре разных состояния, а не четыре значения одного настроения.

### 7.5. Поведение

Поведение экземпляра определяется сочетанием:

```text
stable_traits
current_goal
motive
fear_or_constraint
social_norms
legal_status
knowledge
resources
current_affect
body_state
relationship_state
decision_policy
```

Код не сочиняет поведенческий результат. Он применяет утверждённую policy либо формирует bounded decision из закрытого option set.

## 8. Предметы, контейнеры и транспорт

Основная reference-схема для mappings — Getty Art & Architecture Thesaurus. Проект сохраняет собственные категории и региональные исторические шаблоны.

### 8.1. Фасеты предмета

```text
object_type
object_function
material
manufacturing_technique
component_type
physical_form
size_band
mass_band
condition
quality
use_context
legal_status
social_status_signal
```

### 8.2. Материалы

Материал должен быть отдельной нормализованной категорией. Для составного предмета допускаются связи:

```text
primary_material
secondary_material
surface_material
binding_material
coating_material
```

Материал не хранится только свободной строкой в `item_templates`.

### 8.3. Состояние

Минимальная модель:

```text
integrity
wear
cleanliness
wetness
corrosion_or_rot
sharpness_if_applicable
functional_state
```

Используются только применимые фасеты. Нож не получает влажность как обязательный параметр, а ткань не получает остроту.

### 8.4. Контейнеры

Контейнер классифицируется отдельно от предмета по:

```text
container_type
capacity_model
closure_type
portability
access_policy
visibility_policy
```

Содержимое контейнера не является частью его category. Оно материализуется через content profile и slot rules.

### 8.5. Транспорт

Фасеты:

```text
transport_type
propulsion_or_draft
supported_route_type
seasonal_use
capacity_band
required_equipment
required_operator_skill
```

## 9. Строения, помещения и G5

Тип строения нельзя задавать единственным списком, смешивающим форму, функцию и институт.

### 9.1. Фасеты строения

```text
building_form
primary_function
secondary_function
construction_system
primary_material
roof_form
size_band
storey_or_section_model
public_private_model
institutional_affiliation
wealth_context
condition
```

Основная reference-схема для mappings — Getty AAT. Древнерусские археологические и исторические типологии хранятся как собственные project concepts.

### 9.2. Помещения и зоны

Помещение классифицируется по функции:

```text
residential
sleeping
cooking
heating
storage
work
trade
animal_holding
ritual
administrative
defensive
circulation
service
```

Морфологическая форма и функция не объединяются. Например, `сени` могут иметь собственный исторический template и mapping к более широкой функции circulation/service.

### 9.3. Layout

Layout template определяет:

- обязательные и optional room slots;
- допустимые проходы;
- входы и выходы;
- доступ;
- вместимость;
- связь с функцией строения;
- исторический период;
- региональную применимость.

Category не определяет layout автоматически.

### 9.4. G5 anchors

Якорь классифицируется по возможностям взаимодействия:

```text
passage
work_surface
storage_point
heat_source
light_source
water_source
sleeping_place
seating_place
animal_tether
cover
obstacle
observation_point
ritual_focus
```

Конкретный объект якоря создаётся из template/profile/rule и сохраняется в party state.

## 10. Ландшафты, вода и землепользование

Ландшафт должен быть многокомпонентным. Нельзя хранить `forest`, `hill`, `riverbank`, `bog` и `steppe` как значения одной классификационной оси.

### 10.1. Обязательные фасеты

```text
land_cover
habitat
landform
soil_or_ground
hydrological_regime
vegetation_structure
openness
human_modification
land_use
```

### 10.2. Reference-схемы

- FAO LCCS — mapping для land cover;
- EUNIS Habitat Classification — mapping для habitat;
- WRB — mapping для почв, когда такая детализация подтверждена и нужна игре;
- отдельный проектный геоморфологический словарь — для landform;
- отдельный гидрологический словарь — для water body и режима воды.

### 10.3. Land cover и land use

Они всегда хранятся раздельно.

Пример:

```text
land_cover = mixed_forest
land_use = seasonal_grazing
```

Хозяйственное использование не превращает лес в новый тип природной среды.

### 10.4. Вода

Водный объект классифицируется по:

```text
water_body_type
salinity
flow_regime
permanence
depth_band
width_band
bank_or_shore_form
seasonal_freeze
flood_regime
crossing_capability
navigation_capability
```

`riverbank` и `lake_shore` являются пространственно-морфологическими категориями, а не базовыми типами ландшафта.

### 10.5. Игровые эффекты

Множители движения, обзор, риск, проходимость, возможность брода и сезонные ограничения задаются templates/rules. Они не выводятся напрямую из внешнего classification ID.

## 11. Животные — упрощённая игровая модель

Для животных не вводится глубокая биологическая база, полный таксономический граф, Darwin Core, учёт подвидов, генетических линий или научная детализация пород.

Цель животной категоризации — не зоологический каталог, а исторически правдоподобная игровая материализация.

### 11.1. Универсальные категории животных

Минимальный справочник использует понятные игровые типы:

```text
horse
cattle
sheep
goat
pig
dog
cat
chicken
goose
duck
bee
wolf
bear
fox
hare
deer
elk
beaver
otter
wild_boar
small_game
waterfowl
fish
```

При необходимости добавляется более конкретная категория, только если различие влияет на:

- игровой риск;
- хозяйственную функцию;
- транспорт;
- охоту;
- питание;
- право собственности;
- цену;
- поведение сцены;
- историческую достоверность.

### 11.2. Обязательные фасеты

```text
common_type
domestic_or_wild
game_role
size_band
danger_band
habitat_or_place_context
seasonal_presence
commonness
```

Дополнительные фасеты только при необходимости:

```text
sex
age_band
condition
owner_or_controller
herd_or_single
transport_capability
product_or_resource_role
```

### 11.3. Game role

Закрытый словарь:

```text
draft
riding
pack
livestock
food_source
material_source
guard
companion
pest
predator
game_animal
fishery
pollinator
background_fauna
```

### 11.4. Историческая применимость

Для регионального разрешения достаточно:

- понятного common type;
- подтверждения присутствия или использования в регионе и периоде;
- commonness/weight;
- допустимых мест;
- сезонности;
- хозяйственной или экологической причины присутствия;
- источника и confidence.

Научное латинское название допускается как необязательная справочная строка. Оно не требуется materializer и не является обязательным FK.

Современные породы нельзя переносить в XIII век без отдельного исторического основания. По умолчанию используется общий тип `horse`, `cattle`, `sheep` и т. п., а не современная порода.

### 11.5. Материализация

Животное создаётся только при наличии:

```text
approved animal category
+ regional period permission
+ place or G4 profile
+ causal presence rule
+ capacity and ownership policy when applicable
```

Случайное животное не появляется только потому, что LLM сочло сцену живописнее.

## 12. Социальные категории и профессии

Текущая многоосевая модель сохраняется. Социальное положение не сводится к одной вертикальной шкале.

### 12.1. Независимые оси

```text
social_group
role
legal_status
dependency_status
mobility_status
occupation
office
military_obligation
religious_rank
kinship_position
property_rights
court_voice
tax_obligation
service_obligation
```

### 12.2. Исторические термины

Термины вроде `боярин`, `житьи люди`, `смерд`, `закуп`, `холоп`, `черные люди` являются регионально-временными historical concepts.

Они должны иметь:

- историческое определение;
- период и территорию применимости;
- источники;
- scope note;
- mapping на универсальные оси;
- confidence;
- указание спорных интерпретаций.

Запрещено считать такой термин точным синонимом современного класса или профессии.

### 12.3. Профессии

Профессия определяется через выполняемые задачи, производимые товары, услуги, инструменты, навыки, место работы и сезонность.

HISCO допускается как внешний crosswalk, но не как источник исторической применимости.

```text
project occupation concept
→ local historical term
→ task/function definition
→ optional HISCO mapping
```

### 12.4. Запрет социальных стереотипов

Социальная роль может ограничивать:

- права;
- обязанности;
- доступ;
- знания;
- типичные навыки;
- имущество;
- одежду;
- риски.

Она не назначает автоматически:

- честность;
- трусость;
- жадность;
- жестокость;
- интеллект;
- лояльность;
- религиозность;
- отношение к игроку.

## 13. Навыки и знания

Навык и знание являются разными доменами.

### 13.1. Навык

Навык отвечает на вопрос: **что actor умеет делать?**

Он связан с:

- задачами;
- инструментами;
- профессией;
- опытом;
- уровнем владения;
- ограничениями тела.

### 13.2. Знание

Знание отвечает на вопрос: **какие факты actor знает, предполагает или считает истинными?**

Минимальные состояния знания:

```text
known_exact
known_roughly
heard_report
false_belief
unknown
withheld
```

Knowledge category не заменяет конкретную ссылку на канонический факт, когда такой факт существует.

## 14. Региональные разрешения

Универсальная категория не входит в candidate set без активного регионального разрешения, если домен зависит от истории, культуры, природы или экономики региона.

Региональная запись должна содержать:

```text
world_revision_id
region_id
category_id
valid_from
valid_to
commonness_or_weight
applicability
status
confidence
source_refs
```

Исторически нейтральные технические категории могут быть global, но их применение к игровому объекту всё равно проходит через template/profile/rule.

## 15. Источники и confidence

### 15.1. Типы источников

Рекомендуемый порядок доказательности:

1. археологические отчёты и каталоги находок;
2. критические публикации письменных источников;
3. академические монографии и статьи;
4. научные справочники и классификаторы;
5. музейные каталоги с атрибуцией;
6. качественные обзорные материалы;
7. редакторская реконструкция на основании нескольких источников.

### 15.2. Confidence

`confidence` описывает эпистемическую уверенность, а не workflow-статус.

```text
unknown
low
medium_low
medium
medium_high
high
```

`status` и `confidence` нельзя смешивать.

### 15.3. Спорные понятия

При споре:

- сохраняются competing interpretations;
- фиксируется scope каждой интерпретации;
- `exact` mapping не используется;
- материализация разрешается только при однозначном active binding;
- нерешённая обязательная неоднозначность является hard gap.

## 16. Правила хранения

### 16.1. Нормализация

В отдельные таблицы и FK/relations выносятся:

- category/template/profile/rule IDs;
- region и period bindings;
- внешние mappings;
- allowed/required/forbidden relations;
- materials;
- roles и occupations;
- ownership/holder/controller;
- plural candidate entries;
- queryable facets.

### 16.2. JSONB

JSONB допустим только для:

- versioned closed policy payload;
- condition expression без скрытых внешних ID;
- immutable snapshot;
- validation report;
- trace metadata;
- локализованного описания;
- editor notes.

JSONB не должен быть единственным хранилищем классификационных ссылок.

### 16.3. Свободный текст

Свободный текст допустим для описания, объяснения и примечаний. Он не может заменять category ID, material ID, relation type, role ID, animal type или другой машинно значимый фасет.

## 17. Обязательные проверки

До активации категории или схемы выполняются:

1. проверка stable code;
2. проверка уникальности preferred label в пределах domain/facet;
3. проверка отсутствия иерархических циклов;
4. проверка relation type;
5. проверка external mapping и pinned scheme version;
6. проверка источников;
7. проверка region/period binding;
8. проверка compatibility/requires/excludes;
9. проверка отсутствия составной категории из нескольких фасетов;
10. проверка, что значение не вводит новый скрытый category ID;
11. проверка пустых required candidate sets;
12. negative fixtures для запрещённых и пограничных случаев;
13. readiness audit без hard gaps.

## 18. Поведение runtime

Runtime обязан:

1. загрузить active world revision;
2. загрузить approved category/template/profile/rule bundle;
3. проверить region, period, season и context applicability;
4. сформировать конечный candidate set;
5. отсортировать candidates по stable ID;
6. выполнить deterministic selection через versioned RNG;
7. сохранить selected IDs, digest и rejection summary;
8. создать instance;
9. атомарно записать instance и trace.

Если required candidate set пуст:

```text
data gap
→ hard block
→ без fallback
→ без ослабления фильтра
→ без LLM repair содержания каталога
```

## 19. Запрещённые практики

Запрещено:

- создавать category ID в runtime;
- принимать свободный текст LLM как категорию;
- смешивать category, template, profile, rule и instance;
- использовать современный классификатор как доказательство исторического присутствия;
- объединять независимые фасеты в один тип;
- хранить plural category IDs только в JSONB;
- использовать внешнюю live-базу как обязательную runtime-зависимость;
- назначать характер по внешности, профессии или классу;
- назначать историческому животному современную породу без источника;
- создавать предмет, NPC, животное или строение только по заявке игрока;
- создавать смысловой default при отсутствии данных;
- повышать proposed-документ в active без синхронизации DDL, контрактов, importer/readiness checks и аудита.

## 20. Предлагаемые изменения структуры данных

Точный DDL проектируется отдельной задачей. Целевая логическая модель должна включать:

### 20.1. `classification_schemes`

```text
id
title
authority
scheme_version
release_date
canonical_reference
license_or_usage_note
snapshot_digest
status
```

### 20.2. Расширение `universal_categories`

```text
stable_code
facet
preferred_label
definition
scope_note
inclusion_rules
exclusion_rules
replaced_by_category_id
```

### 20.3. `category_labels`

```text
category_id
language
label
label_type
valid_from
valid_to
source_id
```

`label_type`:

```text
preferred
alternative
historical
deprecated
```

### 20.4. `category_scheme_mappings`

```text
category_id
classification_scheme_id
external_concept_id
mapping_type
mapping_evidence
source_id
review_status
```

### 20.5. Нормализация фасетов

Следует постепенно заменить свободные поля и plural JSONB в предметах, материалах, строениях, ландшафтах, социальных профилях и NPC на специализированные relation/entry tables.

## 21. Итоговый план внедрения

### Этап 1. Утверждение норматива

1. Провести профильный аудит документа.
2. Устранить конфликты с active-нормативами.
3. Добавить документ в canonical corpus и навигацию.
4. Оставить статус `proposed` до технической реализации.

**Критерий готовности:** документ принят как целевая архитектура без утверждения несуществующей реализации.

### Этап 2. Базовый классификационный слой

1. Спроектировать DDL `classification_schemes`, labels и mappings.
2. Расширить `universal_categories` обязательными полями.
3. Ограничить relation types.
4. Добавить JSON Schema и importer validation.
5. Добавить cycle, uniqueness, source и version checks.

**Критерий готовности:** универсальные категории нельзя активировать без определения, фасета, источника и валидной структуры.

### Этап 3. Предметы, материалы и контейнеры

1. Создать универсальные словари object type/function/material/condition.
2. Добавить AAT mappings там, где они однозначны или близки.
3. Нормализовать item material bindings.
4. Нормализовать container facets.
5. Перенести queryable значения из свободного текста и plural JSONB.

**Критерий готовности:** item materializer не использует свободный текст как машинную категорию.

### Этап 4. Строения, помещения и G5

1. Разделить form, function, construction, material и institution.
2. Создать room function vocabulary.
3. Связать layouts с нормализованными room/anchor categories.
4. Проверить region/period bindings.
5. Обновить slot rules и readiness audit.

**Критерий готовности:** building type больше не смешивает функцию, форму и институциональную принадлежность.

### Этап 5. Ландшафт, вода и землепользование

1. Разделить land cover, habitat, landform, soil, hydrology и land use.
2. Зафиксировать LCCS/EUNIS/WRB mappings только для применимых понятий.
3. Сохранить игровые эффекты в templates/rules.
4. Мигрировать существующий `landscape_group` в фасетную модель.
5. Проверить региональные разрешения Новгородской земли.

**Критерий готовности:** `forest`, `hill`, `bog` и `riverbank` не конкурируют в одном enum.

### Этап 6. NPC

1. Нормализовать appearance facets.
2. Ввести compact stable traits.
3. Разделить affect, body state, appraisal и relationship.
4. Связать behavior profiles с decision policies.
5. Запретить стереотипные выводы из класса, внешности и профессии.
6. Обновить materializer, party schema и visible read model.

**Критерий готовности:** NPC profile set объясняет выбор каждого параметра отдельной approved category/profile reference.

### Этап 7. Социальные категории, профессии, навыки и знания

1. Сохранить многоосевую социальную модель.
2. Добавить исторические scope notes и источники.
3. Добавить optional HISCO mappings профессий.
4. Разделить skill и knowledge domains.
5. Нормализовать occupation-task-skill relations.

**Критерий готовности:** региональный исторический термин не используется как неразложимый современный класс.

### Этап 8. Упрощённые животные

1. Создать компактный common-type vocabulary.
2. Создать game-role vocabulary.
3. Добавить region/period permissions, commonness и place context.
4. Связать животных с G4/place/building profiles.
5. Добавить ownership и transport facets только для домашних животных.

**Критерий готовности:** игра получает правдоподобных животных без глубокой зоологической подсистемы.

### Этап 9. Импорт, миграция и activation gate

1. Подготовить versioned datasets и manifest.
2. Выполнить dry-run.
3. Проверить cross-references и digests.
4. Добавить negative fixtures.
5. Обновить generated `SCHEMA_REFERENCE.md`.
6. Выполнить PostgreSQL integration.
7. Выполнить full test suite.
8. Провести обязательный аудит агента-критика.
9. Повысить документ и revision в `active` только после `PASS` или допустимого `PASS WITH NOTES`.

## 22. Минимальный первый релиз

Чтобы не превращать задачу в бесконечное построение онтологии, первый release должен включать только категории, реально используемые Новгородской землёй и текущими pipeline:

```text
NPC appearance / traits / affect
social positions / occupations / skills
item types / materials / conditions
containers / transport
building forms / functions / rooms / anchors
land cover / landform / water / land use
simplified animals
```

Неиспользуемые внешние понятия не импортируются.

## 23. Критерии повышения документа в `active`

Документ может стать `active`, только если:

```text
DDL синхронизирован;
SCHEMA_REFERENCE.md перегенерирован;
JSON Schema и importer обновлены;
seed/catalog datasets versioned и approved;
region bindings Новгородской земли заполнены;
materializer использует только нормализованные IDs;
пустые required candidate sets блокируют операции;
negative fixtures существуют;
полный test suite и PostgreSQL integration выполнены;
агент-критик вернул PASS или допустимый PASS WITH NOTES.
```

## 24. Короткая формула

```text
универсальная категория
= одно определённое понятие одного фасета
+ стабильный ID
+ источник
+ версия
+ контролируемые связи;

историческая допустимость
= регион
+ период
+ источник
+ confidence
+ active permission;

конкретный объект игры
= approved category/template/profile/rule
+ причинное основание
+ deterministic selection
+ сохранённый instance
+ trace.
```

Научная классификация создаёт прочный словарь. Исторические источники ограничивают его эпохой и регионом. Код материализует только прошедшие оба уровня варианты. LLM не расширяет каталог и не заменяет отсутствующее знание.