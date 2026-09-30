# places-binding — ключ для всех пулов: семейства мест, привязка узлов, носитель наличия, реестр категорий

Группа-сборщик game-base-v1. Все данные имеют статус **candidate** и не утверждены.

Пересборка всего: `node scripts/build-all.mjs`. С флагом `--extract` скрипт заново читает файлы PR #98 из соседнего worktree `../Novgorod-runtime` (путь переопределяет `PR98_ROOT`). Без флага он берёт закреплённый снимок `inputs/pr98-extract.json`.

| Папка | Домен | Главный файл | Строк |
|---|---|---|---|
| `places/` | place_families, place_binding | `place_families.csv`, `node_binding.csv` | 45, 227 |
| `places/` | region-type PF coverage (C012b) | `region_type_pf_manifest.json` | 130 типов: 109 covered, 21 gap |
| `presence/` | presence_rules | `frequency_rule.json`, `environment_presence_authoring.csv`, `environment_lens_exclusions.csv`, `presence_rules.csv` | правило; 6 973 производных строки, включая 1 236 проекций из 855 environment candidate-правил для 45 PF (см. `presence/README.md`) |
| `presence/` | people composition D-2 | `people_composition_authoring.json` | 17 PF, 8 постоянных групп (5 + 3 порога D49), 16 глобальных пробелов; формат и проверки — `presence/README.md` |
| `categories/` | category_registry | `category_registry.csv`, `place_family_categories.csv` | 983, 62 |
| `limits/` | place_generation_limits | `place_generation_limits.csv` | 106 |
| `parameters/` | category_parameters | `parameter_definitions.csv`, `category_parameters.csv` | 16, 3 697 |
| `slots/` | materialization_slot_rules | `materialization_slot_rules.csv`, `slot_candidates.csv`, `slot_instance_variants.json`, `materialization_rules.json`, `no_required_slots.csv` | 5 slots, 8 candidates, 8 variants, 13 explicit gaps for 17 bound PF |

## Скрипты

| Скрипт | Что делает |
|---|---|
| `extract-pr98-inputs.mjs` | Механический снимок файлов PR #98 с sha256. |
| `build-place-families.mjs` | Семейства, фасеты и 3 crosswalk. |
| `build-region-type-pf-manifest.mjs` | Сопоставляет 128 типов закреплённого регионального снимка и 2 стартовых водных типа с текущими PF. |
| `build-node-binding.mjs` | Привязка 32 G4 и 195 G5. |
| `build-category-registry.mjs` | Категории place_family, сбор реестра со всех групп, проверки. |
| `build-presence-rules.mjs` | Сборщик правил наличия из пулов групп. |
| `build-generation-limits.mjs` | Лимиты по правилам R1–R5 и сверка с черновиком аудита. |
| `build-category-parameters.mjs` | Параметры категорий. |
| `build-slot-variants.mjs` | Варианты для каждого кандидата слота; четыре фасета берутся из каталога владельца, книжного примера или имеют явный `no_source`. |
| `validate.mjs` | Все критерии приёмки. Пишет `reports/validation.json`, код выхода 1 при провале собственной проверки. |

Для C012b: `node scripts/build-all.mjs` и `node scripts/validate.mjs --start-territory /srv/novgorod-work/fleet/tasks/codex-data/inputs/start-territory.json --self-test`. Проверка закрепляет исходный снимок, сверяет каждый ключ, точные ссылки на источник и авторство PF, а также пересчитывает PF refs из CSV и 21 план закрытия пробелов из `scripts/pf-authoring.json`; self-test включает отрицательную пробу неизвестного локального PF и шесть проб манифеста. `pf_burial_ground` закрывает gap одного G4 и шести G5, не подменяя его `pf_churchyard`; неподтверждённые частоты и соседние домены имеют явные `no_source`.

Долг C012b: временный региональный candidate `places/pf_local_additions.json#burial_ground` перенести в WK place-first-cartography при следующей ревизии WK.

