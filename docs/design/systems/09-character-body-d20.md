> status: REFERENCE / DOMAIN GUIDE. Глава описывает тело персонажа, общие проверки и границу между Novgorod и механиками CDDA. Норм не создаёт: при конфликте действуют AGENTS.md, CONTRACT_INDEX и профильные контракты. Состояние на 2026-10-21: main 181548e8; работа в неслитых ветках — по доске распорядителя на эту дату.

# 09. Персонаж, тело, состояния, проверки d20

## Замысел

Персонаж — человек с ограничениями и телом, которое меняется от действий и времени. Игра показывает подтверждённые последствия, а единый body owner хранит физическое состояние и применяет переходы.

1. Герой долго работает на холоде и устает → игрок продолжает работу, отдыхает или согревается → видит изменение выносливости и состояния, а затем подтверждённый эффект на следующую попытку → CDDA уже рассчитывает stamina, температуру, усталость и эффекты тела в общем игровом цикле ([areas/04-combat-checks-states.md:67–72](../../context/cdda-native-map/areas/04-combat-checks-states.md)), но карта не доказывает интеграцию всех правил Новгорода → наш слой передаёт elapsed time и одобренный контекст единственному владельцу тела, который рассчитывает переход.
2. Герой пытается выполнить неавтоматически успешное действие → игрок формулирует попытку, например удержаться на ногах → видит её фактический результат и последствие → CDDA использует подходящую собственную проверку там, где она существует; карта не находит общего видимого игроку d20 ([areas/04-combat-checks-states.md:57–60](../../context/cdda-native-map/areas/04-combat-checks-states.md)) → слой действия выбирает применимую проверку один раз и передаёт committed исход дальше, не добавляя второй бросок поверх родного.
3. После удара герой получает рану → игрок продолжает игру или оказывает помощь → видит подтверждённые изменения здоровья, боли и доступных действий, которые сохраняются → CDDA предоставляет здоровье частей тела, раны, эффекты и их применение ([areas/04-combat-checks-states.md:21–22,67–68](../../context/cdda-native-map/areas/04-combat-checks-states.md)), но набор исторических ран требует подходящих данных → body owner применяет один принятый пакет последствий, а боевая глава не записывает параллельное тело.

## Что может игрок

- **09.01.** Проверить действие персонажа броском d20 и увидеть результат вместе с последствием для тела или действия.

## Родное CDDA

| Механизм | Покрытие карты | Ограничение |
|---|---|---|
| Состояния боли, кровотечения, оглушения, болезней, голода, сна, температуры и настроения ведут к механическим эффектам ([areas/04-combat-checks-states.md:67–72](../../context/cdda-native-map/areas/04-combat-checks-states.md)). | Полное для перечисленных native состояний. | Карта не подтверждает подключение данных или их историческую полноту. |
| Раны и HP частей тела применяются родными механиками; определений исторических wound/wound_fix в данных карты нет ([areas/04-combat-checks-states.md:21–22](../../context/cdda-native-map/areas/04-combat-checks-states.md)). | Частичное. | Нужны подходящие исторические данные. |
| STR/DEX и другие физические характеристики, оружие, навыки, состояние и обстоятельства уже входят в native боевые формулы ([areas/04-combat-checks-states.md:13–15](../../context/cdda-native-map/areas/04-combat-checks-states.md)). | Полное в пределах штатных боевых проверок. | Повторно добавлять бонус или проверку за тот же исход нельзя. |
| Видимый самостоятельный d20 можно собрать из jmath_function, EOC и RNG; готовой общей игроку видимой проверки нет ([areas/04-combat-checks-states.md:59–60,80](../../context/cdda-native-map/areas/04-combat-checks-states.md)). | Частичное. | Нужны единственный владелец, сохранение результата и подтверждение отсутствия подходящего native roll; debug-вывод не виден игроку. |
| Телесный catch-up NPC имеет отдельные упрощения ([areas/04-combat-checks-states.md:74](../../context/cdda-native-map/areas/04-combat-checks-states.md)). | Частичное. | Строка не подтверждает полную offscreen симуляцию. |

Карта описывает чистый upstream CDDA на пине 0d8843f; она не подтверждает production-binding Новгорода ([areas/04-combat-checks-states.md:1–5](../../context/cdda-native-map/areas/04-combat-checks-states.md)).

## Наш слой и владелец

