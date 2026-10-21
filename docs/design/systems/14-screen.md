> status: REFERENCE / DOMAIN GUIDE. Глава описывает экран Novgorod1230, native map и журнал CDDA, а также границу между отображением и игровым фактом. Норм не создаёт: при конфликте действуют AGENTS.md, CONTRACT_INDEX и профильные контракты. Состояние на 2026-10-21: main 181548e8; работа в неслитых ветках — по доске распорядителя на эту дату.

# 14. Экран

## Замысел

Экран помогает игроку действовать внутри исторического мира. Он связывает прозу, свободный ввод, карту и краткий журнал, но каждый элемент показывает только подтверждённое и доступное герою. Карта отражает знание персонажа, журнал хранит доступные сообщения, а проза соединяет факты в сцену; ни один из этих элементов не создаёт состояние. Target-описание интерфейса и обсуждение native поля полезны для направления, но не доказывают готовую browser-интеграцию ([interface_ux.md](../../../data/knowledge-source/corpus/DOCUMENTS/interface_ux.md); [обсуждение UI, §4–6](../../plans/Novgorod1230_Cataclysm_Map_UI_and_Fog_of_War_Discussion_2026-10-18.md)).

1. Игрок выходит из избы во двор → видит героя, доступные клетки и воспоминания о замеченном → CDDA считает видимость и хранит память карты ([карта:9–10](../../context/cdda-native-map/areas/11-ui-display.md), полное для зрения, частичное для памяти) → `@rus/presentation` показывает player-safe проекцию, не дорисовывая скрытых людей.
2. Игрок читает сцену и просит осмотреть двор → сверяется с картой и журналом → CDDA исполняет запрос и обновляет видимость, а координата с экрана сама по себе не становится результатом ([карта:14,16–17](../../context/cdda-native-map/areas/11-ui-display.md), частичное покрытие транспорта и tile query) → UI передаёт клик как намерение и показывает только принятую прозу и разрешённые сведения.

Целевой опыт части 6 — видеть прозу, карту и журнал на одном экране, сохранив ввод свободным. Native карта основывается на данных CDDA. Это цель slice plan, а не описание текущего game-web поведения ([план среза, P5](../../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md)).

## Что может игрок

- **14.01.** Видеть карту двора и родной журнал в живом графическом окне игры.
- **14.02.** Читать новгородскую прозу, карту и журнал вместе на одном экране.

## Родное CDDA

Карта относится к upstream `0d8843f1c500052c3e026e3da6f8edaf5e00b626`; это оценка механизмов движка, а не browser integration Novgorod.

| Механизм и ссылка на §1 карты | Покрытие | Ограничение |
|---|---|---|
| Native tile/curses отображение локального поля ([areas/11-ui-display.md:9](../../context/cdda-native-map/areas/11-ui-display.md)). | Частичное. | CDDA рисует своё окно; это не готовый HTML viewport. |
| `visibility_cache`, `map::pl_sees` и `map_memory` ([areas/11-ui-display.md:10](../../context/cdda-native-map/areas/11-ui-display.md)). | Полное для зрения, частичное для памяти. | Видимость считает аватар; память обновляется при отрисовке, без draw автоматическое обновление не доказано. |
| Native `overmap`/`om_vision_level` ([areas/11-ui-display.md:12](../../context/cdda-native-map/areas/11-ui-display.md)). | Полное. | Debug-reveal не относится к обычному опыту; overmap не раскрывает предметы локальной карты. |
| Zoom/pixel minimap ([areas/11-ui-display.md:13](../../context/cdda-native-map/areas/11-ui-display.md)). | Полное в TILES. | Pixel minimap не работает в curses режиме. |
| Screenshot, dummy-SDL fixture, Emscripten, `display::` ([areas/11-ui-display.md:14](../../context/cdda-native-map/areas/11-ui-display.md)). | Частичное для browser transport. | Screenshot — PNG существующего окна; fixture тестовая, Emscripten запускает весь клиент. Готового server-to-browser клеточного экспорта не найдено. |
| `Messages::recent_messages` ([areas/11-ui-display.md:16](../../context/cdda-native-map/areas/11-ui-display.md)). | Частичное. | Локализованный текст не источник механической истины. |
| JSON widgets и панели ([areas/11-ui-display.md:18](../../context/cdda-native-map/areas/11-ui-display.md)). | Частичное. | Рисуются игрой; UI-независимые текст/цвет можно использовать, но браузерного layout нет. |
| `u_query_tile` и native input ([areas/11-ui-display.md:17](../../context/cdda-native-map/areas/11-ui-display.md)). | Частичное. | Запрос блокирует и ограничен native UI; browser click должен стать намерением для проверки игрой. |

## Наш слой и владелец

**Используем** native map, visibility, map memory, overmap и `Messages` как основание физического отображения и разрешённых сведений. CDDA владеет картой, зрением и памятью; `@rus/presentation` владеет player-facing read models и панелями ([presentation/MODULE.md:3–25](../../../packages/presentation/MODULE.md)). Browser renderer не становится topology owner и не получает hidden engine state ([interface_ux.md:1–30](../../../data/knowledge-source/corpus/DOCUMENTS/interface_ux.md)).

