# categories — реестр универсальных категорий (домен category_registry)

Статус: **candidate**. Сводный реестр собирает скрипт `scripts/build-category-registry.mjs`. Контракт: `universal_category_classification_policy.md` §4 и DDL `world_base.universal_categories` (09.sql), где `stable_code` глобально UNIQUE, иерархия идёт по `parent_category_id` и циклы запрещены.

## Что здесь

| Файл | Строк (пересборка 2026-09-26, см. `VERIFICATION.md` § «Исправления 2026-09-26») | Что |
|---|---|---|
| `place_family_categories.csv` | 61 | Собственный домен группы `place_family`: корень, 16 видов семейств (`place_family.kind.*`) и 44 семейства (`place_family.<id>`). Универсальный, `region_id` пуст. Не менялся этой пересборкой. |
| `category_registry.csv` | 982 | Весь реестр: 465 категорий v17 (item/container v5 366, spatial 57, actor_appearance 42), 14 категорий контента контейнеров (новое, см. ниже), категории этой группы и категории других групп из файлов с колонками `category_id` и `domain`. Рост с 706 до 982 — не расширение схемы, а то, что с прошлой сборки появились/наполнились новые группы (fauna-mammals-birds 220 строк, flora-trees-shrubs 42) и добавился `content_categories.csv`. |

Проверки и счёт — в `reports/category-registry-report.json`.

## Метод

1. **Собственный домен.** Категории place_family строятся из `places/place_families.csv`. Родитель семейства — его вид (pf_kind), родитель вида — корень. Такая иерархия нужна, чтобы правила наличия наследовались по `parent_category_id`.
2. **Сбор.** Скрипт обходит папки всех групп game-base-v1 (кроме этой) и берёт как файл определений каждый CSV, где есть `category_id` и `domain`. Файлы, где есть только ссылки (`category_id`, `category_ref`, `universal_category_id`), он проверяет на разрешимость. Отдельно (не через общее сканирование, потому что у файла другая форма колонок) подхватывается `buildings-interiors-containers/containers/content_categories.csv`: 41 строка `content_category,name_ru,origin,status` вносится как домен `container_content`, `content_category` служит и `category_id`, и `stable_code`.
3. **Маппинг имён (исправлено 2026-09-26 — см. `VERIFICATION.md`).** Часть источников хранит одно поле метки (`preferred_label`, `preferred_label_ru`) без разделения на русский/английский; раньше сборщик клал это поле в `name_en` независимо от языка, из-за чего у русских меток (например, v5 `cat_item_object_awl_v1` → «шило», `items-household-personal/item_categories.csv` → `preferred_label_ru`) пропадал `name_ru`. Теперь сборщик определяет язык по наличию кириллицы и кладёт метку в `name_ru` или `name_en` соответственно; явные `name_ru`/`name_en` (когда они есть) не переопределяются.
4. **Проверки:**
   - `stable_code` есть и уникален во всём реестре;
   - родитель существует;
   - циклов нет;
   - все ссылки из пулов резолвятся.

   Если группа заново объявляет id категории v17, это считается допустимым переиспользованием, а не дублем. Число таких случаев — в `reused_v17_ids`.

## Состояние на момент сборки (пересборка 2026-09-26)

- Собственные 61 категория проходят все проверки.
- Во внешних данных:
  - 59 категорий `garment` (clothing-appearance) без `stable_code`, и у них не найдены родители — источник (`garment_categories.csv`) не даёт ни имени, ни кода; это гэп группы clothing-appearance, не наш маппинг;
  - 788 неразрешённых ссылок (было 230 на прошлой сборке — выросло из-за новых групп fauna-fish-invertebrates-livestock и flora-herbs-berries-mushrooms, которых не было в прежнем снимке): 198 food-drink `ingredients.csv`, 184 flora `herbs_mosses_aquatic.csv`, 74 crafts-tools-processes `tools_gear.csv`, 56 flora `berries_mushrooms.csv`, 49 items-weapons-armour `weapons_armour.csv`, 45 fauna `invertebrates_herps.csv`, 42 flora `cultivated_plants.csv`, 38 fauna `fish.csv`, 32 clothing `equipment_slots.csv`, 31 items-weapons-armour `weapon_equipment_profiles.csv`, 28 fauna `livestock_types.csv`, 11 fauna `livestock_species.csv`. Полный список — `unresolved_by_file` в `reports/category-registry-report.json`.
- 66 переиспользований id v17 (39 — с другим `stable_code`; сама переопределяющая строка группы сохраняется, конфликт — гэп группы items).
- Не хватает целевых доменов: food, behavior, motive, knowledge, activity (flora и fauna уже подхватываются: fauna-mammals-birds 220 строк, flora-trees-shrubs 42; container-content — новый домен, 14 строк).

## Источники

- `data/knowledge-source/imports/item-container-120-v5/candidate/tables/universal_categories.json` (366).
- `data/world-catalogs/novgorod/spatial-v3/datasets/universal_categories.json` (57).
- pr98 `live-world-runtime-v17/appearance-transfer-v3-datasets/universal_categories.json` (42).
- `buildings-interiors-containers/containers/content_categories.csv` (41 строка вход → 14 в реестре, часть без `content_category` или дублирующая v5, см. отчёт).
- Выходы групп game-base-v1.

## Известные пробелы

- **Region не отделён.** `region_category_options` (веса регионального разрешения) этот реестр не строит. Региональный слой задают пулы: `region_id` в presence_rules. В v17 все 362 веса равны 1.
- **Нет labels и связей.** `category_labels` и `universal_category_relations` для новых доменов не собираются: ни одна группа пока их не даёт.
