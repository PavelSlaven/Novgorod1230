# food_ingredients — продукты и сезонность (candidate)

Все таблицы генерирует `../scripts/build.py`, проверяет `../scripts/check.py`. Руками их не править.

## ingredients.csv — 198 строк (A 67, B 107, C 24)

Одна строка — один продукт или пищевое состояние. 190 строк взяты из master ingredients: 191 минус ING0190, у которого D. Ещё 8 добавлены:

- гречиха (B), бобы кормовые мелкосемянные (B), чечевица (B) — по Кирьяновой 1979;
- сосновая заболонь и кора, липовая кора, лист ильма, мох (A) — это голодные заменители из НПЛ 6738;
- семена лебеды (C) — по аналогии с XVI в. (Степанова 2014).

Ключевые поля:

- `fd_id` (`fd_<slug>`) и `master_ingredient_id`.
- `name_ru`, `name_en`, `name_lat`.
- `source_taxon_ref` (`taxon:<латинское имя>`, см. `taxon_refs.csv`).
- `food_category` (28 категорий, правило в `build.py:food_category`).
- `fasting_class`: meat / animal_fat / dairy / eggs / fish / plant / plant_oil / honey / alcohol / water.
- `category_id` = `content_food.<cat>.<slug>`, `universal_category=true`, `region_id=region_novgorod_land`.
- `origin`: local 190, local+import 3 (рожь, пшеница, просо), regional 2 (соль Старой Руссы, соляной рассол), import 1 (вино), uncertain 1 (уксус), local_uncertain 1 (гречиха).
- `months_available` / `months_fresh` / `months_limited` — номера месяцев 1–12.
- `access_by_class` — 8 классов: poor, common_urban, rural, fisher, merchant, boyar, clergy_monastery, military.
- `storage_forms` (id из `../dishes/preservation_storage.csv`), `spoilage_states`, `frequency_class` / `frequency_weight`, `famine_1230_role`.
- `source_refs`, `confidence`, `status`.

Правки master (у каждой есть ссылка, см. `curated.json/overrides`):

- соль: origin local → **regional** (Старая Русса; SQLite economy A);
- вино: local → **import** (грамота № 586; SQLite economy B);
- рожь, пшеница, просо → **local+import**;
- пшеничная крупа, мука и тесто: relative_cost low → **medium**. Основание: НПЛ 1230, пшеница 40 гривен против 20 за рожь. В master зерно стоило medium, а мука из него low;
- всего 31 правка master; в каждой добавлены ссылки на грамоты, SQLite или утверждённые WK claims.

## ingredient_months.csv — 2280 строк

Помесячная доступность, 190 продуктов × 12 месяцев, из master `food_seasonality.csv`. Для 20 таксонов из curated `phenology_windows` свежие месяцы вне окна переведены в `rare`. Окна взяты по Цвелёву 2000 (B, URL не проверен). Так изменились 6 ячеек: земляника (VIII), крапива (VIII), щавель (VIII), сныть (VII–VIII), лебеда (V). Рыба: master даёт «conditional» во все месяцы. Сроки нереста и путины — пробел, их должен закрыть домен fauna_fish.

## material_entities.csv — 94 строки (A 49, B 38, C 7)

Решение D46 включает выбранные сверкой 01 материальные сущности еды: сырьё, партии, остатки и полуфабрикаты. Из исходных 151 строк 94 остаются самостоятельными сущностями, 53 переведены в варианты существующих сущностей, 4 слиты с каноническими строками.

- `item_id` имеет общий канонический вид `n1230:material_item:<lowercase OMI>`, используемый также группой `items-household-personal`; сырой `OMI…` остаётся локатором строки источника в `source_refs`.
- `basis=sourced` у 49 строк A с явно указанным категорийным характером свидетельства; `logical_necessity` у 45 строк B/C. Буква уверенности сама по себе не превращает реконструкцию B в sourced.
- Все 914 исходных связей с источниками трактуются в роли `category_form_material_process_or_context`; это не доказательство конкретного экземпляра.
- `source_refs` указывает на конкретный `item_id` в `sources/master-archive-v1/.../material_entities.csv`.
- Период, регион, риск анахронизма и политика генерации остаются значениями master.
- Проверяются русские имена, `family_key`/`name_en` против `fd_id`, канонический namespace и внутренние дубли.

63 решения о вариантах не создают новых identity: 52 обогащают существующие `fd_id`, 10 относятся к общим состояниям порчи, одно — к назначению существующей материальной сущности. Четыре слияния также сохраняют каноническую identity. Для 11 проверенных самостоятельных сущностей manifest хранит физическую причину различия. У варианта в отчёте сборки сохраняются `basis`, `derivation` и `confidence`; у продуктовых целей они также отражены в примечании. Манифест включения — `../scripts/curated/archive_inclusions.json`.

