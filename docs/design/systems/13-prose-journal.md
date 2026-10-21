> status: REFERENCE / DOMAIN GUIDE. Глава описывает художественную прозу, родной журнал сообщений и границы их совместного чтения. Норм не создаёт: при конфликте действуют AGENTS.md, CONTRACT_INDEX и профильные контракты. Состояние на 2026-10-21: main 181548e8; работа в неслитых ветках — по доске распорядителя на эту дату.

# 13. Проза и журнал

## Замысел

Игрок читает не отчёт о состоянии, а связную сцену из положения героя. Рассказ соединяет подтверждённые события и восприятие причинно, но не достраивает скрытые факты. Если сцена бедна, недостаёт входных сведений или наполнения мира; более длинная фраза этого не исправит ([ситуационные требования, §1–3](../../../data/knowledge-source/corpus/DOCUMENTS/situational_prose_requirements.md); [PC §3–9](../../governance/PRODUCT_CONSTITUTION.md)). Журнал при этом хранит короткие native сообщения и помогает следить за ходом событий. Он не заменяет прозу, а локализованная строка не доказывает механику ([обсуждение прозы и журнала, §3–5](../../plans/Novgorod1230_Cataclysm_Narration_Boundaries_and_Player_Event_Log_Discussion_2026-10-18.md)).

1. Мастер отвечает → игрок видит произнесённые слова и затем читает цельную сцену → CDDA передаёт речь через звуковой мир и может добавить сообщение в `Messages` ([карта:13](../../context/cdda-native-map/areas/07-narration-log.md), частичное покрытие) → `@rus/narration` пишет сцену по подтверждённой речи и доступному герою контексту, а `@rus/presentation` показывает прозу и журнал раздельно.
2. Игрок ищет следы у двери и не находит их → видит честное отсутствие или наблюдаемую причину, но не выдуманный предмет → CDDA выполняет действие и применяет видимость ([карта:10,14–15](../../context/cdda-native-map/areas/07-narration-log.md), частичное для player-safe сообщений, полное для scripted text) → профильный owner подтверждает результат, проекция отбирает допустимые сведения, narrator сохраняет неопределённость.

Проза сохраняет фактический порядок, точную услышанную речь, русский литературный голос и абзацы по смысловым изменениям. Классы сцен из active требований — читательские проверки, а не набор фраз или отдельный router ([situational_prose_requirements.md, §4, §9, §16](../../../data/knowledge-source/corpus/DOCUMENTS/situational_prose_requirements.md)).

## Что может игрок

- **13.01.** Открыть родной журнал `P` и прочитать фактически сказанную NPC реплику.
- **13.02.** Играть десять минут и читать новгородскую прозу к каждому ходу.

## Родное CDDA

Оценки относятся к upstream `0d8843f1c500052c3e026e3da6f8edaf5e00b626`, а не к готовности интеграции Novgorod.

| Механизм и ссылка на §1 карты | Покрытие | Ограничение |
|---|---|---|
| `Messages`: короткие сообщения, склейка повторов, история и save/load ([areas/07-narration-log.md:9](../../context/cdda-native-map/areas/07-narration-log.md)). | Частичное для хронологии. | `recent_messages` даёт время суток и текст, без даты, source, event id или структуры факта; API опрашивается, push/cursor не найден. Локализованные строки нельзя разбирать как истину. |
| Сообщения с учётом видимости через `add_msg_if_player_sees` ([areas/07-narration-log.md:10](../../context/cdda-native-map/areas/07-narration-log.md)). | Частичное. | Голый `add_msg` может раскрыть неизвестное герою; нативной метки приватности нет. |
| NPC speech, EOC `u_message`, snippets, diary и memorial ([areas/07-narration-log.md:13,15–16,19–20](../../context/cdda-native-map/areas/07-narration-log.md)). | Полное для scripted text/snippets; частичное для речи и личной хроники. | Звуковая речь не создаёт романную сцену; сниппет выбирается из данных; diary заполняется вручную, memorial хранит ограниченный набор событий. |

## Наш слой и владелец

**Используем** `Messages`, native perception и сообщения CDDA в их пределах. Результат действия остаётся у профильного owner-а, а текст журнала или прозы не меняет мир. Связную сцену формирует действующий `@rus/narration`; экран и read models принадлежат `@rus/presentation` ([narration/MODULE.md:3–20](../../../packages/narration/MODULE.md); [presentation/MODULE.md:3–29](../../../packages/presentation/MODULE.md)). Их состав в CDDA пока не прошёл отдельный cutover.

**Новое относительно CDDA** — открытый narrator, который связывает подтверждённые факты в литературный текст. Проверены `Messages` и EOC `u_message`: карта даёт полное покрытие scripted text, но `recent_messages` возвращает строку без event structure и player-safe provenance ([карта:9,15](../../context/cdda-native-map/areas/07-narration-log.md)). Они не заменяют narrator-а и не служат его фактическим входом. Владелец существующего механизма — `@rus/narration`; второй writer не добавляется.

