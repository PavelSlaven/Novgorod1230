# nature-materials-weather — природные материалы, грунты, погода, природные тексты

**Статус:** candidate. Сборщик — `collect-nature-materials-weather`. Утверждение — отдельный проход (WR §21.1): автор не утверждает сам себя.

| Домен | Папка | Главные таблицы |
|---|---|---|
| natural_materials_soils | `natural_materials_soils/` | 34 грунта, 22 вида сырья (универсальные категории), 258 строк присутствия по 34 региональным ландшафтам, 360 строк для 32 G4, 21 расширенный finite-source профиль |
| weather_climate | `weather_climate/` | 9 состояний, 315 переходов с инерцией (D7), 1907 водных строк по шести шаблонам и локальным G4, 70 строк ветра/воздуха (ощущение — пробел), аномалии температуры, нормы, 17 сезонных явлений, 5 исторических погодных событий 1224–1230, свет по месяцам, профиль v2 |
| natural_presentation_texts | `natural_presentation_texts/` | 4098 текстов для рассказчика, 123 фразы членов пула, 142 строки allowlist |

Точные числа строк — в `reports/counts.json` (скрипт).

## Общие элементы (`_shared/`)

- `scripts/lib.mjs` — CSV/TSV/JSON-утилиты, веса 8/4/2/1, Cyrillic-aware denylist.
- `g4_nature_index.json` — закреплённый индекс 32 G4 из PR #98 (с sha256 источника).
- `main_inputs.json` — закреплённые 365 суточных границ света 1230 года и 56 используемых WK claim_ref; для каждого исходного файла сохранены путь, sha256 и размер в байтах.
- `scripts/refresh-inputs.mjs` — явное обновление обоих снимков из соседних checkout.
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
Обычная пересборка и проверки читают только локальные снимки и не требуют соседних checkout. Проверка обработки ошибки: `node _shared/scripts/run-all.mjs --self-test` должна завершиться с ненулевым кодом и вывести `{"checks_passed":false}`; файлы при этом не меняются.

Для намеренного обновления входов: `node _shared/scripts/refresh-inputs.mjs`. Только эта команда читает `PR98_ROOT` и `MAIN_ROOT` (по умолчанию `C:/Users/Slaven/Documents/Novgorod-runtime` и `C:/Users/Slaven/Documents/Novgorod`). После обновления сверить исходные pin и сгенерированные данные перед принятием diff.
