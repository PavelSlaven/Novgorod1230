> status: REFERENCE / DOMAIN GUIDE. Глава описывает боевой обмен и последствия на пути CDDA. Норм не создаёт: при конфликте действуют AGENTS.md, CONTRACT_INDEX и профильные контракты. Состояние на 2026-10-21: main 181548e8; работа в неслитых ветках — по доске распорядителя на эту дату.

# 10. Бой

## Для человека

### Какому столпу служит

Бой является опасным, но необязательным способом решить конфликт в причинном мире; насилие оставляет телесные и общественные последствия. (MEC-043, MEC-045, MEC-068)

### Что чувствует игрок

Короткая схватка может закончиться раной, кровотечением или смертью. Разговор, обмен и доказательства остаются реальными альтернативами. (MEC-043, MEC-045)

### Правила для игрока

Физические ходы в бою выбираются кнопками родных команд CDDA (Cataclysm: Dark Days Ahead — игра-основа); свободный текст в этот момент служит речи. CDDA считает попадание, урон и рану, а рассказ пересказывает промахи, блоки и передвижения. Смерть можно пережить только возвратом к сохранению. (MEC-043, MEC-045, MEC-046)

### Как игрок узнаёт о механике

Проза показывает ход схватки и называет положение боя в последней фразе; отдельная панель родного журнала доступна по желанию. Экран сообщает об опасности без раскрытия скрытого состояния противника. (EXP-069, MEC-050)

### Связи с другими механиками

Бой опирается на тело, оружие и движение CDDA; свидетель или след может запустить слух, право и репутационные последствия. (MEC-040, MEC-045, MEC-046, MEC-068)

### Примеры ситуаций

- Герой нажимает команду атаки, противник уклоняется → CDDA решает исход, а проза честно описывает промах и новое положение сторон. (MEC-046, EXP-069)
- Герой говорит противнику, что сдаётся → речь передаётся неигровому персонажу; согласие прекратить бой остаётся его решением, а не автоматическим результатом фразы. (MEC-052, MEC-043)
- После удара при свидетеле герой уходит → рана остаётся в теле, а свидетель может стать основанием для слуха и последствий. (MEC-045, MEC-068)

## Для разработчика и нейросети
### Замысел

Бой — часть общей сцены и игрового времени, вызванная немедленной физической угрозой, а не ключевым словом. Игрок начинает атаку, защищается, отступает, зовёт на помощь, сдаётся или действует иначе допустимым способом. Исход зависит от участников, дистанции, оружия, защиты, тела и предыдущих последствий. LLM понимает намерение, но не назначает попадание и вред.

1. На героя напали → игрок использует родную команду ближнего боя → видит результат атаки и защиты, затем изменение тела → CDDA исполняет melee attack, бросок, уклонение и урон ([areas/04-combat-checks-states.md:13–22](../../context/cdda-native-map/areas/04-combat-checks-states.md)) → Novgorod связывает committed результат с участниками, временем и безопасным описанием.
2. Противник отступает или сдаётся → игрок прекращает атаку или позволяет ему уйти → видит изменение угрозы и последствия сцены → CDDA имеет native бегство и диалоговые средства, но не готовую семантику сдачи ([areas/04-combat-checks-states.md:36,82,86,107](../../context/cdda-native-map/areas/04-combat-checks-states.md)) → нужное поведение собирается на родных средствах и данных; второй resolver для сдачи не нужен.
3. После боя герой перевязывает раненого → игрок тратит время на помощь → видит состояние тела после действия → CDDA применяет раны, эффекты и телесные состояния ([areas/04-combat-checks-states.md:22,67–74](../../context/cdda-native-map/areas/04-combat-checks-states.md)) → combat-health передаёт последствия body-state, turn связывает их в ходе.

