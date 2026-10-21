> status: REFERENCE / DOMAIN GUIDE. Глава описывает тело персонажа, общие проверки и границу между Novgorod и механиками CDDA. Норм не создаёт: при конфликте действуют AGENTS.md, CONTRACT_INDEX и профильные контракты. Состояние на 2026-10-21: main 181548e8; работа в неслитых ветках — по доске распорядителя на эту дату.

# 09. Персонаж, тело, состояния, проверки d20

## Замысел

Персонаж — человек с ограничениями и телом, которое меняется от действий и времени. Игра показывает подтверждённые последствия, а единый владелец тела хранит физическое состояние и применяет переходы. Замысел владельца от 06.10.2026 задаёт шесть характеристик, навыки, d20 для рискованных действий и здоровье, сытость, бодрость ([spec:13–21](../../plans/sled-na-nizhney-dvine-scenario-spec.md)); граница реализма — [PC §9:213–226](../../governance/PRODUCT_CONSTITUTION.md). Выбор между этим d20 и родными проверками CDDA остаётся вопросом владельцу ниже.

1. Герой долго работает на холоде и устает → игрок продолжает работу, отдыхает или согревается → видит изменение выносливости и состояния, а затем подтверждённый эффект на следующую попытку → CDDA уже рассчитывает stamina, температуру, усталость и эффекты тела в общем игровом цикле ([areas/04-combat-checks-states.md:67–72](../../context/cdda-native-map/areas/04-combat-checks-states.md)), но карта не доказывает интеграцию всех правил Новгорода → наш слой передаёт elapsed time и одобренный контекст единственному владельцу тела, который рассчитывает переход.
2. Герой пытается выполнить неавтоматически успешное действие → игрок формулирует попытку, например удержаться на ногах → видит её фактический результат и последствие → CDDA использует подходящую собственную проверку там, где она существует; карта не находит общего видимого игроку d20 ([areas/04-combat-checks-states.md:57–60](../../context/cdda-native-map/areas/04-combat-checks-states.md)) → слой действия выбирает применимую проверку один раз и передаёт committed исход дальше, не добавляя второй бросок поверх родного.
3. После удара герой получает рану → игрок продолжает игру или оказывает помощь → видит подтверждённые изменения здоровья, боли и доступных действий, которые сохраняются → CDDA предоставляет здоровье частей тела, раны, эффекты и их применение ([areas/04-combat-checks-states.md:22,67–68](../../context/cdda-native-map/areas/04-combat-checks-states.md)), но набор исторических ран требует подходящих данных → body owner применяет один принятый пакет последствий, а боевая глава не записывает параллельное тело.

## Что может игрок

- **09.01.** Проверить действие персонажа броском d20 и увидеть результат вместе с последствием для тела или действия.

## Родное CDDA

| Механизм | Покрытие карты | Ограничение |
|---|---|---|
| Состояния боли, кровотечения, оглушения, болезней, голода, сна, температуры и настроения ведут к механическим эффектам ([areas/04-combat-checks-states.md:67–72](../../context/cdda-native-map/areas/04-combat-checks-states.md)). | Полное для перечисленных native состояний. | Карта не подтверждает подключение данных или их историческую полноту. |
| Раны и HP частей тела применяются родными механиками; определений исторических wound/wound_fix в данных карты нет ([areas/04-combat-checks-states.md:22](../../context/cdda-native-map/areas/04-combat-checks-states.md)). | Частичное. | Нужны подходящие исторические данные. |
| STR/DEX/INT/PER, оружие, навыки, состояние и обстоятельства уже входят в native боевые формулы ([areas/04-combat-checks-states.md:13–15](../../context/cdda-native-map/areas/04-combat-checks-states.md)). | Полное в пределах штатных боевых проверок. | Повторно добавлять бонус или проверку за тот же исход нельзя. |
| Видимый самостоятельный d20 можно собрать из jmath_function, EOC и RNG; готовой общей игроку видимой проверки нет ([areas/04-combat-checks-states.md:59–60,80](../../context/cdda-native-map/areas/04-combat-checks-states.md)). | Частичное. | Нужны единственный владелец, сохранение результата и подтверждение отсутствия подходящего native roll; debug-вывод не виден игроку. |
| Телесный догон NPC упрощён ([areas/04-combat-checks-states.md:74](../../context/cdda-native-map/areas/04-combat-checks-states.md)). | Частичное. | Строка не подтверждает полную offscreen симуляцию. |

