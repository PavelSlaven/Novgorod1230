> status: REFERENCE / DOMAIN GUIDE. Глава объясняет свободный поиск и получение вещей и границы материализации на CDDA. Норм не создаёт: при конфликте действуют AGENTS.md, CONTRACT_INDEX и профильные контракты. Состояние на 2026-10-21: main 181548e8; работа в неслитых ветках — по доске распорядителя на эту дату.

# 06. Взять: свободная материализация

## Замысел

Игрок свободно называет вещь и место; наличие и доступ определяет мир. Категории закрыты, экземпляры открыты. См. [PC §9.1:236–248](../../governance/PRODUCT_CONSTITUTION.md); решения приведены ниже.

1. Камень у забора → игрок просит поднять его → видит вещь у героя либо причину отказа → CDDA полностью покрывает подбор ([карта:15](../../context/cdda-native-map/areas/10-player-actions.md)) → используем native pickup; наш слой связывает свободный запрос с доступным предметом и проверяет доступ.
2. У поленницы не видно щепы → игрок ищет её → получает находку или честное отсутствие → `item_group` создаёт экземпляр существующего типа ([карта:18](../../context/cdda-native-map/areas/05-items-crafting.md), частичное: нового `itype` нет) → наш слой использует сохранённое наличие и не перебрасывает его при повторе.

## Что может игрок

- **06.01.** Сделать десять свободных просьб о вещах двора, неизвестных исполнителю заранее, и для правдоподобно доступных вещей увидеть их в инвентаре `i` с верным названием.
- **06.02.** Поискать невозможную для места и 1230 года вещь и получить понятный отказ.
- **06.03.** Повторно поискать вещь в том же месте и не получить новый предмет из уже проверенного источника.
- **06.04.** Попросить обычную вещь в Вихтуе и получить тот же результат поиска, который принят для двора мастера.

## Родное CDDA

Карта проверяет upstream `0d8843f` ([карта:3](../../context/cdda-native-map/areas/05-items-crafting.md)).

| Механизм | Покрытие | Предел |
|---|---|---|
| `item_group`, `itype` ([карта:18](../../context/cdda-native-map/areas/05-items-crafting.md)). | Частичное. | Выбор из существующих типов; динамического `itype` нет. |
| `Item_modifier` ([карта:19](../../context/cdda-native-map/areas/05-items-crafting.md)). | Полное. | Задаёт свойства экземпляра, не создаёт новый тип. |
| `item::owner`, `old_owner` ([карта:20](../../context/cdda-native-map/areas/05-items-crafting.md)). | Частичное. | Owner — фракция; у Item_modifier поля владельца нет. |
| Метки `item_vars` ([карта:21](../../context/cdda-native-map/areas/05-items-crafting.md)). | Частичное. | Текст не даёт документу юридической силы. |
| `item_uid`, `item_location` ([карта:22](../../context/cdda-native-map/areas/05-items-crafting.md)). | Частичное. | Copy даёт новый UID; item_location не стабилен. |
| Перемещение и расход ([карта:23](../../context/cdda-native-map/areas/05-items-crafting.md)), pickup/wield/drop ([карта:15–16](../../context/cdda-native-map/areas/10-player-actions.md)). | Полное. | У pickup нет отдельного события event_type. |
| Вероятность `item_group`/mapgen ([карта:26](../../context/cdda-native-map/areas/05-items-crafting.md)). | Частичное. | Нет лимита категории на место и учёта «уже искали». |

## Наш слой и владелец

До P7 [`@rus/turn`, MODULE:13–31](../../../packages/turn/MODULE.md) ведёт запрос; [`@rus/materialization`, MODULE:3–24](../../../packages/materialization/MODULE.md) выбирает approved candidates без LLM и commit; [`@rus/items-property`, MODULE:3–39](../../../packages/items-property/MODULE.md) — identity, доступ и transfer plans. Перенос на CDDA определяют CR и P7.

**Используем** полные native pickup, wield/drop, расход и Item_modifier. **Расширяем** item_group: он выбирает существующий `itype`, но не создаёт новый тип из свободного описания (карта:18–19 выше). Представление выбирает CR части 3.

