# nature-materials-weather — природные материалы, грунты, погода, природные тексты

**Статус:** candidate. Сборщик — `collect-nature-materials-weather`. Утверждение — отдельный проход (WR §21.1): автор не утверждает сам себя.

| Домен | Папка | Главные таблицы |
|---|---|---|
| natural_materials_soils | `natural_materials_soils/` | 34 грунта, 22 вида сырья (универсальные категории), 258 строк присутствия по 34 региональным ландшафтам, 360 строк для 32 G4, 21 расширенный finite-source профиль |
| weather_climate | `weather_climate/` | 9 состояний, 315 переходов с инерцией (D7), аномалии температуры, нормы, 17 сезонных явлений, 5 исторических погодных событий 1224–1230, свет по месяцам, профиль v2 |
| natural_presentation_texts | `natural_presentation_texts/` | 3998 текстов для рассказчика (32 G4 × 4 сезона × 13 слоёв + свет и погода; часть зимних ячеек расщеплена на snow/no_snow — см. VERIFICATION), 123 фразы членов пула, 142 строки allowlist |

Точные числа строк — в `reports/counts.json` (скрипт).

## Общие элементы (`_shared/`)

- `scripts/lib.mjs` — CSV/TSV/JSON-утилиты, веса 8/4/2/1, Cyrillic-aware denylist.
- `scripts/extract-g4-index.mjs` → `g4_nature_index.json` — read-only индекс 32 G4 из PR #98 (с sha256 источника).
- `scripts/run-all.mjs` — пересборка, все проверки и подсчёт строк.
- `anachronism_denylist.json` — denylist группы: общий список каталога и регионально отсутствующие таксоны (пихта, лиственница, тополь как глобальный шаблон и др.). Кандидат для домена `anachronism_denylist_lexicon`.
- `*.world_db.tsv` — выгрузки draft-шаблонов из world_db (landscape для региона, land_use).

## Универсальное и региональное (замечание критика)

- Материалы и грунты — универсальные категории (`scope = universal`, `category_code` для `category_registry`). Региональные строки (`material_landscape_presence`, `landscape_ground_binding`) несут `region_id = region_novgorod_land`. Точные строки G4 несут `g4_ref`.
- Погода — региональный профиль `novgorod` (одна цепочка на G0-зону); контракт состояний универсален.
- Тексты рассказчика привязаны к точным G4.

## Пересборка

```
node _shared/scripts/run-all.mjs
```
Переменные `PR98_ROOT` и `MAIN_ROOT` (по умолчанию `C:/Users/Slaven/Documents/Novgorod-runtime` и `.../Novgorod`) — пути read-only источников.
