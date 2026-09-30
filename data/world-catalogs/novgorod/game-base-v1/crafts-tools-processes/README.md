# Ремёсла: инструменты, технологические цепочки, мастерские, материалы (game-base-v1)

Статус: **candidate**. Данные собраны сборщиком и не утверждены. Утверждение — отдельный проход (WR §21.1): автор данные не утверждает.

Группа охватывает четыре домена каталога `game-base-v1/catalog.json`:

| Папка | Домен | Главные файлы |
|---|---|---|
| `craft_tools_gear/` | craft_tools_gear | `tools_gear.csv`, `occupation_tools.csv` |
| `craft_processes/` | craft_processes | `processes.csv`, `process_steps.csv`, `process_products.csv`, `butchery_profiles.csv`, `fish_cleaning_products.csv` |
| `workshops/` | workshops | `workshops.csv` |
| `materials_registry/` | materials_registry | `materials.csv`, `late_materials_denylist.csv`, `material_crosswalk.csv`, `material_resolution.csv` |
| `sources/` | общий реестр источников группы | `sources.csv` |

## Как собрано

1. Сначала взято уже одобренное: WK production-v1 (`runtime-bundle.json`, домены craft_technology 151, chemistry_process 83, material_culture 195, physics_material_science 204 claims), семейства мест `place-first-cartography.json`, шаблоны `item-container-120-v5`, 68 занятий `novgorod_occupations_v1_enriched.tsv`.
2. Кандидатные наборы использованы только вспомогательно: каталог material_culture (1137 предметов; CRF/AGR/FSH/HNT), сцены мастерских material-culture-scenes-v1, MASTER technology_processes (семейства, профили мастерских, отвергнутые технологии; шаблонные шаги мастера не переносились).
3. Пробелы закрыты адресным поиском по первоисточникам: Рыбина 2015 «Промыслы» (полный текст, A), Колчин и Изюмова МИА 65 (через подробные конспекты — числа отмечены B до сверки с PDF), Колчин 1957, Седова 1981, ИА РАН (Десятинный раскоп, буллотирий), Колчин–Янин–Ямщиков 1985, Смирнова 1998, Щапова 1972.
4. Всё содержательное (какие инструменты, шаги, материалы) записано в `scripts/src/*.cjs`. Производное — связи «инструмент ↔ процесс ↔ занятие ↔ мастерская», классы массы, состояния и слоты примет, категории, разрешение материалов других доменов — считает скрипт.

`authoring/category_evidence_ids.csv` — отсортированная выписка уникальных `item_id` с ролью `category_form_material_process_or_context` из закреплённого `data/master-archive/unpacked/Novgorod1230_MASTER_ARCHIVE_v1/data/normalized_source_tables/material_entities/source_item_links.csv` (SHA-256 `8ec5dbcb016f48e2e973bce07a5f1c9fbb6f6429812f853c8a05222660281ddc`); воспроизвести: `python3 -c 'import csv,sys; r=csv.DictReader(open(sys.argv[1],encoding="utf-8-sig")); w=csv.writer(sys.stdout,lineterminator="\n"); w.writerow(("archive_id","support_role")); [w.writerow((x,"category_form_material_process_or_context")) for x in sorted({a["item_id"] for a in r if a["support_role"]=="category_form_material_process_or_context"})]' <source_item_links.csv> > authoring/category_evidence_ids.csv`.

## D38: очередь и датированные ограничения

