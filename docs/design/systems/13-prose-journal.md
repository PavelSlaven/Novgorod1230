> status: REFERENCE / DOMAIN GUIDE. Глава описывает художественную прозу, родной журнал сообщений и границы их совместного чтения. Норм не создаёт: при конфликте действуют AGENTS.md, CONTRACT_INDEX и профильные контракты. Состояние на 2026-10-21: main 181548e8; работа в неслитых ветках — по доске распорядителя на эту дату.

# 13. Проза и журнал

## Замысел

Игрок читает связную сцену от третьего лица, в прошедшем времени, по имени героя. По D158 факты мира берутся строго из данных, а повествование свободно: свет, тепло, запахи, фоновые звуки, мысли, чувства и небольшие движения героя составляют живой рассказ. Человек, предмет, след, голос или исход, создающие новую возможность действия, требуют факта мира. Это замысел D158 и [PC §9.1](../../governance/PRODUCT_CONSTITUTION.md); расхождение с действующей прозовой нормой вынесено ниже. Журнал хранит короткие native сообщения; локализованная строка не доказывает механику ([обсуждение прозы и журнала, §3–5](../../plans/Novgorod1230_Cataclysm_Narration_Boundaries_and_Player_Event_Log_Discussion_2026-10-18.md)).

1. Мастер отвечает → игрок видит произнесённые слова и затем читает цельную сцену → CDDA передаёт речь через звуковой мир и может добавить сообщение в `Messages` ([карта:13](../../context/cdda-native-map/areas/07-narration-log.md), частичное покрытие) → `@rus/narration` пишет сцену по подтверждённой речи и доступному герою контексту, а `@rus/presentation` показывает прозу и журнал раздельно.
2. Игрок ищет следы у двери → читает подтверждённый результат поиска или доступную причину неопределённости → CDDA фильтрует видимость у `add_msg_if_player_sees`, а голые `add_msg` и `u_message` попадают в лог без такого фильтра ([карта:10,14–15](../../context/cdda-native-map/areas/07-narration-log.md), частичное для player-safe сообщений, полное для условий EOC и scripted text) → профильный owner подтверждает результат, проекция отбирает допустимые сведения, narrator сохраняет неопределённость. Сам лог не доказывает отсутствие следа.

Фактический порядок и услышанная речь сохраняются. Классы сцен active требований служат читательской проверке ([situational_prose_requirements.md, §4, §9, §16](../../../data/knowledge-source/corpus/DOCUMENTS/situational_prose_requirements.md)).

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

| Журнал знаний: `avatar::snippets_read`, EOC `store_in_lore` ([areas/07-narration-log.md:18](../../context/cdda-native-map/areas/07-narration-log.md)). | Частичное. | Сохраняет множество ID прочитанных сниппетов без порядка, времени и контекста; этого недостаточно для обязательств, людей, мест и слухов с достоверностью. |

## Наш слой и владелец

**Используем** `Messages` и native perception. Факты подтверждает доменный owner; прозу пишет `@rus/narration`, экраном владеет `@rus/presentation` ([narration/MODULE.md:3–20](../../../packages/narration/MODULE.md); [presentation/MODULE.md:3–29](../../../packages/presentation/MODULE.md)). Состав в CDDA требует cutover.

**Новое относительно CDDA** — связный литературный narrator. Родные `Messages` и EOC `u_message` покрывают scripted text полностью, но строка `recent_messages` лишена структуры события и player-safe provenance ([карта:9,15](../../context/cdda-native-map/areas/07-narration-log.md)). Narrator остаётся у `@rus/narration`; строки лога не становятся его фактическим входом.

**Расширяем** чтение native журнала для UI только если текущий host не даёт нужную историю. В `recent_messages` нет полной даты, стабильного события, источника и push ([карта:9](../../context/cdda-native-map/areas/07-narration-log.md), частичное). Accessor остаётся у `Messages`, проекция — у `@rus/presentation`; формат проверяет прототип.

## Решения владельца

