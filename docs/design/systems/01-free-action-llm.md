> status: REFERENCE / DOMAIN GUIDE. Описывает свободное действие игрока и границу между смысловой работой LLM и точной механикой кода. Норм не создаёт: при конфликте действуют AGENTS.md, CONTRACT_INDEX и профильные контракты. Состояние на 2026-10-21: main 181548e8; работа в неслитых ветках — по доске распорядителя на эту дату.

# 01. Свободное действие и роль LLM

## Замысел

Игрок описывает намерение обычными словами. Игра учитывает место, тело, доступные вещи и committed state, затем показывает причинный результат. Отсутствие готовой команды не запрещает попытку: невозможное действие получает правдоподобный отказ или частичный исход ([PRODUCT_CONSTITUTION.md:28–57](../../governance/PRODUCT_CONSTITUTION.md)).

1. Игрок стоит во дворе и хочет подождать → через F12 просит «Подожди на месте» → видит выполненное действие в журнале → CDDA предоставляет `ACTION_WAIT` и `wait_activity_actor` (**полное** покрытие, [areas/10-player-actions.md:13](../../context/cdda-native-map/areas/10-player-actions.md)) → `@rus/turn` принимает намерение и связывает его с действием; этот конкретный путь имеет живой протокол ([turn/MODULE.md:13–17](../../../packages/turn/MODULE.md)).
2. Игрок просит реалистичное действие, которого нет в заранее заданных командах → система сохраняет смысл и выбирает причинный исход → игрок видит результат с учётом предметов и состояния мира → CDDA исполняет точные действия персонажа, но не имеет готового semantic ввода Новгорода (**нет** покрытия для input seam, [areas/10-player-actions.md:11,14](../../context/cdda-native-map/areas/10-player-actions.md)) → `@rus/turn` передаёт план профильному owner-у, который рассчитывает механику и последствия ([turn_step_llm_contract.md:42–61](../../../data/knowledge-source/corpus/DOCUMENTS/turn_step_llm_contract.md)).

LLM нужна для неперечислимого смысла, а код отвечает за точную механику и authoritative state. Примеры и тесты проверяют класс поведения, но не становятся списком разрешённых фраз ([PRODUCT_CONSTITUTION.md:59–92,96–171](../../governance/PRODUCT_CONSTITUTION.md)).

## Что может игрок

- **01.01.** Произнести через F12 свободную просьбу подождать и увидеть в журнале, что действие выполнено.

## Родное CDDA

Оценки карты относятся к upstream `0d8843f1c500052c3e026e3da6f8edaf5e00b626`, без патчей Новгорода.

| Нужда | Родной механизм и покрытие | Ограничение, указанное картой |
|---|---|---|
| Доставить semantic request в `handle_action` | Ввод берётся из platform `input_manager`; шов-инъекции не найден. **Нет.** ([areas/10-player-actions.md:11](../../context/cdda-native-map/areas/10-player-actions.md)) | Нет готового API web bridge/RPC или инъекции действия. |
| Исполнить ожидание | `ACTION_WAIT` и `wait_activity_actor`. **Полное.** ([areas/10-player-actions.md:13](../../context/cdda-native-map/areas/10-player-actions.md)) | Механика ожидания родная; она не толкует свободный текст. |
| Исполнить движение и долгую активность | `avatar_action::move`, `game::walk_move`, `player_activity` и `activity_actor`. **Полное.** ([areas/10-player-actions.md:14,20](../../context/cdda-native-map/areas/10-player-actions.md)) | Новый класс C++-актора требует сериализации; карта не заявляет semantic интерпретацию. |

## Наш слой и владелец

| Механизм | Отношение к CDDA | Владелец и граница |
|---|---|---|
| Свободное намерение | **Новое** на границе с native CDDA: semantic request/input seam не найден ([areas/10-player-actions.md:11](../../context/cdda-native-map/areas/10-player-actions.md)). | `@rus/turn` владеет одной semantic boundary, exact fast path и внутренним циклом, но не domain mechanics ([turn/MODULE.md:13–17,29–31](../../../packages/turn/MODULE.md)); `@rus/llm-runtime` — transport/config ([llm-runtime/MODULE.md:3–13](../../../packages/llm-runtime/MODULE.md)). |
| Открытая семантика и точные последствия | **Расширяем** native action mechanics semantic планом и делегированием. | `@rus/turn` вызывает handlers; профильные owners рассчитывают исход, модель не пишет state ([turn_step_llm_contract.md:79–99](../../../data/knowledge-source/corpus/DOCUMENTS/turn_step_llm_contract.md)). |
| Ordinary-конкретизация | **Расширяем** предметные данные: native `item_group` даёт основу кандидатов, но правила наличия конкретного места покрыты **частично** ([areas/05-items-crafting.md:18–26](../../context/cdda-native-map/areas/05-items-crafting.md)). | `@rus/materialization` выбирает экземпляр, `@rus/world-knowledge` предоставляет factual slice ([materialization/MODULE.md:3–24](../../../packages/materialization/MODULE.md), [world-knowledge/MODULE.md:3–39](../../../packages/world-knowledge/MODULE.md)). |

