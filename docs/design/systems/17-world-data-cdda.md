> status: REFERENCE / DOMAIN GUIDE. Глава объясняет путь исторических данных и знаний в игровой мир CDDA. Норм не создаёт: при конфликте действуют AGENTS.md, CONTRACT_INDEX и профильные контракты. Справочная редакция от 2026-10-22 учитывает D275 и ответы анкеты; приведённые свидетельства реализации относятся к проверке main 181548e8 от 2026-10-21 и отдельно названным опытам.

# 17. Данные мира и их путь в CDDA

## Для человека

### Какому столпу служит

«Я верю в 1230 год»: люди, вещи и занятия узнаваемы по эпохе и месту; широту мира поддерживают исторические данные и отмеченная правдоподобная реконструкция. ([VIS-028](../questionnaire.md); [D275/37](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D38, D40](../decision-log.md))

### Что чувствует игрок

У встреченных людей есть местные имена, занятия и границы знания. Рыбак может честно не знать ковку; речь не сообщает сведения из будущего. ([MEC-075](../questionnaire.md); [D51, D61](../decision-log.md))

### Правила для игрока

Наличное окружение соответствует эпохе: анахронизмы исключены, но редкое и привозное не запрещается само по себе. Изобретение героя зависит от реальных условий и физики. Исторический каркас сохраняется в новой партии, а вероятностные находки могут измениться. ([VIS-084](../questionnaire.md); [D40, D51, D59, D220](../decision-log.md))

### Как игрок узнаёт о механике

Через названия и свойства вещей, увиденные места и разговоры о занятиях людей. Большие исторические события приходят слухами с названным источником, а рассказ остаётся в пределах знания героя. ([WLD-003](../questionnaire.md); [WLD-056](../questionnaire.md); [WLD-064](../questionnaire.md); [MEC-075](../questionnaire.md))

### Связи с другими механиками

Исторические данные дают основу [ремеслу](07-craft-processes.md), [находкам](06-take-materialization.md), [старту](16-new-game.md), [разговорам](05-conversation.md) и [знаниям мира](12-world-knowledge.md). До включения данные проходят независимое утверждение; выдумка, обнаруженная проверкой, означает пробел данных. ([WLD-009](../questionnaire.md); [MEC-075](../questionnaire.md); [D134](../decision-log.md))

### Примеры ситуаций

- Герой спрашивает рыбака о его занятии, затем о незнакомом ремесле → получает местное знание и честное «не знаю» за его пределами. ([MEC-075](../questionnaire.md))
- Герой встречает редкую привозную вещь → редкость не делает её невозможной, если она допустима для времени и региона. ([D40, D51](../decision-log.md))
- Герой спрашивает о далёком событии → слышит сообщение с источником, а не всеведущее изложение истории. ([WLD-064](../questionnaire.md); [EXP-074](../questionnaire.md))

## Для разработчика и нейросети

### Замысел

Игрок встречает людей с местными именами и занятиями и действует среди вещей своей эпохи. Категории общемировые, разрешения региональные, экземпляры открыты ([PC §9.1](../../governance/PRODUCT_CONSTITUTION.md), решение от 25 сентября ниже).

Часть 5: Вихтуй → разговор с двумя жителями об их занятиях → CDDA загружает `npc`, `npc_class`, `talk_topic` ([areas/12-mods-data-loading.md:12](../../context/cdda-native-map/areas/12-mods-data-loading.md), полное для зарегистрированных типов; повтор ID заменяет объект) → мод переносит личности и доступные каждому знания. Подробнее — главы [05](05-conversation.md) и [04](04-npc-life.md).

