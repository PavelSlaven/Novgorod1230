> status: REFERENCE / DOMAIN GUIDE. Глава описывает предметный мир и собственность; она не создаёт норм и не подтверждает production-возможности конкретного сценария. Состояние на 2026-10-21: main `181548e8`; статус задаётся действующими контрактами и binding.

# 08. Вещи и собственность

## Замысел

Предмет — это не только название и строка в инвентаре. Для каждой значимой вещи игра различает, что это за вещь, где она находится, кто её держит, кто владеет ею, кто контролирует доступ, в каком она состоянии и какие последствия связаны с её использованием или присвоением. Игрок должен иметь возможность увидеть причинный результат подбора, переноса, использования, открытия контейнера или утраты предмета. Повторный осмотр не создаёт новый экземпляр, а взятая чужая вещь не становится своей автоматически. Предметная механика остаётся у одного owner; сцена, знание и социально-правовая реакция обращаются к ней через свои границы.

1. Рядом лежит огниво → игрок подбирает его → видит предмет среди вещей при себе и может применить его по назначению → CDDA предоставляет item transfer и существующие типы предметов ([areas/05-items-crafting.md:18,23](../../context/cdda-native-map/areas/05-items-crafting.md)), но карта не проверяет полностью picker и novgorod access → наш слой меняет физического держателя, сохраняя отдельно owner, condition и доступность.
2. В закрытом сундуке есть содержимое → игрок впервые открывает сундук, а позднее проверяет его снова → содержимое один раз раскрывается и не пересоздаётся при повторном открытии → CDDA даёт контейнеры и item location primitives ([areas/05-items-crafting.md:23](../../context/cdda-native-map/areas/05-items-crafting.md)), но не хранит novgorod-правило отсутствия повторной материализации ([areas/05-items-crafting.md:75](../../context/cdda-native-map/areas/05-items-crafting.md)) → наш слой использует сохранённый факт содержимого и проверяет доступ к контейнеру.
3. Герой берёт чужой предмет → он физически оказывается у героя → игрок видит, что держатель изменился, но право владения не перешло; дальнейшее действие может вызвать социальную или правовую реакцию → CDDA частично хранит faction ownership ([areas/05-items-crafting.md:20](../../context/cdda-native-map/areas/05-items-crafting.md)), но не моделирует владельца-владельца конкретного двора без faction → наш слой сохраняет owner отдельно от holder и передаёт последствия социальному owner.

## Что может игрок

- **08.01.** Подобрать лежащее рядом огниво клавишей `g` и увидеть его в руках.
- **08.02.** Попробовать применить огниво без трута и с трутом и увидеть разные причинные результаты.
- **08.03.** Взять чужую найденную вещь и после перезапуска увидеть, что она остаётся чужой.

Формулировки способностей перенесены без изменения из принятой таблицы плана; этот раздел не назначает им статус.

## Родное CDDA

| Родной механизм | Покрытие карты | Ограничение карты |
|---|---|---|
| `itype`, item groups и `Item_modifier` задают существующий тип и его свойства при появлении ([areas/05-items-crafting.md:18–19](../../context/cdda-native-map/areas/05-items-crafting.md)). | Частичное. | Динамического `itype` из свободного описания нет. |
| `item::owner`, `old_owner` и `item_vars` хранят часть owner relations и item facts ([areas/05-items-crafting.md:20–21](../../context/cdda-native-map/areas/05-items-crafting.md)). | Частичное. | Owner привязан к `faction_id`; бытовое владение без faction и юридическая истина надписи не выражены. |
| `item_uid` и `item_location` дают native item identity/reference ([areas/05-items-crafting.md:22](../../context/cdda-native-map/areas/05-items-crafting.md)). | Частичное. | UID меняется при копировании; карта не подтверждает сюжетную identity или устойчивость после pickup/reload. |
| `visitable`, `item_location`, `consume_items` и EOC дают перемещение и расход ([areas/05-items-crafting.md:23,57–60](../../context/cdda-native-map/areas/05-items-crafting.md)). | Частичное. | Полный picker и его связь с novgorod access не проверены. |
| `item_group` и mapgen задают часть появления ([areas/05-items-crafting.md:26,75](../../context/cdda-native-map/areas/05-items-crafting.md)). | Частичное. | Нет категории-лимита по месту и состояния «уже искали». |

Карта проверяет чистый upstream CDDA на пине `0d8843f`, а не production-интеграцию Новгорода ([areas/05-items-crafting.md:1](../../context/cdda-native-map/areas/05-items-crafting.md)).

## Наш слой и владелец

