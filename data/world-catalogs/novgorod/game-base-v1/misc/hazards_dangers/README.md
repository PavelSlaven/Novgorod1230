# hazards_dangers — опасности мест, путей и сезонов

**Статус:** candidate (не утверждено; автор не утверждает сам себя — нужен отдельный проход по WR §21.1).
**Группа:** misc. **Приоритет:** M2c.

## Что здесь

| Файл | Строк | Что это |
|---|---:|---|
| `hazards.csv` | 24 | Опасности по `hz_id`: `risk_type` из перечня `world_base.region_risks` DDL (05.sql), `pf_ids` (реальные id из `places-binding/places/place_families.csv`), сезон (`season_periods`, только каталожные значения) отдельно от событийного триггера (`event_triggers`), видимые признаки, пути/грани traversal, способы избежать, ссылки на последствия (`health_body`, `law`, `item`, `traversal`), класс частоты, `region_id`, `source_refs`, `confidence`. |

Счёт строк получен скриптом (`scripts/build.mjs`, вывод `hazards.csv: 24 rows`).

## Метод

1. `scripts/build.mjs` — авторские строки в виде JS-массива, каждая с явной ссылкой на WK claim (`wk:claim:*`, production-v1), верифицированное книжное свидетельство (`book:<id> §... ¶...`), draft-правило `tools/rus13-novgorod-regional-templates/*.json` или сам DDL-enum, пишет `hazards.csv` детерминированно.
2. `scripts/check.mjs` — проверяет: `risk_type` ∈ enum DDL, есть `visible_signs`, есть `source_refs`, `confidence` ∈ {A,B,C}, `frequency_class` начинается со stated-класса, каждый `pf_id` резолвится в `place_families.csv`, каждое значение `season_periods` резолвится в каталожном наборе {winter, spring, spring_rasputitsa, summer, autumn}, есть хотя бы одна опасность на `water_crossing` (старт v17), нет дублей `hz_id`. Результат прогона — `OK: 24 rows, all checks passed`.

**Правило частоты (`frequency_class`), не придуманные числа:**
- `common` — опасность привязана к грани/месту, доминирующему на стартовой территории v17 M2c (32 G4: речные плёсы, протоки, отмели, пристани — по критику sweep-d4 о заниженном приоритете `transport_travel`), либо действует почти весь год (ночь, закрытые ворота).
- `contextual` — опасность запускается событием/триггером (тревога, спор, непогода, чужой совет), а не является фоном места или сезона.
- `rare` — опасности встречи со зверем (медведь, волк), для которых в WK/MASTER не найдено ставки встречи для региона; оставлено как редакторский минимум, а не изобретённое число, и помечено как пробел ниже.

## Приёмка (скрипт `check.mjs` — OK)

- У каждой строки `risk_type` ∈ {road, weather, law, violence, theft, hunger, disease, wild_animals, social, religious, economic, war, fire, water, cold} (DDL `05.sql`).
- У каждой строки ≥1 видимый признак и `source_refs`.
- Частоты только из {ubiquitous, common, contextual, rare} со stated-основанием в самой строке класса.
- Для каждого водного/прибрежного traversal-grain (`water_crossing`) есть ≥1 строка — покрыты брод, перевоз, лёд, ледоход, половодье, утопление.
- Id уникальны.
- Каждый `pf_id` резолвится в `places-binding/places/place_families.csv` (проверка добавлена 2026-09-26).
- Каждое значение `season_periods` резолвится в каталожном наборе {winter, spring, spring_rasputitsa, summer, autumn} (проверка добавлена 2026-09-26); событийные условия (буря, тревога, ледостав, несоответствие сезона, ночь) — в отдельной колонке `event_triggers`, не проверяются скриптом как сезон.

## Источники

