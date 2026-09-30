# Еда и питьё — кандидатный набор game-base-v1

Статус: **candidate**. Не утверждено. Утверждать должен отдельный проход (Opus high или владелец), автор не утверждает сам себя.
Сборщик: `collect-food-drink`, `fleet/imp-food` (Codex sol 5.6), 2026-09-29.

Группа покрывает два домена каталога (`../catalog.json`):

| Домен | Папка | Главные таблицы |
|---|---|---|
| `food_ingredients` — продукты, материальные сущности и сезонность | [food/](food/README.md) | `ingredients.csv`, `material_entities.csv`, `ingredient_months.csv`, `taxon_refs.csv`, `household_food_stock_profiles.csv` |
| `dishes_meals_preservation` — блюда, напитки, их сезонность, трапезы, хранение, посты, голод | [dishes/](dishes/README.md) | `dishes_meals.csv`, `recipe_months.csv`, `recipe_steps.csv`, `meal_profiles.csv`, `meal_slot_rules.csv`, `fasting_rules.csv`, `preservation_storage.csv`, `spoilage_states.csv`, `sensory_lexicon.csv`, `famine_1230.csv` |

Общий реестр ссылок — `sources.csv`: каждая ссылка из `source_refs` всех таблиц с названием, URL и уровнем доверия. Ссылки на строки файлов сведены до имени файла.

## Числа строк (по скрипту `scripts/check.py`, прогон 2026-09-29)

| Файл | Строк | A | B | C |
|---|---|---|---|---|
| food/ingredients.csv | 198 | 67 | 107 | 24 |
| food/material_entities.csv | 94 | 49 | 38 | 7 |
| food/ingredient_months.csv | 2280 | 756 | 1248 | 276 |
| food/taxon_refs.csv | 74 | — | 59 | 15 |
| food/household_food_stock_profiles.csv | 6528 | — | 44 | 6484 |
| dishes/dishes_meals.csv | 270 | 19 | 2 | 249 |
| dishes/recipe_months.csv | 3216 | 228 | 2388 | 600 |
| dishes/recipe_steps.csv | 1164 | 70 | — | 1094 |
| dishes/meal_profiles.csv | 21 | — | 14 | 7 |
| dishes/meal_slot_rules.csv | 10 | — | — | 10 |
| dishes/fasting_rules.csv | 18 | — | 13 | 5 |
| dishes/preservation_storage.csv | 9 | — | 4 | 5 |
| dishes/spoilage_states.csv | 9 | — | — | 9 |
| dishes/sensory_lexicon.csv | 23 | — | — | 23 |
| dishes/famine_1230.csv | 23 | 18 | — | 5 |
| sources.csv | 113 | | | |

## Как собрано

1. **Сначала имеющиеся знания.** База — MASTER `food_system`, уже скопированный в репозиторий: `sources/master-archive-v1/data/normalized_source_tables/food_system/` (ingredients 191, recipes 268, food_seasonality 5508, religious_food_rules 12, sources 115). Недостающие таблицы того же набора (recipe_steps 1164, recipe_ingredient_links 883, meal_sets 21, famine_1230_context, spoilage_states, technical_states, rejected_recipes) скопированы без изменений в `scripts/source_snapshot/` из `Novgorod1230_food_system_dataset_v1`. Содержимое ingredients и recipes совпадает с копией в репозитории: отличается только запись `true`/`True`, это проверено скриптом.
2. **Утверждённый WK** (production-v1, 46 claim id проверены скриптом, все `approved`): food-processes, grain-processing, static-food-bio-gap-v1, static-food-contact-v1, place-wet-food-processes-v1, place-milk-dye-processes-v1, place-salt-poultry-processes-v1, household-agriculture, agriculture-fauna, environment-p1, historical-population и др.
3. **Temporal v4** (approved): `record:historical_phase_local_effect_rules:novgorod_famine_1230_v2`. Правило задаёт фазу голода на 1230 год и прямо запрещает придумывать числа («numeric_magnitude: not authored»).
4. **Курированная SQLite** `C:/Users/Slaven/Downloads/novgorod_1230(1) (1).sqlite` (read-only): economy, famine_prices, events.
5. **Новое исследование** только для реальных пробелов, первоисточники прочитаны:
   - НПЛ под 6738–6739: мороз 14.09.1230, цены, заменители, скудельница 3030, немецкое жито 1231;
   - ПВЛ под 996 (квасы, мёд в бочках) и 997 (кисель из цежа, «сыта»);
   - берестяные грамоты № 943, 706, 709, 586, 147 (gramoty.ru);
   - Кирьянова 1979: состав зерновых X–XIII вв., горох, кормовые бобы, чечевица, гречиха.