| Механизм | Отношение к CDDA | Владелец и граница |
|---|---|---|
| Предметные отношения, доступ, identity и inventory | **Используем** native item primitives, расширяем novgorod property relations. | До P7 [`@rus/items-property`](../../../packages/items-property/MODULE.md) — owner отношений старого runtime; физическую вещь в CDDA ведёт движок. Admission ordinary, authored и crafted результатов различается ([items_and_property.txt:3–10](../../../data/knowledge-source/corpus/DOCUMENTS/items_and_property.txt)). |
| Подбор, перенос и физическое placement | **Используем** подтверждённое native movement, расширяем проверкой доступа и раздельными owner/holder. | [`@rus/turn`](../../../packages/turn/MODULE.md) связывает semantic request; [`@rus/space-map`](../../../packages/space-map/MODULE.md) владеет пространственным scope; item relations остаются у `@rus/items-property`. Полный native picker не подтверждён картой. |
| Восприятие и последствия присвоения | **Используем** соответствующих owners, не дублируем item state. | [`@rus/visibility-knowledge-memory`](../../../packages/visibility-knowledge-memory/MODULE.md) владеет perception/knowledge; [`@rus/social-law`](../../../packages/social-law/MODULE.md) — социально-правовой реакцией. Оба используют item facts от `@rus/items-property`. |

## Решения владельца

- **2026-09-25, номер D не присвоен — запись решений владельца в #133.** Код задаёт категории и свойства, а экземпляры создаются с опорой на WK; наличие места определяется ограниченным сохраняемым решением без переброса, и умение влияет на поиск. Запись также разрешает находить и изготавливать оружие, деньги и документы с учётом материалов, инструмента, навыка и технологии. Это не прямая цитата владельца ([#133, комментарий 5836830425](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5836830425)).

## Расхождения и открытые вопросы

- **Stable identity.** Карта описывает ограниченную семантику `item_uid` при move/copy и не подтверждает устойчивость после pickup или reload ([areas/05-items-crafting.md:22](../../context/cdda-native-map/areas/05-items-crafting.md)); прототипный отчёт фиксирует смену UID после reload ([cataclysm-p4-results.md:54–67](../../implementation/cataclysm-p4-results.md)). UID нельзя объявлять стабильным ключом; границу logical identity подтверждает item owner.
- **Picker и передача.** Карта подтверждает общие item movement primitives, но прямо не подтверждает полный pickup путь ([areas/05-items-crafting.md:23](../../context/cdda-native-map/areas/05-items-crafting.md)). До заявления о native reuse конкретный путь pickup следует проверить в CR с указанием upstream file и строки; до этой проверки утверждение остаётся ограниченным.
- **Владение.** Native faction owner не представляет бытового владельца без faction ([areas/05-items-crafting.md:20,77](../../context/cdda-native-map/areas/05-items-crafting.md)); active контракт разделяет owner и holder, а ordinary не означает unowned ([items_and_property.txt:7,121–158](../../../data/knowledge-source/corpus/DOCUMENTS/items_and_property.txt)). Допустимые отношения задаются данными, не текстовой меткой CDDA.
- **Сохранённое наличие.** Запись решений #133 описывает chance и лимит категории на место с однократным сохраняемым решением; active item contract задаёт более конкретные ordinary discovery/materialization paths ([items_and_property.txt:65–81](../../../data/knowledge-source/corpus/DOCUMENTS/items_and_property.txt)). Для любого сценария следует называть конкретный active binding и не переносить старое правило на все paths без сверки.
- **Масса и укладка.** Контракт разделяет массу и packing slots ([items_and_property.txt:12–20](../../../data/knowledge-source/corpus/DOCUMENTS/items_and_property.txt)); inventory guide содержит прежние формулы веса, рук и контейнеров ([character_inventory_equipment.txt:105–160,235–273](../../../data/knowledge-source/corpus/DOCUMENTS/character_inventory_equipment.txt)). Реализация должна указывать active profile и не выдавать старую формулу за production.
- **Исторический аудит.** Аудит руководств #243 отмечал частичное и забытое покрытие item/property описаний. Текущие active contracts и owner MODULE описывают сегодняшнюю границу; выводы аудита не подменяют их и не утверждают повторное выполнение аудита ([#243](https://github.com/PavelSlaven/Novgorod1230/issues/243)).

## Источники

- [`items_and_property.txt`](../../../data/knowledge-source/corpus/DOCUMENTS/items_and_property.txt) — active предметные категории, физическое положение, ownership, access, containers и identity boundary.
- [`character_inventory_equipment.txt`](../../../data/knowledge-source/corpus/DOCUMENTS/character_inventory_equipment.txt) — предметы при персонаже, масса, занятые руки, контейнеры и быстрый доступ.
- [`05-items-crafting.md`](../../context/cdda-native-map/areas/05-items-crafting.md) — проверенные native item primitives и ограничения покрытия на закреплённом upstream-пине.
- [`cataclysm-p4-results.md`](../../implementation/cataclysm-p4-results.md) — результат ограниченной прототипной проверки identity; он не доказывает production-поведение.

## Этап

Предметное владение нужно с части 3 среза «Взять»: получение не подменяет committed source, owner или physical location. В части 4 тот же owner принимает crafted result; в части 5 предметная логика повторяется в Вихтуе. Повторный поиск не создаёт копию, holder не переписывает property, а передача проходит через проверку доступа.