**Целевая роль языковой модели:** Загрузка утверждённых данных не вызывает модель; свободная конкретизация использует их через общий ход. ([D275 §3.2](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

**Особенность:** Данные ограничивают исполнение и конкретизацию. ([«Как устроен ход»: сквозные примеры](../GDD.md))

### Что может игрок

- **17.01.** Встретить в Вихтуе двух разных жителей и узнать их местные имена и занятия в разговоре.

### Родное CDDA

| Что используем | Оценка карты и предел |
|---|---|
| Мод с `modinfo.json` и JSON загружает `DynamicDataLoader` ([areas/12-mods-data-loading.md:11](../../context/cdda-native-map/areas/12-mods-data-loading.md)). | Полное. Неизвестный `type` и цикл наследования — ошибка. |
| Предметы, группы, здания и люди используют `ITEM`, `item_group`, `mapgen`, `npc`, `npc_class`, `talk_topic` ([areas/12-mods-data-loading.md:12](../../context/cdda-native-map/areas/12-mods-data-loading.md)). | Полное для типов загрузчика; повтор ID заменяет объект, `copy-from` поддержан не везде. |
| `--check-mods` проверяет загружаемые определения и согласованность ссылок ([areas/12-mods-data-loading.md:19](../../context/cdda-native-map/areas/12-mods-data-loading.md)). | Полное. Consistency не доказывает историчности. |
| `ITEM_BLACKLIST`, списки животных и `region_overlay` исключают содержимое и меняют регион ([areas/12-mods-data-loading.md:21](../../context/cdda-native-map/areas/12-mods-data-loading.md)). | Частичное. Возможны битые ссылки; второй список сценариев или профессий сбрасывает первый. |
| `item_group` и `Item_modifier` дают основу выбора и свойств обычного предмета ([areas/05-items-crafting.md:18](../../context/cdda-native-map/areas/05-items-crafting.md)). | Частичное. Тип выбирается из существующих `itype`; новый тип на лету этот путь не создаёт. |

### Наш слой и владелец

Путь данных: происхождение → применимость → утверждение → экспорт → потребитель. Уровни category/template/profile/rule/instance разделены ([world-base §1–2](../../../data/knowledge-source/corpus/DOCUMENTS/world_base_materialization_table_requirements.md)); авторинг не подменяет состояние партии ([v3 contract §1](../../../data/knowledge-source/corpus/DOCUMENTS/spatial_v3_target_world_base_materialization_table_requirements.md)).

`v17` — прежняя линия данных; `rus13` — архив с происхождением ([manifest:1–12](../../../data/world-base-sources/rus13-base-v1.manifest.json)). `game-base-v1` — домены и потребители ([CATALOG.md:3–25](../../../data/world-catalogs/novgorod/game-base-v1/CATALOG.md)); [STATUS.md:3](../../../data/world-catalogs/novgorod/game-base-v1/STATUS.md) оставляет данные candidate до решения об импорте. WK хранит фактические знания отдельно от партии и памяти NPC ([WK contract §10–14](../../../data/knowledge-source/corpus/DOCUMENTS/world_knowledge_platform_implementation_contract.md)). Мод `novgorod` публикует проверенное содержимое D220.

**Используем** полную JSON-загрузку и consistency ([areas/12-mods-data-loading.md:11–12,19](../../context/cdda-native-map/areas/12-mods-data-loading.md)). **Новое относительно CDDA** — историческая проверка периода, региона и источника: родная `game::check_mod_data` (`src/game_io.cpp:127–211`) вызывает `finalize_loaded_data` и `check_consistency` (`src/init.cpp:954–1042`), но проверяет согласованность данных, а не историческую достоверность ([areas/12-mods-data-loading.md:19](../../context/cdda-native-map/areas/12-mods-data-loading.md)). По D40 `function` не фильтрует полезность; `reject` — только анахронизм/невозможность, дубли исправляются ([Audit and Migration:130](../../plans/Novgorod1230_Cataclysm_Audit_and_Migration_2026-10-18.md)).

**Расширяем** частично покрытые исключения ([areas/12-mods-data-loading.md:21](../../context/cdda-native-map/areas/12-mods-data-loading.md)) вычитанными данными, сохраняя рецепты и зависимости. Публикация — мод `novgorod`; авторинг/WK-компиляция — `@rus/world-catalog-workflow` ([MODULE.md:3–27](../../../tools/world-catalog-workflow/MODULE.md)), запросом WK — `@rus/world-knowledge` ([MODULE.md:3–38](../../../packages/world-knowledge/MODULE.md)). Экспорт/потребитель — CR части 5; утверждение и проверка экспорта — по [WR §21.1](../../governance/WORKFLOW_RULES.md).

### Решения владельца

- **2026-09-25, номер D не присвоен, пересказ.** [#133 от 25.09](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5836830425): база общемировая, категории и региональные разрешения заполняются максимально; код задаёт классы/характеристики, LLM конкретизирует экземпляры через WK.
- **D220, 2026-10-19, пересказ.** Мод `novgorod`, мир `[dda, novgorod]`, исторические звери/вещи/регион; части `innawood` и `Tamable_Wildlife` — после вычитки. Анахронизмы не появляются, изобретения и рецепты сохраняются. Приручение — детёныши, перков за убийства нет; щиты и конь — из `Medieval Mod Reborn`. Нужен замер старта.
- **2026-09-25, номер D не присвоен, пересказ.** Имя NPC выбирает код по seed из утверждённого пула народа, пола, эпохи и положения; прозвища — позже из списка ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5838829348)).
- **D24, 2026-09-27, пересказ; история старого движка.** Данные и импорт имеют одного потребителя в игре; `approve_with_limits` переносится вместе с ограничениями ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5853027101)).
- **D26, 2026-09-27, пересказ.** В старом world_base PF — единый слой типов мест, по которому строятся наличие, вода и распорядки; соответствие native данным требует P7 ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5856342800)).
- **D30, 2026-09-28, пересказ.** Все типы стартовой территории наполняются; у остальных применимых типов остаётся явный пробел с планом закрытия ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5866721387)).
- **D38, 2026-09-28, пересказ.** Нехватку источника закрывает логическая необходимость с записанным выводом; формы ограничены эпохой, мир широк и разнообразен ([PC §9.1](../../governance/PRODUCT_CONSTITUTION.md)).
- **D39, 2026-09-28, пересказ.** Любой физически добываемый вид — ресурс; «непромысловый» не означает исключённый. Архив служит черновой основой реконструкции ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5873452423)).
- **D40, 2026-09-28, пересказ.** Включение определяется существованием, а не пользой; исключения — анахронизм и физическая невозможность, дубли/противоречия исправляются. Импортное не исключается; широта максимальна, глубина задаётся свойствами ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5873540762)).
- **D46, 2026-09-28, пересказ.** Из архивов включаются вещи, быт, сезонность пищи, затем занятия, право, психология и имена; ремесленные шаги — аналогия, карты за стартовой территорией — отдельный CR ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5878069847)).
- **D51, 2026-09-30, пересказ.** Для народов нужны отдельные пулы имён; сомнение в анахронизме проверяется по региону/периоду, редкость и привозное происхождение не запрещают вещь.
- **D59, 2026-10-01, пересказ.** Анахронизмы исключаются из наличного мира; изобретение игрока решается физикой и причинными условиями ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5926596803)).
- **D61, 2026-10-01, пересказ.** Карельские имена учитывают календарь; профили немецких и готландских гостей — мужские ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5931406104)).
- **D99, 2026-10-06, пересказ.** Итоговые предметные разделы заменяют раннюю раскладку D95; у предмета есть литературное собственное имя либо общее имя категории ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6012628812)).
- **D124, 2026-10-06, пересказ.** Двор и общество дополняются игровой реконструкцией там, где источников нет; нужна полнота мира ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6019676864)).
- **D125, 2026-10-06, пересказ.** Реконструкция распространяется на брак, наследование, военные и городские дворы и отношения ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6020145069)).
- **D129, 2026-10-06, пересказ.** Утверждена раскладка 13 765 вещей в 20 разделах; 38 вещей «Упряжи и повозок» получают собственные имена отдельным утверждением ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6023166925)).
- **D134, 2026-10-07, пересказ.** Утверждена реконструкция пробелов общества; для каждого набора называются потребитель и путь импорта ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6025992676)).
- **D136, 2026-10-07, пересказ.** Подключаются история, исторические лица, здоровье и досуг; при отсутствии механики потребитель — WK, а не новая инфраструктура ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6116723787)).
- **D140, 2026-10-07, пересказ.** Постройки связываются с двором и владением, экономикой и местами; источниковые пробелы закрываются отмеченной реконструкцией ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6116723787)).
- **D169, 2026-10-08, пересказ.** Остаточные пробелы базы заполняются отмеченной реконструкцией с проверкой правдоподобия ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6116723787)).
- **Без номера D, 2026-09-26, пересказ записи.** Знание и слухи различаются между социальными группами; это поздний этап, текущая фильтрация не должна свести знание к «известно всем».