## taxon_refs.csv — 74 строки

Сопоставление продуктов с таксонами:

- латинское имя и ранг (species / genus / group);
- `kind`: flora / fungi / fauna;
- `fd_ids`;
- ожидаемый соседний домен.

`sibling_id` пуст. check.py заполнит сверку по `name_lat`, когда появятся CSV флоры и фауны. Группы без вида (например, «Actinopterygii: freshwater fish (unspecified)», «domestic livestock») помечены C.

## household_food_stock_profiles.csv — 6528 строк (C, кроме 44 строк B)

Присутствие продукта в запасе двора по типу двора и периоду сезона.

- 7 типов дворов: бедный городской, ремесленник, купец, боярин, смерд, рыбак, монастырь.
- 4 периода: winter XII–II, spring_rasputitsa III–V, summer VI–VIII, autumn IX–XI. Такое деление месяцев — условность, окончательно его задаст calendar_feasts_fasts.

Правило для обычного года (3552 строки):

1. Базовый класс частоты берётся из rarity master: ubiquitous→ubiquitous, common→common, uncommon/seasonal→contextual, rare/exceptional/context_bound→rare.
2. Шаг по доступу класса: ordinary 0, occasional −1, rare −2, none — строки нет.
3. Шаг по месяцам сезона: хотя бы один месяц доступен → 0; только ограниченные месяцы → −1; иначе строки нет.
4. Ниже rare — строки нет.
5. Вес 8/4/2/1. `qty_band`: ample / some / little / trace. Точную массу задаёт код-владелец, здесь она не авторизуется.

Доступ класса (правило C, `curated.json/access_rule`) задаётся по relative_cost master:

- very_low, low → всем ordinary;
- medium → бедным occasional;
- high → бедным rare, рядовым occasional;
- elite → бедным none.

Поправки к доступу:

- если social_scope в master без `common`, беднякам и рядовым доступ на шаг ниже;
- рыба для рыбака на шаг выше, дичь для смерда на шаг выше;
- монастырю мясо исключено (RFR005).

Фаза голода 1230–1231 (2976 строк, `world_phase=famine_1230:*`):

- зерновые и хлебные категории −2, прочие −1;
- боярину и монастырю +1: неравный доступ, как в правиле master «not all strata equal»;
- голодные заменители — rare/trace для бедных, рядовых, смердов и рыбаков в сезоны winter, spring, summer (лист ильма без зимы).

Основание: НПЛ 6738, Temporal v4 `novgorod_famine_1230_v2`. Числа не придуманы.

## Проверки (check.py)

1. Каждый сырой продукт растительного или животного происхождения ссылается на таксон из `taxon_refs.csv`.
2. Свежие месяцы не выходят за окно фенологии.
3. Denylist анахронизмов (картофель, кукуруза, томат, подсолнечник, табак, индейка, кролик, кофе, какао, ваниль, водка, чили, фасоль, тыква, чай…) с границей слова.
4. У каждой строки есть source_refs, confidence ∈ A/B/C и status=candidate.
5. Все ссылки wk / master / ext / sqlite / temporal / файлов разрешаются.
6. Исходные 151 строки D46 полностью распределены как 94 новых, 53 варианта и 4 слияния; все 914 исходных связей получают категорийную роль.
7. Все 63 варианта разрешаются в существующие цели, сохраняют уверенность и не выпускаются как самостоятельные сущности.
8. Semantic check снимает только ограниченные тарные, количественные, целевые и условные уточнения; совпадение основы требует manifest-решения с причиной. Маркеры порчи запрещены в новых сущностях без `spoilage_state`.
9. Негативные self-test ловят сырой OMI вместо канонического id, exact и semantic дубли, необъяснённую порчу, неполную матрицу и неверный basis.

Последний прогон: PASS.

## Пробелы

- Сверка с `fl_id`/`fa_id`: 46 из 74; для 28 ссылок соответствие в соседних доменах не найдено.
- Грецкий орех включён как привозной редкий продукт (`fd_walnut_imported`, B; Засурцев §474, §481; Рыбина в Янин 2008 §1044–1045). Слива, импортные пряности и сельдь перечислены в `authoring/needs_check.json` до проверки датированного регионального/импортного источника. Черёмуха (`flora-trees-shrubs/flora/trees_shrubs.csv#fl_ts_prunus_padus`) и калина (`flora-trees-shrubs/flora/trees_shrubs.csv#fl_ts_viburnum_opulus`) местны; пищевые кандидаты заведены с `logical_necessity`, confidence C.
- Сроки нереста, путины, подлёдного лова по видам не заданы.
- Доля гречихи, бобов и чечевицы именно в Новгороде не установлена: у Кирьяновой данные по северо-западу и западу в целом.
- Доступ по классам — правило C, а не данные.
