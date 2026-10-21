> status: REFERENCE / DOMAIN GUIDE. Глава объясняет путь исторических данных и знаний в игровой мир CDDA. Норм не создаёт: при конфликте действуют AGENTS.md, CONTRACT_INDEX и профильные контракты. Состояние на 2026-10-21: main 181548e8; работа в неслитых ветках — по доске распорядителя на эту дату.

# 17. Данные мира и их путь в CDDA

## Замысел

Игрок встречает людей с местными именами и занятиями и действует среди вещей своей эпохи. Категории задают классы, региональные разрешения — применимость, World Knowledge — фактическую основу. Экземпляры остаются открытыми; Новгородская земля — начало общемировой модели ([PC §9.1](../../governance/PRODUCT_CONSTITUTION.md), решение от 25 сентября ниже).

Путь части 5: новая игра в Вихтуе → игрок спрашивает двух жителей об их занятиях → видит разных людей и читает местные ответы → CDDA загружает `npc`, `npc_class`, `talk_topic` ([areas/12-mods-data-loading.md:12](../../context/cdda-native-map/areas/12-mods-data-loading.md), полное для зарегистрированных типов; повтор ID заменяет объект) → наш слой переносит утверждённые личности и подключает знания в пределах известного каждому. Разговор и распорядок — в главах [05](05-conversation.md) и [04](04-npc-life.md).

## Что может игрок

- **17.01.** Встретить в Вихтуе двух разных жителей и узнать их местные имена и занятия в разговоре.

## Родное CDDA

| Что используем | Оценка карты и предел |
|---|---|
| Мод с `modinfo.json` и JSON загружает `DynamicDataLoader` ([areas/12-mods-data-loading.md:11](../../context/cdda-native-map/areas/12-mods-data-loading.md)). | Полное. Неизвестный `type` — ошибка; циклическое наследование отбрасывается. |
| Предметы, группы, здания и люди используют `ITEM`, `item_group`, `mapgen`, `npc`, `npc_class`, `talk_topic` ([areas/12-mods-data-loading.md:12](../../context/cdda-native-map/areas/12-mods-data-loading.md)). | Полное для зарегистрированных типов. Повтор ID заменяет объект; не все типы поддерживают `copy-from`. |
| `--check-mods` проверяет загружаемые определения и согласованность ссылок ([areas/12-mods-data-loading.md:19](../../context/cdda-native-map/areas/12-mods-data-loading.md)). | Полное. Проверка согласованности не устанавливает историческую достоверность. |
| `ITEM_BLACKLIST`, списки животных и `region_overlay` исключают содержимое и меняют регион ([areas/12-mods-data-loading.md:21](../../context/cdda-native-map/areas/12-mods-data-loading.md)). | Частичное. Возможны битые ссылки; второй список сценариев или профессий сбрасывает первый. |
| `item_group` и `Item_modifier` дают основу выбора и свойств обычного предмета ([areas/05-items-crafting.md:18](../../context/cdda-native-map/areas/05-items-crafting.md)). | Частичное. Тип выбирается из существующих `itype`; новый тип на лету этот путь не создаёт. |

## Наш слой и владелец

Путь записи: происхождение → применимость → утверждение → экспорт → потребитель. Уровни category/template/profile/rule/instance различаются по [world-base requirements §1–2](../../../data/knowledge-source/corpus/DOCUMENTS/world_base_materialization_table_requirements.md); авторинг и состояние партии разделяет [v3 contract §1](../../../data/knowledge-source/corpus/DOCUMENTS/spatial_v3_target_world_base_materialization_table_requirements.md).

### Что означает каждый набор

