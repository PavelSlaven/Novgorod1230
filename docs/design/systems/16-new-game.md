> status: REFERENCE / DOMAIN GUIDE. Объясняет путь от запуска и выбора старта к первому экрану и свободной игре в Вихтуе. Норм не создаёт: при конфликте действуют AGENTS.md, CONTRACT_INDEX и профильные контракты. Состояние на 2026-10-21: main 181548e8; работа в неслитых ветках — по доске распорядителя на эту дату.

# 16. Старт и новая игра

## Замысел

Герой задаётся свободной заявкой независимо от места; игра объясняет его присутствие (D108–D111). Заявка не создаёт фактов мира ([player_character_generation.txt:3–9,19–37](../../../data/knowledge-source/corpus/DOCUMENTS/player_character_generation.txt)). Сценарий задаёт исходные данные; общие правила и свободная игра сохраняются после сюжета ([PRODUCT_CONSTITUTION.md:203–209](../../governance/PRODUCT_CONSTITUTION.md)).

1. Первый запуск → двор мастера → родные `scenario`, `start_location` и mapgen дают фиксированный старт (полное покрытие; поиск идёт по типу местности, не земной координате: [areas/06-movement-world-map.md:37–38](../../context/cdda-native-map/areas/06-movement-world-map.md)) → launcher создаёт fixture и постоянный профиль. Такой запуск наблюдался на servak, с Xvfb и клавишами через XTest ([JOURNAL.md:77–92](../../../tools/cataclysm-prototype/JOURNAL.md)); обычный вывод окна и ввод Windows не подтверждены ([JOURNAL.md:76,83](../../../tools/cataclysm-prototype/JOURNAL.md)). Двор вымышленный; повторный запуск продолжает сохранение ([PLAY.md:3–4,16–17](../../../tools/cataclysm-prototype/PLAY.md)).
2. Партия среза → Вихтуй и два жителя → CDDA размещает героя и геометрию фиксированного старта (полное покрытие с тем же ограничением: [areas/06-movement-world-map.md:37–38](../../context/cdda-native-map/areas/06-movement-world-map.md)) → мод `novgorod` даёт данные, общий игровой слой — разговор, распорядок, поиск и изготовление. Это цель части 5; перенос — в [главе 17](17-world-data-cdda.md).

## Что может игрок

- **16.01.** Запустить прототип CDDA и оказаться во дворе мастера.
- **16.02.** Начать новую игру в Вихтуе.
- **16.03.** Начать в Вихтуе и играть пятнадцать–двадцать минут, переходя между принятыми частями среза.

- **16.04.** Создать персонажа свободным описанием и увидеть выбранный образ в начале партии.

## Родное CDDA

Карта описывает upstream `0d8843f`, до наших патчей ([areas/12-mods-data-loading.md:3](../../context/cdda-native-map/areas/12-mods-data-loading.md)).

| Что даёт движок | Покрытие и предел |
|---|---|
| Загрузка мода через `modinfo.json`, поддержанные JSON-типы для предметов, карты и NPC ([areas/12-mods-data-loading.md:11–12](../../context/cdda-native-map/areas/12-mods-data-loading.md)). | Полное для типов загрузчика. Неизвестный тип — ошибка; повтор ID заменяет объект. Формат не доказывает историчности. |
| `scenario`, `start_location`, зоны появления героя и JSON mapgen ([areas/06-movement-world-map.md:37–38](../../context/cdda-native-map/areas/06-movement-world-map.md)). | Полное для фиксированного старта и геометрии. Старт ищется по типу местности, не исторической координате. |
| Создание героя: `scenario`, `profession`, `start_location`, стартовые EOC ([areas/12-mods-data-loading.md:22](../../context/cdda-native-map/areas/12-mods-data-loading.md)); черты, профессии и хобби ([areas/04-combat-checks-states.md:73](../../context/cdda-native-map/areas/04-combat-checks-states.md)). | Полное для сценария, профессии, места и стартового EOC; частичное для черт/предысторий: фантастические мутации требуют фильтрации. |
| Опции сезона и `scenario.start_of_game` ([areas/12-mods-data-loading.md:14–16](../../context/cdda-native-map/areas/12-mods-data-loading.md)). | Настройка календаря — частичное; исторические месяцы и день недели — нет. 1230 год не помещается в секундный отсчёт (арифметический вывод без запуска). |
| `--userdir`, `--savedir`, `--world` и отдельный профиль ([areas/12-mods-data-loading.md:17](../../context/cdda-native-map/areas/12-mods-data-loading.md)). | Полное для CLI; Windows-поведение ключей не проверено; нужен отдельный userdir. |