### Расхождения и открытые вопросы

- **Какой набор подключить?** D220/D228 требуют Вихтуй, [план миграции:95,130](../../plans/Novgorod1230_Cataclysm_Audit_and_Migration_2026-10-18.md) — отбора и утверждения. CR части 5 называет записи, ID и потребителя. [Загрузка:12](../../context/cdda-native-map/areas/12-mods-data-loading.md).
- **Какая ревизия WK придёт к жителям?** [IDX §5](../../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md) различает production WK и пилот `reviewed/not_active`; D228 требует WK в Вихтуе. Нужны утверждённый пакет, binding и живой потребитель CDDA. [Потребитель WK](12-world-knowledge.md).
- **Открытые экземпляры.** [PC §9.1](../../governance/PRODUCT_CONSTITUTION.md) требует открытости, а [areas/05-items-crafting.md:18](../../context/cdda-native-map/areas/05-items-crafting.md) ограничивает частичное покрытие существующим `itype`. Механизм — глава [06](06-take-materialization.md) и её CR.

### Источники

- [PRODUCT_CONSTITUTION.md](../../governance/PRODUCT_CONSTITUTION.md), §9.1; [CONTRACT_INDEX.md](../../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md), §4–5.
- [world_base_materialization_table_requirements.md](../../../data/knowledge-source/corpus/DOCUMENTS/world_base_materialization_table_requirements.md), [spatial_v3_target_world_base_materialization_table_requirements.md](../../../data/knowledge-source/corpus/DOCUMENTS/spatial_v3_target_world_base_materialization_table_requirements.md) — уровни данных.
- [world_knowledge_platform_implementation_contract.md](../../../data/knowledge-source/corpus/DOCUMENTS/world_knowledge_platform_implementation_contract.md) — пакеты и применимость.
- [areas/12-mods-data-loading.md](../../context/cdda-native-map/areas/12-mods-data-loading.md), [areas/05-items-crafting.md](../../context/cdda-native-map/areas/05-items-crafting.md) — загрузка и предметные типы.
- [Audit and Migration](../../plans/Novgorod1230_Cataclysm_Audit_and_Migration_2026-10-18.md) — публикация исторических наборов.