Карта описывает upstream CDDA 0d8843f, не подключение Новгорода ([areas/04-combat-checks-states.md:1–5](../../context/cdda-native-map/areas/04-combat-checks-states.md)).

## Наш слой и владелец

| Механизм | Отношение к CDDA | Владелец и граница |
|---|---|---|
| Изменения тела, состояния и body modifiers | **Используем** native физиологию CDDA как целевой физический фундамент; действующий Novgorod owner остаётся отдельной моделью до миграционного решения. | [@rus/body-state](../../../packages/body-state/MODULE.md) единолично владеет health, satiety, energy, conditions, body-state validation/modifiers и предложениями телесных переходов. Он не владеет часами, боевым намерением, narration или persistence. |
| Боевые проверки и последствия для тела | **Используем** штатные боевые проверки как проверенный родной вариант; его согласование с замыслом d20 требует ответа владельца. | [@rus/combat-health](../../../packages/combat-health/MODULE.md) владеет combat request/result, harm и injury proposals, но не бросает RNG. [@rus/turn](../../../packages/turn/MODULE.md) оркестрирует активный ход и передаёт механические решения профильным owners; он не владеет их формулами. |
| Изменение тела от длительности | **Используем** родную физиологию; для переноса порогов D135 нужны согласованные данные и проверка прерывания. Календарь и точное время принадлежат отдельному владельцу. | @rus/body-state рассчитывает телесное предложение, @rus/time-events-history владеет временной арифметикой, а @rus/turn соединяет результат в общем ходе. Это не утверждает 1:1 соответствия показателей Novgorod и native CDDA ([Novgorod1230_Cataclysm_Character_States_Attributes_and_Dice_Checks_Discussion_2026-10-18.md:32–36](../../plans/Novgorod1230_Cataclysm_Character_States_Attributes_and_Dice_Checks_Discussion_2026-10-18.md)). |
| Дополнительный видимый d20 | **Расширяем** EOC и `jmath_function`: карта даёт частичное покрытие, сборка и показ результата ещё нужны. | До P7 [@rus/checks-rng](../../../packages/checks-rng/MODULE.md) владеет броском через RandomSource и числовым результатом ([turn_step_llm_contract.md:50](../../../data/knowledge-source/corpus/DOCUMENTS/turn_step_llm_contract.md)). На пути CDDA назначение владельца открыто; бросок должен быть сохранён и показан один раз; выбрасывать d20 поверх уже рассчитанного CDDA outcome нельзя ([areas/04-combat-checks-states.md:57–60](../../context/cdda-native-map/areas/04-combat-checks-states.md)). |

## Решения владельца

- **2026-10-06, номер D не присвоен, дословно:** «Рискованные действия разрешаются броском d20»; шесть характеристик и навыки связаны с биографией, здоровье, сытость и бодрость влияют на действия ([spec:13–21](../../plans/sled-na-nizhney-dvine-scenario-spec.md), текст владельца без изменений).
- **D135, 2026-10-07, дословно:** «Предупреждать на сильном пороге». Пересказ уточнения: мягкий порог сытости/бодрости 50 только упоминается, сильный 20 прерывает занятие и спрашивает игрока; перенос чисел требует профиля ([запись решения](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6116723787)).
- **D260, 2026-10-21, пересказ:** в части 2 используется родной голод NPC, `No_NPC_Food` не включается; еда мастера и её источник входят в часть, родной ночной сон не гарантирован.

## Расхождения и открытые вопросы

