# m2c-npc-wave v1 — перегенерация на пине game-base 27bd6134 (review request для переподписи)

Статус: **на переподпись ревьюером** (D27, шаг «пин → перегенерация → код»). `manifest.json` остаётся `draft`; этап bootstrap не подключён.
`approval.json`: `source_commit` = `27bd6134cf61200b8da5ffe76ef8ab777ad5a5fd` (origin/main после #209); `checked_by` / `checked_at` — подпись для **старого** пина `337abf9e`, **недействительна для этих данных** до переподписи (метка `resign_required`). Обнулить подпись нельзя: валидатор `m2c-npc-wave-approval.mjs` и существующий тест требуют непустые `checked_by`/`checked_at`.

## Как воспроизвести
```
M2C_SOURCE_COMMIT=27bd6134cf61200b8da5ffe76ef8ab777ad5a5fd node scripts/generate-m2c-npc-wave-datasets.mjs
python3 <bridge>/out/wave-repin-diff.py <ref до регенерации>   # из корня; старое читает из git, новое — из рабочей копии
```
Генератор теперь отсеивает `subject_kind='environment'` и печатает `excludedEnvironmentPresenceRules` (см. ниже); любой иной неизвестный вид — ошибка `M2C_WAVE_PRESENCE_SUBJECT_KIND_UNSUPPORTED`.

## Сверка старых и новых наборов (провенанс в причинах изменений игнорируется — он содержит пин)
| table | old | new | added | removed | changed | changed fields (top) | provenance_ref only |
|---|---|---|---|---|---|---|---|
| fauna_phase_activity_rules | 3628 | 3640 | 16 | 4 | 16 | payload:16, visibility_state:16 | 3608 |
| household_composition_profiles | 139 | 139 | 0 | 0 | 0 | - | 139 |
| npc_relationship_materialization_rules | 53 | 53 | 0 | 0 | 0 | - | 53 |
| npc_schedule_routine_rules | 167 | 167 | 0 | 0 | 0 | - | 167 |
| place_families | 45 | 45 | 0 | 0 | 0 | - | 45 |
| place_population_composition_rules | 17 | 17 | 0 | 0 | 0 | - | 17 |
| presence_rules | 5717 | 5740 | 4254 | 4231 | 0 | - | 1486 |
| slot_instance_variants | 8 | 8 | 0 | 0 | 0 | - | 8 |
| source_records | 1 | 1 | 0 | 0 | 1 | title:1, file_reference:1, id:1 | 0 |
| spatial_node_place_family_bindings | 227 | 227 | 0 | 0 | 0 | - | 227 |
| spatial_v3_nodes | 227 | 227 | 0 | 0 | 0 | - | 0 |
| spatial_v3_world_revisions | 1 | 1 | 0 | 0 | 0 | - | 0 |
| speech_address_forms | 98 | 98 | 0 | 0 | 0 | - | 98 |
| water_body_presence_facets | 1754 | 1907 | 153 | 0 | 0 | - | 1754 |

presence_rules.region_id old: novgorod_land=4222, None=1469, region_novgorod_land=17, ladoga_lake=9
presence_rules.region_id new: region_novgorod_land=4266, None=1474
presence_rules removed sample: [('pr_00147171fd4e8946', 1), ('pr_003b85b99f85626a', 1), ('pr_0040b9c3c0372241', 1)]
presence_rules added sample: [('pr_00069f572eb29f55', 1), ('pr_0011a55410500dc6', 1), ('pr_0023d78be6a81b5d', 1)]
presence_rules pairing (same content, id/region/provenance ignored):
  removed+added pairs: 4194; unpaired removed (rule gone): 37; unpaired added (new rule): 60
  region novgorod_land -> region_novgorod_land: 4185
  region ladoga_lake -> region_novgorod_land: 9
  unpaired removed by (subject_kind, scope_kind): ('category', 'place_family')=37
  unpaired removed top scope_ref: pf_floodplain_meadow=7, pf_hunting_ground=6, pf_forest_edge=5, pf_marshy_stream=4, pf_mixed_woodland=3
  unpaired added by (subject_kind, scope_kind): ('category', 'place_family')=60
  unpaired added top scope_ref: pf_floodplain_meadow=6, pf_outbuildings=5, pf_forest_edge=5, pf_hunting_ground=5, pf_market_square=4

## Отсев `environment` (1236 правил)
game-base lw-env (#176, коммит 25ea56d4 — после старого пина) добавил 1236 строк `presence_rules.csv` с `subject_kind='environment'` («спутники окружения»). Такого вида нет в §3A.1 (`category | social_role | occupation`), в DDL `world_base.presence_rules` (`27.sql:53` CHECK) и в движке R-2a. Они **не импортируются в v17** (данные остаются в game-base; подключение — отдельным CR: §3A.1 + DDL + движок). Итог: в датасете 5740 правил = 6976 строк CSV − 1236 (генератор возвращает счётчик; тест на пине 27bd6134 проверяет 1236 и равенство `rules + excluded = CSV`).

## Объяснения изменений `presence_rules`
- **9 правил `ladoga_lake → region_novgorod_land`.** Все 9 — `fauna.mammal.marine_mammal.ladoga_ringed_seal` на `pf_hunting_ground` (4), `pf_lake_shore` (4), `pf_winter_ice_crossing` (1). Регион `ladoga_lake` заменён коммитом 88555d24 (#189 «rebuild region ids», единый G0-id `region_novgorod_land`; в CSV после него регионы только `region_novgorod_land` и пусто). Специфика озера теперь держится только `subject_ref` (ладожская нерпа) и типом места (PF озера/охоты/ледовой переправы), регионального сужения к Ладоге больше нет.
- **37 исчезнувших правил** = 10 + 27:
  - **10** — `fauna.bird.waterfowl.mallard` (по одному на PF) убраны коммитом 4c0b90e3 «Constrain appearance by sex and age and contextual fauna visibility»;
  - **27** — не удаление, а переклассификация частоты (id правила — хеш содержимого, поэтому «новая версия» = старый id исчезает, новый появляется): `redwing` 18, `common_rosefinch` 8, `mole` 1; в CSV `frequency_class` сдвинут (redwing: common→contextual, contextual→rare; вероятность 500000→250000→125000 ppm; rosefinch 500000→250000 и 250000→125000; у mole одна строка 500000→125000), коммит 7bbdd2d2 («Expand name components, complete fish products and D40 returns (C016)»).
- **60 новых `category`-правил** = те же 27 переклассифицированных + **33** новых из a3fe91a9 («Close resource catalog follow-ups after #179 … rc-next»): `striped_field_mouse` 12, `house_mouse` 12, `common_vole` 4, `perforated_clay_vessel` 2, `clay_baking_pan` 1, `clay_latka` 1, `rectangular_clay_tray` 1 (PF: в основном `pf_outbuildings`, `pf_cellar_granary`, `pf_dwelling_interior`, `pf_grain_drying_shed_ovin`).
- **4185 правил** — чистое переименование региона `novgorod_land → region_novgorod_land` (#189); легаси-регионов в датасете больше нет (LW-077).
- Остальное из сверки: `water_body_presence_facets` +153, `fauna_phase_activity_rules` +16/−4/16 изменено (`visibility_state`, `payload` — коммит 4c0b90e3), `source_records` — только id/title/file_reference (пин); композиция (17), расписания (167), речь (98), household (139), связи (53), слоты (8), bindings (227), nodes (227), revision — содержательно без изменений.

## Проверки (детерминированные)
- generator: 16/16 (в т.ч. parity закоммиченных файлов с выводом генератора на пине `approval.source_commit`, отсев `environment`, отказ на неизвестном виде);
- approval-валидатор и unit/PG-набор волны — см. DONE.
- Как переподписать: заменить `checked_by`/`checked_at` и удалить объект `resign_required` в `approval.json`.

# Добавка D49 (people-data): пороги min_count ≥ 1 в составе D-2, пин c79852e7
Статус: **на переподпись ревьюером**. `source_commit` = `c79852e7b2119630954783a138f920752ef9f55f` (коммит ветки fleet/people-data поверх 27bd6134; меняет только `game-base-v1/places-binding` — см. VERIFICATION.md «Пороги D49»). Подпись `checked_by`/`checked_at` относится к пину 27bd6134 (метка `resign_required`).

Воспроизвести: `M2C_SOURCE_COMMIT=c79852e7b2119630954783a138f920752ef9f55f node scripts/generate-m2c-npc-wave-datasets.mjs`.

Сверка с прежней волной (детерминированно, `provenance_ref` игнорируется — он содержит пин): изменились только две таблицы, остальные 12 — только пин в `provenance_ref`.
| table | old | new | removed | added |
|---|---|---|---|---|
| place_population_composition_rules | 17 | 17 | 3 (pf_riverbank, pf_rural_yard, pf_village_lane) | 3 (те же PF с группой min=max=1) |
| presence_rules | 5740 | 5737 | 3 (`pr_3350f0641f59045e` fisher@pf_riverbank, `pr_0bc3c2be8d8a6870` householder@pf_rural_yard, `pr_b067191b1b9858d6` householder@pf_village_lane) | 0 |
| source_records | 1 | 1 | 1 | 1 (только id/title/file_reference — пин) |

Группы: `pf_riverbank.shore_worker` (рыбак, `profile_ref m2c_npc_fisher_v1`), `pf_rural_yard.householder`, `pf_village_lane.householder` (роль `nov_role_smerd_householder`, profile_ref null). Основание — решение владельца D49; confidence C. Правила присутствия тех же PF/субъектов переведены в `creation_owner=composition` (валидатор game-base запрещает дублирование). Порог действует на канонических узлах PF: pf_riverbank 70, pf_village_lane 3, pf_rural_yard 1; правило — минимум один человек **при первом входе**.
Как переподписать: как выше — заменить `checked_by`/`checked_at`, удалить `resign_required`.
