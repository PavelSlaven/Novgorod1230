# natural_presentation_texts — природные тексты для рассказчика

**Статус:** candidate (редакторские тексты, C; не утверждены).
**Группа:** nature-materials-weather. **Приоритет:** M2c.

Это единственные природные строки, которые видит рассказчик: `spatial-v3-projection` → `sensory_details`. Преемник `pr98:m2c-natural-presentation/candidate.json` (32 профиля, 13 слоёв, без сезонов; слои `seasonal_state`, `light` и `weather` там пустые).

## Что здесь

| Файл | Строк | Что это |
|---|---:|---|
| `presentation_texts.csv` | 3762 | Для 32 G4 × 4 сезона × 13 слоёв: `clear_text` и `partial_text`, с сезонным условием (`condition`, `requires`: снег/без снега, половодье, лёд, ледоход, высокая вода, ледостав), каналом и громкостью для акустики. По слоям: surface 188, relief 160, water_body 180, bank_structure 120, tree_layer 112, shrub_layer 120, ground_cover 120, riparian_vegetation 116, natural_materials 128, seasonal_state 187, light 544 (сезон × фаза света × освещённость места, светлые и тёмные летние ночи), weather 1600 (доступные в сезоне состояния × вид осадков × местная поправка: лес, открытая вода, лёд, открытое место), audible_context 187. |
| `member_phrases.csv` | 123 | Фразы на каждый член пула: визуальные и акустические, по 4 сезонам. Это 7 родов растений, 4 гильдии, 2 зверя (только следы и звуки), грибная гильдия, 7 материалов и камыш из растительности шаблона. Для показа выбранного члена пула, когда появится код `member_selection`. |
| `habitat_allowlist.csv` | 142 | Какие таксоны можно называть в текстах данного G4: члены пула successor-v2 плюс растительность ландшафтного шаблона из world_db. Регионально отсутствующие слова отброшены. |
| `reports/denied_landscape_words.csv` | 3 | Отброшено: «пихта» (`lt_temperate_coniferous_forest`), «тополь» (`lt_wooded_floodplain`, 2 G4). Глобальные шаблоны world_db не новгородские. |

## Метод

- `authoring/lexicon.mjs` — авторские фразы по классу слоя (из утверждённого natural baseline), сезону и условию. `authoring/members.mjs` — фразы членов пула и словарь таксонов.
- `scripts/build.mjs` собирает тексты по `_shared/g4_nature_index.json`. Используются классы слоёв, применимость (слои `not_applicable` пропускаются), тип воды, освещённость, окружающие материалы и допустимые таксоны. Для деревьев учитывается хвойное или листопадное (WK `residual-tree-*`).
- Условия берутся из `weather_climate/seasonal_phenomena.csv` и `ground_water_condition_rules.csv`, свет — из `light_profile_by_month.csv`, набор погод сезона — из `weather_season_climatology.csv`.
- Тексты не утверждают людей, постройки, текущее присутствие зверя, количества и события. Фразы о фауне — только следы или звуки, при условии текущего физического источника (`render_condition`).

## Приёмка (скрипт `check.mjs` — OK)

- Все 1604 ячейки «G4 × сезон × применимый слой» имеют `clear_text` и `partial_text`.
- Каждый упомянутый таксон есть в `habitat_allowlist` этого G4. Словарь — 29 основ названий. Отрицательный тест: подставленные «берёза» и «тополь» ловятся.
- Анахронизмов и регионально отсутствующих названий по `_shared/anachronism_denylist.json` нет.
- Сезонных противоречий нет: летом нет снега, льда и мороза, зимой — зелени, грозы и жары.
- У акустических строк громкость 1–3, у визуальных её нет; id уникальны.
- У каждого члена пула есть визуальная фраза на 4 сезона.

## Источники

PR #98: `m2c-natural/nature-successor-candidate-v2.json` (классы, члены, применимость), `m2c-natural-presentation/candidate.json` (прежние тексты и политика partial/loudness), `m2c-natural/nature-successor-phrases-v1.json`, `m2c-acoustic/approved/spatial_v3_g6_acoustic_baselines.json`. world_db `landscape_templates.dominant_vegetation`. WK: `residual-tree-*`, `static-weather-b06-beaver-*`, `fauna-mammals-moose-*`, `common-reed-*`, `population-material-wood-decay`. Группа: `weather_climate/*`.

## Известные пробелы

- `habitat_presence` из доменов флоры и фауны (другие сборщики) ещё не готов. Сейчас allowlist = члены пула successor-v2 + растительность шаблона. После выхода `flora_*` / `fauna_*` allowlist надо пересобрать, а `member_phrases` — расширить на все члены их пулов.
- В текстах нет птиц, рыб и насекомых: в пулах 32 G4 их нет. Добавлять только после появления `habitat_presence`.
- Тексты редакторские (C). Лексика одна на класс слоя, поэтому G4 одного класса звучат одинаково (например, 5 речных плёсов). Для разнообразия нужны варианты по функции G4 или выбор из нескольких формулировок по seed.
- Отрисовка `member_selection` и условий `requires` — задача кода; этот датасет только поставляет строки.