- CRF0061, HNT0024, HNT0028, HRS0021, WTR0015, AGR0022 и CRF0057 стоят в `authoring/needs_check.csv`. CRF0061, HNT0024 и AGR0022 размечены как `anachronism` и блокируют имя для Новгородской земли в 1230–1250 гг.; HNT0028 и CRF0057 — `regional_presence` и остаются информационными; HRS0021 и WTR0015 оставлены спорными до редакционного решения. Причина и запрос источника указаны отдельно по каждой записи; confidence D сохранён.
- HNT0022 остаётся исключённым как современный фабричный капкан: мастер-снимок задаёт период 1600–2000. WTR0024 остаётся исключённым по датированному каталожному периоду 1450–1700.
- Хлопчатник исключён как местное растение, но хлопковая ткань не запрещена: импорт возможен. Привозная хлопчатобумажная ткань включена как материал одежды (`clothing-appearance/garments/materials_colors.csv#imported_cotton_cloth`): basis=analogy, confidence C, привозная, редкая, для зажиточных (Рыбаков и др. 1985, book:622242 §1778; Пушкарёва 1989, book:616519 §409, пример XIV–XV вв.); ситец — анахронизм (`dl_chintz`), бязь ждёт датировки (`dl_byaz`). Колёсная прялка, ножной круг и плуг с отвалом находятся в `materials_registry/needs_check.csv` как `anachronism` и блокируют совпадение имени; водяной молот отмечен как `regional_presence`, бязь остаётся спорной. Отсутствие подтверждения само по себе не считается анахронизмом, confidence D сохранён.
- Стекло в окнах ограничено контекстом обычного жилья; это не общий запрет стекла.
- Если archive ID одновременно присутствует в очередях crafts и BIC, редакционное решение и снятие блокировки вносятся в оба `authoring/needs_check.csv` согласованно; одна оставшаяся строка продолжает блокировать совпадение.

## Общий needs_check gate

Правила классификации, областей действия, исключений и снятия блоков находятся в [общем game-base gate](../NEEDS_CHECK.md).

Активные очереди проверяются одним `scripts/check-needs-check.mjs` gate. `anachronism` блокирует имя в указанном регионе и периоде; `regional_presence` и спорные строки только отражаются в отчёте. Блок по archive ID не допускает запись в entity/catalog через registry entities и BIC/crafts archive-inclusions, но не блокирует ссылки на этот ID в частотах, размещении, trace, инвентарях и presence; эти совпадения только выводятся информационно. После интеграции runtime блок анахронизма будет действовать также на свободную материализацию. Archive-записи с маршрутными или идентификационными причинами блокируются по ID; `unresolved` с запросом источника проверяется по `doubt_kind`. Снять блок можно после утверждения по D38: перенести запись в соответствующий каталог или denylist, удалить дубли строки в BIC и crafts одним изменением, затем пересобрать snapshot командой `node scripts/check-needs-check.mjs --write`. Одной смены confidence недостаточно.

Gate проверяет entity tables и generated item-bearing tables: item place frequency, item context relations, item place trace relations, carried inventories, scene items, presence rules, environment presence authoring, costume disposition, church practice и weapon source crosswalk. Таблица, создающая совпадение, должна остановить сборку либо исключить запись с явным gap в отчёте.

## Запуск

```bash
cd data/world-catalogs/novgorod/game-base-v1/crafts-tools-processes
# необязательно: пути к распакованным кандидатным архивам для дополнительных проверок
export MATCULT_CATALOG=<...>/Novgorod1230_material_culture_dataset_v1/data/catalog_items.csv
export MASTER_TP_DIR=<...>/Novgorod1230_MASTER_ARCHIVE_v1/data/normalized_source_tables/technology_processes
node scripts/build.cjs      # CSV из scripts/src; build-report.json
node scripts/crosswalk.cjs  # materials_registry/material_crosswalk.csv
node scripts/validate.cjs --self-test # проверки приёмки и отрицательные пробы; validation-report.json, materials_registry/material_resolution.csv
```

Зависимостей нет (Node ≥ 18). Скрипты пишут только в эту папку. `material_resolution.csv` — снимок: другие сборщики ещё пишут свои CSV, поэтому после их завершения `validate.cjs` нужно перезапустить.

## Итоговые числа (из build-report.json и validation-report.json этого прогона)

