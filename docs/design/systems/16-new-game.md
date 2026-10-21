> status: REFERENCE / DOMAIN GUIDE. Объясняет путь от запуска и выбора старта к первому экрану и свободной игре в Вихтуе. Норм не создаёт: при конфликте действуют AGENTS.md, CONTRACT_INDEX и профильные контракты. Состояние на 2026-10-21: main 181548e8; работа в неслитых ветках — по доске распорядителя на эту дату.

# 16. Старт и новая игра

## Замысел

Новая партия помещает человека в определённое место и время: с телом, имуществом, знаниями и причиной находиться здесь. Заявка выражает желание; исторических фактов она не создаёт ([player_character_generation.txt:3–9,19–37](../../../data/knowledge-source/corpus/DOCUMENTS/player_character_generation.txt)). Сценарий задаёт исходное состояние и сюжет; общие правила действуют одинаково внутри и вне него. После завершения сюжета игра продолжается ([PRODUCT_CONSTITUTION.md:203–209](../../governance/PRODUCT_CONSTITUTION.md)).

1. Игрок впервые запускает dev-пробу → входит в мир → видит двор мастера → родные `scenario`, `start_location` и mapgen дают фиксированный старт (полное покрытие; поиск идёт по типу местности, не земной координате: [areas/06-movement-world-map.md:37–38](../../context/cdda-native-map/areas/06-movement-world-map.md)) → наш launcher подготавливает отдельную fixture и постоянный профиль. Такой запуск наблюдался в [JOURNAL.md:84–92](../../../tools/cataclysm-prototype/JOURNAL.md). Двор вымышленный; повторный запуск продолжает сохранение ([PLAY.md:3–4,16–17](../../../tools/cataclysm-prototype/PLAY.md)).
2. Игрок начинает новую партию среза → выбирает предусмотренный старт → оказывается в Вихтуе, обходит его и встречает двух жителей → CDDA размещает героя и геометрию средствами фиксированного старта (полное покрытие с тем же ограничением: [areas/06-movement-world-map.md:37–38](../../context/cdda-native-map/areas/06-movement-world-map.md)) → мод `novgorod` задаёт утверждённое место и жителей, а наш слой соединяет разговор, распорядок, поиск и изготовление. Это целевой путь части 5; перенос данных описан в [главе 17](17-world-data-cdda.md).

## Что может игрок

- **16.01.** Запустить прототип CDDA и оказаться во дворе мастера.
- **16.02.** Начать новую игру в Вихтуе.
- **16.03.** Начать в Вихтуе и играть пятнадцать–двадцать минут, переходя между принятыми частями среза.

## Родное CDDA

Оценки относятся к пину `0d8843f1c500052c3e026e3da6f8edaf5e00b626`, без патчей Новгорода ([areas/12-mods-data-loading.md:3](../../context/cdda-native-map/areas/12-mods-data-loading.md)).

| Что даёт движок | Покрытие и предел |
|---|---|
| Загрузка мода через `modinfo.json`, поддержанные JSON-типы для предметов, карты и NPC ([areas/12-mods-data-loading.md:11–12](../../context/cdda-native-map/areas/12-mods-data-loading.md)). | Полное для перечисленных типов. Неизвестный тип вызывает ошибку; более поздний объект с тем же ID заменяет прежний. Поддержка формата не подтверждает историческую достоверность содержимого. |
| `scenario`, `start_location`, зоны появления героя и JSON mapgen ([areas/06-movement-world-map.md:37–38](../../context/cdda-native-map/areas/06-movement-world-map.md)). | Полное для фиксированного старта и геометрии. Поиск стартовой позиции идёт по типу местности; историческую координату этим не задают. |
| Опции сезона и `scenario.start_of_game` ([areas/12-mods-data-loading.md:14–16](../../context/cdda-native-map/areas/12-mods-data-loading.md)). | Частичное для календаря. Абсолютный 1230 год не помещается в описанный секундный отсчёт; вывод карты арифметический, запуском не проверен. Исторические названия месяцев не настраиваются JSON. |
| `--userdir`, `--savedir`, `--world` и отдельный профиль ([areas/12-mods-data-loading.md:17](../../context/cdda-native-map/areas/12-mods-data-loading.md)). | Полное для CLI; поведение этих ключей на Windows картой не проверено. Без отдельного userdir можно открыть реальный профиль пользователя. |

## Наш слой и владелец

| Механизм | Отношение к CDDA и владелец |
|---|---|
| Запуск dev-двора и продолжение | **Используем** native профиль и фиксированный старт ([areas/12-mods-data-loading.md:17](../../context/cdda-native-map/areas/12-mods-data-loading.md), [areas/06-movement-world-map.md:38](../../context/cdda-native-map/areas/06-movement-world-map.md)). Владелец launcher — `tools/cataclysm-prototype`; он работает со своим постоянным userdir ([MODULE.md, раздел «Граница»](../../../tools/cataclysm-prototype/MODULE.md)). Новый старт и загрузка прежней партии различаются по [PLAY.md:16–17,27](../../../tools/cataclysm-prototype/PLAY.md). |
| Старт в Вихтуе | **Расширяем** содержимое native `scenario`/`start_location`/mapgen; их полного механического покрытия недостаточно без исторических данных ([areas/06-movement-world-map.md:37–38](../../context/cdda-native-map/areas/06-movement-world-map.md)). Владелец сцены и исходных сущностей — данные мода `novgorod`; утверждение и преобразование данных принадлежат пути [главы 17](17-world-data-cdda.md). |
| Герой, рамка и первый экран | **Используем** разделение intent, проверки и фиксации, описанное в [new_game_start_pipeline.txt:5–39,59–81](../../../data/knowledge-source/corpus/DOCUMENTS/new_game_start_pipeline.txt). В старом JS-пути orchestration принадлежит `@rus/new-game` ([new-game.md:3,37–41](../../pipelines/new-game.md)); это описание прежней реализации, не готовый CDDA-владелец. Перенос требует CR с одним владельцем каждого поля героя и публичной проекции. |
| Историческая дата старта | **Расширяем** относительный календарь и его отображение. Проверенный native механизм `scenario.start_of_game` покрывает задачу частично, но не абсолютный 1230 год и исторические месяцы ([areas/12-mods-data-loading.md:14–16](../../context/cdda-native-map/areas/12-mods-data-loading.md)). Мод задаёт сезон и час; наш патч CDDA отвечает за отсутствующую часть отображения, если она потребуется. Согласование календаря относится к [главе 03](03-time-calendar.md). |