## Наш слой и владелец

| Механизм | Отношение к CDDA и владелец |
|---|---|
| Запуск и продолжение | **Используем** native профиль и фиксированный старт ([areas/12-mods-data-loading.md:17](../../context/cdda-native-map/areas/12-mods-data-loading.md); [areas/06-movement-world-map.md:37–38](../../context/cdda-native-map/areas/06-movement-world-map.md), полное). Launcher `tools/cataclysm-prototype` ведёт отдельный userdir ([MODULE.md, «Граница»](../../../tools/cataclysm-prototype/MODULE.md)); первый запуск и reload различает [PLAY.md:16–17,27](../../../tools/cataclysm-prototype/PLAY.md). |
| Вихтуй | **Используем** полное native покрытие фиксированного старта; утверждённые места и сущности поставляет мод `novgorod` через путь [главы 17](17-world-data-cdda.md). |
| Свободная заявка героя | **Расширяем** родное создание ([areas/12-mods-data-loading.md:22](../../context/cdda-native-map/areas/12-mods-data-loading.md), полное для сценария/профессии): разбор заявки, причина присутствия и preview D110/D111 картой не доказаны. Прежнее разделение intent/проверки/фиксации — [new_game_start_pipeline.txt:5–39,59–81](../../../data/knowledge-source/corpus/DOCUMENTS/new_game_start_pipeline.txt); JS orchestration — `@rus/new-game` ([new-game.md:3,37–41](../../pipelines/new-game.md)). CDDA owner определяется CR. |
| Историческая дата | **Расширяем** частичную настройку `start_of_game`; исторических месяцев и дня недели нет ([areas/12-mods-data-loading.md:14–16](../../context/cdda-native-map/areas/12-mods-data-loading.md)). Мод задаёт сезон/час; отсутствующее отображение требует патча CDDA. Календарь — [глава 03](03-time-calendar.md). |

## Решения владельца

- **D11, 2026-09-26, пересказ.** Игрок задаёт имя, характер, цель и предысторию; код сверяет имя с пулом и предлагает варианты, LLM пишет связный пересказ ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5839745154)).
- **D49, 2026-09-29.** «Сначала починить Вихтую»; Вихтуй выбран началом среза ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5889785976)).
- **D66, 2026-10-01, пересказ.** Сценарий задаёт сюжет и конкретных NPC; механики общие, после сюжета свободная игра продолжается ([PC §8.1](../../governance/PRODUCT_CONSTITUTION.md)).
- **D75, 2026-10-02, пересказ.** Начальные параметры — регион, сезон, занятие и общественное положение; расширение позже.
- **D98, 2026-10-06, пересказ.** Сюжет Нижней Двины сохраняется как один из квестовых стартов v17; пример прохождения не задаёт обязательную последовательность.
- **D101, 2026-10-06, пересказ.** Перенос начинается на том же берегу Вихтуя; версия событий и роли — основа квеста, авторский пример не исполняется дословно ([замысел владельца от 06.10](../../plans/sled-na-nizhney-dvine-scenario-spec.md)).
- **D105, 2026-10-06, пересказ.** В квесте заявка героя свободна внутри роли младшего приказчика; NPC берутся из утверждённых имён и занятий, сначала проверяется фиксированный вариант ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6013422255)).
- **D106, 2026-10-06, пересказ.** Сбой генератора: ответ и один repair, затем до двух новых вариантов, после — объяснённый отказ; старты показываются естественными названиями по знанию героя ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6014376079)).
- **D108, 2026-10-06, пересказ.** Любой персонаж возможен в любом месте; игра объясняет реалистичное присутствие, место не назначает личность ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6015580813)).
- **D109, 2026-10-06, пересказ.** В карточке старта остаётся место; свободное создание героя проектируется отдельно, норму переносят через CORPUS_EDIT ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6015615466)).
- **D110, 2026-10-06, пересказ.** Поля важнее текста; preview «Принять»/«Изменить», правки без лимита; занятие — ближайшее утверждённое с объяснением; квестовая роль не фильтрует место ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6015910253)).
- **D111, 2026-10-06, пересказ.** Утверждены норма героя и старта, объяснение пути/цели/непосредственной нужды до первого хода, preview и фиксация без перегенерации при reload ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6015937590)).
- **D138, 2026-10-07, пересказ.** Вступление получает видимые выходы с описаниями местности, а не пустую заглушку ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6116723787)).
- **D139, 2026-10-07, пересказ.** До первого хода вступление объясняет, как, почему и зачем герой здесь, что ему нужно и чем грозит бездействие, только из заявки и утверждённых данных ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6116723787)).
- **D220, 2026-10-19, пересказ.** Срез использует мод `novgorod`; анахронизмы исключаются из наличного мира, причинное изобретение игрока сохраняется.
- **D264, 2026-10-21.** «дату старта сам выбери»: распорядитель выбрал 20.08.1230 по юлианскому календарю, 07:00 местного среднего солнечного времени; распорядок двора уточняет D266 в [главе 04](04-npc-life.md).

