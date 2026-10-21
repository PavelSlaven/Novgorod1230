> status: REFERENCE / DOMAIN GUIDE. Глава описывает факты мира, субъективное знание персонажей и безопасную передачу фактов в речь и прозу. Норм не создаёт: при конфликте действуют AGENTS.md, CONTRACT_INDEX и профильные контракты. Состояние на 2026-10-21: main 181548e8; работа в неслитых ветках — по доске распорядителя на эту дату.

# 12. Знания мира (WK) и граница знания

## Замысел

В мире есть факты, но персонажи знают лишь часть из них, могут ошибаться и могут узнавать новое. World Knowledge (WK) даёт модели проверяемые фактические основания для текущей задачи; само извлечение сведений не становится разрешением на изменение мира. Если обязательного факта нет или он не применим, система сохраняет различие между неизвестным, неподтверждённым и фактическим, а модель не заполняет пробел своей памятью. Так активный WK контракт формулирует границу между factual layer и semantic reasoning ([world_knowledge_platform_implementation_contract.md:303–417](../../../data/knowledge-source/corpus/DOCUMENTS/world_knowledge_platform_implementation_contract.md)).

1. Игрок спрашивает кузнеца о предмете, которого в 1230 году человек не мог знать → получает ответ в пределах знания мастера либо человеческое признание незнания → видит реплику, а не сухой статус базы → CDDA хранит простые переменные, но не происхождение знания (нет покрытия для полной модели; [карта, §1, строка 27](../../context/cdda-native-map/areas/03-conversation.md)) → WK подаёт проверенные факты, доступ NPC их ограничивает, conversation owner формирует речь.
2. Игрок читает рассказ о произошедшей сцене → рассказчик описывает только то, что герой увидел, услышал или узнал → проза не раскрывает скрытого участника и не подставляет современное объяснение → CDDA может фильтровать отдельные сообщения по видимости, но не строит целый безопасный рассказ (частичное покрытие; [карта, §1, строка 10](../../context/cdda-native-map/areas/07-narration-log.md)) → projection owner подготавливает подтверждённый player-safe контекст, narrator пишет только из него.
3. Игрок просит сложное действие, для которого не хватает факта → получает честно обозначенный пробел → он не превращается в якобы установленное правило → CDDA хранит простые переменные, но не provenance и применимость (не покрывает полную модель знания; [карта, §1, строка 27](../../context/cdda-native-map/areas/03-conversation.md)) → WK возвращает evidence или статус пробела; решение остаётся у domain owner.

## Что может игрок

- **12.01.** Спросить мастера о неизвестном человеку 1230 года и услышать честное незнание без казённого «не установлено».
- **12.02.** Читать рассказ о сцене, в котором нет скрытого от героя знания.

## Родное CDDA

Карта CDDA сверена по upstream-пину, указанному в индексе; строки §1 показывают готовые механизмы и их границы, но не интеграцию в игровой runtime Новгорода ([native-map INDEX.md:9–11](../../context/cdda-native-map/INDEX.md)).

| Родной механизм | Покрытие карты и предел |
|---|---|
| `u_val`, `npc_val`, `global_val`, `context_val`, `var_val`, фоновые traits NPC и EOC позволяют хранить некоторые постоянные или приобретённые знания ([areas/03-conversation.md:27](../../context/cdda-native-map/areas/03-conversation.md)). | **Нет** для полноценной модели знания NPC: переменные не хранят происхождение сведений, а `u_val` исчезает со смертью аватара. |
| Известные игроку overmap-места и открытие маршрута: `only_known_by_player`, `reveal_map`, `reveal_route` ([areas/06-movement-world-map.md:20](../../context/cdda-native-map/areas/06-movement-world-map.md)). | **Частичное**: `for_npc()` снимает проверку знания; это не модель знаний NPC. |
| Локальное зрение, `visibility_cache`, `map_memory` и `memorized_tile` отделяют видимое от запомненного ([areas/11-ui-display.md:10–11](../../context/cdda-native-map/areas/11-ui-display.md)). | **Полное** для видимости клетки аватаром; **частичное** для памяти карты: запись зависит от отрисовки. |
| `add_msg_if_player_sees` фильтрует отдельные сообщения ([areas/07-narration-log.md:10](../../context/cdda-native-map/areas/07-narration-log.md)). | **Частичное** для логов: `add_msg` раскрывает сообщение независимо от знаний игрока; общей метки приватности нет. |

## Наш слой и владелец