### Этап

Этап 0 — опытный двор; данные в `main` не доказывают переноса Вихтуя. [PR #793](https://github.com/PavelSlaven/Novgorod1230/pull/793) и [PR #829](https://github.com/PavelSlaven/Novgorod1230/pull/829) ведут разговор и нормы распорядка.

Часть 5 переносит части 1–4 на двух жителей Вихтуя. P7 согласует нормы; затем наборы подключаются кольцами владельца, этапы 4–5 расширяют территорию. Пилот WK перед массовым наполнением указан в [этапе 3 хаба](../GDD.md).

### Данные и числа

Параметры предметов, рецептов и существ берутся из родных данных CDDA, затем из утверждённых исторических наборов; собственные балансовые числа без решения не вводятся. Сводка — [таблица главы 4 GDD](../GDD.md). ([D275/2](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D220](../decision-log.md))

### Состояния и события

Происхождение и применимость → независимое утверждение → экспорт → подтверждённый потребитель. Загрузка JSON проверяет согласованность, историчность подтверждает отдельная вычитка. Запись данных сама по себе не означает, что житель получил знание в партии. ([WLD-009](../questionnaire.md); [D134](../decision-log.md); [карта загрузчика](../../context/cdda-native-map/areas/12-mods-data-loading.md))

### Что сохраняется

В партии сохраняются конкретные люди и физические экземпляры, а знания отдельного человека и его память остаются отделены от общей исторической базы. Перезагрузка возвращает тот же мир. ([D275/31](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [MEC-075](../questionnaire.md); [контракт WK](../../../data/knowledge-source/corpus/DOCUMENTS/world_knowledge_platform_implementation_contract.md))

### Чек-лист

- Сохранение: загруженный мир сохраняет имена, занятия и экземпляры без повторного создания. ([D275/31](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))
- Перевод: русский интерфейс; исходный язык строк мода — см. [open-questions.md, EXP-045](../open-questions.md). ([EXP-044](../questionnaire.md); [EXP-045](../questionnaire.md))
- Звук: проза называет только слышимое героем; отдельных сигналов опасности нет. ([EXP-017](../questionnaire.md)) Подписи звуков не решены — см. [open-questions.md, EXP-043](../open-questions.md).
- Подсказка и управление: знания доступны через свободные вопросы, ответ ограничен знанием конкретного человека. ([MEC-075](../questionnaire.md))
- Доступность: родные средства CDDA, крупный текст прозы; смысл не только цветом. ([EXP-040](../questionnaire.md))

### Как проверить готовность

Проверить загрузку и consistency мода; отдельно — утверждение периода, региона и происхождения записей. В живой партии поговорить с двумя жителями Вихтуя об их разных занятиях, проверить границу знания и сохранение. Одной успешной загрузки недостаточно для исторической приёмки. ([WLD-009](../questionnaire.md); [MEC-075](../questionnaire.md); [план среза, часть 5](../../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md))
