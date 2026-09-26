# Еда и питьё — кандидатный набор game-base-v1

Статус: **candidate**. Не утверждено. Утверждать должен отдельный проход (Opus high или владелец), автор не утверждает сам себя.
Сборщик: `collect-food-drink`, 2026-09-26.

Группа покрывает два домена каталога (`../catalog.json`):

| Домен | Папка | Главные таблицы |
|---|---|---|
| `food_ingredients` — продукты и сезонность | [food/](food/README.md) | `ingredients.csv`, `ingredient_months.csv`, `taxon_refs.csv`, `household_food_stock_profiles.csv` |
| `dishes_meals_preservation` — блюда, напитки, трапезы, хранение, посты, голод | [dishes/](dishes/README.md) | `dishes_meals.csv`, `recipe_steps.csv`, `meal_profiles.csv`, `meal_slot_rules.csv`, `fasting_rules.csv`, `preservation_storage.csv`, `spoilage_states.csv`, `sensory_lexicon.csv`, `famine_1230.csv` |

Общий реестр ссылок — `sources.csv`: каждая ссылка из `source_refs` всех таблиц с названием, URL и уровнем доверия. Ссылки на строки файлов сведены до имени файла.

## Числа строк (по скрипту `scripts/check.py`, прогон 2026-09-26)

| Файл | Строк | A | B | C |
|---|---|---|---|---|
| food/ingredients.csv | 198 | 67 | 107 | 24 |
| food/ingredient_months.csv | 2280 | 756 | 1248 | 276 |
| food/taxon_refs.csv | 74 | — | 59 | 15 |
| food/household_food_stock_profiles.csv | 6528 | — | 44 | 6484 |
| dishes/dishes_meals.csv | 270 | 19 | 2 | 249 |
| dishes/recipe_steps.csv | 1164 | 70 | — | 1094 |
| dishes/meal_profiles.csv | 21 | — | 14 | 7 |
| dishes/meal_slot_rules.csv | 10 | — | — | 10 |
| dishes/fasting_rules.csv | 18 | — | 13 | 5 |
| dishes/preservation_storage.csv | 9 | — | 4 | 5 |
| dishes/spoilage_states.csv | 8 | — | — | 8 |
| dishes/sensory_lexicon.csv | 23 | — | — | 23 |
| dishes/famine_1230.csv | 23 | 18 | — | 5 |
| sources.csv | 111 | | | |

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
6. **Курированные входы** — `scripts/curated/curated.json` (таксоны, правки master, добавления, голод, посты, классы, дворы) и `scripts/curated/curated_rules.json` (сенсорный словарь, порча, трапезы, насыщение, способы хранения). У каждой записи есть ссылки.
7. **Сборка** — `python scripts/build.py`: детерминированная, без сети. **Проверка** — `python scripts/check.py`: acceptance доменов, denylist и разрешение ссылок. Выход 1 при любой ошибке. Последний прогон: `RESULT PASS 0`, проверено 4045 ссылок.

## Правила уверенности

- Ингредиенты: A/B/C из master. Строки master с D (ING0190, «импортная пряность») исключены и вынесены в пробелы.
- Блюда: `confidence = recipe_confidence`. Если `recipe_evidence_type` ∈ {ingredient_based_reconstruction, comparative_reconstruction, ethnographic_parallel}, ставится **C** (так вышло для 249 из 270 блюд). Отдельно хранится `attestation_confidence`: насколько засвидетельствован сам тип блюда или напитка (по master).
- Частоты: только по правилу каталога ubiquitous/common/contextual/rare → 8/4/2/1. Базой служит rarity из master, дальше шаги по доступу класса и по месяцам сезона (подробно — в food/README.md).

## Универсальный слой и регион

Каждая строка продукта — это разрешение для региона на универсальную категорию: `universal_category=true`, `category_id=content_food.<food_category>.<slug>` (предложение для `category_registry`), `region_id=novgorod_land`, `origin` (local / regional / local+import / import). Таксон задаётся через `source_taxon_ref = taxon:<латинское имя>`. Сверка с `fl_id`/`fa_id` доменов флоры и фауны выполняется по `name_lat`. Сейчас сверено 0 из 74: соседних файлов с колонкой `name_lat` в game-base-v1 при прогоне ещё не было. check.py сверит их автоматически, когда файлы появятся.

## Известные пробелы (общие)

- Нет сопоставления с `fl_id`/`fa_id` (домены флоры и фауны ещё собираются).
- Сроки нереста и путины по видам рыб не заданы: у всех рыб весь год стоит «conditional». Это передано домену `fauna_fish`.
- Даты постов на 1230–1233 по пасхалии здесь не вычислены, это задача домена `calendar_feasts_fasts`. Здесь только рамки и классы продуктов.
- Импортные пряности (перец и др.), грецкий орех, слива, черёмуха, калина для Новгорода около 1230 г. не подтверждены найденными источниками и не включены.
- Число трапез в день и их названия для Новгорода 1230 г. в изученных источниках не засвидетельствованы, поэтому `meal_slot_rules` — реконструкция C.
- Ледник как способ хранения для 1230 г. не подтверждён (C). Типы погребов и клетей относятся к домену `buildings_structures`.
- Monk & Johnston 2012 (археоботаника Троицкого раскопа) полностью не прочитан. Его содержание учтено через утверждённые WK claims `troitsky-*`.
- `craft_process_ref` (`pc_food_<subcategory>`) — это ожидаемые id домена `craft_processes`; такие процессы там ещё не созданы.
- Числа голода (доли порций 0.25–0.7 и зерна 0.1–0.5 из master) помечены C и `needs_approved_profile`: Temporal v4 запрещает выводить числа без отдельного профиля.
