# README для LLM: навигация по документации проекта «Русь XIII век»

## Статус navigation и target/active boundary

Навигация отражает два раздельных слоя: до P28 active production следует materialization v2; `spatial_architecture_standard_g0_g6.md` v4.2.0 задаёт target v3 для документации, contracts, fixtures, migration и shadow composition. `temporal_world_and_interruptible_activities.md` задаёт active Temporal World v4 target amendment (`temporal-world-v1`, Spatial contract `4.3.0-target.1`) и доступен в default active-only retrieval. Навигационный файл не активирует target, не разрешает partial activation, dual write или fallback.

## Приоритет materialization v2

Высший норматив разделения кода и LLM — `code_driven_world_materialization_architecture.md`; технический норматив данных — `world_base_materialization_table_requirements.md`. Код не придумывает категории и историю, но материализует конкретные G5/NPC/items из утверждённых profiles/rules. LLM ограничен bounded decisions, персонажем игрока, аудитом и прозой. Это правило заменяет прежние формулы «LLM создаёт смысл, код только хранит» во всех нижестоящих описаниях.

Для domain-scoped activation `item_container_materialization_v2` дополнительно
обязательны `read_only_database_and_graph_architecture.md` и generated
`infra/world-base/SCHEMA_REFERENCE.md`. Implementation owners:
`packages/runtime-catalog/MODULE.md` для read-only active/historical catalog,
`tools/runtime-catalog-activation/MODULE.md` для operator-only writes и
`docs/implementation/item-container-runtime-activation/README.md` для
readiness, выполненных queries/checks и operator blockers. Эти implementation
paths не заменяют active-нормативы.

Актуализировано: 2026-07-14.

Этот файл нужен для быстрой ориентации LLM, разработчика или аудитора в папке `DOCUMENTS`. Он не заменяет нормативные документы и не вводит новых правил. Если этот README расходится с высшим нормативом materialization v2 или профильным документом, применяется установленный ниже приоритет.

Главное правило работы:

```text
сначала определить систему → открыть профильный документ → сверить связанные документы → только потом отвечать, писать код, менять промт или фиксировать состояние
```

Нельзя придумывать новые механики, категории, формулы, исторические допущения, игровые факты или UI-слои, если они не следуют из текущих документов проекта. Код материализует и изменяет экземпляры из утверждённых данных; LLM принимает только формально ограниченные решения и формулирует разрешённую прозу.

## 1. Приоритет источников

1. `code_driven_world_materialization_architecture.md` — для границы кода/LLM и материализации.
2. Профильный норматив конкретной подсистемы.
3. `development_rules.txt`.
4. DDL, схемы и формальные контракты.
5. Навигационные документы.
6. Реализация.
7. Комментарии и примеры.

### Статусы целевых нормативов

`universal_category_classification_policy.md` и `universal_category_classification_references.md` зарегистрированы в canonical corpus со статусом `proposed`. Они задают целевую модель классификации и внешние опоры, но не отменяют active-нормативы и не подтверждают готовность предметных каталогов, regional permissions или materializer. До отдельного повышения действует приоритет выше.

`temporal_world_and_interruptible_activities.md` имеет status `active` после
реализации, полного набора проверок и независимого критика. Для exact time,
activities, boundaries, NPC temporal runtime, carriers, environment или remote
processes его необходимо читать полностью вместе с target spatial standard.
Его active status означает нормативную власть target amendment, а не
production activation; финальное P28 exact-head evidence остаётся отдельным
обязательным gate.

Дополнительные правила навигации:

- `formulas.md` помогает быстро найти формулу, но не заменяет профильный документ, где эта формула объяснена.
- `README.md` и этот `llm_documentation_navigation.md` являются навигацией, а не источником новых правил.
- `world_regions.txt` задаёт допустимую региональную сетку, но не описывает всю внутреннюю логику региона.
- Исторический слой всегда уточняется через год, сезон, регион, текущую сцену и уже зафиксированные факты партии.
- LLM не должна менять уже зафиксированные факты без игровой причины и явной фиксации изменения.
- Новые предметы, NPC, места, слухи, исторические события и последствия материализуются только при причинном основании и в пределах текущего контекста.
- Скрытые факты мира, мотивы NPC, будущие события, технические промты и raw-диагностика не должны попадать в player-facing прозу или UI.