**Целевая роль языковой модели:** Модель нужна для смысловых решений NPC, речи и литературной сцены; обычные удары и движение исполняет CDDA. ([D275 §3.2](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

**Особенность:** Боевые команды и группировка подтверждённых событий. ([«Как устроен ход»: сквозные примеры](../GDD.md))

### Что может игрок

- **10.01.** Вступить в бой и увидеть исход удара, защиты и вреда, который сохраняется после продолжения игры.

### Родное CDDA

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

Оружие и доспех 1230 года — нож, топор, копьё, меч, щит, шлем, кольчуга — целевые предметы мода с родными свойствами CDDA: уроном, досягаемостью, занятыми руками, блоком, защитой и обременением по частям тела, слоями одежды; собственных профилей и формул не вводим. ([D275 T01, §2.1](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Наш слой и владелец

На целевом пути физические бой, урон, тело и RNG принадлежат CDDA; `@rus/combat-health`, `@rus/body-state` и `@rus/checks-rng` — действующие владельцы старого движка до P7 ([план:88–95,118–120](../../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md)).

| Механизм | Отношение к CDDA | Владелец и граница |
|---|---|---|
| Combat session, intent и exchange | **Используем** native бой как целевой исполнитель атак и защит. | [@rus/turn](../../../packages/turn/MODULE.md) владеет семантическим намерением и тонким adapter handoff, не физикой; до P7 его session/exchange orchestration относится к старому движку. |
| Combat outcomes, harm и injury | **Используем** CDDA для попадания, урона и последствий. | До P7 [@rus/combat-health](../../../packages/combat-health/MODULE.md) остаётся владельцем старых combat requests/results, harm и injury proposals; RNG и исход CDDA ему не принадлежат. |
| Body state | **Используем** CDDA: она владеет телом и применяет переходы. | До P7 [@rus/body-state](../../../packages/body-state/MODULE.md) остаётся владельцем телесных показателей и переходов старого движка; второго тела на целевом пути нет. |
| Исторические стили, оружие и surrender | **Используем** родное оружие с историческими данными; **расширяем** частично покрытые стили и сдачу через JSON/EOC. | Мод novgorod должен содержать подходящие item, martial_art, technique и эффекты. Карта показывает эти родные аналоги; отдельный механизм не обоснован ([areas/04-combat-checks-states.md:17,80–88](../../context/cdda-native-map/areas/04-combat-checks-states.md)). |
| Свободное боевое намерение и видимый roll | **Расширяем** handoff к атаке; CDDA рассчитывает RNG и исход, слой действия показывает committed результат без второго броска. | До P7 [@rus/checks-rng](../../../packages/checks-rng/MODULE.md) остаётся владельцем RNG старого движка. Карта отмечает EOC-вызов атаки только для avatar/NPC и отсутствие bridge к handle_action ([areas/04-combat-checks-states.md:13–20,47,57–60,109](../../context/cdda-native-map/areas/04-combat-checks-states.md)). |

Целевая литературная сцена нужна при входе в бой и выходе из него; потере или обретении боеспособности, значимой ране, смерти, сдаче, вступлении или выбытии бойца; существенной смене оружия, выхода, укрытия, видимости или опасности; состоявшейся реплике. Сцена появляется и периодически по ограниченным группам обычных действий, даже если это промахи, блоки или небольшие перемещения.

Одновременные изменения объединяются в одну сцену. Курсор последнего рассказанного события позволяет передавать ей все ещё не рассказанные подтверждённые события боя, доступные герою. Повторы можно сокращать без потери важных исходов; последняя фраза показывает правдивое текущее тактическое положение. Предел 6 событий или 5 игровых секунд — техническая гипотеза для проверки, а не утверждённое число. Группировка использует общую границу передачи событий, без второго планировщика рассказа. ([D275 §6.3](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

### Решения владельца

- **D275/16–19, 22.10.2026, пересказ.** Физический бой вызывается родными командами, текст служит речи; проза сохраняет ход схватки, базовые последствия включают свидетелей, слухи, обычай и закон, сдача и плен входят в игру. ([D275/16](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/17](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/18](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/19](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))
- **D275/2 и D275/30, 22.10.2026, пересказ.** Родная проверка не дублируется d20; смерть оставляет загрузку сохранения. ([D275/2](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [D275/30](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md))

- **D65, 2026-10-01, пересказ записи:** бой занимает минуты, код разрешает удары, LLM понимает намерение и пишет последствия; импровизированное оружие оценивается по физике; NPC испытывают храбрость и страх ранения; после минимального боя нужны вира, суд, свидетели, месть и репутация. Старые d20 против защиты, дистанционные полосы и отсутствие сетки описывали прежний движок и требуют согласования с CDDA ([#224](https://github.com/PavelSlaven/Novgorod1230/issues/224)).
- **D220, 2026-10-19, пересказ записи:** нужные щиты и коня брать из Medieval Mod Reborn, перков за убийства нет.
- **D59, 2026-10-01, дословно:** «Анахронизмы недопустимы в мире как бытность, но если игрок изобретёт порох — игра не должна его останавливать»; применительно к оружию исход определяется физикой, материалами и навыком ([запись решения](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5926596803)).
- **D14, 2026-09-26, пересказ:** у многих вещей есть владелец, который узнаёт их; код задаёт приметы, узнавание идёт через знание и восприятие, правовые последствия — через social-law ([запись решения](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5844152943)).

combat_system.md зарегистрирован как ACTIVE DOMAIN NORM для persisted combat session/exchange, а npc_combat_and_trigger_contract.md — как ACTIVE для trigger/session и решений NPC ([CONTRACT_INDEX.md:89–93](../../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md)). Эти области и профиль не означают cutover на CDDA.

### Расхождения и открытые вопросы

- **Active exchange и CDDA.** combat_system.md задаёт session, intent, technical steps и exchange; native map описывает собственные атаки и реакции ([combat_system.md:1–28](../../../data/knowledge-source/corpus/DOCUMENTS/combat_system.md), [areas/04-combat-checks-states.md:13–22](../../context/cdda-native-map/areas/04-combat-checks-states.md)). Судьбу частей контракта решает отдельная миграция P7. Нерешённая реализация — см. [открытые вопросы](../open-questions.md), SYS-10-01.
- **Перенос боя.** Обсуждение предлагает физический бой и time/moves CDDA, но command bridge, handoff времени и историческая точность не доказаны ([обсуждение:8–20,154–158](../../plans/Novgorod1230_Cataclysm_Combat_Turns_and_Semantic_Actions_Discussion_2026-10-18.md), [карта:47,109](../../context/cdda-native-map/areas/04-combat-checks-states.md)). Продуктовый выбор управления решён: физические действия — нативные команды CDDA, свободный текст — речь; открыта проверка подключения команд и времени. ([D275/16](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md)) Нерешённая реализация — см. [открытые вопросы](../open-questions.md), SYS-10-02.
- **d20 — прежний вопрос, принцип решён.** Замысел 06.10 требует d20 для рискованных действий ([spec:17](../../plans/sled-na-nizhney-dvine-scenario-spec.md)), D65 описывал d20 против защиты старого движка; обсуждение допускает калиброванное изменение native случайности, но коэффициент, статистика и реализация не утверждены ([Novgorod1230_Cataclysm_Combat_Turns_and_Semantic_Actions_Discussion_2026-10-18.md:100–117](../../plans/Novgorod1230_Cataclysm_Combat_Turns_and_Semantic_Actions_Discussion_2026-10-18.md)). Выбор сделан: готовая проверка CDDA обязательна, d20 допустим лишь при доказанном пробеле; открыта проверка конкретных случаев. Подробности — в главе [09](09-character-body-d20.md). ([D275/2](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md)) Нерешённая реализация — см. [открытые вопросы](../open-questions.md), SYS-10-03.
- **Социальные последствия — базовый состав решён.** Аудит руководств [#243](https://github.com/PavelSlaven/Novgorod1230/issues/243), [weapons_and_armor.txt:491–510,553–580](../../../data/knowledge-source/corpus/DOCUMENTS/weapons_and_armor.txt), сохраняет право ношения, узнавание оружия, риск трофея и реакции свидетелей; D65 требует виру, суд, месть и репутацию ([#224](https://github.com/PavelSlaven/Novgorod1230/issues/224)). Родные атаки и тактика этого пакета не доказывают ([карта боя:13–22,35–37](../../context/cdda-native-map/areas/04-combat-checks-states.md)). Для первого боевого этапа выбраны свидетели, слухи, обычай и закон; развёрнутый суд отложен. Открыта проверка реализации этой цепочки. ([D275/18](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md)) Текущие владельцы — [social-law](../../../packages/social-law/MODULE.md) для права и [items-property](../../../packages/items-property/MODULE.md) для собственности и примет. Нерешённая реализация — см. [открытые вопросы](../open-questions.md), SYS-10-04.
- **Сдача и исторический бой — выбор решён, реализация проверяется.** Карта показывает native компоненты, но не полную семантику сдачи; историческая точность требует проверки. Базовые сдача и плен приняты, а решение принять сдачу принадлежит NPC; открыто подключение и проверка родных компонентов ([D275/19](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md)) ([areas/04-combat-checks-states.md:82–88](../../context/cdda-native-map/areas/04-combat-checks-states.md), [Novgorod1230_Cataclysm_Combat_Turns_and_Semantic_Actions_Discussion_2026-10-18.md:32–36,121–137](../../plans/Novgorod1230_Cataclysm_Combat_Turns_and_Semantic_Actions_Discussion_2026-10-18.md)). Нерешённая реализация — см. [открытые вопросы](../open-questions.md), SYS-10-05.
- **Численные правила.** formulas.md не зарегистрирован как active contract; #243 отклоняет универсальную load-cost formula. Числа требуют конкретного профиля ([formulas.md:84–132](../../../data/knowledge-source/corpus/DOCUMENTS/formulas.md), [#243](https://github.com/PavelSlaven/Novgorod1230/issues/243)). Нерешённая реализация — см. [открытые вопросы](../open-questions.md), SYS-10-06.

### Источники

- [Анкета](../questionnaire.md), [журнал решений](../decision-log.md) и [видение](../vision.md) — источники игрового замысла.
- [Пакет D275](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md) — целевой справочный дизайн от 22.10.2026, не акт перехода действующих контрактов.

- [weapons_and_armor.txt](../../../data/knowledge-source/corpus/DOCUMENTS/weapons_and_armor.txt) — социальная сторона оружия и трофеев, guide аудита #243.
- [sled-na-nizhney-dvine-scenario-spec.md](../../plans/sled-na-nizhney-dvine-scenario-spec.md) — исходный замысел рискованной проверки.

- [combat_system.md](../../../data/knowledge-source/corpus/DOCUMENTS/combat_system.md) — active session, intent, exchange и последствия в текущей области.
- [npc_combat_and_trigger_contract.md](../../../data/knowledge-source/corpus/DOCUMENTS/npc_combat_and_trigger_contract.md) — trigger/session и решения NPC.
- [character_parameters.txt](../../../data/knowledge-source/corpus/DOCUMENTS/character_parameters.txt) — проектные характеристики для семантической сверки.
- [formulas.md](../../../data/knowledge-source/corpus/DOCUMENTS/formulas.md) — численные формулы, не общая норма без active profile.
- [Novgorod1230_Cataclysm_Combat_Turns_and_Semantic_Actions_Discussion_2026-10-18.md](../../plans/Novgorod1230_Cataclysm_Combat_Turns_and_Semantic_Actions_Discussion_2026-10-18.md) — native combat discussion и открытые проверки.
- [04-combat-checks-states.md](../../context/cdda-native-map/areas/04-combat-checks-states.md) — native combat mechanisms and d20 coverage.

### Этап

Родные melee и защиты доступны в CDDA ([areas/04-combat-checks-states.md:13–22](../../context/cdda-native-map/areas/04-combat-checks-states.md)), но live combat path Novgorod не доказан. План среза исключает полный combat UX и unified d20 из P0–P6 ([Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md:357](../../plans/Novgorod1230_Cataclysm_Vertical_Slice_Implementation_Plan_2026-10-19.md)); 10.01 в прежней таблице относится к возможному расширению после P6. Новый порядок включает бой в этап 3 GDD, этап 6 пакета D275; это принятый объём первого региона ([D276/3](../decision-log.md); [D275/16](../../plans/Novgorod1230_Approved_Design_37_Decisions_and_Implementation_Plan_2026-10-22.md); [глава 11 GDD](../GDD.md)).

### Данные и числа

Попадание, урон, число выдерживаемых ударов и телесные состояния считает CDDA; своих утверждённых чисел попадания и урона здесь нет. Порог группировки рассказа «6 событий или 5 секунд» — стартовый ориентир, уточним на прототипе; это нерешённый остаток MEC-046 — см. [открытые вопросы](../open-questions.md). Общий список собственных чисел — [глава 4 GDD](../GDD.md). (MEC-016, MEC-045, MEC-046)

### Состояния и события

Начало столкновения, выбранное физическое действие, реакция, рана, сдача и выход из конфликта фиксируются в порядке событий; проза следует подтверждённому исходу. (MEC-043, MEC-045, MEC-046, MEC-052)

### Что сохраняется

Родное тело и положение сторон сохраняют последствия физического боя; слух или правовой факт сохраняется лишь при действительном свидетеле, следе либо другом основании. (MEC-045, MEC-068)

### Чек-лист

Проверить загрузку после схватки, русский перевод команд и ран, звук только доступного герою события, подсказки кнопок, клавиатурное управление и доступность опасности без одного цвета. (MEC-043, MEC-046, EXP-040, EXP-044, EXP-048)

### Как проверить готовность

На живой сборке разыграть удар, промах, блок, ранение и попытку разговора; сверить родной исход с рассказом, журналом и сохранением. (MEC-043, MEC-045, MEC-046, EXP-069)