- **2026-09-25, номер D не присвоен, пересказ.** Проза — книга глазами героя; бедность фактов требует наполнения мира. D158 уточняет: строгость относится к фактам мира, повествование свободно ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5836830425)).
- **D16, 2026-09-26, пересказ.** WK подключается рассказчику и интерпретатору реплик игрока ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5846022014)).
- **D20, 2026-09-26, пересказ.** Рассказчик получает из WK только видимое и известное герою; современные научные объяснения остаются в разборе хода ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5846311836)).
- **D25, 2026-09-27, пересказ.** Рассказчику нужен русский пакет с приоритетами и инструкцией первого прихода; отдельные задачи отбора, письма и проверки сравниваются слепыми судьями ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5853027101)).
- **D72, 2026-10-02, пересказ.** Служебные ID, статусы и коды не попадают ни в прозу, ни на другие поверхности игрока.
- **D135, 2026-10-07, пересказ.** Мягкий телесный порог продолжающегося действия упоминается рассказчиком; сильный останавливает действие и требует ответа игрока ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6116723787)).
- **D153, 2026-10-08, пересказ.** Вход прозовой роли — русские предложения о воспринимаемом и известном её субъекту с человеческим выражением уверенности; служебные флаги и ID не являются фактами. Пункт 3 о потолке атмосферы для писателя заменён D158 ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6116723787)).
- **D158, 2026-10-08.** На рекомендации владелец ответил «все по рекомендации». Пересказ: факты мира из данных, рассказ свободен; третье лицо, прошедшее время, по имени героя. Заменяет D78 и пункт 3 D153 для писателя. Уточнение дословно: «нейтральные звуки и запахи среды можно оставить (запах леса, шум ветра и прочее)»; звук о человеке или событии требует факта мира. Слова владельца: «важно не задушить писателя опять» ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6116723787)).
- **D159, 2026-10-08, пересказ.** Средняя живость прозы по слепым судьям — не ниже 8/10; тексты с протокольной подачей исключаются ([#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6116723787)).
- **D161, 2026-10-08.** «Всегда оценивай прозу с точки зрения читателя.» Пересказ: речь NPC включена в связное повествование ([#133, D161](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6116723787)).
- **D162, 2026-10-08, пересказ.** Неисполненный следующий шаг плана не объявляется фактом; при помехе передаётся лишь доступная причина ([#586](https://github.com/PavelSlaven/Novgorod1230/issues/586)).
- **D187, 2026-10-12, пересказ.** При плохой видимости доступны силуэт, пол и крупный цвет одежды; лицо, возраст, занятие и неизвестное коду положение не добавляются.

## Расхождения и открытые вопросы

- **Свобода рассказа и ACTIVE-текст — вопрос владельцу на P7/CORPUS_EDIT.** D158 разрешает свободное повествование и третье лицо, но действующая [норма:19–29,87](../../../data/knowledge-source/corpus/DOCUMENTS/situational_prose_requirements.md) в §2 запрещает создание звука и телесного ощущения, а §4.5 требует второго лица. D158 намечает переработку §2, §3.1, §4.2, §4.5, §14, §16. Как согласовать свободу рассказа с фактической границей? До cutover действует ACTIVE-текст. [Запись D158](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6116723787).
- **Журнал знаний — вопрос владельцу.** В аудите #243 правила `information_sources_llm_prompts.md:774–793` и `:235–239` о людях, местах, обязательствах и достоверности слухов отмечены PARTIAL; native [snippets_read:18](../../context/cdda-native-map/areas/07-narration-log.md) хранит только ID. Какой состав журнала и на каком этапе нужен, с единым владельцем знания `@rus/visibility-knowledge-memory` и показом через `@rus/presentation`? [Аудит #243](https://github.com/PavelSlaven/Novgorod1230/issues/243).

- Целевой narrator вызывается на смысловой границе ([обсуждение, §3](../../plans/Novgorod1230_Cataclysm_Narration_Boundaries_and_Player_Event_Log_Discussion_2026-10-18.md)). Действующий `@rus/presentation` допускает `TurnScreen` только с approved narration; prose contract связывает её с подтверждённым player-safe контекстом и commit. Как состыковать это с native commit и промежуточным журналом, решается на P7 ([presentation/MODULE.md:3–29](../../../packages/presentation/MODULE.md); [situational_prose_requirements.md:17–29](../../../data/knowledge-source/corpus/DOCUMENTS/situational_prose_requirements.md)).
- План среза просит отдельный журнал, но карта native указывает, что Messages может содержать неизвестные герою строки и не имеет структуры событий ([план, P5](../../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md); [карта:9–10](../../context/cdda-native-map/areas/07-narration-log.md)). Нужна безопасная доставка без разбора текста и второго event log.
- Часть 6 требует десять минут прозовой игры и оценки владельца ([план, P5–P6](../../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md)). Нужно согласовать понятие хода с границами narrator-а; критерий не доказывает готовности. [Границы narrator, §3](../../plans/Novgorod1230_Cataclysm_Narration_Boundaries_and_Player_Event_Log_Discussion_2026-10-18.md).

## Источники

- [situational_prose_requirements.md](../../../data/knowledge-source/corpus/DOCUMENTS/situational_prose_requirements.md) — требования к сцене, фактической границе и приёмке.
- [CONTRACT_INDEX.md](../../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md) — статус prose contract и профильных owners.
- [areas/07-narration-log.md](../../context/cdda-native-map/areas/07-narration-log.md) — native сообщения, речь и хронология.
- [Novgorod1230_Cataclysm_Narration_Boundaries_and_Player_Event_Log_Discussion_2026-10-18.md](../../plans/Novgorod1230_Cataclysm_Narration_Boundaries_and_Player_Event_Log_Discussion_2026-10-18.md) — границы прозы и журнала.
- [Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md](../../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md) — критерий части 6 и native-путь.
- [TASK03-DELIVERY-RESULT.md](../../../tools/cataclysm-prototype/TASK03-DELIVERY-RESULT.md) — live реплика в журнале. Ограничение прозы подтверждают [PLAY.md:3](../../../tools/cataclysm-prototype/PLAY.md) и [JOURNAL.md:86](../../../tools/cataclysm-prototype/JOURNAL.md).

## Этап

В основе CDDA живой протокол показывает принятую реплику NPC в native журнале `P` ([TASK03-DELIVERY-RESULT.md:31–36](../../../tools/cataclysm-prototype/TASK03-DELIVERY-RESULT.md)). Подача остаётся черновиком ([PLAY.md:3](../../../tools/cataclysm-prototype/PLAY.md); [JOURNAL.md:86](../../../tools/cataclysm-prototype/JOURNAL.md)). В части 6 владелец играет десять минут, читает прозу на каждом принятом ходу и оценивает её как читатель. Связь подтверждённых результатов, доступного знания, журнала и prose проверяется на всей сцене; до такого прогона и P7 нельзя считать экран и повествование согласованной production-системой.
