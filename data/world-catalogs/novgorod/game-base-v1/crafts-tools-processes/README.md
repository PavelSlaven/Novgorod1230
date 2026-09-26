# Ремёсла: инструменты, технологические цепочки, мастерские, материалы (game-base-v1)

Статус: **candidate**. Данные собраны сборщиком и не утверждены. Утверждение — отдельный проход (WR §21.1): автор данные не утверждает.

Группа охватывает четыре домена каталога `game-base-v1/catalog.json`:

| Папка | Домен | Главные файлы |
|---|---|---|
| `craft_tools_gear/` | craft_tools_gear | `tools_gear.csv`, `occupation_tools.csv` |
| `craft_processes/` | craft_processes | `processes.csv`, `process_steps.csv`, `process_products.csv` |
| `workshops/` | workshops | `workshops.csv` |
| `materials_registry/` | materials_registry | `materials.csv`, `late_materials_denylist.csv`, `material_crosswalk.csv`, `material_resolution.csv` |
| `sources/` | общий реестр источников группы | `sources.csv` |

## Как собрано

1. Сначала взято уже одобренное: WK production-v1 (`runtime-bundle.json`, домены craft_technology 151, chemistry_process 83, material_culture 195, physics_material_science 204 claims), семейства мест `place-first-cartography.json`, шаблоны `item-container-120-v5`, 68 занятий `novgorod_occupations_v1_enriched.tsv`.
2. Кандидатные наборы использованы только вспомогательно: каталог material_culture (1137 предметов; CRF/AGR/FSH/HNT), сцены мастерских material-culture-scenes-v1, MASTER technology_processes (семейства, профили мастерских, отвергнутые технологии; шаблонные шаги мастера не переносились).
3. Пробелы закрыты адресным поиском по первоисточникам: Рыбина 2015 «Промыслы» (полный текст, A), Колчин и Изюмова МИА 65 (через подробные конспекты — числа отмечены B до сверки с PDF), Колчин 1957, Седова 1981, ИА РАН (Десятинный раскоп, буллотирий), Колчин–Янин–Ямщиков 1985, Смирнова 1998, Щапова 1972.
4. Всё содержательное (какие инструменты, шаги, материалы) записано в `scripts/src/*.cjs`. Производное — связи «инструмент ↔ процесс ↔ занятие ↔ мастерская», классы массы, состояния и слоты примет, категории, разрешение материалов других доменов — считает скрипт.

## Запуск

```bash
cd data/world-catalogs/novgorod/game-base-v1/crafts-tools-processes
# необязательно: пути к распакованным кандидатным архивам для дополнительных проверок
export MATCULT_CATALOG=<...>/Novgorod1230_material_culture_dataset_v1/data/catalog_items.csv
export MASTER_TP_DIR=<...>/Novgorod1230_MASTER_ARCHIVE_v1/data/normalized_source_tables/technology_processes
node scripts/build.cjs      # CSV из scripts/src; build-report.json
node scripts/crosswalk.cjs  # materials_registry/material_crosswalk.csv
node scripts/validate.cjs   # проверки приёмки; validation-report.json, materials_registry/material_resolution.csv
```

Зависимостей нет (Node ≥ 18). Скрипты пишут только в эту папку. `material_resolution.csv` — снимок: другие сборщики ещё пишут свои CSV, поэтому после их завершения `validate.cjs` нужно перезапустить.

## Итоговые числа (из build-report.json и validation-report.json этого прогона)

| Файл | Строк |
|---|---|
| craft_tools_gear/tools_gear.csv | 157 |
| craft_tools_gear/occupation_tools.csv | 356 |
| craft_processes/processes.csv | 48 |
| craft_processes/process_steps.csv | 166 |
| craft_processes/process_products.csv | 42 |
| workshops/workshops.csv | 21 |
| materials_registry/materials.csv | 103 |
| materials_registry/late_materials_denylist.csv | 27 |
| materials_registry/material_crosswalk.csv | 127 |
| materials_registry/material_resolution.csv | 1498 |
| sources/sources.csv | 25 |

Проверки `validate.cjs`: 27 из 27 PASS, из них 5 информационных (они всегда PASS и только сообщают покрытие).

## Универсальное и региональное

Инструменты, материалы и процессы — **универсальные категории**. Колонка `region_id` у всех строк пуста (пусто = универсально). Новгородская специфика записана как свидетельство (`attestation`, `source_refs`) и доступ (`origin`, `access_class`), а не как региональная копия категории. Разрешения и частоты по региону задают presence_rules и region_category_options, а не эти таблицы.

## Главные пробелы (подробно — в README доменов)

- МИА 65 (Колчин, Изюмова, Седова) постранично не выписан: числа взяты из конспекта и отмечены B. Нужна OCR-выборка PDF `https://archaeolog.ru/el-bib/el-cat/el-series/mia/mia-65`. Локальный скан Колчина 1968 (`C:/Users/Slaven/Downloads/Е1-55_Колчин_дерев_1968.pdf`) тоже не распознан.
- В 68 занятиях нет литейщика-ювелира, костореза, токаря, стекольщика, сельского металлурга и красильщика. Их мастерские есть, занятия нужно добавить в домен occupations.
- Для новых таблиц (process_templates и process_steps, material_definitions, tool categories) нужны CR и Contract Auditor (новая схема и persistence).
- Идентификаторы мест — это id семейств WK (`smithy`, `ordinary_workshop` …). В `pf_id` домена place_families их переводит поле `wk_family_ref`. `bt_*_proposed` ждут домена buildings_structures, `pr:*` ждут доменов предметов.