| Набор | Его место на пути в игру |
|---|---|
| `v17` | Линия данных старого движка, откуда часть 5 берёт жителей Вихтуя. Решение о паре БД — [#133 от 25.09](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5836830425). Имя версии не доказывает перенос. |
| `rus13` | Архив исходных материалов с manifest и происхождением: [rus13-base-v1.manifest.json:1–12](../../../data/world-base-sources/rus13-base-v1.manifest.json). Извлечённые сведения проходят предметную проверку; архив не является готовым модом. |
| `game-base-v1` | Домены наполнения и потребители: [CATALOG.md:3–25](../../../data/world-catalogs/novgorod/game-base-v1/CATALOG.md). [STATUS.md:3](../../../data/world-catalogs/novgorod/game-base-v1/STATUS.md) отделяет проверку файлов от импорта; ограничения вердиктов сохраняются. CSV не доказывает включения в игру. |
| Пакет WK | Фактические знания отдельно от состояния партии и знания NPC ([WK contract §10–14](../../../data/knowledge-source/corpus/DOCUMENTS/world_knowledge_platform_implementation_contract.md)); подключение и ревизия — глава [12](12-world-knowledge.md). |
| Мод `novgorod` | Форма публикации отобранного исторического содержимого по D220; общий импорт архивов из решения не следует. |

### Механизмы и ответственность

| Механизм | Отношение к родному и владелец |
|---|---|
| Публикация определений | **Используем** загрузку JSON ([areas/12-mods-data-loading.md:11–12](../../context/cdda-native-map/areas/12-mods-data-loading.md), полное для известных типов). Владелец — мод `novgorod`; авторинг — `@rus/world-catalog-workflow` ([MODULE.md:3–19](../../../tools/world-catalog-workflow/MODULE.md)). Экспорт предстоит оформить в CR части 5. |
| Исторический допуск | **Расширяем** consistency проверкой региона, периода, функции и источника ([areas/12-mods-data-loading.md:19](../../context/cdda-native-map/areas/12-mods-data-loading.md), полное только для consistency). Владелец — данные каталога; утверждение — независимый проход или владелец проекта по [WR §21.1](../../governance/WORKFLOW_RULES.md). Автор сам себя не утверждает. |
| Историческое содержимое | **Используем и расширяем** исключения вычитанным набором ([areas/12-mods-data-loading.md:21](../../context/cdda-native-map/areas/12-mods-data-loading.md), частичное; возможны битые ссылки). Владелец — мод `novgorod`; проверяются зависимости и сохранность рецептов. |
| Знания для модели | **Используем** `@rus/world-catalog-workflow` для компиляции ([MODULE.md:19–27](../../../tools/world-catalog-workflow/MODULE.md)), `@rus/world-knowledge` для запроса к пакету ([MODULE.md:3–38](../../../packages/world-knowledge/MODULE.md)). Подключение к CDDA предстоит части 5; JSON-загрузка его не доказывает. |

Содержимое вычитывается по наборам с сохранением происхождения ([Audit and Migration:130](../../plans/Novgorod1230_Cataclysm_Audit_and_Migration_2026-10-18.md)). Производный экспорт проверяется по заявленному правилу отдельно от утверждённого исходника ([WR §21.1](../../governance/WORKFLOW_RULES.md)).

## Решения владельца

- **2026-09-25, номер D не присвоен.** Пересказ записи решений владельца в [#133 от 25.09](https://github.com/PavelSlaven/Novgorod1230/issues/133#issuecomment-5836830425): общемировая база — универсальные категории и региональные разрешения; она заполняется максимально. Код задаёт категории и характеристики, LLM конкретизирует экземпляры через WK. Это запись решений, не прямая речь.
- **D220, 2026-10-19.** Сохранённые слова владельца: «убрать из мира». Остальное — пересказ записи D220 от 2026-10-19; полного дословного высказывания в записи нет. Нужен свой мод `novgorod`, мир с составом `[dda, novgorod]`, исторически вычитанные животные, вещи, регион и координаты; части `innawood` и `Tamable_Wildlife` берутся после вычитки. Анахроничное не лежит и не появляется само; изобретение игрока не блокируется, рецепты не прячутся. Приручение ограничено детёнышами, перков за убийства нет; нужное для щитов и коня берётся из `Medieval Mod Reborn`. Создание мода выделено отдельно и требует замера старта.
- **D228, 2026-10-20.** Дословно: «Да: порядок принят». Часть 5 переносит срез в Вихтуй с жителями из v17 и WK; на двух жителях повторяются части 1–4. Критерии — в [хабе](../GDD.md).

## Расхождения и открытые вопросы

- **Какой набор подключить?** D220/D228 требуют Вихтуй, [план миграции:95,130](../../plans/Novgorod1230_Cataclysm_Audit_and_Migration_2026-10-18.md) — отбора и утверждения. Конкретные записи, соответствие ID и потребитель CDDA должны быть названы в CR части 5.
- **Какая ревизия WK придёт к жителям?** [IDX §5](../../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md) различает production WK и пилот `reviewed/not_active`; D228 требует WK в Вихтуе. Нужны approved pack, binding и проверка живого потребителя CDDA.
- **Как сохранить открытые экземпляры?** [PC §9.1](../../governance/PRODUCT_CONSTITUTION.md) требует открытости, а [areas/05-items-crafting.md:18](../../context/cdda-native-map/areas/05-items-crafting.md) ограничивает частичное покрытие существующим `itype`. Общий механизм решается в главе [06](06-take-materialization.md) и её CR.

## Источники

- [PRODUCT_CONSTITUTION.md](../../governance/PRODUCT_CONSTITUTION.md), §9.1 — общемировые категории, регион и открытые экземпляры.
- [CONTRACT_INDEX.md](../../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md), §4–5 — границы применимости каталогов и WK.
- [world_base_materialization_table_requirements.md](../../../data/knowledge-source/corpus/DOCUMENTS/world_base_materialization_table_requirements.md), §1–4 — уровни данных и региональный допуск.
- [spatial_v3_target_world_base_materialization_table_requirements.md](../../../data/knowledge-source/corpus/DOCUMENTS/spatial_v3_target_world_base_materialization_table_requirements.md), §1 — авторинг и состояние партии.
- [world_knowledge_platform_implementation_contract.md](../../../data/knowledge-source/corpus/DOCUMENTS/world_knowledge_platform_implementation_contract.md), §10–14 — factual knowledge, применимость и ревизия пакета.
- [areas/12-mods-data-loading.md](../../context/cdda-native-map/areas/12-mods-data-loading.md), §1 — загрузка, типы, проверка и исключения.
- [areas/05-items-crafting.md](../../context/cdda-native-map/areas/05-items-crafting.md), §1 — предел существующих предметных типов.
- [Audit and Migration](../../plans/Novgorod1230_Cataclysm_Audit_and_Migration_2026-10-18.md), матрица владельцев и §4 — публикация исторических наборов.

## Этап

Этап 0 — опытный двор; исходные данные в `main` не доказывают переноса. Неслитые [PR #793](https://github.com/PavelSlaven/Novgorod1230/pull/793) и [PR #829](https://github.com/PavelSlaven/Novgorod1230/pull/829) относятся к разговору и нормам распорядка; готового Вихтуя из них не следует.

Этап 1, часть 5 переносит принятые пути частей 1–4 на Вихтуй и двух жителей. Этап 2, P7 отдельно согласует нормы переноса. На этапе 3 наборы подключаются кольцами по очереди владельца; этапы 4–5 расширяют территорию, план импорта ещё не определён.