## Расхождения и открытые вопросы

- **Свободный герой и фиксированный срез — вопрос владельцу.** D108/D110/D111 требуют независимости героя от места, preview и объяснения присутствия; В #243 это CONFLICT, заявка/импульс/позиция — PARTIAL (`player_character_generation.txt:35,37,64,68–86,393–416,506–551`). Часть 5/D228 и [PLAY.md:3–4](../../../tools/cataclysm-prototype/PLAY.md) пока опираются на фиксированный двор. Какую свободу героя включить в срез? Родные [scenario/profession:22](../../context/cdda-native-map/areas/12-mods-data-loading.md) покрыты полностью, но свободная заявка ими не доказана. [D108](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6015580813).

- **Старый pipeline и CDDA.** [new_game_start_pipeline.txt:41–81](../../../data/knowledge-source/corpus/DOCUMENTS/new_game_start_pipeline.txt) описывает G5 и запись party database; [карта:37–38](../../context/cdda-native-map/areas/06-movement-world-map.md) даёт native mapgen и старт. Перенос проверок и dossier определяет CR; статус старого текста — [CONTRACT_INDEX.md, §7](../../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md).
- **Готовность данных Вихтуя.** D228 требует двух жителей с полным набором действий, тогда как [PLAY.md:34–37](../../../tools/cataclysm-prototype/PLAY.md) описывает ограниченный dev-двор без полной памяти и распорядка. CR называет утверждённые карту, жителей, вещи и WK; JSON-типы не доказывают загрузку ([areas/12-mods-data-loading.md:12](../../context/cdda-native-map/areas/12-mods-data-loading.md)). См. [GDD.md](../GDD.md), раздел «Этапы».
- **Дата и первый экран.** D264 даёт дату сцены; рамка требует согласованного времени ([new_game_start_pipeline.txt:11–15,53–54](../../../data/knowledge-source/corpus/DOCUMENTS/new_game_start_pipeline.txt)). Представление этой даты в ограниченном родном календаре надо согласовать до приёмки ([areas/12-mods-data-loading.md:14–16](../../context/cdda-native-map/areas/12-mods-data-loading.md)).

## Источники

- [PRODUCT_CONSTITUTION.md](../../governance/PRODUCT_CONSTITUTION.md) — свободный мир и сценарии.
- [new_game_start_pipeline.txt](../../../data/knowledge-source/corpus/DOCUMENTS/new_game_start_pipeline.txt) и [player_character_generation.txt](../../../data/knowledge-source/corpus/DOCUMENTS/player_character_generation.txt) — заявка и первый экран.
- [new-game.md](../../pipelines/new-game.md) — прежний JS-путь.
- [areas/06-movement-world-map.md](../../context/cdda-native-map/areas/06-movement-world-map.md), [areas/12-mods-data-loading.md](../../context/cdda-native-map/areas/12-mods-data-loading.md), [areas/04-combat-checks-states.md](../../context/cdda-native-map/areas/04-combat-checks-states.md) — родные механизмы.
- [PLAY.md](../../../tools/cataclysm-prototype/PLAY.md), [JOURNAL.md](../../../tools/cataclysm-prototype/JOURNAL.md) — запуск и ограничения.
- [План среза](../../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md) — итоговая партия P6.

## Этап

Этап 0: servak, Xvfb, XTest; Windows не проверен ([JOURNAL.md:76–92](../../../tools/cataclysm-prototype/JOURNAL.md)). Часть 5 переносит разговор, распорядок, «взять» и «сделать» на двух жителей Вихтуя; итог P6 — пятнадцать–двадцать минут игры ([план среза, раздел P6](../../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md)). Критерии и доказательства — в [GDD.md](../GDD.md).