6. **Курированные входы** — `scripts/curated/curated.json` (таксоны, правки master, добавления, голод, посты, классы, дворы), `scripts/curated/curated_rules.json` (сенсорный словарь, порча, трапезы, насыщение, способы хранения) и `scripts/curated/archive_inclusions.json` (решение D46: точный список включений и вариантов). У каждой записи есть ссылки.
7. **D46.** Исходные 151 материальная строка сверки разобраны на 94 новые сущности, 53 варианта существующих сущностей и 4 слияния. Вместе с 10 прежними решениями сверки манифест содержит 63 варианта. Также включены 3216 строк сезонности для 268 существующих рецептов.
8. **Сборка** — `python scripts/build.py`: детерминированная, без сети. **Проверка** — `python scripts/check.py`: acceptance доменов, denylist и разрешение ссылок. Выход 1 при любой ошибке. Последний прогон: `RESULT PASS 0`, проверено 7422 ссылки.

## Правила уверенности

- Ингредиенты: A/B/C из master. Строки master с D (ING0190, «импортная пряность») исключены и вынесены в пробелы.
- Блюда: `confidence = recipe_confidence`. Если `recipe_evidence_type` ∈ {ingredient_based_reconstruction, comparative_reconstruction, ethnographic_parallel}, ставится **C** (так вышло для 249 из 270 блюд). Отдельно хранится `attestation_confidence`: насколько засвидетельствован сам тип блюда или напитка (по master).
- Частоты: только по правилу каталога ubiquitous/common/contextual/rare → 8/4/2/1. Базой служит rarity из master, дальше шаги по доступу класса и по месяцам сезона (подробно — в food/README.md).

## Универсальный слой и регион

Каждая строка продукта — это разрешение для региона на универсальную категорию: `universal_category=true`, `category_id=content_food.<food_category>.<slug>` (предложение для `category_registry`), `region_id=region_novgorod_land`, `origin` (local / regional / local+import / import). Таксон задаётся через `source_taxon_ref = taxon:<латинское имя>`. Сверка с `fl_id`/`fa_id` доменов флоры и фауны выполняется по `name_lat`. Сейчас сверено 46 из 74; для 28 ссылок соответствие в соседних файлах ещё не найдено.

## Известные пробелы (общие)

- Для 28 из 74 таксонов ещё нет сопоставления с `fl_id`/`fa_id`.
- Сроки нереста и путины по видам рыб не заданы: у всех рыб весь год стоит «conditional». Это передано домену `fauna_fish`.
- Даты постов на 1230–1233 по пасхалии здесь не вычислены, это задача домена `calendar_feasts_fasts`. Здесь только рамки и классы продуктов.
- Импортные пряности, грецкий орех, слива и сельдь стоят в `authoring/needs_check.json` до датированного источника для Новгорода или подтверждения торгового пути. Черёмуха и калина местны и заведены как пищевые кандидаты с `logical_necessity`; их пищевое использование остаётся реконструкцией C.
- Число трапез в день и их названия для Новгорода 1230 г. в изученных источниках не засвидетельствованы, поэтому `meal_slot_rules` — реконструкция C.
- Ледник как способ хранения для 1230 г. не подтверждён (C). Типы погребов и клетей относятся к домену `buildings_structures`.
- Monk & Johnston 2012 (археоботаника Троицкого раскопа) полностью не прочитан. Его содержание учтено через утверждённые WK claims `troitsky-*`.
- `craft_process_ref` (`pc_food_<subcategory>`) — это ожидаемые id домена `craft_processes`; такие процессы там ещё не созданы.
- Числа голода (доли порций 0.25–0.7 и зерна 0.1–0.5 из master) помечены C и `needs_approved_profile`: Temporal v4 запрещает выводить числа без отдельного профиля.

## Правки C002

`food/household_type_pf_crosswalk.csv` сопоставляет тип двора с семейством места. `rule` — осторожное редакционное сопоставление жилого типа двора с `pf_id`; `no_source` фиксирует отсутствие обоснованной связи, включая `hh_fisher`. Таблица не утверждает наличие конкретного продукта в месте. Все строки `candidate`.

Сборка: `python -B scripts/pf_crosswalk.py`; проверка исходных ID, полноты 44 PF и 16 видов, уникальности и побайтной воспроизводимости: `python -B scripts/pf_crosswalk.py --check`.
