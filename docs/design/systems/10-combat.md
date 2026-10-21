> status: REFERENCE / DOMAIN GUIDE. Глава описывает боевой обмен и последствия на пути CDDA. Норм не создаёт: при конфликте действуют AGENTS.md, CONTRACT_INDEX и профильные контракты. Состояние на 2026-10-21: main 181548e8; работа в неслитых ветках — по доске распорядителя на эту дату.

# 10. Бой

## Замысел

Бой — часть общей сцены и игрового времени, вызванная немедленной физической угрозой, а не ключевым словом. Игрок начинает атаку, защищается, отступает, зовёт на помощь, сдаётся или действует иначе допустимым способом. Исход зависит от участников, дистанции, оружия, защиты, тела и предыдущих последствий. LLM понимает намерение, но не назначает попадание и вред.

1. На героя напали → игрок использует родную команду ближнего боя → видит результат атаки и защиты, затем изменение тела → CDDA исполняет melee attack, бросок, уклонение и урон ([areas/04-combat-checks-states.md:13–22](../../context/cdda-native-map/areas/04-combat-checks-states.md)) → Novgorod связывает committed результат с участниками, временем и безопасным описанием.
2. Противник отступает или сдаётся → игрок прекращает атаку или позволяет ему уйти → видит изменение угрозы и последствия сцены → CDDA имеет native бегство и диалоговые средства, но не готовую семантику сдачи ([areas/04-combat-checks-states.md:36,82,86,107](../../context/cdda-native-map/areas/04-combat-checks-states.md)) → нужное поведение собирается на родных средствах и данных; второй resolver для сдачи не нужен.
3. После боя герой перевязывает раненого → игрок тратит время на помощь → видит состояние тела после действия → CDDA применяет раны, эффекты и телесные состояния ([areas/04-combat-checks-states.md:21–22,67–74](../../context/cdda-native-map/areas/04-combat-checks-states.md)) → combat-health передаёт последствия body-state, turn связывает их в ходе.

## Что может игрок

- **10.01.** Вступить в бой и увидеть исход удара, защиты и вреда, который сохраняется после продолжения игры.

## Родное CDDA

| Механизм | Покрытие карты | Ограничение |
|---|---|---|
| Ближняя атака, точность, попадание, крит, урон и раны ([areas/04-combat-checks-states.md:13–16,22](../../context/cdda-native-map/areas/04-combat-checks-states.md)). | Полное. | Нужны исторические данные для оружия, стилей и ран. |
| Уклонение, блок и броня ([areas/04-combat-checks-states.md:19–21](../../context/cdda-native-map/areas/04-combat-checks-states.md)). | Полное. | Блок и уклонение являются native реакциями; карта не подтверждает отдельное ручное решение на каждую реакцию. |
| Martial art techniques и EOC hooks задают эффекты удара, промаха, блока и уклонения ([areas/04-combat-checks-states.md:17,80–82](../../context/cdda-native-map/areas/04-combat-checks-states.md)). | Частичное. | Русский исторический боевой контент не найден. |
| Самостоятельный d20 собирается через EOC, RNG и jmath_function; общего видимого игроку d20 и отображения фактического native roll нет ([areas/04-combat-checks-states.md:59–60](../../context/cdda-native-map/areas/04-combat-checks-states.md)). | Частичное. | Новый бросок допускается при отсутствии подходящей native проверки и требует одного owner; точная калибровка не сделана. |
| Сдача использует родные бегство и dialogue effects, но готового действия surrender нет ([areas/04-combat-checks-states.md:36,82,86,107](../../context/cdda-native-map/areas/04-combat-checks-states.md)). | Частичное. | Полное поведение зависит от NPC и сцены. |

Карта описывает upstream CDDA на пине 0d8843f; она не подтверждает игровой боевой путь Novgorod или UI-интеграцию ([areas/04-combat-checks-states.md:1–5](../../context/cdda-native-map/areas/04-combat-checks-states.md)).

## Наш слой и владелец

| Механизм | Отношение к CDDA | Владелец и граница |
|---|---|---|
| Combat session, intent и exchange | **Используем** native бой как целевой исполнитель физических атак и защит; active Novgorod contract действует до формального перехода. | [@rus/turn](../../../packages/turn/MODULE.md) владеет session/intent orchestration и автоматическим обменом, делегируя проверки, вред, тело, предметы, позицию, время и persistence профильным владельцам. |
| Combat outcomes, harm и injury | **Используем** native damage/body mechanics в целевом пути; второй исход после native результата не добавляется. | [@rus/combat-health](../../../packages/combat-health/MODULE.md) владеет combat requests/results, качеством исхода, harm и injury proposals; он не выбирает намерение, не бросает RNG и не записывает DB. |
| Body state | **Используем** согласованные механики CDDA; переход остаётся у body owner. | [@rus/body-state](../../../packages/body-state/MODULE.md) владеет телесными показателями, условиями и переходами; combat owner не создаёт отдельное тело. |
| Исторические стили, оружие и surrender | **Расширяем** данными CDDA и JSON/EOC. | Мод novgorod должен содержать подходящие item, martial_art, technique и эффекты. Карта показывает эти родные аналоги; отдельный механизм не обоснован ([areas/04-combat-checks-states.md:17,80–88](../../context/cdda-native-map/areas/04-combat-checks-states.md)). |
| Свободное боевое намерение и видимый roll | **Новое** только для недостающей semantic boundary с использованием turn и существующего combat owner. | Второй технический combat engine не нужен. Native карта показывает вызов EOC атаки только для avatar/NPC и отсутствие bridge к handle_action; для нового executor нужно сначала проверить этот путь и зафиксировать ограничение ([areas/04-combat-checks-states.md:13–20,47,57–60,109](../../context/cdda-native-map/areas/04-combat-checks-states.md)). |

