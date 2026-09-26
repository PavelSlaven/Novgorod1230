# places-binding — ключ для всех пулов: семейства мест, привязка узлов, носитель наличия, реестр категорий

Группа-сборщик game-base-v1. Все данные имеют статус **candidate** и не утверждены.

Пересборка всего: `node scripts/build-all.mjs`. С флагом `--extract` скрипт заново читает файлы PR #98 из соседнего worktree `../Novgorod-runtime` (путь переопределяет `PR98_ROOT`). Без флага он берёт закреплённый снимок `inputs/pr98-extract.json`.

| Папка | Домен | Главный файл | Строк |
|---|---|---|---|
| `places/` | place_families, place_binding | `place_families.csv`, `node_binding.csv` | 44, 227 |
| `presence/` | presence_rules | `frequency_rule.json`, `presence_rules.csv` | правило; 2 426 на пересборку 2026-09-26 (пересобирается из пулов, см. `presence/README.md`) |
| `categories/` | category_registry | `category_registry.csv`, `place_family_categories.csv` | 982, 61 (на пересборку 2026-09-26, см. `categories/README.md`) |
| `limits/` | place_generation_limits | `place_generation_limits.csv` | 105 |
| `parameters/` | category_parameters | `parameter_definitions.csv`, `category_parameters.csv` | 16, 3 697 |

## Скрипты

| Скрипт | Что делает |
|---|---|
| `extract-pr98-inputs.mjs` | Механический снимок файлов PR #98 с sha256. |
| `build-place-families.mjs` | Семейства, фасеты и 3 crosswalk. |
| `build-node-binding.mjs` | Привязка 32 G4 и 195 G5. |
| `build-category-registry.mjs` | Категории place_family, сбор реестра со всех групп, проверки. |
| `build-presence-rules.mjs` | Сборщик правил наличия из пулов групп. |
| `build-generation-limits.mjs` | Лимиты по правилам R1–R5 и сверка с черновиком аудита. |
| `build-category-parameters.mjs` | Параметры категорий. |
| `validate.mjs` | Все критерии приёмки. Пишет `reports/validation.json`, код выхода 1 при провале собственной проверки. |

Ручные решения (суждение, confidence C) лежат отдельно, в `scripts/pf-authoring.json` и `scripts/crosswalk-rules.json`. Их утверждает отдельный проход.

## Универсальное и региональное

Семейства мест, их категории и параметры универсальны: `region_id` пуст, `universal=true`. Региональное появляется в трёх местах:
- привязка узлов (`region_novgorod_land`);
- `region_id` в правилах наличия (пусто = общемировое по умолчанию, по норме §8.1);
- колонка `template_refs_not_in_novgorod_candidate`: какие универсальные шаблоны новгородский кандидат не разрешил.

## Что требует CR и Contract Auditor

- **Новый носитель наличия.** В DDL нет таблицы; scope `place_family`, `g4`, `g5`, `region` отсутствуют в норме §8.1; в задании `refresh_class` был `none|season`, в норме — `none|by_year_season`.
- **Новая таблица `node_place_family_bindings`** и домен категорий `place_family`.
- **Колонки лимитов.** Дворы и жители отсутствуют в `world_base.place_generation_limits`.

Подробности, метод, источники и пробелы — в README каждой папки.
