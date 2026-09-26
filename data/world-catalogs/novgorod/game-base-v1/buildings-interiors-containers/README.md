# Постройки, облик поселения, интерьеры, ёмкости и запасы — candidate

Статус всех строк: `candidate` (не утверждено; автор не утверждает сам себя). Группа каталога game-base-v1: `buildings-interiors-containers`.

| Папка | Домен каталога | Главные файлы |
|---|---|---|
| [buildings/](buildings/README.md) | `buildings_structures`, `settlement_form` | building_types, building_parts, building_type_parts, materials_vocab, settlement_form, settlement_building_mix |
| [interiors/](interiors/README.md) | `interiors_scenes` | scenes, scene_items, furniture_fixtures_light, anti_patterns_ref, matcult_item_refs |
| [containers/](containers/README.md) | `containers_contents` | container_forms, content_categories, content_profiles, content_profile_entries, place_containers, first_open_rule.json |
| [landmarks/](landmarks/README.md) | `city_landmarks_institutions` | landmarks |
| [ambience/](ambience/README.md) | `settlement_ambience_texts` | settlement_ambience_texts, presence_tokens, g4_human_layer_binding |
| `sources.csv` | все | библиография `ref:*`, источники nov1230db, наборы данных |

## Как пересобрать и проверить

```
python scripts/build.py      # пишет все CSV/JSON и scripts/build_counts.json
python scripts/validate.py   # приёмочные проверки 6 доменов; код 1 при ошибке
```

Авторские данные лежат в `scripts/src/*.py` (правка только там). Внешние входы вне репозитория задаются переменными `MATCULT_DIR`, `MASTER_DIR`, `NOV1230_DB` (по умолчанию — распакованные архивы в scratchpad и `Downloads/novgorod_1230(1) (1).sqlite`). Для офлайн-проверки build пишет снимок всех упомянутых предметов matcult (`interiors/matcult_item_refs.csv`).

Последний прогон: `validate.py` — PASS, 0 ошибок, 41 предупреждение (все — «имя объекта нет в v6 naming_register»: это новые, но источниковые имена).

## Общие соглашения группы

- **place family (`pf_id`)** — 44 семейства WK `place-first-cartography.json` (approved). Реестр `place_families` другого сборщика пока не создан; при появлении нужен crosswalk.
- **region_id**: пусто = универсальная категория (сруб, амбар, бочка — формы лесной зоны, не только Новгорода); `region_novgorod_land` = региональная конкретизация (Великий мост, Детинец, иноземные дворы, жальники).
- **source_refs** — токены, каждый проверяется `validate.py`: `wk:claim:<id>` (WK approved), `matcult:<ITEM>` / `matcult_scene:SCN###` / `matcult_src:SRC###` (material culture v1, кандидат), `master:spawn:SPN###` / `master:workshop:<id>` (MASTER, кандидат), `nov1230db:<id>` (курированная SQLite 1230 г. с A/B/C), `v5:<table>[:<id>]` (item-container-120-v5, pending), `rus13tpl:container:<id>` (draft), `v6tsv:g3_places:<тип>` (draft), `ref:<key>` (новая литература, `sources.csv`), `authored_scene:<sc_id>`.
- **confidence**: A — первоисточник/археология; B — научная вторичная; C — реконструкция по аналогии (с note).
- **frequency_class → вес**: ubiquitous/common/contextual/rare → 8/4/2/1; правило выбора класса — в README каждого домена.
- **Анахронизмы**: общий denylist в `validate.py` (картофель, кукуруза, томат, подсолнечник, табак, индейка, тяжеловоз, чай, кофе, сахар, огнестрел, порох, кирпичная изба, застеклённые окна изб) + структурные правила (стекло только у хором/каменных храмов, плинфа только в монументальных постройках, у жилищ явная охрана «нет дымохода»).

## Исследование (новые данные, закрывающие реальные пробелы)

Веб-поиск (WebSearch/WebFetch) по датировке пятистенка, размерам срубов и печей, баням, жальникам, Хутынскому монастырю; ссылки — `sources.csv` (`ref:*`). МИА 65 и Колчин 1968 не прочитаны: локального OCR нет (tesseract отсутствует), файл `MIA_65.pdf` по пути из каталога не найден.