| Механизм | Отношение к CDDA | Владелец и граница |
|---|---|---|
| Изменения тела, состояния и body modifiers | **Используем** native физиологию CDDA как целевой физический фундамент; действующий Novgorod owner остаётся отдельной моделью до миграционного решения. | [@rus/body-state](../../../packages/body-state/MODULE.md) единолично владеет health, satiety, energy, conditions, body-state validation/modifiers и предложениями телесных переходов. Он не владеет часами, боевым намерением, narration или persistence. |
| Боевые проверки и последствия для тела | **Используем** штатную боевую проверку там, где она соответствует действию; отдельный d20 допустим лишь для проверки без подходящего native roll. | [@rus/combat-health](../../../packages/combat-health/MODULE.md) владеет combat request/result, harm и injury proposals, но не бросает RNG. [@rus/turn](../../../packages/turn/MODULE.md) оркестрирует активный ход и передаёт механические решения профильным owners; он не владеет их формулами. |
| Изменение тела от длительности | **Расширяем** при наличии approved профиля и явной временной границы; календарь и точное время принадлежат отдельному owner. | @rus/body-state рассчитывает телесное предложение, @rus/time-events-history владеет временной арифметикой, а @rus/turn соединяет результат в общем ходе. Это не утверждает 1:1 соответствия показателей Novgorod и native CDDA ([Novgorod1230_Cataclysm_Character_States_Attributes_and_Dice_Checks_Discussion_2026-10-18.md:32–36](../../plans/Novgorod1230_Cataclysm_Character_States_Attributes_and_Dice_Checks_Discussion_2026-10-18.md)). |
| Дополнительный видимый d20 | **Новое** только как механика свободной проверки, когда подходящего native roll нет. | Механический owner должен выполнить бросок один раз, сохранить его и показать тот же результат; выбрасывать d20 поверх уже рассчитанного CDDA outcome нельзя ([areas/04-combat-checks-states.md:57–60](../../context/cdda-native-map/areas/04-combat-checks-states.md)). |

## Решения владельца

Отдельные дословные слова владельца о d20 или численных формулах тела не найдены. Формулы из character_parameters.txt и formulas.md поэтому не выдаются за решение владельца.

Разделение @rus/body-state, @rus/combat-health и @rus/turn описывает текущие владельческие границы, а не решение о миграции.

## Расхождения и открытые вопросы

- **Модель параметров.** character_parameters.txt задаёт шесть числовых характеристик и проектную формулу d20, тогда как native CDDA уже учитывает свои характеристики в боевых формулах; guide не является active domain contract ([character_parameters.txt:18–56](../../../data/knowledge-source/corpus/DOCUMENTS/character_parameters.txt), [areas/04-combat-checks-states.md:13–15](../../context/cdda-native-map/areas/04-combat-checks-states.md)). Нужны семантическое соответствие и решение о target-профиле.
- **Единый d20.** Карта подтверждает способ собрать отдельный d20 в EOC, но не готовый универсальный roll и не показ фактического native броска игроку ([areas/04-combat-checks-states.md:59–60](../../context/cdda-native-map/areas/04-combat-checks-states.md)). Обсуждение запрещает второй исход поверх CDDA; точная калибровка не проверена ([Novgorod1230_Cataclysm_Character_States_Attributes_and_Dice_Checks_Discussion_2026-10-18.md:67–89](../../plans/Novgorod1230_Cataclysm_Character_States_Attributes_and_Dice_Checks_Discussion_2026-10-18.md)).
- **Телесные шкалы.** Body owner хранит health/satiety/energy, CDDA — hunger, kcal, stamina и pain; их эквивалентность требует таблицы и проверки переходов ([character_parameters.txt:1–14](../../../data/knowledge-source/corpus/DOCUMENTS/character_parameters.txt), [Novgorod1230_Cataclysm_Character_States_Attributes_and_Dice_Checks_Discussion_2026-10-18.md:32–36](../../plans/Novgorod1230_Cataclysm_Character_States_Attributes_and_Dice_Checks_Discussion_2026-10-18.md)).
- **NPC вне активной сцены.** Карта указывает ограничение catch-up и отдельную неполноту NPC stamina ([areas/04-combat-checks-states.md:74](../../context/cdda-native-map/areas/04-combat-checks-states.md)); fidelity и catch-up требуют прототипа.

## Источники

- [character_parameters.txt](../../../data/knowledge-source/corpus/DOCUMENTS/character_parameters.txt) — проектные параметры тела и навыков, требующие сверки с active owners.
- [formulas.md](../../../data/knowledge-source/corpus/DOCUMENTS/formulas.md) — формулы свободных и боевых проверок; численные правила не перенесены как текущая production-норма.
- [combat_system.md](../../../data/knowledge-source/corpus/DOCUMENTS/combat_system.md) — active combat контракт в своей области; служит источником границы между проверкой и последствиями.
- [Novgorod1230_Cataclysm_Character_States_Attributes_and_Dice_Checks_Discussion_2026-10-18.md](../../plans/Novgorod1230_Cataclysm_Character_States_Attributes_and_Dice_Checks_Discussion_2026-10-18.md) — обсуждение повторного использования физиологии CDDA и открытых вопросов по d20.
- [04-combat-checks-states.md](../../context/cdda-native-map/areas/04-combat-checks-states.md) — строка родной карты для состояний, боевых проверок и сборки d20.

## Этап

Нативные телесные состояния доступны в CDDA ([areas/04-combat-checks-states.md:67–72](../../context/cdda-native-map/areas/04-combat-checks-states.md)), но это не доказывает готовность Novgorod. D20 не входит в критерии частей 1–7; 09.01 — кандидат для позднего кольца, порядок которого не утверждён.
