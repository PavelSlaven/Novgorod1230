> status: REFERENCE / DOMAIN GUIDE. Глава описывает боевой обмен и последствия на пути CDDA. Норм не создаёт: при конфликте действуют AGENTS.md, CONTRACT_INDEX и профильные контракты. Состояние на 2026-10-21: main 181548e8; работа в неслитых ветках — по доске распорядителя на эту дату.

# 10. Бой

## Замысел

Бой — часть общей сцены и игрового времени, вызванная немедленной физической угрозой, а не ключевым словом. Игрок начинает атаку, защищается, отступает, зовёт на помощь, сдаётся или действует иначе допустимым способом. Исход зависит от участников, дистанции, оружия, защиты, тела и предыдущих последствий. LLM понимает намерение, но не назначает попадание и вред.

1. На героя напали → игрок использует родную команду ближнего боя → видит результат атаки и защиты, затем изменение тела → CDDA исполняет melee attack, бросок, уклонение и урон ([areas/04-combat-checks-states.md:13–22](../../context/cdda-native-map/areas/04-combat-checks-states.md)) → Novgorod связывает committed результат с участниками, временем и безопасным описанием.
2. Противник отступает или сдаётся → игрок прекращает атаку или позволяет ему уйти → видит изменение угрозы и последствия сцены → CDDA имеет native бегство и диалоговые средства, но не готовую семантику сдачи ([areas/04-combat-checks-states.md:36,82,86,107](../../context/cdda-native-map/areas/04-combat-checks-states.md)) → нужное поведение собирается на родных средствах и данных; второй resolver для сдачи не нужен.
3. После боя герой перевязывает раненого → игрок тратит время на помощь → видит состояние тела после действия → CDDA применяет раны, эффекты и телесные состояния ([areas/04-combat-checks-states.md:22,67–74](../../context/cdda-native-map/areas/04-combat-checks-states.md)) → combat-health передаёт последствия body-state, turn связывает их в ходе.

## Что может игрок

- **10.01.** Вступить в бой и увидеть исход удара, защиты и вреда, который сохраняется после продолжения игры.

## Родное CDDA

| Механизм | Покрытие карты | Ограничение |
|---|---|---|
| Ближняя атака, точность, попадание, крит и урон ([areas/04-combat-checks-states.md:13–16](../../context/cdda-native-map/areas/04-combat-checks-states.md)). | Полное. | Используем родную механику с историческими данными оружия. |
| Раны и HP частей тела ([areas/04-combat-checks-states.md:22](../../context/cdda-native-map/areas/04-combat-checks-states.md)). | Частичное. | Движок ран есть, нужны определения `wound`/`wound_fix`. |
| Уклонение, блок и броня ([areas/04-combat-checks-states.md:19–21](../../context/cdda-native-map/areas/04-combat-checks-states.md)). | Полное. | Блок — родная реакция, уклонение рассчитывает движок; карта не подтверждает отдельное ручное решение на каждую реакцию. |
| Метание, лук, арбалет и прицеливание ([areas/04-combat-checks-states.md:28–29](../../context/cdda-native-map/areas/04-combat-checks-states.md)). | Полное. | Исторические предметы и снаряды задаются данными; используем родной дальний бой. |
| Выбор атаки, цели и дистанции NPC, бегство и правила союзников ([areas/04-combat-checks-states.md:35–37](../../context/cdda-native-map/areas/04-combat-checks-states.md)). | Полное. | Используем родную тактику; выбор атаки и пороги паники находятся в C++. |
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
| Исторические стили, оружие и surrender | **Используем** родное оружие с историческими данными; **расширяем** частично покрытые стили и сдачу через JSON/EOC. | Мод novgorod должен содержать подходящие item, martial_art, technique и эффекты. Карта показывает эти родные аналоги; отдельный механизм не обоснован ([areas/04-combat-checks-states.md:17,80–88](../../context/cdda-native-map/areas/04-combat-checks-states.md)). |
| Свободное боевое намерение и видимый roll | **Расширяем** родной вызов атаки и EOC/`jmath_function`; недостаёт связи свободного намерения с executor и показа результата проверки. | Второй технический combat engine не нужен. Native карта показывает вызов EOC атаки только для avatar/NPC и отсутствие bridge к handle_action; для нового executor нужно сначала проверить этот путь и зафиксировать ограничение ([areas/04-combat-checks-states.md:13–20,47,57–60,109](../../context/cdda-native-map/areas/04-combat-checks-states.md)). |

## Решения владельца