## 2. Быстрый порядок чтения

### Для общего понимания проекта

1. `README.md`
2. `world_generation_and_turns.txt`
3. `player_character_generation.txt`
4. `character_parameters.txt`
5. `time_system.txt`
6. `temporal_world_and_interruptible_activities.md` при temporal target work
7. `movement_locations_regions.txt`
8. `interface_ux.md`

### Для игровых систем и последствий

1. `items_and_property.txt`
2. `character_inventory_equipment.txt`
3. `npc_inventory_item_marks.txt`
4. `npc_generation_profiles.txt`
5. `weapons_and_armor.txt`
6. `combat_system.md`
7. `historical_events_and_figures.txt`
8. `world_regions.txt`
9. `formulas.md`

### Для LLM-архитектуры, промтов и работы с источниками

1. `information_sources_llm_prompts.md`
2. `llm_agent_prompt_templates.md`
3. `world_generation_and_turns.txt`
4. `interface_ux.md`

## 3. Карта документов

| Файл | Краткое содержание | Когда использовать |
|---|---|---|
| `README.md` | Общее описание проекта, состава `DOCUMENTS`, запуска, тестов и правил будущих изменений. | При первом входе в проект, объяснении назначения репозитория, проверке состава документации и базовых команд. |
| `world_regions.txt` | Список допустимых регионов мира RUS13. Задаёт историко-географическую сетку, в пределах которой выбираются стартовые и последующие регионы партии. | При выборе региона, смене региона, проверке географической допустимости, создании исторического фона и маршрутов. |
| `spatial_architecture_standard_g0_g6.md` | Главный target v4.2.0: G0–G6, topology, movement, materialization, player projection, migration и release gate. До P28 не является active runtime нормативом. | При target-проектировании пространственной модели, contracts, DDL/migration plan и проверке границы active/target. |
| `temporal_world_and_interruptible_activities.md` | Active Temporal World v4 target amendment: exact `GameTimestamp`, interruptible activities, event-driven boundaries, domain/NPC/carrier/remote updates, persistence и post-commit narration. | При любой target-задаче времени, activity/traversal timing, schedules, same-time cascades, environment, carrier clocks, catch-up или propagation; default active-only retrieval обязан находить документ. |
| `world_generation_and_turns.txt` | Target v3: G0–G6/position, bounded preparation/materialization и turn boundary; archived v2 источник сохранён для traceability. | При target-проектировании start/materialization/slots/expansion и сверке active v2 до P28. |
| `player_character_generation.txt` | Правила создания персонажа игрока как человека, встроенного в эпоху, место, статус, тело, знания, имущество, связи и стартовую сцену. | При создании нового персонажа, интерпретации заявки игрока, проверке стартового статуса, биографии, навыков, имущества, связей и причин нахождения в сцене. |
| `character_parameters.txt` | Базовая механика характеристик, навыков, бонусов, состояний, тела и проверок. Фиксирует формулу d20, диапазоны характеристик, здоровье, сытость, бодрость, активные состояния и влияние тела. | При любой проверке, расчёте бонусов, изменении состояния, создании персонажа/NPC, применении штрафов от голода, усталости, ран, болезни и иных состояний. |
| `time_system.txt` | Target routing для exact времени; authoritative Temporal World v4 details находятся в профильном amendment, архивная v2-проза исключена из retrieval. | При любом действии, которое занимает время; для target implementation обязательно затем читать active temporal amendment. |
| `movement_locations_regions.txt` | Target v3: typed endpoints, authored topology, readiness, immutable plans и execution; archived v2 источник сохранён для traceability. | При target-проектировании перемещения, path query, route/segment authoring и boundary. |
| `items_and_property.txt` | Общие правила материальной среды: предметы, имущество, доступ, контейнеры, обнаружимость, право владения, состояние, ценность, следы, риски, материализация предметов и связь вещей с локацией/персонажами. | При создании или проверке предметов сцены, контейнеров, собственности, доступа, кражи, обмена, ремонта, поиска, ценности и правдоподобия материальной среды. |
| `character_inventory_equipment.txt` | Правила для вещей, которые персонаж физически несёт при себе. Описывает вес, нагрузку, быстрый доступ, контейнеры, занятые руки, влияние предметов на проверки, износ, владение и социально-правовые риски. | Когда персонаж берёт, несёт, достаёт, теряет, использует или показывает предмет; при расчёте нагрузки, доступа к вещам и влияния снаряжения на действия. |
| `npc_inventory_item_marks.txt` | Правила для предметов, которые NPC держит при себе или контролирует в текущей сцене. Описывает владельца, держателя, доступность, видимость, метки, узнавание вещи, скрытые предметы, кражу, передачу и последствия обнаружения. | При обыске NPC, краже, передаче вещей, распознавании чужого предмета, проверке улик, меток собственности и реакции владельца. |
| `npc_generation_profiles.txt` | Описывает три уровня NPC: фоновый, сценический и ключевой. Задаёт, какие параметры нужны каждому уровню, когда профиль повышается/понижается, как хранить память, отношение, знания, ресурсы, навыки и последствия. | При создании NPC, взаимодействии с NPC, повышении NPC до сценического или ключевого уровня, сохранении отношений, долгов, памяти и долговременных последствий. |
| `weapons_and_armor.txt` | Типы оружия, брони, щитов и боевого снаряжения как сочетание боевого эффекта, веса, доступности, состояния, права и риска. | При выборе оружия, определении опасности попадания, снижении вреда бронёй, проверке допустимости ношения оружия, социального риска и физической нагрузки. |
| `combat_system.md` | Правила начала боя, боевого хода, проверок атаки/защиты, активной защиты, вреда, уязвимости, брони, дистанции, борьбы, дальнего боя, ранений, добивания, бегства, сдачи и последствий насилия. | При любой физической угрозе, атаке, борьбе, погоне, защите, попытке сбежать, удержать позицию, нанести вред или оценить последствия насилия. |
| `historical_events_and_figures.txt` | Правила исторического слоя: события и личности как внешнее давление, фазы событий, слухи, предвестники, последствия, связь с местом, временем, властью, дорогами, ценами и настроением. | При генерации исторического фона, слухов, крупных событий, власти, войн, известных личностей, смене региона, большом пропуске времени или изменении исторического давления. |
| `interface_ux.md` | Target v3 player-safe projection: movement readiness, knowledge visibility, scene/route maps, interruption/stranded state и diagnostics boundary; archived v2 источник сохранён для traceability. | При UI, `ui-state`, журнале, карте знаний, player payload или проверке hidden-leak boundary. |
| `formulas.md` | Справочник расчётных и структурных формул проекта с пояснениями. Объединяет формулы проверок, состояний, веса, нагрузки, боя, времени, перемещения и структуры сущностей. | Когда нужно быстро найти формулу, а затем проверить её смысл в профильном документе. |
| `universal_category_classification_policy.md` | Proposed-норматив базового слоя universal categories, external mappings и фасетной модели; не является active. | При работе с классификационными схемами, labels, mappings, category relations и планировании этапов 3–9. |
| `universal_category_classification_references.md` | Proposed-реестр внешних классификационных опор; не подтверждает историческую применимость. | При редакторском mapping к внешней схеме, без live runtime-запросов и без regional permission. |
| `information_sources_llm_prompts.md` | Правила работы с исторической, игровой и технической информацией: происхождение сведений, статус достоверности, пополнение базы, сжатие источников, черновики, утверждённые данные и аудит. | При проектировании RAG/поиска, пополнении базы, сохранении источников, работе с внешними сведениями, снижении токенов, отделении чернового знания от утверждённого. |
| `llm_agent_prompt_templates.md` | Рабочие шаблоны только для разрешённых LLM-ролей. Security projection является code-owned; narrator получает уже persisted player-safe package. | При изменении LLM-пайплайна, разрешённых bounded/audit/narrator ролей, генерации прозы и post-commit presentation. |

