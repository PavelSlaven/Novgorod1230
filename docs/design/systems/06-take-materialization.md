> status: REFERENCE / DOMAIN GUIDE. Глава объясняет свободный поиск и получение вещей и границы материализации на CDDA. Норм не создаёт: при конфликте действуют AGENTS.md, CONTRACT_INDEX и профильные контракты. Состояние на 2026-10-21: main 181548e8; работа в неслитых ветках — по доске распорядителя на эту дату.

# 06. Взять: свободная материализация

## Замысел

Игрок свободно называет вещь и место. Мир отвечает по наличию и доступу; формулировка не создаёт отсутствующее. Категории ограничивает код, экземпляры остаются открытыми. Правила поиска — [PC §9.1:236–248](../../governance/PRODUCT_CONSTITUTION.md); решения владельца приведены ниже.

1. Камень у забора → игрок просит поднять его → видит вещь у героя либо причину отказа → CDDA даёт примитивы движения ([карта:23](../../context/cdda-native-map/areas/05-items-crafting.md), полное для примитивов; полный pickup не проверен) → наш слой связывает запрос с доступным предметом и проверяет перенос.
2. У поленницы не видно щепы → игрок ищет её → получает находку или честное отсутствие → `item_group` создаёт экземпляр существующего типа ([карта:18](../../context/cdda-native-map/areas/05-items-crafting.md), частичное: нового `itype` нет) → наш слой использует сохранённое наличие и не перебрасывает его при повторе.

## Что может игрок

- **06.01.** Попросить у поленницы обычную щепу и, если она правдоподобно есть, увидеть её в инвентаре с верным названием.
- **06.02.** Поискать невозможную для места и 1230 года вещь и получить понятный отказ.
- **06.03.** Повторно поискать вещь в том же месте и не получить новый предмет из уже проверенного источника.
- **06.04.** Попросить обычную вещь в Вихтуе и получить тот же результат поиска, который принят для двора мастера.

## Родное CDDA

Карта проверяет upstream `0d8843f` ([карта:3](../../context/cdda-native-map/areas/05-items-crafting.md)).

| Механизм и ссылка на §1 карты | Покрытие | Предел |
|---|---|---|
| `item_group`, `Item_modifier`, `itype` ([карта:18–19](../../context/cdda-native-map/areas/05-items-crafting.md)). | Частичное для свободной материализации; полное для перечисленных свойств экземпляра. | Выбор идёт из существующих `itype`; нового типа на лету нет. |
| `item::owner`, `old_owner`, `set_owner` ([карта:20](../../context/cdda-native-map/areas/05-items-crafting.md)). | Частичное. | Owner — `faction_id`; бытовой двор или церковь без фракции так не представлены. В `Item_modifier` поля owner нет. |
| `item_vars`, метки и надписи ([карта:21](../../context/cdda-native-map/areas/05-items-crafting.md)). | Частичное. | Текст метки не даёт документу юридической силы. |
| `item_uid`, `item_location`, `safe_reference` ([карта:22](../../context/cdda-native-map/areas/05-items-crafting.md)). | Частичное. | Move переносит UID, copy выдаёт новый; `item_location` не стабилен. Устойчивость при reload строка карты не доказывает. |
| `visitable`, `consume_items`, предметные EOC ([карта:23](../../context/cdda-native-map/areas/05-items-crafting.md)). | Полное для расхода и движения. | Проверка полного picker и связи со свободным запросом в карте не проведена. |
| Вероятности `item_group`, mapgen и сезонный сбор ([карта:26](../../context/cdda-native-map/areas/05-items-crafting.md)). | Частичное. | Нет лимита категории на место и состояния «уже искали»; сезонное ограничение сбора не заменяет это правило. |

## Наш слой и владелец

**Используем** общий semantic turn: `@rus/turn` оркестрирует запрос ([MODULE.md:11–32](../../../packages/turn/MODULE.md)); `@rus/materialization` выбирает approved candidates и ведёт trace без LLM и commit ([MODULE.md:3–24](../../../packages/materialization/MODULE.md)); `@rus/items-property` владеет identity, доступом и transfer plans ([MODULE.md:3–39](../../../packages/items-property/MODULE.md)). Перенос этих владельцев на native путь определяют CR и P7.

**Используем и расширяем** `item_group`/`Item_modifier` ([карта:18–19](../../context/cdda-native-map/areas/05-items-crafting.md), частичное/полное в указанных пределах). Как представить открытый экземпляр без каталога всех находок и создания произвольного `itype`, решает проект части 3.

Для наличия требуется **новое** правило: проверенные `item_group.cpp:894` и mapgen `place_items` дают вероятность, но не category-place limit и отметку поиска ([карта:26](../../context/cdda-native-map/areas/05-items-crafting.md), частичное). Владельца сохранённого решения определяет CR. Knowledge boundary принадлежит `@rus/visibility-knowledge-memory` ([MODULE.md:3–24](../../../packages/visibility-knowledge-memory/MODULE.md)).

**Расширяем** ownership для бытового владельца: проверен `item::owner` в `item.h:3748–3750`, но он хранит фракцию ([карта:20](../../context/cdda-native-map/areas/05-items-crafting.md), частичное). Предметный owner отвечает за владельца и держателя; узнавание использует знание, а юридическую оценку ведёт `@rus/social-law` ([MODULE.md:3–23](../../../packages/social-law/MODULE.md)). Точный native путь расширения остаётся предметом CR.