- **Модель параметров.** character_parameters.txt задаёт шесть числовых характеристик и проектную формулу d20, тогда как native CDDA уже учитывает свои характеристики в боевых формулах; guide не является active domain contract ([character_parameters.txt:29–56](../../../data/knowledge-source/corpus/DOCUMENTS/character_parameters.txt), [areas/04-combat-checks-states.md:13–15](../../context/cdda-native-map/areas/04-combat-checks-states.md)). Нужны семантическое соответствие и решение о target-профиле.
- **Вопрос владельцу: единый d20 и владелец проверки.** Дословный замысел 06.10 требует d20 для рискованных действий ([spec:17](../../plans/sled-na-nizhney-dvine-scenario-spec.md)); обсуждение 18.10 предлагает «не единый d20» и родные проверки разных видов ([discussion:67–89](../../plans/Novgorod1230_Cataclysm_Character_States_Attributes_and_Dice_Checks_Discussion_2026-10-18.md)). Сохранить d20 как общий принцип или принять родные проверки? Карта подтверждает только частичную сборку отдельного d20 без второго исхода поверх native ([карта:59–60](../../context/cdda-native-map/areas/04-combat-checks-states.md)). До P7 броском владеет checks-rng; после ответа нужно определить его передачу CDDA. Глава не выбирает вариант.
- **Навык и нагрузка — вопрос переноса.** Аудит руководств [#243](https://github.com/PavelSlaven/Novgorod1230/issues/243) отмечает выбор навыка по ситуации и влияние нагрузки на расход тела ([character_inventory_equipment.txt:217–233,311–315](../../../data/knowledge-source/corpus/DOCUMENTS/character_inventory_equipment.txt)). Как переносить расход сытости и бодрости от нагрузки из guide без второго расчёта поверх CDDA? Это сохраняемый замысел guide, а не утверждение его формулы расхода; родные навыки и стоимость шага используются без второго бонуса ([карта проверок:53–56](../../context/cdda-native-map/areas/04-combat-checks-states.md), [карта движения:17](../../context/cdda-native-map/areas/06-movement-world-map.md)).
- **Телесные шкалы.** Body owner хранит health/satiety/energy, CDDA — hunger, kcal, stamina и pain; их эквивалентность требует таблицы и проверки переходов ([character_parameters.txt:94–110](../../../data/knowledge-source/corpus/DOCUMENTS/character_parameters.txt), [Novgorod1230_Cataclysm_Character_States_Attributes_and_Dice_Checks_Discussion_2026-10-18.md:32–36](../../plans/Novgorod1230_Cataclysm_Character_States_Attributes_and_Dice_Checks_Discussion_2026-10-18.md)).
- **NPC вне активной сцены.** Карта указывает ограничение catch-up и отдельную неполноту NPC stamina ([areas/04-combat-checks-states.md:74](../../context/cdda-native-map/areas/04-combat-checks-states.md)); fidelity и catch-up требуют прототипа.

## Источники

- [sled-na-nizhney-dvine-scenario-spec.md](../../plans/sled-na-nizhney-dvine-scenario-spec.md) — дословный замысел владельца 06.10.2026.
- [PRODUCT_CONSTITUTION.md](../../governance/PRODUCT_CONSTITUTION.md) — §9: реализм и историческая рамка.
- [character_inventory_equipment.txt](../../../data/knowledge-source/corpus/DOCUMENTS/character_inventory_equipment.txt) — выбор навыка по ситуации и влияние нагрузки.
- [turn_step_llm_contract.md](../../../data/knowledge-source/corpus/DOCUMENTS/turn_step_llm_contract.md) — текущий владелец числовой проверки.
- [06-movement-world-map.md](../../context/cdda-native-map/areas/06-movement-world-map.md) — родная стоимость шага.

- [character_parameters.txt](../../../data/knowledge-source/corpus/DOCUMENTS/character_parameters.txt) — проектные параметры тела и навыков, требующие сверки с active owners.
- [formulas.md](../../../data/knowledge-source/corpus/DOCUMENTS/formulas.md) — формулы свободных и боевых проверок; численные правила не перенесены как текущая production-норма.
- [combat_system.md](../../../data/knowledge-source/corpus/DOCUMENTS/combat_system.md) — active combat контракт в своей области; служит источником границы между проверкой и последствиями.
- [Novgorod1230_Cataclysm_Character_States_Attributes_and_Dice_Checks_Discussion_2026-10-18.md](../../plans/Novgorod1230_Cataclysm_Character_States_Attributes_and_Dice_Checks_Discussion_2026-10-18.md) — обсуждение повторного использования физиологии CDDA и открытых вопросов по d20.
- [04-combat-checks-states.md](../../context/cdda-native-map/areas/04-combat-checks-states.md) — строка родной карты для состояний, боевых проверок и сборки d20.

## Этап

Нативные телесные состояния доступны в CDDA ([areas/04-combat-checks-states.md:67–72](../../context/cdda-native-map/areas/04-combat-checks-states.md)), но это не доказывает готовность Novgorod. D20 не входит в критерии частей 1–7; 09.01 — кандидат для позднего кольца, порядок которого не утверждён.