## 4. Как выбирать нужный документ по задаче

| Задача | Читать сначала | Затем сверить |
|---|---|---|
| Создать новую партию, стартовую сцену, новый узел мира или обработать ход | `world_generation_and_turns.txt` | `time_system.txt`, `movement_locations_regions.txt`, `interface_ux.md` |
| Создать или проверить персонажа игрока | `player_character_generation.txt` | `character_parameters.txt`, `character_inventory_equipment.txt`, `items_and_property.txt` |
| Рассчитать проверку, состояние тела, штраф или навык | `character_parameters.txt` | `formulas.md`, релевантный документ системы действия |
| Изменить время, сон, отдых, ожидание, расписание или отложенное последствие | `temporal_world_and_interruptible_activities.md` | `time_system.txt`, `character_parameters.txt`, `historical_events_and_figures.txt` |
| Переместить персонажа, построить маршрут, вернуть назад, заблудиться | `movement_locations_regions.txt` | `time_system.txt`, `world_regions.txt`, `world_generation_and_turns.txt` |
| Создать предмет сцены, проверить имущество, контейнер, доступ или кражу | `items_and_property.txt` | `character_inventory_equipment.txt`, `npc_inventory_item_marks.txt` |
| Проверить, что персонаж несёт, где предмет лежит, сколько весит и доступен ли он | `character_inventory_equipment.txt` | `items_and_property.txt`, `character_parameters.txt`, `weapons_and_armor.txt` |
| Работать с вещами NPC, метками, узнаваемостью и реакцией владельца | `npc_inventory_item_marks.txt` | `items_and_property.txt`, `npc_generation_profiles.txt`, `interface_ux.md` |
| Создать NPC, повысить профиль, сохранить отношения или память | `npc_generation_profiles.txt` | `character_parameters.txt`, `items_and_property.txt`, `interface_ux.md` |
| Обработать физический конфликт, угрозу, удар, борьбу, стрельбу, защиту, бегство | `combat_system.md` | `weapons_and_armor.txt`, `character_parameters.txt`, `character_inventory_equipment.txt` |
| Проверить оружие, броню, щит, опасность, защиту, право ношения и социальный риск | `weapons_and_armor.txt` | `combat_system.md`, `character_inventory_equipment.txt`, `items_and_property.txt` |
| Создать исторический фон, слух, войну, власть, князя, фазу события | `historical_events_and_figures.txt` | `world_regions.txt`, `time_system.txt`, `world_generation_and_turns.txt` |
| Изменить UI, журнал, подсказки, видимость данных, dev-diagnostics | `interface_ux.md` | `llm_agent_prompt_templates.md`, `information_sources_llm_prompts.md` |
| Изменить LLM-пайплайн, роли агентов, prompt templates, visible context | `llm_agent_prompt_templates.md` | `information_sources_llm_prompts.md`, `world_generation_and_turns.txt`, `interface_ux.md` |
| Добавить внешние источники или пополнить базу знаний | `information_sources_llm_prompts.md` | `historical_events_and_figures.txt`, `world_regions.txt`, профильный документ системы |
| Быстро найти формулу | `formulas.md` | профильный документ, из которого формула взята |