Новый шов нужен только потому, что native CDDA не имеет управляемого semantic input. Карта предлагает обернуть источник `input_manager` либо вызвать `avatar_action`/`Character` между ходами ([areas/10-player-actions.md:11](../../context/cdda-native-map/areas/10-player-actions.md)); выбор должен быть проверен в CR. Ожидание уже покрывает native `ACTION_WAIT`, собственный дубликат ему не нужен.

## Решения владельца

- **Запись решений владельца в #133 от 2026-09-25** ([комментарий 5836830425](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5836830425)). Код задаёт категории и характеристики экземпляров; LLM конкретизирует обычный экземпляр с опорой на World Knowledge. Для главы это означает открытое семантическое пространство внутри границ, заданных кодом. Это запись решений, не прямая цитата владельца.
- **D214, 2026-10-14, слова владельца дословно:** «Важно, чтобы это не превратили в скрипт, где палка и посох заранее прописаны и лежат на локации. Персонаж может подобрать что угодно (с учетом реалистичности, например камень или пучок травы) и сделать что угодно (также с учётом реалистичности, копьё или подстилку из травы).» Источник — запись владельца от этой даты; решения перенесены в этот документ.
- **D271, 2026-10-21**: текущий дизайн-документ — справочный хаб с главами, а не новая норма; до P7 решения остаются в действующих контрактах и активных профилях. Перевод глав в норму отнесён к отдельной задаче.

## Расхождения и открытые вопросы

- **Ввод в native-игру.** Карта не находит готовый API управляемого события и web bridge ([areas/10-player-actions.md:11](../../context/cdda-native-map/areas/10-player-actions.md)); active semantic boundary контракт описывает вход `turn_step_request_v1`, обработку и фиксацию результата ([turn_step_llm_contract.md:79–99](../../../data/knowledge-source/corpus/DOCUMENTS/turn_step_llm_contract.md)). Какой точный bridge доставит эту boundary в CDDA, остаётся предметом отдельного CR с указанием минимального native шва.
- **Граница записи.** Конституция запрещает LLM менять authoritative state и отдавать ей точные mechanics ([PRODUCT_CONSTITUTION.md:113–126](../../governance/PRODUCT_CONSTITUTION.md)); контракт описывает code-owned execution и atomic commit ([turn_step_llm_contract.md:79–99](../../../data/knowledge-source/corpus/DOCUMENTS/turn_step_llm_contract.md)). В этих документах конфликтов нет; при реализации каждого доменного запроса нужно подтвердить, что конкретная связка handler и профильного owner действительно соблюдает границу.
- **Слова о проверке в живой игре.** Способность 01.01 имеет протокол с F12 и настоящим локальным Qwen в таблице хаба. Он подтверждает этот путь в указанной сборке, но не доказывает semantic boundary для всего открытого пространства просьб; живой протокол не расширяет заявленное покрытие.
- **Native ожидание и свободный ввод.** CDDA полностью покрывает механику ожидания, но не свободный semantic ввод ([areas/10-player-actions.md:11,13](../../context/cdda-native-map/areas/10-player-actions.md)). Эти оценки относятся к разным нуждам; точка их соединения должна быть проверена в native bridge.

## Источники

- [PRODUCT_CONSTITUTION.md](../../governance/PRODUCT_CONSTITUTION.md) — свободное действие, LLM, код, причинный и исторический предел.
- [turn_step_llm_contract.md](../../../data/knowledge-source/corpus/DOCUMENTS/turn_step_llm_contract.md) — активная граница свободной заявки, пайплайн и ответственность профильных владельцев.
- [areas/10-player-actions.md](../../context/cdda-native-map/areas/10-player-actions.md) — проверенные native механизмы ввода, ожидания, действий и активности.
- [areas/05-items-crafting.md](../../context/cdda-native-map/areas/05-items-crafting.md) — пределы native предметного выбора и materialization.
- [Novgorod1230_Cataclysm_Mechanics_Reuse_Strategy_2026-10-18.md](../../plans/Novgorod1230_Cataclysm_Mechanics_Reuse_Strategy_2026-10-18.md) — порядок повторного использования CDDA и основания для расширения.

## Этап

В основе CDDA способность 01.01 относится к свободной просьбе подождать и опирается на родное ожидание. Вертикальный срез затем расширяет свободную границу на разговор, людей и материалы; любой новый шаг должен принимать ранее неизвестную исполнителю, но реалистичную формулировку. После принятия среза расширение идёт кольцами; ранее принятый путь игрока остаётся регрессией для следующих систем. Решение о срезе и очередности записано владельцем 2026-10-14; критерии частей и их проверка находятся в утверждённом плане среза. Точные этапы и статусы способности указываются в хабе, не в этой главе.