| Файл | Строк |
|---|---|
| craft_tools_gear/tools_gear.csv | 157 |
| craft_tools_gear/occupation_tools.csv | 356 |
| craft_processes/processes.csv | 50 |
| craft_processes/process_steps.csv | 171 |
| craft_processes/process_products.csv | 47 |
| craft_processes/butchery_profiles.csv | 7 |
| craft_processes/fish_cleaning_products.csv | 37 |
| workshops/workshops.csv | 21 |
| materials_registry/materials.csv | 103 |
| materials_registry/late_materials_denylist.csv | 27 |
| materials_registry/material_crosswalk.csv | 127 |
| materials_registry/material_resolution.csv | 2171 |
| sources/sources.csv | 25 |

Проверки `validate.cjs`: 29 из 29 PASS, из них 5 информационных (они всегда PASS и только сообщают покрытие). `--self-test` дополнительно отклоняет процесс без ножа, выходы массой больше туши, число с ложной source-ссылкой, разрыв класса very-small и рыбу без свежего продукта или видовой строки чистки.

## Универсальное и региональное

Инструменты, материалы и процессы — **универсальные категории**. Колонка `region_id` у всех строк пуста (пусто = универсально). Новгородская специфика записана как свидетельство (`attestation`, `source_refs`) и доступ (`origin`, `access_class`), а не как региональная копия категории. Разрешения и частоты по региону задают presence_rules и region_category_options, а не эти таблицы.

## Главные пробелы (подробно — в README доменов)

- МИА 65 (Колчин, Изюмова, Седова) постранично не выписан: числа взяты из конспекта и отмечены B. Нужна OCR-выборка PDF `https://archaeolog.ru/el-bib/el-cat/el-series/mia/mia-65`. Локальный скан Колчина 1968 (`C:/Users/Slaven/Downloads/Е1-55_Колчин_дерев_1968.pdf`) тоже не распознан.
- В 68 занятиях нет литейщика-ювелира, костореза, токаря, стекольщика, сельского металлурга и красильщика. Их мастерские есть, занятия нужно добавить в домен occupations.
- Для новых таблиц (process_templates и process_steps, material_definitions, tool categories) нужны CR и Contract Auditor (новая схема и persistence).
- Идентификаторы мест — это id семейств WK (`smithy`, `ordinary_workshop` …). В `pf_id` домена place_families их переводит поле `wk_family_ref`. `bt_*_proposed` ждут домена buildings_structures, `pr:*` ждут доменов предметов.

## Правки C002

`craft_tools_gear/occupation_pf_crosswalk.csv` выводит пары `occupation_id` → `pf_id` из мастерских, названных мест в TSV занятий и закреплённых приспособлений, используемых одним занятием (`carry_kind=workplace`, `size_class=fixture`). Носимые и общие инструменты не задают место работы. `source` означает прямую связь с мастерской или местом, названным в TSV; `rule` — вывод по закреплённому приспособлению или названию занятия. `source_refs`, `tool_ids` и `workshop_ids` показывают основания; `confidence` — худшее звено внутри одной доказательной цепочки и лучшая из независимых цепочек для той же пары. Строки `no_source` учитываются отдельно от действительных связей; все строки `candidate`.

Для G4 берётся только целый элемент `typical_g4_location_types`, однозначно сопоставленный с одним PF в `places-binding/places/crosswalk_v6_g4_location_types.csv`. Многозначные соответствия остаются пробелом без отдельного правила выбора. Уверенность и ссылки владельца включены в связь. `outer_gate` ведёт к `pf_town_courtyard`; `town_gate` ведёт к `pf_town_wall_edge`, но в TSV занятий не назван. Из `where_work_happens` берутся одинаково для всех занятий только целые элементы списка, прямо называющие одно место: `зимник`, `погост`, `болото`, `скотный двор`, `поле`, `покос`, `рыболовный стан`, `торг`, `церковный двор`. Подстроки и неоднозначные названия не угадываются. Семь занятий с явным `болото` связаны с `pf_bog`.

Сборка: `python -B scripts/pf_crosswalk.py`; проверка разрешения ID, полноты 44 PF и 16 видов, уникальности и побайтной воспроизводимости: `python -B scripts/pf_crosswalk.py --check`.