## 5. Минимальные связки документов по подсистемам

### Мир и ход

```text
world_generation_and_turns.txt
+ time_system.txt
+ movement_locations_regions.txt
+ interface_ux.md
```

Использовать при обработке обычной заявки игрока, потому что ход почти всегда меняет сцену, время, видимость и сохранённые факты.

### Персонаж и проверки

```text
player_character_generation.txt
+ character_parameters.txt
+ formulas.md
```

Использовать при генерации, миграции или проверке `health / satiety / vigor`, характеристик, навыков, активных состояний и d20-формулы.

### Предметы, имущество и инвентарь

```text
items_and_property.txt
+ character_inventory_equipment.txt
+ npc_inventory_item_marks.txt
```

Использовать, чтобы не смешивать физический инвентарь, право собственности, доступ, держателя, владельца, контейнеры, метки, риск и сценическую видимость.

### NPC и социальная память

```text
npc_generation_profiles.txt
+ character_parameters.txt
+ items_and_property.txt
+ interface_ux.md
```

Использовать, чтобы фоновые NPC не получали лишнюю скрытую биографию, а сценические и ключевые NPC получали ровно тот объём состояния, который нужен для честных последствий.

### Бой, оружие и последствия насилия

```text
combat_system.md
+ weapons_and_armor.txt
+ character_parameters.txt
+ character_inventory_equipment.txt
+ npc_inventory_item_marks.txt
```

Использовать при любой физической угрозе. Оружие не создаётся заявкой игрока: оно должно быть при персонаже, в руках, доступно в сцене или причинно присутствовать в мире.