**Используем** UID в проверенных пределах; возможная **новая** связь logical/physical identity не выбрана. Проверен `item_uid.h`: copy выдаёт новый UID ([карта:22](../../context/cdda-native-map/areas/05-items-crafting.md), частичное). [P0–P2:108–113](../../implementation/cataclysm-p0-p2-experiment.md) наблюдал copy при pickup; [P4:54–68](../../implementation/cataclysm-p4-results.md) — смену UID при reload. Единственным устойчивым ключом UID пока быть не может; продолжение — [#759](https://github.com/PavelSlaven/Novgorod1230/issues/759).

## Решения владельца

- **2026-09-25, номер D не присвоен — запись решений владельца в #133 от 2026-09-25, пересказ, не прямая речь.** Код задаёт категории; LLM с опорой на WK создаёт экземпляр, код присваивает характеристики. Для категории места код задаёт вероятность и лимит; наличие решает один сохраняемый бросок без переброса, умение влияет только на поиск. Новое содержимое определяется при первом осмотре места и первом открытии контейнера. Копание даёт природные ресурсы; рукотворный тайник требует причины. Оружие, деньги и документы можно найти с малой вероятностью и изготовить; их подлинность решается отдельно. Источник — [комментарий 5836830425](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5836830425).
- **D14, 2026-09-26 — пересказ записи D14 от 2026-09-26; слов владельца в записи нет.** Код назначает владельца и приметы вещи; узнавание зависит от знания и восприятия, реакция и правовые последствия принадлежат своим владельцам. Источник — [комментарий 5844152943](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5844152943).
- **D214, 2026-10-14, дословно:** «Важно, чтобы это не превратили в скрипт, где палка и посох заранее прописаны и лежат на локации. Персонаж может подобрать что угодно (с учетом реалистичности, например камень или пучок травы) и сделать что угодно (также с учётом реалистичности, копьё или подстилку из травы).» Источник — запись владельца от этой даты; URL GitHub для цитаты отсутствует.

## Расхождения и открытые вопросы

- **Ordinary и authored.** [AI §10.1–10.4](../../governance/ARCHITECTURE_INVARIANTS.md) сохраняет две области. [Предметный контракт:3–11](../../../data/knowledge-source/corpus/DOCUMENTS/items_and_property.txt) требует authority и data gap для пустого authored/significant/hidden набора. Ordinary direct action допускается через валидированный план как `direct_partition`, `ambient_ordinary` или `crafted`, с committed refs, точной механикой и persisted identity. Он не заполняет authored gap и не создаёт hidden contents; O2b — отдельная узкая ветка существующего контейнера. CR части 3 должен установить применимые active bindings.
- **Редкая находка и запрет.** [PC §9.1:244–248](../../governance/PRODUCT_CONSTITUTION.md) допускает редкое оружие и физические деньги/документы, отделяя их от authority. [Предметный контракт:9–11](../../../data/knowledge-source/corpus/DOCUMENTS/items_and_property.txt) ограничивает direct-action путь; A1 даёт только неавторитетную физическую форму. В переданном плане частей пример «меч» указан среди невозможных находок. Владелец должен уточнить критерий: редкость сама по себе не доказывает невозможность, а разрешение не активирует новый runtime путь.
- **Момент наличия.** Запись [25.09 в #133](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5836830425) говорит о первом осмотре; [PC §9.1:246](../../governance/PRODUCT_CONSTITUTION.md) — о первом прибытии и восприятии без отдельной команды. Как CR выражает этот момент и сохраняет бросок на native пути, ещё предстоит определить.
- **Identity и picker.** [Карта:22–23](../../context/cdda-native-map/areas/05-items-crafting.md) даёт частичную identity и полные предметные примитивы; [P4:54–68](../../implementation/cataclysm-p4-results.md) показывает потерю UID после reload. Нужны решение native owner и живая проверка сохранения identity, чужого owner и отсутствия дублей; готовой устойчивости здесь не заявлено.

## Источники

- [PRODUCT_CONSTITUTION.md](../../governance/PRODUCT_CONSTITUTION.md) — открытые экземпляры, наличие, поиск и редкость.
- [CONTRACT_INDEX.md](../../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md), [items_and_property.txt](../../../data/knowledge-source/corpus/DOCUMENTS/items_and_property.txt) и [turn_step_llm_contract.md](../../../data/knowledge-source/corpus/DOCUMENTS/turn_step_llm_contract.md) — authored/ordinary boundary и свободный план.
- [areas/05-items-crafting.md](../../context/cdda-native-map/areas/05-items-crafting.md) — native возможности и пределы.
- [cataclysm-p0-p2-experiment.md](../../implementation/cataclysm-p0-p2-experiment.md) и [cataclysm-p4-results.md](../../implementation/cataclysm-p4-results.md) — измеренные ограничения identity.

## Этап

Этап 1, часть 3 «Взять»: CR с механизмом и владельцем, затем десять свободных просьб, честное отсутствие, чужой owner и отсутствие дублей после перезапуска. Части 1–2 остаются регрессией; часть 5 переносит принятый путь в Вихтуй. На P7 контракты и владельцы согласуются с исполнением CDDA.