**Расширяем** чтение native журнала для UI только если текущий host не даёт нужную историю. В `recent_messages` нет полной даты, стабильного события, источника и push ([карта:9](../../context/cdda-native-map/areas/07-narration-log.md), частичное). При необходимости accessor принадлежит native `Messages` owner-у, а безопасная проекция — `@rus/presentation`; формат решается прототипом.

## Решения владельца

- **D20, 2026-09-26 — пересказ записи D20 от 2026-09-26; слов владельца в записи нет.** Рассказчик получает из WK лишь видимое и известное персонажу; физика и последствия участвуют в разборе хода, но не выдаются прозой как современные научные объяснения. Источник — [#133, комментарий](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5846311836).
- **Решение от 2026-09-25, номер D не присвоен — пересказ записи решений владельца от 2026-09-25; слов владельца в записи нет.** Проза задумана как книга глазами персонажа, без выдумок; бедная проза указывает на пробел наполнения. Это запись решений, не прямая речь владельца ([#133, комментарий](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5836830425)).
- **D161, 2026-10-08, слова владельца:** «Всегда оценивай прозу с точки зрения читателя.» Реплики NPC встроены в связное повествование, а качество оценивается по всему экрану ([#600](https://github.com/PavelSlaven/Novgorod1230/issues/600)).
- **D158, 2026-10-08, дословно:** «нейтральные звуки и запахи среды можно оставить (запах леса, шум ветра и прочее)». Звук, который раскрывает человека или событие, требует факта мира.
- **D162, 2026-10-08, запись по обратной связи владельца:** «Микула ещё не попросил показать дорогу. Ну что это за бред?» Это отзыв о неудачном примере, не дословное правило. Следствие в записи D162: следующий, ещё не исполненный шаг не объявляют и не перечисляют как факт; при помехе называют только доступную герою причину ([#586](https://github.com/PavelSlaven/Novgorod1230/issues/586)).

## Расхождения и открытые вопросы

- Целевой narrator вызывается на смысловой границе, а не на каждом техническом тике ([обсуждение, §3](../../plans/Novgorod1230_Cataclysm_Narration_Boundaries_and_Player_Event_Log_Discussion_2026-10-18.md)). Действующий `@rus/presentation` допускает `TurnScreen` только с approved narration; prose contract связывает её с подтверждённым player-safe контекстом и commit. Как состыковать это с native commit и промежуточным журналом, решается на P7 ([presentation/MODULE.md:3–29](../../../packages/presentation/MODULE.md); [situational_prose_requirements.md:17–29](../../../data/knowledge-source/corpus/DOCUMENTS/situational_prose_requirements.md)).
- План среза просит отдельный журнал, но карта native указывает, что Messages может содержать неизвестные герою строки и не имеет структуры событий ([план, P5](../../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md); [карта:9–10](../../context/cdda-native-map/areas/07-narration-log.md)). Нужна безопасная доставка без разбора текста и второго event log.
- Часть 6 требует десять минут игры с прозой каждого хода и читательской оценки владельца ([план, P5–P6](../../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md)). Согласовать, что в критерии считается ходом, с реальными границами narrator-а; критерий не является свидетельством пройденного прогона.

## Источники

- [situational_prose_requirements.md](../../../data/knowledge-source/corpus/DOCUMENTS/situational_prose_requirements.md) — требования к сцене, фактической границе и приёмке.
- [CONTRACT_INDEX.md](../../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md) — статус prose contract и профильных owners.
- [areas/07-narration-log.md](../../context/cdda-native-map/areas/07-narration-log.md) — native сообщения, речь и хронология.
- [Novgorod1230_Cataclysm_Narration_Boundaries_and_Player_Event_Log_Discussion_2026-10-18.md](../../plans/Novgorod1230_Cataclysm_Narration_Boundaries_and_Player_Event_Log_Discussion_2026-10-18.md) — границы прозы и журнала.
- [Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md](../../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md) — критерий части 6 и native-путь.
- [TASK03-DELIVERY-RESULT.md](../../../tools/cataclysm-prototype/TASK03-DELIVERY-RESULT.md) — live реплика и ограничение: это ещё не литературная проза.

## Этап

В основе CDDA живой протокол показывает принятую реплику NPC в native журнале `P`, но отдельно отмечает, что литературная проза ещё не проверена ([TASK03-DELIVERY-RESULT.md:30–36](../../../tools/cataclysm-prototype/TASK03-DELIVERY-RESULT.md)). В части 6 владелец играет десять минут, читает прозу на каждом принятом ходу и оценивает её как читатель. Связь подтверждённых результатов, доступного знания, журнала и prose проверяется на всей сцене; до такого прогона и P7 нельзя считать экран и повествование согласованной production-системой.