Для сохранённого наличия требуется **новое** правило: `item_group.cpp:894` и mapgen `place_items` не дают category-place limit и отметки поиска ([карта:26](../../context/cdda-native-map/areas/05-items-crafting.md), частичное). CR назначает owner записи; знание — [`@rus/visibility-knowledge-memory`, MODULE:3–24](../../../packages/visibility-knowledge-memory/MODULE.md).

**Расширяем** бытовое ownership: проверенный `item::owner`, `item.h:3748–3750`, хранит фракцию ([карта:20](../../context/cdda-native-map/areas/05-items-crafting.md), частичное). Предметный owner ведёт владельца и держателя; [`@rus/social-law`, MODULE:3–23](../../../packages/social-law/MODULE.md) — правовые последствия.

**Используем** UID: копия, в том числе на проверенном пути pickup, получает новый UID ([P0–P2:109–113](../../implementation/cataclysm-p0-p2-experiment.md)); при reload UID сохраняется нашим патчем [PR #768](https://github.com/PavelSlaven/Novgorod1230/pull/768) ([recovery:29–33](../../implementation/cataclysm-p4-recovery-results.md)). Связь logical identity с копией определяет CR.

## Решения владельца

- **2026-09-25, номер D не присвоен, пересказ записи решений.** Код задаёт категории, свойства и лимит; наличие сохраняется без переброса, навык влияет на поиск. Копание даёт природное, тайник требует причины; оружие, деньги и документы разрешены. Момент/подвид уточнены D3/D9. [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5836830425).
- **D3, 2026-09-26, пересказ.** Броски наличия сохраняются при первом прибытии; поиск не создаёт скрытого. Контейнер определяется при первом открытии. Заменяет «первый осмотр» 25.09. [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5839745154).
- **D4, 2026-09-26, пересказ.** Один носитель наличия по scope и региону для природы, вещей и людей; используются уже собранные утверждённые данные. [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5844115406).
- **D6, 2026-09-26, пересказ.** Сезонный бросок один на период, дополняет до лимита без удаления старого. Природный источник пополняет ресурсный owner. [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5839745154).
- **D9, 2026-09-26, пересказ.** Подвид находки выбирает код по весам, LLM описывает его; категорию названной/изготовленной вещи предлагает LLM, проверяет код. Опознавательный текст — из пулов/сущностей, текст подделки пишет игрок. [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5839745154).
- **D10, 2026-09-26, пересказ.** Редкость, ценность и класс не основание typed gap: нужна authored authority. Метки ведёт items-property, подлинность и законность — social-law (уточнение). [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5844152943).
- **D14, 2026-09-26, пересказ.** Вещь может иметь узнающего её владельца. Код задаёт owner, приметы и узнавание; knowledge хранит знание, NPC выбирает реакцию, social-law — последствия. [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5844152943).
- **D33, 2026-09-28, пересказ.** Ресурсы: условно неисчерпаемые ограничены трудом/переноской; сезонные — наличием, навыком, d20 и инструментом; рукотворные запасы конечны. [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5870365310).
- **D34, 2026-09-28, пересказ.** Порционные бюджеты v17 для тростника, валежника, плавника и древесины отменены: это условно неисчерпаемые ресурсы. [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5870365310).
- **D36, 2026-09-28, пересказ.** Принят общий проект ресурсов #171 со всеми девятью рекомендациями; каталог семей — его дополнение. [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5871030413).
- **D37, 2026-09-28, пересказ.** Разделка туши требует ножа и времени, выходы — из данных; выделка, копчение и засолка — позднее ремесло. Восстановление различает цикл и событие. [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5873071119).
- **D38, 2026-09-28, пересказ.** Обыденное допускается по логической необходимости с записанным выводом; это не источник. Глубина уточнена D40, широта максимальна. [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5873359387).
- **D39, 2026-09-28, пересказ.** Любой физически добываемый вид — ресурс; непромысловость влияет на выход, а не исключает вид. [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5873452423).
- **D40, 2026-09-28, пересказ.** Включается существующее независимо от пользы; действие разрешается по свойствам, не перечню применений. Широта отделена от глубины. [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5873540762).
- **D43, 2026-09-28, пересказ.** Пять уровней состояния и свойства семей относятся ко всем вещам; деньги — вещи, примеси — отдельное поле. [#133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5875263635).
- **D59, 2026-10-01, дословно:** «Анахронизмы недопустимы в мире как бытность, но если игрок изобретёт порох — игра не должна его останавливать». Физически невозможное даёт реалистичный неуспех; запрет world stock не переносится на изобретение игрока.
- **D71, 2026-10-02, пересказ.** Числа запасов и добычи — игровая калибровка, не исторический факт; служебная метка не видна игроку и модели.
- **D92, 2026-10-06, пересказ.** Безымянная вещь — пробел данных: игрок видит утверждённое имя либо общее имя категории.
- **D164, 2026-10-08, пересказ.** WK даёт модели живые знания для любого свободного запроса, включая инструменты и условия действия с вещью.
- **D210, 2026-10-13, пересказ.** «Ветка» — часть того же запаса валежника; категорию задаёт код, без словаря частных названий.
- **D211, 2026-10-14, дословно:** «сценарий — это просто вводные данные… но никак не механики». Действия среза выполняются общими механизмами, без идентификаторов сценария и точных фраз в механическом коде.
- **D214, 2026-10-14, дословно:** «Важно, чтобы это не превратили в скрипт, где палка и посох заранее прописаны и лежат на локации». Подобрать и сделать можно любую реалистичную вещь; приёмка использует неизвестные исполнителю вещи и честный отказ.

## Расхождения и открытые вопросы

- **Ordinary и authored.** [AI §10.1–10.4](../../governance/ARCHITECTURE_INVARIANTS.md) разделяет области. [Контракт:3–11](../../../data/knowledge-source/corpus/DOCUMENTS/items_and_property.txt) требует authority для authored; ordinary direct action не заполняет authored gap. O2b относится к существующему контейнеру; CR называет active binding.
- **Меч — вопрос владельцу.** D10 и [PC §9.1:244–248](../../governance/PRODUCT_CONSTITUTION.md) не запрещают редкий класс; [direct action:9–11](../../../data/knowledge-source/corpus/DOCUMENTS/items_and_property.txt) ограничен non-authoritative результатом. [Критерий части 3](../GDD.md) называет меч невозможной находкой. Какое условие делает его невозможным?
- **Чужие вещи и контейнеры — вопрос владельцу.** [ACTIVE-контракт:10](../../../data/knowledge-source/corpus/DOCUMENTS/items_and_property.txt) запрещает direct action создавать чужие вещи и container contents; D3 требует содержимого при первом открытии, а [часть 3](../GDD.md) — чужого owner. Нужен иной путь материализации либо пересмотр критерия/контракта; пока действует ACTIVE.
- **Identity.** Reload сохраняет UID ([recovery:29–33](../../implementation/cataclysm-p4-recovery-results.md)); копия на проверенном pickup получает новый ([P0–P2:109–113](../../implementation/cataclysm-p0-p2-experiment.md)). Открыты связь с логической вещью и проверка owner/дублей; native подбор используем ([карта:15](../../context/cdda-native-map/areas/10-player-actions.md), полное).

## Источники

- [PC](../../governance/PRODUCT_CONSTITUTION.md), [CONTRACT_INDEX](../../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md), [items_and_property](../../../data/knowledge-source/corpus/DOCUMENTS/items_and_property.txt), [turn_step_llm_contract](../../../data/knowledge-source/corpus/DOCUMENTS/turn_step_llm_contract.md) — наличие и authority.
- [05-items-crafting](../../context/cdda-native-map/areas/05-items-crafting.md), [10-player-actions](../../context/cdda-native-map/areas/10-player-actions.md) — native reuse.
- [P0–P2](../../implementation/cataclysm-p0-p2-experiment.md), [recovery-results](../../implementation/cataclysm-p4-recovery-results.md) — UID при pickup и reload.

## Этап

Часть 3 проверяет десять просьб, результат/отказ, отсутствие дублей и сохранение owner; часть 5 повторяет путь в Вихтуе. Критерии — в [хабе](../GDD.md); перенос норм и владельцев — P7.