### История, регион и источники

```text
historical_events_and_figures.txt
+ world_regions.txt
+ time_system.txt
+ information_sources_llm_prompts.md
```

Использовать для фаз исторических событий, слухов, влияния власти, внешнего давления, региональных ограничений и пополнения базы знаний.

### UI и LLM-слои

```text
interface_ux.md
+ llm_agent_prompt_templates.md
+ information_sources_llm_prompts.md
```

Использовать при отделении player-facing данных от скрытого состояния, raw diagnostics, prompt payloads, debug/admin слоя и художественной прозы.

## 6. Правила для LLM при ответах и изменениях кода

1. Не добавлять новую механику, если она не описана в профильном документе.
2. Не менять формулу в коде без сверки с `formulas.md` и профильным документом.
3. Не считать старый код источником истины, если он противоречит `DOCUMENTS`.
4. Не считать художественную прозу состоянием мира. Состояние должно быть структурировано и сохранено отдельно.
5. Не раскрывать скрытые мотивы NPC, скрытые предметы, будущие события, полный JSON мира или technical diagnostics в игровом UI/прозе.
6. Не материализовать новый предмет, NPC, место или событие только потому, что игрок это назвал. Сначала проверить уже зафиксированное, затем допустимые категории, доступ, риск и причинное основание.
7. Не менять owner при простой передаче предмета: передача обычно меняет holder, а право собственности может остаться прежним.
8. Не обновлять историческое событие как внезапный факт без фаз, предвестников, видимых признаков или регионального давления.
9. Не смешивать инвентарь и имущество: инвентарь — только то, что персонаж физически несёт и может использовать в текущей сцене.
10. Не считать `llm_documentation_navigation.md` самостоятельным источником правил; он только указывает, где искать правило.

## 7. Чеклист перед изменением проекта

Перед изменением кода, промта, схемы данных или UI нужно ответить:

1. Какая подсистема затронута?
2. Какой профильный документ её описывает?
3. Какие связанные документы нужно сверить?
4. Есть ли формула в `formulas.md`?
5. Меняется ли сохранённое состояние мира или только отображение?
6. Не попадут ли скрытые факты в player-facing слой?
7. Нужна ли миграция старых сохранений?
8. Нужны ли новые тесты на формулу, схему, UI-фильтрацию или LLM-контракт?
9. Не создаёт ли изменение новую механику, отсутствующую в документах?
10. Нужно ли обновить профильный документ, если изменение действительно новое?

## 8. Чеклист перед ответом LLM по игровой ситуации

Перед ответом игроку или генерацией хода LLM должна проверить:

1. Что персонаж видит, слышит, помнит или разумно предполагает?
2. Что скрыто от персонажа и не должно попасть в прозу?
3. Есть ли уже зафиксированные факты о месте, NPC, предметах, маршруте и времени?
4. Занимает ли заявка время и как оно влияет на тело, NPC, погоду, дороги и последствия?
5. Нужна ли проверка d20 и какие характеристика/навык/состояние/обстоятельства в неё входят?
6. Есть ли предмет физически при персонаже или в сцене?
7. Есть ли владелец, держатель, доступ, риск или метки предмета?
8. Может ли действие изменить отношение NPC, слух, обязательство, право собственности, следы или историческое давление?
9. Нужно ли записать событие в память/журнал как факт, слух, обязательство или последствие?
10. Не раскрывает ли ответ техническую или будущую информацию?

## 9. Что делать при конфликте документов

1. Не выбирать удобную трактовку молча.
2. Найти профильные документы обеих подсистем.
3. Проверить, не является ли один файл справочником или README, а другой профильным источником.
4. Если конфликт остаётся, явно зафиксировать его как проблему документации.
5. В коде не закреплять новую трактовку до правки профильного документа.
6. В отчёте или задаче указывать конкретные файлы и разделы, где возник конфликт.

## 10. Где должен лежать этот файл

Рекомендуемое место: корень проекта рядом с `README.md`.

Причина: основной `README.md` ссылается на `llm_documentation_navigation.md` как на навигационный файл для LLM. При желании можно дополнительно держать копию в `DOCUMENTS/llm_documentation_navigation.md`, но источником для разработчиков должен быть один актуальный файл, чтобы не появилось двух расходящихся навигационных README.
