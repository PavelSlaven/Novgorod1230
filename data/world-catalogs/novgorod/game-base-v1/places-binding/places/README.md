# places — семейства мест и привязка узлов (домены place_families, place_binding)

Статус: **candidate**, не утверждено. Автор не утверждает сам себя: нужен отдельный проход утверждения.

## Что здесь

| Файл | Строк | Что |
|---|---|---|
| `place_families.csv` | 44 | 44 семейства WK place-first-cartography, `pf_<wk id>`. Имена ru/en, вид, применимые 9 природных слоёв M2c, 4 фасета, ссылки на шаблоны landscape / land_use / place / water_body / route, типы G4 v6, scene templates v17, архетипы MASTER. `region_id` пуст: семейства универсальны. |
| `place_family_facets.csv` | 171 | Все фасеты WK семейств: слот, coverage, число claims, needs, limits и полный список `claim_refs`. |
| `crosswalk_v6_g4_location_types.csv` | 198 | Каждый `g4_location_type` графа v6 (9332 строки) переведён в pf; 1 тип `not_applicable` (brine_source). |
| `crosswalk_scene_templates.csv` | 17 | Каждый scene template spatial-v3 переведён в pf, с числом G5 v17. |
| `crosswalk_master_location_archetypes.csv` | 32 | Архетипы мест MASTER (item_location_links 12 997 связей, spawn_profiles 46) переведены в pf; 1 `not_applicable` (military_camp). |
| `node_binding.csv` | 227 | 32 G4 и 195 G5 стартовой территории v17: pf, вторичные pf, landscape, water_body, оси authoring, scene template, основание, gaps. |

Счёт строк — из `scripts/build-*.mjs` и `reports/validation.json`.

## Метод

1. **Семейства.** Скрипт `build-place-families.mjs` читает id, описание, `composes_with` и фасеты из `world-knowledge/production-v1/place-first-cartography.json`. Ручная часть — `scripts/pf-authoring.json`: имена, вид, слои, ссылки на шаблоны. Это суждение, confidence C.
2. **9 слоёв M2c.** Это 13 ключей `layer_applicability` из pr98 `m2c-natural/candidate.json` без 4 фоновых слоёв (seasonal_state, light, weather, audible_context). Их живые значения принадлежат runtime-владельцам (`nonblocking_limits` кандидата). Для интерьеров слои не применяются, там указано `layers_note`.
3. **Фасеты.** Правило позиции: у семейств с 4 фасетами порядок в WK всегда «грунт/материал, использование/люди, ощущения/следы, риски/уход». Для семейств с 1, 2 или 5 фасетами слоты заданы явно в `pf-authoring.json`.
4. **Шаблоны.** Ссылки проверяются по `infra/world-base/*_templates.seed.json` и кандидату regional-environment. Колонка `template_refs_not_in_novgorod_candidate` показывает ссылки, которых нет в новгородском кандидате: они есть только в универсальном seed.
5. **Crosswalk.** Ручные таблицы лежат в `scripts/crosswalk-rules.json`. Покрытие и разрешимость ссылок проверяет `validate.mjs`.
6. **Привязка узлов (`build-node-binding.mjs`).**
   - G4: pf выводится из `authoring_axes.function`; в источнике эта ось помечена direct/high. Landscape и water_body копируются из `template_refs` кандидата m2c-natural.
   - G5: pf выбирается по заявленному правилу из 4 шагов. Шаг 1: ключевое слово в id G5. Шаг 2: pf родителя, если он есть в crosswalk scene template. Шаг 3: pf scene template из `composes_with` родителя. Шаг 4: наследование от родителя. Использованный шаг записан в `binding_basis`. Итог на момент сборки: 125 строк по шагу 1, 6 по шагу 2, 26 по шагу 3, 32 по шагу 4 (`bound_inherited`), 6 gap. Точные числа — в `reports/build-node-binding.json`.
   - Шаблоны G5 наследуются от родительского G4. Это отмечено в gaps.

## Источники

- `data/world-catalogs/novgorod/world-knowledge/production-v1/place-first-cartography.json`: 44 семейства, WK approved claims. Confidence B для фасетов.
- `infra/world-base/{landscape,land_use,place,water_body,route}_templates.seed.json`: 70/45/64/41/21 строк, draft. Идентичны seed в PR #98.
- pr98 `regional-environment/candidates/novgorod-1230-1250-v1/candidate.json`: 33/21/24/37 строк + 1 pending, `pending_independent_approval`.
- pr98 `m2c-natural/candidate.json`: 32 профиля G4, `candidate_approval_pending`.
- pr98 `spatial-v3/datasets` (nodes, node_parents, scene_templates, scene_materialization_candidates/profiles): approved.
- `DOCUMENTS/.../novgorod_graphify_g1_g4_full/source_tsv/novgorod_g2_g4_70_cells_v6_g4_locations.tsv`: 9332 строки, 198 типов, draft/usable_with_caution.
- MASTER `material_entities/item_location_links.csv`, `spawn_profiles.csv` (копия в `data/world-catalogs/novgorod/sources/master-archive-v1`).
- Источники PR #98 закреплены sha256 в `inputs/pr98-extract.json`. Пересборка: `node scripts/extract-pr98-inputs.mjs`.

## Известные пробелы

- **Погребение.** Нет семейства места для могильника или кладбища вне церковного двора. G4 `zaostrovye_burial_area` и его 6 G5 записаны как gap. Нужен домен lifecycle_rites_burial и семейство в WK place-first.
- **Два шаблона без источника на уровне узлов.** Ни для одного узла v17 нет источника `land_use_template_id` и `place_template_id`. Ось authoring `land_use` (waterway_access и т.п.) не является id шаблона `lu_*`. Во всех 227 строках эти поля — typed gap.
- **Наследование G5.** Landscape и water_body у G5 наследуются от G4 и для самих G5 не засвидетельствованы.
- **Нет семейства.** В WK place-first нет семейств для соляного промысла (brine_source), военного лагеря (MASTER military_camp) и устья или морского края. Внешние G4 `mixing_reach` и `outer_exposed_approach` отнесены к river_channel. Колодца как отдельного семейства тоже нет: well_* разнесены по village_lane, rural_yard и town_street.
- **Мельница.** Для 1230 г. не подтверждена (pt_watermill_site и lu_watermill_water_management не повышены в новгородском кандидате). Ветряная мельница исключена как анахронизм.
- **Вся территория — не Новгород.** Стартовая территория v17 (xp017_yp026_r2) лежит в низовьях Северной Двины (Вихтуй, Заостровье), а не в самом Новгороде. Графа v6 для неё нет. Поэтому crosswalk типов G4 v6 относится к остальной Новгородской земле, а не к узлам v17.
- **Crosswalk — суждение.** Всё отнесение к pf (типы G4, scene templates, архетипы, функции G4) — ручное суждение с confidence C. Оно требует независимого утверждения.