**Расширяем** native journal accessor только если текущий host не отдаёт нужную историю: `recent_messages` не имеет полной даты, event id/source и push ([карта:16](../../context/cdda-native-map/areas/11-ui-display.md), частичное). Native accessor остаётся у `Messages`, а безопасная проекция и UI — у `@rus/presentation`; второй журнал и разбор локализованного текста не добавляются.

**Новое относительно CDDA** — транспорт native поля в браузер, если выбран web-вариант. Проверены `game::take_screenshot`, dummy-SDL fixture и Emscripten: скриншот захватывает текущее окно, fixture не является режимом запуска, Emscripten — клиент целиком; структурного actor-safe экспорта клеток карта не нашла ([карта:14](../../context/cdda-native-map/areas/11-ui-display.md), частичное). Поэтому варианты viewport capture и минимальной native проекции сначала сравниваются на прототипе. Если понадобится новый native seam, его владелец — патч CDDA; read model и browser rendering — `@rus/presentation`. Решение о конкретном seam не принято.

**Используем** native tile query для выбора, где оно подходит. Проверенный `u_query_tile` блокирует и предназначен для окна игры ([карта:17](../../context/cdda-native-map/areas/11-ui-display.md), частичное); browser click передаёт намерение, а не записывает позицию, маршрут или последствие.

## Решения владельца

- **D20, 2026-09-26 — пересказ записи D20 от 2026-09-26; слов владельца в записи нет.** Рассказчик и экран ограничены тем, что персонаж видит и знает; физическое состояние не становится знанием само по себе. Источник — [#133, комментарий](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5846311836).
- **D228, 2026-10-20, критерий части 6:** в живой десятиминутной игре владелец читает прозу каждого хода; карта, журнал и проза должны быть согласованы. Это критерий будущей проверки, не свидетельство готового экрана ([план среза, P5](../../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md)); процедура приёмки остаётся в разделе этапов хаба.

## Расхождения и открытые вопросы

- `interface_ux.md` описывает целевой player-safe UI, но CONTRACT_INDEX относит его к `UNDECLARED / DOMAIN GUIDE`; target не активирует production integration ([CONTRACT_INDEX.md:133](../../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md); [interface_ux.md:1–30](../../../data/knowledge-source/corpus/DOCUMENTS/interface_ux.md)). Native live-окно не доказывает доступность того же поля в браузере.
- Карта CDDA хранит память, однако обновляет её через render path ([карта:10](../../context/cdda-native-map/areas/11-ui-display.md)). Если browser integration не вызывает draw, предстоит выбрать совместимый путь без второго owner-а памяти.
- Карта не выявила готовый web transport; нужно сравнить screenshot и actor-safe проекцию на ограниченной области, включая player-safe фильтр и производительность. Ни один вариант сейчас не объявляется готовым API.
- План части 6 требует approved prose, карты и журнала вместе, тогда как `TurnScreen` допускает только approved narration, а `FactualTurnDeliveryScreen` остаётся ограниченным recovery ([план среза, P5](../../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md); [presentation/MODULE.md:39–51](../../../packages/presentation/MODULE.md)). Необходимо согласовать промежуточную подачу отдельно.
- Native tiles не подтверждают историческую уместность графики для Руси XIII века ([обсуждение UI, §6](../../plans/Novgorod1230_Cataclysm_Map_UI_and_Fog_of_War_Discussion_2026-10-18.md)).

## Источники

- [interface_ux.md](../../../data/knowledge-source/corpus/DOCUMENTS/interface_ux.md) — назначение UI и target player-safe projection.
- [CONTRACT_INDEX.md](../../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md) — статус UI-документа и профильная область.
- [areas/11-ui-display.md](../../context/cdda-native-map/areas/11-ui-display.md) — native rendering, видимость, память, журнал и transport limits.
- [Novgorod1230_Cataclysm_Map_UI_and_Fog_of_War_Discussion_2026-10-18.md](../../plans/Novgorod1230_Cataclysm_Map_UI_and_Fog_of_War_Discussion_2026-10-18.md) — native поле и варианты безопасного browser transport.
- [Novgorod1230_Cataclysm_Narration_Boundaries_and_Player_Event_Log_Discussion_2026-10-18.md](../../plans/Novgorod1230_Cataclysm_Narration_Boundaries_and_Player_Event_Log_Discussion_2026-10-18.md) — разделение prose и журнала.
- [Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md](../../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md) — критерии части 6.
- [JOURNAL.md](../../../tools/cataclysm-prototype/JOURNAL.md) — живой native графический экран, карта двора и журнал.

## Этап

В основе CDDA живой протокол показывает карту двора и native журнал в графической сессии ([JOURNAL.md:83–92](../../../tools/cataclysm-prototype/JOURNAL.md)); это ещё не совместный экран игры Novgorod с принятой прозой. В части 6 владелец играет десять минут и читает прозу каждого хода, затем оценивает её как читатель. Прогон должен подтвердить согласованность результата, карты, журнала и рассказа, не раскрывая скрытого знания. Browser transport, обновление памяти и показ промежуточного результата требуют решения до P7.
