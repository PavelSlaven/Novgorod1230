> status: REFERENCE / DOMAIN GUIDE. Субъективные слухи и причинное продвижение значимого мира вдали. Утверждённый дизайн не означает действующую реализацию; нормы и их статусы определяет CONTRACT_INDEX.

# 19. Слухи и мир вдали

## Для человека

### Какому столпу служит

«Люди живут без меня» и «Сделанное остаётся»: увиденное может стать новостью, но каждый человек узнаёт её своим путём. ([VIS-028](../questionnaire.md); [VIS-094](../questionnaire.md); [D275/28](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Что чувствует игрок

Мир помнит поступки через конкретных людей. Слух может прийти позже, оказаться чужим пересказом или не дойти; далёкое событие не становится мгновенно общеизвестным. ([VIS-094](../questionnaire.md); [EXP-074](../questionnaire.md); [D275/29](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Правила для игрока

Свидетель сразу решает, сообщать ли, кому и как; может промолчать или солгать. Новость требует носителя, пути, прибытия и услышанного сообщения. Если носитель погиб до передачи, именно эта новость с ним не пересылается. ([VIS-094](../questionnaire.md); [D275/28](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §5.3](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §5.5](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

Вблизи действуют обычные события мира; вдали исход оставшегося пути значимого человека, ушедшего из окрестности героя, решается один раз и сохраняется. Прибытие или гибель наступают лишь в свой игровой срок. Если герой встречает путешественника раньше, дальнейшее зависит от реальной встречи, без двойного исхода. ([D275/29](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §5.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Как игрок узнаёт о механике

Из услышанной речи и журнала: указано, что герой видел сам, а что услышал и от кого. Журнал не помечает слух истинным или ложным. Большие события Руси приходят местным людям тем же путём, с источником. ([EXP-074](../questionnaire.md); [WLD-056](../questionnaire.md); [WLD-064](../questionnaire.md); [D275/5](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Связи с другими механиками

[Восприятие и память людей](04-npc-life.md), [разговор](05-conversation.md), [путь](11-movement-travel.md), [время](03-time-calendar.md), [поручения](18-quests.md) и [сохранение](15-saves.md) образуют одну цепь. Мир может изменить исход дела без героя; загрузка откатывает вместе с миром и слухи. ([MEC-060](../questionnaire.md); [MEC-072](../questionnaire.md); [VIS-066](../questionnaire.md); [VIS-094](../questionnaire.md); [D275/29](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Примеры ситуаций

- Рыбак увидел происшествие и рассказал купцу → купец пересказывает рыбачьи слова; он не становится очевидцем. ([VIS-094](../questionnaire.md); [D275 §5.5](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))
- Свидетель решил нести новость в другое место → герой встретил его по дороге до прибытия → дальнейшие действия определяются этой встречей. ([D275/28](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/29](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))
- Герой услышал тревожный рассказ → в журнале остаются источник и пометка услышанного, без удостоверения правды. ([EXP-074](../questionnaire.md))

## Для разработчика и нейросети

### Замысел

Вблизи нужна точная native физика; вдали — минимально достаточное причинное продвижение значимых персонажей и процессов. Фон допустимо укрупнять или замораживать, продолжающееся значимое дело требует продвижения. Фоновый человек становится ключевым по связи или обязательству. (MEC-071) ([D275/4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/28](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/29](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Что может игрок

- **19.01.** Узнать слух с названным источником и отличить услышанное от увиденного в журнале. Целевое поведение; не начато. ([EXP-074](../questionnaire.md); [VIS-094](../questionnaire.md))
- **19.02.** Встретить носителя новости до завершения его дальнего пути и повлиять на дальнейшее. Целевое поведение; не начато. ([D275/29](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Родное CDDA

`load_npcs`/`unload_npcs` — `src/game.cpp:1144–1300`; `npc::on_load` — `src/npc.cpp:3557–3620`, частичный catch-up; `overmap_npc_move` — `src/do_turn.cpp:426–471`; `travel_overmap` — `src/npc.cpp:1248–1275`. Это опоры, а не готовый общий путешественник: движение ограничено типом NPC и областью вокруг игрока, catch-up неполон. ([D275 §12.1](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [карта NPC, вне пузыря](../../context/cdda-native-map/areas/02-npc-life.md); [карта времени](../../context/cdda-native-map/areas/01-time.md))

Родные миссии компаньонов (`npc_companion_mission`, `companion_mission_time` и `companion_mission_time_ret`) дают образец «ушёл за экран → срок → возврат с исходом»: `src/npc.h:185,1699–1705`, `src/mission_companion.cpp:467,1250,1418,1530,2354,2655`. Переиспользуем эту опору хранения миссии и срока там, где она подходит. Покрытие частичное: логика конкретных приключений зашита в C++, данные задают имя, риск и время; произвольный самостоятельный носитель новости, перехват до срока и сохранение одного исхода этой картой не доказаны. Интеграция должна сначала проверить расширение родной миссии; новый параллельный таймер не утверждается. ([карта NPC, миссии компаньонов](../../context/cdda-native-map/areas/02-npc-life.md))

Родной `EOC_camp_rumor_spread` (`data/json/effects_on_condition/misc_effect_on_condition.json:204`) содержит одно `u_message`: это шаблон сообщения, без модели передачи «кто кому рассказал». ([карта разговора](../../context/cdda-native-map/areas/03-conversation.md))

Готовая цепь субъективных слухов и происхождения утверждений в native карте не подтверждена. Наличие механизма звука не доказывает смысловую доставку новости. ([карта разговора, пробелы](../../context/cdda-native-map/areas/03-conversation.md))

### Наш слой и владелец

На значимой границе решение свидетеля задаёт намерение и сообщение; код сохраняет носителя, происхождение, попытку пути, случайный исход и срок. CDDA остаётся владельцем физического тела, вещей и активного движения. При возврате до срока неисполненный удалённый остаток отменяется или замещается; подробная физика получает приоритет. Повторный выход создаёт новую попытку из новой фактической ситуации. Ни один уже совершившийся факт не перебрасывается. ([D275/28](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/29](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §5.3](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §5.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

`rumor` в текущем `@rus/world-processes` не доказывает доставку от человека к человеку; её связка с воспринятыми сообщениями, памятью и native временем — отдельная интеграционная задача. Полный удалённый бой ради этой политики не нужен. ([D275 §5.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §5.5](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Решения владельца

Свидетель принимает решение сразу; удалённый остаток пути имеет один сохраняемый контекстный исход, который становится событием лишь в свой срок. После каждого состоявшегося разговора память участников субъективна; значимые пережитые события запоминают затронутые, без обязательного вызова модели на каждого фонового свидетеля. ([D275/26](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/27](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/28](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/29](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Расхождения и открытые вопросы

Не решено — см. [open-questions.md, VIS-073, VIS-094](../open-questions.md).

### Источники

[Пакет D275](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md), §5.1–5.5, §7.4, §12.1; [анкета](../questionnaire.md), [VIS-094](../questionnaire.md), [MEC-072](../questionnaire.md), [WLD-056](../questionnaire.md), [WLD-064](../questionnaire.md), [EXP-074](../questionnaire.md); [native NPC](../../context/cdda-native-map/areas/02-npc-life.md), [время](../../context/cdda-native-map/areas/01-time.md), [разговор](../../context/cdda-native-map/areas/03-conversation.md).

### Этап

Слухи и значимые удалённые исходы нужны полноценному первому региону. Дизайн принят; сама доставка и согласование активного/удалённого состояния готовностью не объявляются. Порядок реализации — [глава 11 GDD](../GDD.md). ([D275/37](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §12](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D276/3](../decision-log.md))

### Данные и числа

Утверждён один сохраняемый исход на конкретный выход и остаток пути; численные вероятности, скорости и пороги не назначены. Native тайминги остаются родными. ([таблица главы 4 GDD](../GDD.md); [D275/2](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/29](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Состояния и события

Восприятие → знание → решение сообщить → путь → прибытие в свой срок → возможность реального контакта → воспринятое утверждение у адресата. Закрытый будущий исход не равен уже произошедшему прибытию. Неудача может дать задержку, возвращение, остановку либо обоснованную гибель. ([D275 §5.3](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §5.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §5.5](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Что сохраняется

Носитель и намерение, содержание и источник сообщения, маршрут и исходная позиция, идентичность попытки, RNG, время наступления результата и уже случившиеся последствия. Всё входит в одно поколение с native миром; load/retry не даёт нового броска на тот же выход. ([D275 §5.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §7.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Чек-лист

- Сохранение: исход пути, сроки и память совпадают после reload, раннее возвращение в активную область не удваивает итог. ([D275 §5.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §7.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))
- Перевод: русский журнал и литературный рассказ. ([EXP-044](../questionnaire.md); [EXP-045](../questionnaire.md))
- Звук: проза называет только слышимое героем; отдельных сигналов опасности нет. ([EXP-017](../questionnaire.md)) Подписи звуков не решены — см. [open-questions.md, EXP-043](../open-questions.md).
- Подсказка и управление: журнал показывает источник, «видел / слышал», без скрытой оценки истинности. ([EXP-074](../questionnaire.md))
- Доступность: крупная проза, родные средства CDDA, смысл не только цветом. ([EXP-040](../questionnaire.md))

### Как проверить готовность

По сквозным сценариям T11–T14 (D275 §10) проверить молчание и передачу новости, цепь из двух рассказчиков, гибель до передачи, отсутствие знания будущего до срока, сохранение исхода при reload и встречу носителя до удалённого завершения. Вмешательство не должно оставлять его одновременно прибывшим, погибшим и стоящим рядом. Все физические итоги проверяются в мире, не только в прозе. ([D275 §5.3](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §5.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §5.5](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275 §7.4](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))