## Решения владельца

Отдельные дословные слова владельца о боевом обмене, d20 или surrender не найдены. Proposal из CDDA discussion не представлен как личное решение владельца.

combat_system.md зарегистрирован как ACTIVE DOMAIN NORM для persisted combat session/exchange, а npc_combat_and_trigger_contract.md — как ACTIVE для trigger/session и решений NPC ([CONTRACT_INDEX.md:89–93](../../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md)). Эти области и профиль не означают cutover на CDDA.

## Расхождения и открытые вопросы

- **Active exchange и CDDA.** combat_system.md задаёт session, intent, technical steps и exchange; native map описывает собственные атаки и реакции ([combat_system.md:1–28](../../../data/knowledge-source/corpus/DOCUMENTS/combat_system.md), [areas/04-combat-checks-states.md:13–22](../../context/cdda-native-map/areas/04-combat-checks-states.md)). Судьбу частей контракта решает отдельная миграция P7.
- **Перенос боя.** Обсуждение предлагает физический бой и time/moves CDDA, но command bridge, handoff времени и историческая fidelity не доказаны ([Novgorod1230_Cataclysm_Combat_Turns_and_Semantic_Actions_Discussion_2026-10-18.md:8–20,154–158](../../plans/Novgorod1230_Cataclysm_Combat_Turns_and_Semantic_Actions_Discussion_2026-10-18.md)). Путь управления игрока открыт.
- **D20.** Обсуждение допускает калиброванное изменение native случайности, но коэффициент, статистика и реализация не утверждены ([Novgorod1230_Cataclysm_Combat_Turns_and_Semantic_Actions_Discussion_2026-10-18.md:100–117](../../plans/Novgorod1230_Cataclysm_Combat_Turns_and_Semantic_Actions_Discussion_2026-10-18.md)). Второй бросок поверх результата CDDA не допускается.
- **Сдача и исторический бой.** Карта показывает native компоненты, но не полную семантику сдачи; историческая точность требует проверки ([areas/04-combat-checks-states.md:82–88](../../context/cdda-native-map/areas/04-combat-checks-states.md), [Novgorod1230_Cataclysm_Combat_Turns_and_Semantic_Actions_Discussion_2026-10-18.md:32–36,121–137](../../plans/Novgorod1230_Cataclysm_Combat_Turns_and_Semantic_Actions_Discussion_2026-10-18.md)).
- **Численные правила.** formulas.md не зарегистрирован как active contract; #243 отклоняет универсальную load-cost formula. Числа требуют конкретного профиля ([formulas.md:84–132](../../../data/knowledge-source/corpus/DOCUMENTS/formulas.md), [#243](https://github.com/PavelSlaven/Novgorod1230/issues/243)).

## Источники

- [combat_system.md](../../../data/knowledge-source/corpus/DOCUMENTS/combat_system.md) — active session, intent, exchange и последствия в текущей области.
- [npc_combat_and_trigger_contract.md](../../../data/knowledge-source/corpus/DOCUMENTS/npc_combat_and_trigger_contract.md) — trigger/session и решения NPC.
- [character_parameters.txt](../../../data/knowledge-source/corpus/DOCUMENTS/character_parameters.txt) — проектные характеристики для семантической сверки.
- [formulas.md](../../../data/knowledge-source/corpus/DOCUMENTS/formulas.md) — численные формулы, не общая норма без active profile.
- [Novgorod1230_Cataclysm_Combat_Turns_and_Semantic_Actions_Discussion_2026-10-18.md](../../plans/Novgorod1230_Cataclysm_Combat_Turns_and_Semantic_Actions_Discussion_2026-10-18.md) — native combat discussion и открытые проверки.
- [04-combat-checks-states.md](../../context/cdda-native-map/areas/04-combat-checks-states.md) — native combat mechanisms and d20 coverage.

## Этап

Родные melee и защиты доступны в CDDA ([areas/04-combat-checks-states.md:13–22](../../context/cdda-native-map/areas/04-combat-checks-states.md)), но live combat path Novgorod не доказан. План среза исключает полный combat UX и unified d20 из P0–P6 ([Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md:357](../../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md)); 10.01 относится к возможному расширению после P6, кольца не утверждены.