Слоты C003 — candidate-условия идентичности места, а не частоты появления предметов из `presence_rules.csv`. Пять required-слотов задают перевоз как anchor, жилое здание и ограду конкретной крестьянской усадьбы, хозяйственную постройку и зимнюю ледовую дорогу как anchor. У остальных 13 привязанных PF, включая общий сельский двор и место погребения, есть явная причина отсутствия обязательного слота в `slots/no_required_slots.csv`. Для жилья сельский `settlement_building_mix.csv#sf_yard_peasant` даёт только избу 1..1; жилая клеть в этот слот не входит. В ограде плетень из сельского mix имеет вес 2, частокол — вес 1 и редакционный статус C: `ARC0014` описывает городские дворы и не служит основанием сельской частоты. У хозяйственных построек веса 2/2/1. Все веса относительные и не задают историческую частоту. `spatial.g3.built_site` — общая категория застроенного места; конкретный тип здания задаёт `building:bt_*`. Правила и область применения заданы в `slots/materialization_rules.json`: один комплект слотов на G4-комплекс, подходящий G5 выбирает код, `pf_secondary` сам по себе обязательный слот не создаёт. Историческая обязательность ограды остаётся редакционным C, отдельно от свидетельств о кандидатах. Эти записи не получают статус approved автоматически.

У всех building-вариантов `siv_002`–`siv_007` возраст конкретного экземпляра не задан: `facets.age.no_source` указывает, что runtime выбирает его из `building_types.age_states`. Возраст route и transport не относится к этому правилу.

Ручные решения (суждение, confidence C) лежат отдельно, в `scripts/pf-authoring.json` и `scripts/crosswalk-rules.json`. Их утверждает отдельный проход.

В `node_binding.csv` вторичные семейства выводятся из scene-template кандидатов с условиями по осям родительского G4. Проверка `scripts/validate.mjs --self-test` независимо пересчитывает 227 узлов, проверяет правила, отсутствие `overlay` и сезонность достигнутого `seasonal_overlay`; метод и текущие числа — в `places/README.md`.

## Универсальное и региональное

44 семейства из WK, их категории и параметры универсальны: `region_id` пуст, `universal=true`. Временный локальный `pf_burial_ground` регионален: `region_id=region_novgorod_land`, `universal=false`. Остальное региональное появляется в трёх местах:
- привязка узлов (`region_novgorod_land`);
- `region_id` в кандидатных правилах наличия (пусто = общемировое по умолчанию); материализационный контракт для этого ещё требует CR;
- колонка `template_refs_not_in_novgorod_candidate`: какие универсальные шаблоны новгородский кандидат не разрешил.

## Что требует CR и Contract Auditor

- **Новый носитель наличия.** В текущих DDL и материализационном контракте таблицы нет. Будущий CR должен добавить планируемый §8.1 со scope `place_family`, `g4`, `g5`, `region`, колонками `item_ref`/`variants` и согласовать `refresh_class` (`none|season` в задании, `none|by_year_season` в кандидатных данных).
- **Новая таблица `node_place_family_bindings`** и домен категорий `place_family`.
- **Колонки лимитов.** Дворы и жители отсутствуют в `world_base.place_generation_limits`.

Подробности, метод, источники и пробелы — в README каждой папки.
## Правки C002 — people presence

`presence/people_presence_authoring.csv` задаёт 19 candidate-привязок людей; 17-й привязанный PF погребения имеет пустой состав с явным `no_source` вместо выдуманной частоты посещения. `creation_owner=composition` направляет 5 строк в состав при создании места; `creation_owner=presence_rule` оставляет 14 строк для производных правил наличия. Состав не получает повторного броска presence. Проверка ссылок, ключей и условий — в `scripts/validate.mjs`. `allowed_times` — provenance, не runtime-фильтр C5; guards — авторский текст, не исполняемый evaluator. Числа — редакционные кандидаты, не approved historical frequency; подробности в `presence/README.md`.

`book:622242 §519` свидетельствует о городских усадьбах; сельскую усадьбу поддерживает `book:648161 §2639`. Эти ссылки не доказывают численность конкретной семьи.

## Варианты слотов C006a2

Восемь кандидатов дают восемь записей. `materials` здания передаётся целиком как перечень допустимых материалов, включая альтернативы (у хлева — бревно или плетень); это не утверждение, что каждый материал уже присутствует у экземпляра. Состояние конкретной постройки и её возраст из перечня состояний типа не выбираются: ARC допускает следы износа, возраст остаётся `no_source`. Книжные размеры тына, частокола, клети и амбара — городские примеры, не сельская норма. О зимнике известны поверхность и возможные опасности пути по Ильменю; дата и состояние конкретного зимника не установлены.

Для пробелов проверены `building_types.csv`, `transport_entities.csv`, `route_modes.csv`, master-archive `material_items.csv` (ARC0002/0014/0017/0018/0020), books-evidence `buildings-interiors-containers.csv`, `nature-materials-weather.csv`, `transport-health-recreation.csv` и WK `place-first-cartography.json`. Тип и размеры перевозного судна, возраст построек, размеры сельского экземпляра и частоты альтернативных материалов там не установлены; явные `no_source` сохранены.
