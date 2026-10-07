# Постройки, облик поселения, интерьеры, ёмкости и запасы — candidate

Статус всех строк: `candidate` (не утверждено; автор не утверждает сам себя). Группа каталога game-base-v1: `buildings-interiors-containers`.

| Папка | Домен каталога | Главные файлы |
|---|---|---|
| [buildings/](buildings/README.md) | `buildings_structures`, `settlement_form` | building_types, age_condition_rule.json, occupied_condition_rule.json, building_parts, building_type_parts, materials_vocab, settlement_form, settlement_building_mix |
| [interiors/](interiors/README.md) | `interiors_scenes` | scenes, scene_items, furniture_fixtures_light, anti_patterns_ref, matcult_item_refs |
| [containers/](containers/README.md) | `containers_contents` | container_forms, content_categories, content_profiles, content_profile_entries, place_containers, first_open_rule.json |
| [landmarks/](landmarks/README.md) | `city_landmarks_institutions` | landmarks |
| [ambience/](ambience/README.md) | `settlement_ambience_texts` | settlement_ambience_texts, presence_tokens, g4_human_layer_binding |
| `sources.csv` | все | библиография `ref:*`, источники nov1230db, наборы данных |

## Как пересобрать и проверить

Для standalone-сборки после изменения overlay сначала из корня `game-base-v1` выполните `python3 scripts/build-master-material-view.py`. Он строит узкое представление из неизменённого `sources/master-archive-v1` и `source-overlays/master-material-materials.csv` в `generated/master-material-material-view.json`; `generated-freshness.test.mjs` запускает producer автоматически перед сборщиками.

```
python3 scripts/build.py              # пишет все CSV/JSON и scripts/build_counts.json
python3 scripts/build.py --check      # сравнивает ожидаемые байты без записи в checkout
python3 scripts/validate.py           # приёмочные проверки 6 доменов; код 1 при ошибке
```

Авторские данные лежат в `scripts/src/*.py` (правка только там). Входы закреплены в `data/world-catalogs/novgorod/sources/`: `bic-reproducible-inputs-v1` содержит snapshots каталога и anti-patterns material-culture, а реестр источников берётся из общего `material-culture-scenes-v1/data/sources.csv`; там же хранится единственная курированная SQLite, общая для BIC и items. Стандартный `master-archive-v1` содержит `material_entities.csv`, `state_variants.csv` и `spawn_profiles.csv`; если в нём нет `workshop_profiles.csv`, по умолчанию берётся BIC snapshot. `MASTER_DIR` задаёт полный корень `.../data` альтернативного MASTER snapshot и должен включать все четыре таблицы; при явном override fallback не используется. Альтернативы остальных входов задаются через `MATCULT_DIR` и `NOV1230_DB`. Отсутствующий или несовместимый вход завершает build до записи выходов. Для офлайн-проверки build пишет снимок всех упомянутых предметов matcult (`interiors/matcult_item_refs.csv`).

## Очередь `needs_check.csv`

Активная строка блокирует генерацию совпадающего предмета через общий needs-check gate. Если archive ID одновременно стоит в очередях BIC и crafts, редакционное решение и снятие блокировки оформляются в обоих `authoring/needs_check.csv` одной согласованной правкой; удаление только одной строки не снимает блок.

Runtime handoff: тип постройки → `buildings/age_condition_rule.json` (возраст/состояние) → привязка жилого экземпляра `dwelling` к PF → `buildings/occupied_condition_rule.json` (состояние жилья, если у связанного PF есть группы D-2 `residents`). D-2 не выбирает экземпляр постройки: это обязанность runtime. Правило не распространяется на прочие постройки того же двора. `containers/place_containers.csv` не включает рыбацкую корзину и грузовую бочку для общего `riverbank`; привязки специализированных мест сохраняются.

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

## Правки C002

`buildings/sf_pf_crosswalk.csv` разворачивает авторские `settlement_form.pf_ids` в пары `sf_*` → полные `pf_*` из `place_families.csv` с исходными `source_refs` (SF-PF-1). Семейства без формы получают явную строку `no_source`. `validate.py` сверяет ID, связи, уникальность, статус `candidate` и покрытие реестра PF (44 семейства).