- **Расширяем** родные переменные знанием с происхождением и границей доступа: `@rus/world-knowledge` — read-only factual owner, который возвращает bounded slice из compiled pack, не решая исход действия ([MODULE.md](../../../packages/world-knowledge/MODULE.md); [world_knowledge_platform_implementation_contract.md:303–417](../../../data/knowledge-source/corpus/DOCUMENTS/world_knowledge_platform_implementation_contract.md)).
- **Расширяем** родную видимость и фильтрацию отдельных сообщений: `@rus/visibility-knowledge-memory` владеет player-safe контекстом и памятью знаний ([MODULE.md](../../../packages/visibility-knowledge-memory/MODULE.md)); `@rus/narration` пишет прозу из подтверждённых фактов ([MODULE.md](../../../packages/narration/MODULE.md)). Native карта не подтверждает сквозную проверку всего контекста рассказа.
- **Используем** игровой шаг для вызова владельцев в установленном порядке: `@rus/turn` организует шаг, а факты и состояния готовят доменные owners ([turn_step_llm_contract.md:10–59](../../../data/knowledge-source/corpus/DOCUMENTS/turn_step_llm_contract.md)). WK не определяет успех просьбы игрока.
- Для знания NPC используется owner access policy и контекст конкретного персонажа. Conversation owner формирует реплику, NPC decision owner принимает решения; модель не получает полный мир автоматически. Это граница передачи данных между владельцами, а не отдельный новый «WK-движок».

Точные границы реализации задают MODULE owners. Второй owner фактов, знания NPC или player-safe narration не вводится.

## Решения владельца

- **D15, 2026-09-26:** запись решения владельца: решения NPC получают WK как сведения об устройстве мира, а речь ограничивается знаниями человека 1230 года. [Комментарий #5846022014](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5846022014). Позднее D167 распространило ограничение доступа и на решения NPC.
- **D18, 2026-09-26 — пересказ записи D18; слов владельца в записи нет.** Будущие для даты партии события не поступают ни в речь, ни в прозу, ни в знания NPC, даже с пометкой о неприменимости. [Комментарий #5846025182](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5846025182).
- **D20, 2026-09-26:** запись решения владельца: рассказчик получает из WK только видимое и известное персонажу; современные научные объяснения в прозу не выводятся. [Комментарий #5846311836](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5846311836).
- **D164, 2026-10-08:** WK задумывалась для любого игрового запроса, «не только в разговорах и знаниях NPC, но и при любом другом запросе». [Комментарий #6116723787](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6116723787).
- **D165, 2026-10-08:** «Как раз полнота знаний в базе избавит нас от галлюцинаций у малой модели. Особенно если мы будем размечать по NPC, к каким знаниям у них есть доступ, а какие они знать не могут. И делать это на уровне кода.» [Комментарий #6116723787](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-6116723787).
- **D167, 2026-10-08:** «Ограничивать доступом и решения NPC, а не только речь - да. Исключения биографии - позже.» Дословная запись владельца от 2026-10-08; работа по доступу — [#618](https://github.com/PavelSlaven/Novgorod1230/issues/618).

## Расхождения и открытые вопросы

- `world_knowledge_platform_implementation_contract.md` имеет статус `ACTIVE`, но статус контракта не означает, что каждый возможный pack или consumer включён. CONTRACT_INDEX указывает, что Giga/vector путь обязателен, runtime определяется актуальными release/binding, а WK pilot pack остаётся `reviewed/not_active` ([CONTRACT_INDEX.md:99, 165–167](../../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md)). Нельзя сообщать игроку, будто pilot pack уже доступен в runtime.
- 12.01 отнесена к части 1 и связана с PR #793; это не подтверждает, что способность прошла живую приёмку. Технический пробел #693 не заменяет путь части 1.
- 12.02 относится к части 6. Фильтр видимости CDDA и наличие WK не доказывают безопасную прозу; приёмка проверяет фактический consumer path.
- Approved pack, binding каждого consumer и доступность данных NPC устанавливаются по профилю и коду. Неизвестный факт остаётся пробелом до подтверждения источником или exact mechanic.

## Источники

- `data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md` — статусы active WK и scope matrix строк 99, 165–167.
- `data/knowledge-source/corpus/DOCUMENTS/world_knowledge_platform_implementation_contract.md` — назначение, полнота знания и запрет превращать пробел в модельную догадку.
- `data/knowledge-source/corpus/DOCUMENTS/npc_autonomous_decision_contract.md` — границы решения NPC.
- `data/knowledge-source/corpus/DOCUMENTS/turn_step_llm_contract.md` — роль narrator и владельцев в игровом шаге.
- `docs/context/cdda-native-map/INDEX.md` — upstream-пин и правила чтения карты.
- `docs/context/cdda-native-map/areas/03-conversation.md` — §1: переменные и хранилище знания NPC.
- `docs/context/cdda-native-map/areas/06-movement-world-map.md` — §1: знание маршрута и отличие `for_npc()`.
- `docs/context/cdda-native-map/areas/07-narration-log.md` — §1: фильтрация сообщений по видимости.
- `docs/context/cdda-native-map/areas/11-ui-display.md` — §1: native visibility и map memory.
- `data/knowledge-source/corpus/DOCUMENTS/spatial_architecture_standard_g0_g6.md` — факт места, actor knowledge и player-safe projection.

## Этап

Глава задаёт продуктовую границу между фактами WK, знанием NPC и безопасной прозой. Статус нормы задают активный контракт, pack, профили, bindings, owners, код и тесты. Pilot pack остаётся `reviewed/not_active`; 12.01 и 12.02 требуют своих игровых доказательств и не объявляются принятыми по одному наличию документации.