Старт соединяет разговор, распорядок, вещи и прозу их общих владельцев. Первый экран получает только доступные герою факты ([new_game_start_pipeline.txt:56–81](../../../data/knowledge-source/corpus/DOCUMENTS/new_game_start_pipeline.txt)).

## Решения владельца

- **D49, 2026-09-29.** Владелец о начале среза: «Сначала починить Вихтую» (запись владельца от этой даты). Выбор Вихтуя опубликован в [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5889785976). Решение задаёт место начала; перенос pipeline в CDDA требует отдельной работы.
- **D220, 2026-10-19.** Запись решения выбирает свой мод `novgorod`. Об анахронизмах слова владельца: «убрать из мира». Запись владельца от этой даты; причинное изобретение игрока остаётся возможным ([PRODUCT_CONSTITUTION.md:238–248](../../governance/PRODUCT_CONSTITUTION.md)).
- **D228, 2026-10-20.** Владелец утвердил порядок словами «Да: порядок принят». Запись владельца от этой даты закрепляет Вихтуй в части 5 после «сделать», проверку частей 1–4 на двух жителях и итоговые пятнадцать–двадцать минут. Критерии перенесены в [GDD.md](../GDD.md), раздел «Этапы».
- **D264, 2026-10-21.** Слова владельца: «дату старта сам выбери». В записи решения распорядитель выбрал 20.08.1230 по юлианскому календарю, 07:00 местного среднего солнечного времени. Уточнение D266 от той же даты задаёт распорядок «Дня мастера»; его содержание находится в [главе 04](04-npc-life.md).

## Расхождения и открытые вопросы

- **Старый pipeline и CDDA.** [new_game_start_pipeline.txt:41–81](../../../data/knowledge-source/corpus/DOCUMENTS/new_game_start_pipeline.txt) описывает G5 и запись party database; [карта:37–38](../../context/cdda-native-map/areas/06-movement-world-map.md) даёт native mapgen и старт. Какие проверки и поля dossier переходят в CDDA, а какие остаются историей JS-пути, должен определить отдельный CR. Ориентир по роли старого текста — [CONTRACT_INDEX.md, §7](../../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md).
- **Готовность данных Вихтуя.** D228 требует двух жителей с полным набором действий, тогда как [PLAY.md:34–37](../../../tools/cataclysm-prototype/PLAY.md) описывает ограниченный dev-двор без полной памяти и распорядка. Нужно назвать утверждённые наборы карты, жителей, вещей и WK и подтвердить их загрузку. Само наличие JSON-типов этого не доказывает ([areas/12-mods-data-loading.md:12](../../context/cdda-native-map/areas/12-mods-data-loading.md)).
- **Дата и первый экран.** D264 даёт дату сцены; рамка требует согласованного времени ([new_game_start_pipeline.txt:11–15,53–54](../../../data/knowledge-source/corpus/DOCUMENTS/new_game_start_pipeline.txt)). Представление этой даты в ограниченном родном календаре надо согласовать до приёмки ([areas/12-mods-data-loading.md:14–16](../../context/cdda-native-map/areas/12-mods-data-loading.md)).

## Источники

- [PRODUCT_CONSTITUTION.md](../../governance/PRODUCT_CONSTITUTION.md) — свободный мир, сценарии и историческая рамка.
- [new_game_start_pipeline.txt](../../../data/knowledge-source/corpus/DOCUMENTS/new_game_start_pipeline.txt) и [player_character_generation.txt](../../../data/knowledge-source/corpus/DOCUMENTS/player_character_generation.txt) — заявка, герой, проверки и первый экран.
- [new-game.md](../../pipelines/new-game.md) — владелец orchestration и handoff старого JS-пути.
- [areas/06-movement-world-map.md](../../context/cdda-native-map/areas/06-movement-world-map.md) и [areas/12-mods-data-loading.md](../../context/cdda-native-map/areas/12-mods-data-loading.md) — native старт, карта, мод и календарные ограничения.
- [PLAY.md](../../../tools/cataclysm-prototype/PLAY.md) и [JOURNAL.md](../../../tools/cataclysm-prototype/JOURNAL.md) — действительный dev-запуск и его пределы.
- [План среза](../../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md) — путь к итоговой партии P6.

## Этап

Этап 0 проверяет запуск двора мастера. В этапе 1 часть 5 переносит в Вихтуй разговор, распорядок, «взять» и «сделать» на двух жителях. После экрана с прозой и сохранений итог P6 соединяет части в партию на пятнадцать–двадцать минут ([план среза, раздел P6](../../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md)). Полные критерии и доказательства — в [GDD.md](../GDD.md).