- WK production-v1 (approved/verified claims): `claim:residual-nature-ice-current-thin-areas` (residual-nature-v1), `claim:candidate-physiology-v3-drowning-respiratory-impairment` (gameplay-physiology-v3, payload approved, помечен pending independent verification для самой физиологии), `claim:macro-b1819-storm-damaged-hung-wood-is-an-overhead-hazard-until-its-state-is-known`, `claim:r7-unstable-layered-snow-on-a-slope-can-release-and-warning-cues-support-exposure-reduction`, `claim:macro-b17-high-moisture-stored-hay-can-heat-and-become-a-smoulder-fire-risk` + `claim:macro-b17-suspected-hot-or-smoking-hay-should-not-be-pulled-apart`, `claim:r7-possibly-frozen-body-part-needs-protection-from-further-cold-and-rough-warming-avoidance`, `claim:r7-suspected-venomous-snakebite-supports-limiting-exertion-and-seeking-help`, `claim:mb14-practical-boat-approach-balances-wind-current-and-oar-control`, `claim:practical-dwelling-smoke-draft`, `claim:macro-b1819-smoke-or-ash-can-irritate-eyes-and-supports-clean-air-and-rinsing-response`, `claim:fauna-mammals-brown-bear-food-driven-movement`, `claim:fauna-mammals-brown-bear-cover-rest`, `claim:fauna-mammals-wolf-pack-sociality`, `claim:fauna-mammals-wolf-territorial-defense` — все `wk:claim:*` ссылки резолвятся в `world-knowledge/production-v1/*.json`.
- Верифицированное книжное свидетельство (servak, read-only): book:709382 (Засурцев, «Новгород, открытый археологами») §Новгородские постройки ¶258 (дым через волоковое окно) и §О чем говорят находки ¶535 (кости медведя на усадьбах); book:439294 (Беловинский, «Изба и хоромы», 2012) §Глава 13 ¶588 (пожары от лучины/топки по-чёрному, period ethnographic_late — только вспомогательная опора); book:343305 (Руковский, «Следы зверей») §Бурый медведь ¶120,124 и §Волк ¶1,4; book:185148 (Федорова, «Допетровская Русь») ¶247 (медведи обычны в Новгородской земле до XVII в.); book:518606 (Колесов, «Древняя Русь: наследие в слове», 2011) §Глава первая ¶259 (ледоход 1143 г. на Волхове); book:641351 (Пространная Правда, перевод) ¶2758 (поток и разграбление разбойника) и ¶2780 (побои без свидетелей).
- `main:tools/rus13-novgorod-regional-templates/novgorod_route_season_modifiers_v1.json` (draft) — `risk_escalation_rules` 5, `crossing_rules` 4, `getting_lost_rules` 4.
- `main:tools/rus13-novgorod-regional-templates/novgorod_weather_season_rules_v1.json` (draft) — `body_state_effects` 5, `place_state_effects` 5.
- `main:tools/rus13-novgorod-regional-templates/novgorod_route_knowledge_rules_v1.json` (draft) — `wrong_route_and_getting_lost_rules` 5.
- `world_base.region_risks` DDL (`infra/world-base/schema/05.sql`) — `risk_type` enum, поле-носитель для этого домена (0 строк в БД на момент сбора).
- `places-binding/places/place_families.csv` — `pf_id` для колонки `pf_ids` (добавлено 2026-09-26).

## Известные пробелы

- `world_base.region_risks` и все `spatial_v3_traversal_*` (availability/check/consequence/risk_profiles/risk_hazards) таблицы пусты в БД (0 строк) — этот CSV — кандидат для импорта, не готовая привязка к конкретным `graph_edges`/`places`; связывание с `applies_to_places`/`applies_to_graph_edges` — отдельная задача владельца spatial/traversal, вне полномочий сборщика.
- Частота встречи с медведем и волком не подтверждена источником — только общеизвестный факт присутствия вида и его признаков (муравейники, следы) в регионе, теперь с книжной опорой (см. `note` у `hz_bear_encounter`/`hz_wolf_encounter`). Ставки встречи всё ещё нет — нужен источник со ставкой (охотоведческая/археозоологическая работа) прежде чем эти строки могут перейти в `usable_with_caution`.
- Правило `crossing_ice` / `crossing_ford_check` / `getting_lost_rules` взято из draft rus13tpl (не approved WK), поэтому confidence этих строк — C, а не B.
- `hz_ford_crossing` и `hz_snow_slope_instability` используют приближённые `pf_id` (нет отдельного pf для брода/оврага в `place_families.csv`) — см. `note` этих строк.
- Явной привязки к 32 G4 стартовой территории (как в `nature-materials-weather/natural_materials_soils/g4_ground_and_materials.csv`) в этом проходе не сделано — `pf_ids` теперь резолвятся к реальным `place_families.csv` id, но не к конкретным G4-местам; это задача следующего прохода, у которого будет доступ к `_shared/g4_nature_index.json` соседней группы.
- `consequence_refs` (`health_body:*`, `item_consequences:*`, `law_consequences:*`, …) остаются свободными строками, не сверенными с id домена `health_body` (transport-health-recreation) — межгруппoвая сверка, отдельная задача.

## Исправления 2026-09-26 (см. также корневой `VERIFICATION.md`)

По независимому verify-пассу этот файл переведён из статуса rework: pf_ids и season_periods теперь резолвятся в каталожные id (события-триггеры вынесены в новую колонку `event_triggers`); `hz_smoky_house_fire` пересобран на `wk:claim:practical-dwelling-smoke-draft` + книжное свидетельство (Засурцев) и поднят C→B; `hz_road_thieves`/`hz_brawl_violence` получили правовую опору (Пространная Правда, book:641351); `hz_bear_encounter`/`hz_wolf_encounter` получили источниковые признаки (Руковский, «Следы зверей»; Засурцев; Федорова); `hz_frostbite`/`hz_night_gate_closed` получили собственную basis-строку частоты вместо скопированной водной; `hz_venomous_snakebite` понижен B→C с уточнением visible_signs. Подробности по каждой строке — в `note` соответствующей строки `hazards.csv`.