- **D65, 2026-10-01, пересказ записи:** бой занимает минуты, код разрешает удары, LLM понимает намерение и пишет последствия; импровизированное оружие оценивается по физике; NPC испытывают храбрость и страх ранения; после минимального боя нужны вира, суд, свидетели, месть и репутация. Старые d20 против защиты, дистанционные полосы и отсутствие сетки описывали прежний движок и требуют согласования с CDDA ([#224](https://github.com/PavelSlaven/Novgorod1230/issues/224)).
- **D220, 2026-10-19, пересказ записи:** нужные щиты и коня брать из Medieval Mod Reborn, перков за убийства нет.
- **D59, 2026-10-01, дословно:** «Анахронизмы недопустимы в мире как бытность, но если игрок изобретёт порох — игра не должна его останавливать»; применительно к оружию исход определяется физикой, материалами и навыком ([запись решения](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5926596803)).
- **D14, 2026-09-26, пересказ:** у многих вещей есть владелец, который узнаёт их; код задаёт приметы, узнавание идёт через знание и восприятие, правовые последствия — через social-law ([запись решения](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5844152943)).

combat_system.md зарегистрирован как ACTIVE DOMAIN NORM для persisted combat session/exchange, а npc_combat_and_trigger_contract.md — как ACTIVE для trigger/session и решений NPC ([CONTRACT_INDEX.md:89–93](../../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md)). Эти области и профиль не означают cutover на CDDA.

## Расхождения и открытые вопросы

- **Active exchange и CDDA.** combat_system.md задаёт session, intent, technical steps и exchange; native map описывает собственные атаки и реакции ([combat_system.md:1–28](../../../data/knowledge-source/corpus/DOCUMENTS/combat_system.md), [areas/04-combat-checks-states.md:13–22](../../context/cdda-native-map/areas/04-combat-checks-states.md)). Судьбу частей контракта решает отдельная миграция P7.
- **Перенос боя.** Обсуждение предлагает физический бой и time/moves CDDA, но command bridge, handoff времени и историческая точность не доказаны ([обсуждение:8–20,154–158](../../plans/Novgorod1230_Cataclysm_Combat_Turns_and_Semantic_Actions_Discussion_2026-10-18.md), [карта:47,109](../../context/cdda-native-map/areas/04-combat-checks-states.md)). Путь управления игрока открыт.
- **D20 — вопрос владельцу.** Замысел 06.10 требует d20 для рискованных действий ([spec:17](../../plans/sled-na-nizhney-dvine-scenario-spec.md)), D65 описывал d20 против защиты старого движка; обсуждение допускает калиброванное изменение native случайности, но коэффициент, статистика и реализация не утверждены ([Novgorod1230_Cataclysm_Combat_Turns_and_Semantic_Actions_Discussion_2026-10-18.md:100–117](../../plans/Novgorod1230_Cataclysm_Combat_Turns_and_Semantic_Actions_Discussion_2026-10-18.md)). Требуется выбор между общим d20 и родными проверками; вопрос целиком в главе [09](09-character-body-d20.md).
- **Социальные последствия — вопрос владельцу.** Аудит руководств [#243](https://github.com/PavelSlaven/Novgorod1230/issues/243), [weapons_and_armor.txt:491–510,553–580](../../../data/knowledge-source/corpus/DOCUMENTS/weapons_and_armor.txt), сохраняет право ношения, узнавание оружия, риск трофея и реакции свидетелей; D65 требует виру, суд, месть и репутацию ([#224](https://github.com/PavelSlaven/Novgorod1230/issues/224)). Родные атаки и тактика этого пакета не доказывают ([карта боя:13–22,35–37](../../context/cdda-native-map/areas/04-combat-checks-states.md)). Какую часть последствий включать в первое боевое кольцо? Текущие владельцы — [social-law](../../../packages/social-law/MODULE.md) для права и [items-property](../../../packages/items-property/MODULE.md) для собственности и примет.
- **Сдача и исторический бой.** Карта показывает native компоненты, но не полную семантику сдачи; историческая точность требует проверки ([areas/04-combat-checks-states.md:82–88](../../context/cdda-native-map/areas/04-combat-checks-states.md), [Novgorod1230_Cataclysm_Combat_Turns_and_Semantic_Actions_Discussion_2026-10-18.md:32–36,121–137](../../plans/Novgorod1230_Cataclysm_Combat_Turns_and_Semantic_Actions_Discussion_2026-10-18.md)).
- **Численные правила.** formulas.md не зарегистрирован как active contract; #243 отклоняет универсальную load-cost formula. Числа требуют конкретного профиля ([formulas.md:84–132](../../../data/knowledge-source/corpus/DOCUMENTS/formulas.md), [#243](https://github.com/PavelSlaven/Novgorod1230/issues/243)).

## Источники

- [weapons_and_armor.txt](../../../data/knowledge-source/corpus/DOCUMENTS/weapons_and_armor.txt) — социальная сторона оружия и трофеев, guide аудита #243.
- [sled-na-nizhney-dvine-scenario-spec.md](../../plans/sled-na-nizhney-dvine-scenario-spec.md) — исходный замысел рискованной проверки.

- [combat_system.md](../../../data/knowledge-source/corpus/DOCUMENTS/combat_system.md) — active session, intent, exchange и последствия в текущей области.
- [npc_combat_and_trigger_contract.md](../../../data/knowledge-source/corpus/DOCUMENTS/npc_combat_and_trigger_contract.md) — trigger/session и решения NPC.
- [character_parameters.txt](../../../data/knowledge-source/corpus/DOCUMENTS/character_parameters.txt) — проектные характеристики для семантической сверки.
- [formulas.md](../../../data/knowledge-source/corpus/DOCUMENTS/formulas.md) — численные формулы, не общая норма без active profile.
- [Novgorod1230_Cataclysm_Combat_Turns_and_Semantic_Actions_Discussion_2026-10-18.md](../../plans/Novgorod1230_Cataclysm_Combat_Turns_and_Semantic_Actions_Discussion_2026-10-18.md) — native combat discussion и открытые проверки.
- [04-combat-checks-states.md](../../context/cdda-native-map/areas/04-combat-checks-states.md) — native combat mechanisms and d20 coverage.

## Этап

Родные melee и защиты доступны в CDDA ([areas/04-combat-checks-states.md:13–22](../../context/cdda-native-map/areas/04-combat-checks-states.md)), но live combat path Novgorod не доказан. План среза исключает полный combat UX и unified d20 из P0–P6 ([Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md:357](../../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md)); 10.01 относится к возможному расширению после P6, кольца не утверждены.
