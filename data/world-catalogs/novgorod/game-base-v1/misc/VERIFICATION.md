# VERIFICATION — misc

- **Who:** verifier agent (independent pass, label `verify-misc`; not the collector).
- **When:** 2026-09-26.
- **What:** `misc/hazards_dangers/hazards.csv` (+ README, scripts), `misc/anachronism_denylist_lexicon/denylist.csv` (+ README, scripts), `misc/README.md`.
- **Brief:** `scratchpad/gb-retry/misc.json`; catalog conventions `game-base-v1/CATALOG.md` / `catalog.json#conventions`.

## Method

1. Collector acceptance scripts re-run: `hazards_dangers/scripts/check.mjs` → `OK: 24 rows`; `anachronism_denylist_lexicon/scripts/check.mjs` → `OK: 30 rows`.
2. Own read-only verifier script (scratch, deleted after the pass) parsed both CSVs and checked row counts, confidence mix, empty `source_refs`, duplicate ids, `pf_ids` against `places-binding/places/place_families.csv` (45 pf_id), `season_periods` against the `season_period` values that sibling groups use (`winter, spring, spring_rasputitsa, summer, autumn`), `applies_to_domains` against the 60 domain ids in `catalog.json`, the ANTI join against `sources/costume-dataset-v1/data/anti_patterns.csv` (exact text), overlap with `clothing-appearance/garments/denylist.csv`, and coverage of the catalog `anachronism` convention list.
3. **All 54 rows were read by hand (not a sample).** For every cited source:
   - all 13 distinct `wk:claim:*` ids resolved in `main:.../world-knowledge/production-v1`, and each one's `review_status`, qualifiers and ru `runtime_text` were read;
   - all 12 `tools:rus13-novgorod-regional-templates/*#id` rule ids were resolved and their texts read (status `draft`);
   - the DDL enum was read in `pr98:infra/world-base/schema/05.sql`;
   - issue #133 was read with `gh issue view`;
   - the book evidence on `servak` (read-only) was searched for facts on the collector's declared gaps.
4. world_db `world-base-postgres-1` is running. `region_risks`, `llm_context_packs` and `llm_validation_rules` each have 0 rows, which confirms the collector's statement.

## Counts (script)

| File | README says | Script | Confidence | Other |
|---|---:|---:|---|---|
| hazards.csv | 24 | 24 | B 7, C 17 | freq: common 9, contextual 12, rare 3; 0 empty source_refs; 0 dup ids |
| denylist.csv | 30 (denylist 26 + FA 3 + period_term 0) | 30 (**denylist 27** + FA 3 + period_term 0) | A 4, B 22, C 4 | 0 empty source_refs; 0 dup ids |

No quotations longer than one sentence (longest field 253 chars, a collector note). No fabricated WK/tool ids: every one resolves.

## hazards_dangers/hazards.csv — verdict: **rework** (limited, mostly mechanical)

What is right: the texts of the 10 WK-cited rows match their claims (thin ice/current, drowning, hung wood, layered snow, hay self-heating ×2, frostbite, snakebite response, boat approach). The 12 rus13tpl-cited rows match the draft rule texts, and C was correctly assigned because they are draft. `risk_type` ⊂ DDL enum. The frequency rule is stated. No anachronisms were found in the signs or avoidance texts.

Problems:
1. **Brief acceptance fails: pf and season refs do not resolve.** 22 of 25 distinct `pf_ids` (`river_reach, channel, ford, ferry_crossing, landing, winter_road_on_ice, swamp_path, hay_barn, torg, gate, any_road, any_outdoor, …`) are not ids in `place_families.csv`, although matching families exist: `pf_river_channel`, `pf_riverbank`, `pf_ferry_landing`, `pf_winter_ice_crossing`, `pf_bog`, `pf_forest_track`, `pf_road`, `pf_bridge_crossing`, `pf_market_square`, `pf_dwelling_interior`, `pf_outbuildings`, `pf_hay_meadow`, `pf_river_wharf`, `pf_town_wall_edge`, `pf_town_street`. 19 of 23 distinct `season_periods` (`early_winter, mid_winter_thaw, ice_formation, spring_flood, after_storm, heating_season, all, season_mismatch, …`) are not catalog season ids (`winter, spring, spring_rasputitsa, summer, autumn`). Event triggers such as `after_storm` or `season_mismatch` belong in a separate trigger column, not in `season_periods`. `check.mjs` does not test either rule, which is why it passes.
2. **Wrong attribution, `hz_smoky_house_fire`:** the row cites `claim:macro-b20-heated-pitch-is-a-burn-and-fume-exposure-hazard…`, which is about heated pitch, not a smoky hut. Better sources already exist in the project: WK `claim:practical-dwelling-smoke-draft` and `claim:macro-b1819-smoke-or-ash-can-irritate-eyes-and-supports-clean-air-and-rinsing-response`, plus verified book evidence `book:709382 §Новгородские постройки ¶258` (Засурцев, «Новгород, открытый археологами»: топка по-чёрному, дым через волоковое окно) and `book:439294 §Глава 13 ¶588` (Беловинский, «Изба и хоромы», 2012: лучина, топка по-чёрному, бани и овины as fire sources). This is the exact Засурцев source the README calls missing, so the row can move C→B. Typo in `name_ru`: «Курная избы».
3. **Frequency basis mislabelled:** `hz_frostbite` and `hz_night_gate_closed` are `common`, but their basis string is the water one ("32 G4 river reaches/channels/shoals/landings"). The README rule for them is "acts almost all year (night, closed gates)", or winter-wide for frostbite. The in-row basis must state the rule that actually applies.
4. **Enum used as a source:** `hz_road_thieves` and `hz_brawl_violence` cite only `world_base.region_risks#risk_type_enum:*`. The enum only proves that the category exists; it gives no basis for the signs, avoidance or consequences. The `hz_road_thieves` note reads "Denylist enum-based", which looks like a copy slip. Candidate sources include the WK Пространная Правда claims (e.g. art. 23 on blood/bruises and witnesses, for the brawl consequences) and the book evidence in `social-strata-law.csv` (разбойник / поток и разграбление). Also usable: `route_season_modifiers#risk_escalate_alarm`, whose condition names разбой.
5. **Declared gaps that are not gaps:** bear/wolf (`gap:no_wk_or_master_encounter_rate_source`). There is still no encounter-rate source, so keeping `rare` as a stated editorial floor is acceptable. But presence and signs have sources: WK `claim:fauna-mammals-brown-bear-*` / `claim:fauna-mammals-wolf-*`, and book evidence `fauna-mammals-birds.csv`: Руковский, «Следы зверей» (`book:343305 §Волк ¶1–13`, `§Бурый медведь ¶120–127`, e.g. bears digging up anthills as a sign); `book:709382 §О чем говорят находки ¶535` (bear bones on Novgorod estates); `book:185148 ¶247` (bears in Novgorod land declined only by the XVII c.). The row sign «поваленный улей» is unsourced, and «разрытые муравейники» is the sourced alternative. Ice rows can also add `book:694952 ¶140` (зимник по Ильменю — полыньи, conf C) and `book:518606 §Глава первая ¶259` (ледоход 1143 took out Volkhov bridge piers) for `hz_river_ice_breakup`.
6. **Confidence overstated on details:** `hz_venomous_snakebite` is B, but its `visible_signs` (two puncture marks, fast local swelling) are not in the cited claim, which only covers the response. Either lower the signs to C with a note, or cite a source for them.
7. Weak fit, acceptable at C: `hz_quagmire_bog` cites `lost_rule_forest_swamp`, which is about getting lost without a guide and does not mention quagmire, so the quagmire signs (moss over open water, гать) are the author's own. `hz_river_ice_breakup` cites `lost_rule_water_change` (паводок/ледостав/оттепель), which does not say ледоход.
8. `consequence_refs` namespaces (`health_body:*`, `item_consequences:*`, `law_consequences:*`, …) are free strings and are not checked against the ids of the `health_body` domain in transport-health-recreation. Flag for the cross-group join.

Fix scope: remap pf/season ids to catalog ids and add those checks to `check.mjs`; re-source 4–5 rows (items 2, 4, 5, 6); fix the basis strings (item 3). The hazard content itself stays.

## anachronism_denylist_lexicon/denylist.csv — verdict: **rework**

What is right: the 20 ANTI rows copy `why_wrong`/`replacement` exactly (0 mismatches). The steam engine and motor rows match approved WK claims with `hard_exclusion.basis_kind=introduced_after_context`. The 4 gap rows (gunpowder, minute-hand clock, fork, glass windows) are honestly marked C with a `gap:` note, and none are fabricated. The historical-figures forbidden assumption is supported by the owner decisions in issue #133 (code rejects biographies with historical persons not in the saved world or WK; the LLM does not invent names). The `persons_1230 14` figure matches sweep-d4.

Problems:
1. **Wrong status attribution:** the README, the build note and every one of the 20 imported rows call `costume anti_patterns.csv` "approved". `sources/README.md` lists `costume-dataset-v1` as **candidate (not approved)**, and the brief also says «кандидат». The 20 rows therefore have no approved basis and no per-row citation, since `anti_patterns.csv` has no source column. Blanket B is not justified: it should be C, or B only where a row is re-sourced (e.g. clothing book evidence, `clothing-appearance.csv`).
2. **Duplicate owner:** `clothing-appearance/garments/denylist.csv` already carries the same 20 ANTI001–020 rows, with match `pattern` and `scope` columns. `nature-materials-weather/_shared/anachronism_denylist.json` holds a group denylist that is explicitly "to be merged into the proposed shared domain anachronism_denylist_lexicon". misc re-imports the costume rows but merges neither sibling list. One owner per list is required: either misc references the garments rows or the rows move here, not both.
3. **Brief and catalog coverage missing:** the brief lists «табак» explicitly, and the catalog `anachronism` convention lists картофель, кукуруза, томат, подсолнечник, табак, индейка, кролик как скот, тяжеловозы, чай, кофе, сахар-песок, огнестрел. The script found **подсолнечник, табак, индейка, кролик, тяжеловозы, чай, кофе, сахар** missing from every column, and кукуруза/томат present only inside one forbidden_assumption, not as denylist terms. The sibling list also adds regional-absent taxa (ондатра, енотовидная собака, американская норка, борщевик Сосновского, элодея, сирень, конский каштан, лиственница/пихта C). The collector's gap list does not mention this shortfall.
4. **Not machine-usable for its main consumer:** `term_ru` is a descriptive phrase (e.g. «Позднемосковский кафтан XVI–XVII вв.»), and there is no match-pattern column. The brief's acceptance test ("проверка по всем доменам даёт 0 совпадений") cannot be run from this file. The garments list (`pattern`) and the nature list (prefix terms) already show the needed shape.
5. **Invalid `applies_to_domains`:** 7 of 14 distinct values are not catalog domain ids: `clothing_appearance` (a group, not a domain; should be garments / outfits_by_role / adornment_appearance), `food_drink`, `flora_herbs_berries_mushrooms`, `items_weapons_armour`, `time_calendar_church`, `items_household_personal`, `names_peoples`. 26 of 30 rows carry at least one invalid id.
6. **Confidence overstated:** `an_potato` is A, but the WK claim is `confidence: medium, directness: editorial`. In the catalog convention, A means primary/archaeological, so this should be B. Its `earliest_attestation_or_basis` («в России — не ранее XVII–XVIII вв.») and the South-America gloss are not in the claim and are unsourced. `fa_no_potato_tomato_maize` is B, but tomato and maize have no source (C with note).
7. **Anachronism risk inside replacements:** `an_steam_engine` suggests «ветряной привод» and «водяной (наливное колесо)» as 1230 replacements. No project source supports windmills in Novgorod around 1230 (none in WK; windmills in Rus are generally dated much later), and the overshot wheel type is not sourced either. Remove the windmill, or mark it C with a source. `an_mechanical_clock_minutes` already makes the hourglass/water-clock replacement conditional, which is acceptable.
8. **A declared gap that is not a gap:** `an_glass_window_ordinary_house` says no project source exists, but verified book evidence has one: `book:622242 §Глава четвертая Сооружения > Архитектура ¶1210` (Рыбаков, Даркевич, «Древняя Русь. Город, замок, село», 1985: round glass in wooden window frames and mica in *rich* buildings), and `book:423821 ¶1601` / `book:709382 ¶258` (peasant and urban houses heated по-чёрному with a small smoke window). This supports the row's scope ("ordinary house") and moves it to B. Mica is attested for rich buildings, not as a general replacement. Checks in items-weapons-armour book evidence found no gunpowder dating row, so the gunpowder row remains a real gap.
9. **README count:** it says `denylist (26)`, but the script counts 27 `denylist` rows.
10. `period_term` has 0 rows, which the collector declared honestly; one of the three brief parts is still undelivered.

Fix scope: correct the status and confidence of the ANTI rows; decide on the owner vs garments and nature lists, then merge; add the missing catalog terms with basis; add a `match_pattern` column; map `applies_to_domains` to catalog ids; fix the potato confidence; drop the windmill; re-source the glass row from book evidence; fix the README count; add the checks for domain ids and catalog-term coverage to `check.mjs`.

## READMEs and scripts

- `misc/README.md`: accurate index. Its gap list omits denylist problems 1–5 above.
- `hazards_dangers/README.md`: accurate, except that the smoky-hut and bear/wolf "no source" gaps are now closable (see above), and it claims "WK claims … все резолвятся" (true).
- `anachronism_denylist_lexicon/README.md`: "approved" status of the costume source is wrong; the denylist count is wrong (26 vs 27).
- `scripts/build.mjs` + `check.mjs`: both are deterministic and run OK. The checks are too weak: no pf/season/domain-id resolution and no catalog-term coverage.

## Not done by this pass

- Web sources for the gunpowder, fork and minute-hand clock datings were not researched; these rows remain honest C gaps.
- The `consequence_refs` ids were not joined to the `health_body` domain ids.

## Исправления 2026-09-26

Роль: fixer (misc), по заданию из этого VERIFICATION.md. Правились только `hazards_dangers/hazards.csv` (+ `build.mjs`/`check.mjs`/`README.md`), `anachronism_denylist_lexicon/denylist.csv` (+ `build.mjs`/`check.mjs`/`README.md`) и `misc/README.md`. Другие файлы не трогались. Оба `check.mjs` прогнаны после правок и показывают `OK`.

### hazards_dangers/hazards.csv (24 строки, без изменения количества)

1. **pf/season resolution (проблема 1).** `build.mjs` переписан: все `pf_ids` теперь реальные id из `places-binding/places/place_families.csv` (например `river_reach;channel;ford` → `pf_river_channel;pf_riverbank`); все `season_periods` — только из каталожного набора {winter, spring, spring_rasputitsa, summer, autumn}; событийные условия (after_storm, ice_formation, thaw, season_mismatch, alarm, night, ice_breakup, spring_flood, heating_season) вынесены в новую колонку `event_triggers`, а не смешаны с сезоном. `check.mjs` теперь резолвит оба поля против `place_families.csv` и каталожного набора сезонов (новый код, FAIL при несовпадении). Два pf (брод, склон/овраг) не имеют точного pf в `place_families.csv` — использованы ближайшие приближения с пометкой в `note` строки (`hz_ford_crossing`, `hz_snow_slope_instability`).
2. **`hz_smoky_house_fire` — неверная атрибуция (проблема 2).** Источник заменён с `claim:macro-b20-heated-pitch...` (про смолу) на `wk:claim:practical-dwelling-smoke-draft` + `claim:macro-b1819-smoke-or-ash-can-irritate-eyes-and-supports-clean-air-and-rinsing-response` + верифицированное `book:709382 §Новгородские постройки ¶258` (Засурцев); confidence C→B. Опечатка «Курная избы» → «Курная изба». `book:439294 §Глава 13 ¶588` добавлен как вспомогательная (не основная) опора с пометкой period ethnographic_late = не выше C по правилу проекта.
3. **Frequency basis (проблема 3).** `hz_frostbite` и `hz_night_gate_closed` получили собственную basis-строку («acts almost all year — night/closed gates, or winter-wide cold exposure») вместо скопированной водной строки.
4. **Enum-as-source (проблема 4).** `hz_road_thieves` убрана пометка «Denylist enum-based»; добавлен `book:641351 §РУССКАЯ ПРАВДА (ПРОСТРАННАЯ РЕДАКЦИЯ) ¶2758` (поток и разграбление разбойника). `hz_brawl_violence` добавлен `book:641351 ¶2780` (побои без свидетелей). Оба book_id и параграфы проверены на сервере (servak, read-only, social-strata-law.csv). Note: попытка использовать несуществующий WK claim id для «ст. 23 Правды» была отвергнута при собственной проверке — заменена на реальную книжную ссылку.
5. **Ложные пробелы (проблема 5).** `hz_bear_encounter`: убран несourced признак «поваленный улей», заменён на «разрытые муравейники» (`book:343305 §Бурый медведь ¶124`, Руковский) + след лапы (¶120); добавлено присутствие вида (`book:709382 ¶535`, `book:185148 ¶247`) и WK claims `fauna-mammals-brown-bear-food-driven-movement`/`-cover-rest`. `hz_wolf_encounter`: добавлены `book:343305 §Волк ¶1,4` и WK claims `fauna-mammals-wolf-pack-sociality`/`-territorial-defense`. Ставка встречи по-прежнему не найдена — `rare` остаётся редакторским минимумом (пробел не был ложным для самой частоты, только для признаков/присутствия).
6. **Overstated confidence (проблема 6).** `hz_venomous_snakebite`: confidence B→C; убран несourced признак «две точечные ранки от укуса» из `visible_signs` (цитируемый claim описывает только реакцию, не сами признаки укуса).
7. **Слабое соответствие (проблема 7).** `hz_quagmire_bog` и `hz_river_ice_breakup` оставлены на C, с явным note о слабом соответствии цитируемому правилу; для `hz_river_ice_breakup` добавлен `book:518606 §Глава первая ¶259` (ледоход 1143 г. на Волхове) как подтверждающий пример.
8. **`consequence_refs` cross-join (проблема 8).** Не тронуто в этом проходе — остаётся флагом для владельца health_body (transport-health-recreation), как и было в исходном отчёте.

### anachronism_denylist_lexicon/denylist.csv (30 → 20 строк)

1. **Неверная атрибуция статуса и владелец (проблемы 1–2).** 20 строк ANTI001–020 убраны из `build.mjs`: `costume-dataset-v1/data/anti_patterns.csv` — candidate, не approved, и владелец этих 20 анахронизмов — `clothing-appearance/garments/denylist.csv` (тот же текст, плюс `pattern`/`scope`). По правилу «один владелец на список» misc больше не дублирует эти строки; README ссылается на `garments/denylist.csv` явно.
2. **Недостающие каталожные термины (проблема 3).** Добавлены 10 новых строк: `an_maize` (кукуруза), `an_tomato` (помидор/томат), `an_sunflower` (подсолнечник), `an_tobacco` (табак), `an_turkey_bird` (индейка), `an_rabbit_livestock` (кролик как скот), `an_heavy_draft_horse` (тяжеловозы), `an_tea` (чай), `an_coffee` (кофе), `an_sugar_granulated` (сахар-песок). Кукуруза/томат используют potato-claim только по аналогии (colombian exchange) с confidence C и note про отсутствие отдельного источника; остальные 8 — `gap:no_project_bibliographic_source_yet`, confidence C, как и уже существовавшие 4 gap-строки. Огнестрел/картофель уже были покрыты.
3. **Match-pattern (проблема 4).** Добавлена колонка `match_pattern` (regex-фрагмент) для всех `kind=denylist` строк; `check.mjs` требует её непустой для этого kind.
4. **`applies_to_domains` (проблема 5).** Все значения переведены на реальные `catalog.json` domain id (например `clothing_appearance` больше не используется здесь — costume-строки убраны вовсе; `food_drink`→`food_ingredients`/`cultivated_plants`/`trade_goods_markets`; `items_weapons_armour`→`weapons_armour`; `time_calendar_church`→`calendar_feasts_fasts`; `items_household_personal`→`household_items;personal_items`; `names_peoples`→`personal_names;peoples_origins`). `check.mjs` резолвит каждое значение против `catalog.json`.
5. **Overstated confidence (проблема 6).** `an_potato`: A→B (цитируемый WK claim несёт qualifiers confidence=medium/directness=editorial — по конвенции каталога это B). `fa_no_potato_tomato_maize`: B→C (claim подтверждает только картофель; томат/кукуруза — по аналогии, без отдельного источника).
6. **Windmill risk (проблема 7).** Убран «ветряной привод» из replacement_term `an_steam_engine` (ни один источник проекта не помещает ветряные мельницы в Новгородскую землю к 1230 г.); водяное колесо оставлено без уточнения типа.
7. **Ложный пробел — стекло (проблема 8).** `an_glass_window_ordinary_house`: C→B, пересобран на `book:622242 §Глава четвертая Сооружения ¶1210` (Рыбаков, Даркевич и др., 1985) и `book:423821 ¶1601` (Рыбаков, 2013); оба book_id и параграфы проверены на сервере. Слюда указана только для богатых построек в `replacement_term`.
8. **README count (проблема 9).** README теперь берёт счёт из фактического вывода `build.mjs`/`check.mjs` (20 строк: 17 denylist + 3 forbidden_assumption), а не из руки вписанного числа.
9. **`period_term` (проблема 10).** Не сделано в этом проходе — остаётся честным пробелом (0 строк), как и раньше.

### Проверки, фактически выполненные

- `node hazards_dangers/scripts/build.mjs && node hazards_dangers/scripts/check.mjs` → `OK: 24 rows, all checks passed`.
- `node anachronism_denylist_lexicon/scripts/build.mjs && node anachronism_denylist_lexicon/scripts/check.mjs` → `OK: 20 rows, all checks passed`.
- Книжные свидетельства (book:709382, 439294, 343305, 185148, 694952→заменён на 518606, 622242, 423821, 641351) проверены построчно через `ssh servak` (read-only) на реальное существование строки/параграфа перед использованием; один изначально предполагавшийся источник («ст. 23 Правды» как WK claim) не подтвердился и был заменён на реально найденную книжную цитату (book:641351), а не оставлен как выдуманная ссылка.
- WK claim ids (`practical-dwelling-smoke-draft`, `macro-b1819-smoke-or-ash-...`, `fauna-mammals-brown-bear-*`, `fauna-mammals-wolf-*`) проверены `grep` по `world-knowledge/production-v1/*.json` на фактическое существование перед использованием.

### Что осталось нерешённым (честно, не сделано)

- `consequence_refs` cross-join с доменом `health_body` — не сделано (проблема 8), как и в исходном отчёте.
- `period_term` словарь эпохи — 0 строк, как и раньше.
- Кросс-групповая проверка denylist по всем ~60 доменам каталога — не выполнена как отдельный скрипт (вне физического доступа этого прохода к остальным группам); `match_pattern` теперь готов как вход для такого скрипта, когда он появится.
- Библиографический источник для пороха/огнестрела, часов, вилки и 8 новых catalog-term строк не найден — остаются честными C gap-строками.
- `hz_ford_crossing` и `hz_snow_slope_instability` используют приближённые (не точные) `pf_id`, поскольку `place_families.csv` не выделяет отдельный pf для брода/оврага — отмечено в `note` этих строк.

## Повторная проверка 2026-09-26

- **Кто:** независимый повторный проверяющий (старший проход; не fixer и не collector).
- **Метод:** оба `check.mjs` перезапущены (`OK: 24 rows`, `OK: 20 rows`). Отдельный read-only скрипт в scratch (удаляется после прохода) пересчитал строки и распределения, проверил резолв всех `wk:claim:*` в WK production-v1 (все 18 резолвятся, тексты новых claims прочитаны) и всех 12 id `tools:rus13-novgorod-regional-templates/*#id` (все найдены). Все 13 пар `book_id ¶para` проверены по `evidence/*.csv` на servak (read-only), найдены все 13, quote и period прочитаны. Паттерны `match_pattern` прогнаны в JS (`new RegExp(p,'i'|'iu')`) на собственном `term_ru` и на отрицательных примерах. Затем они прогнаны Unicode-корректной заменой `\w`/`\b` по 247 CSV/JSON/TSV каталога game-base-v1, без denylist-файлов и `catalog.json`. Прочитаны все 24 строки hazards и все 20 строк denylist.

### hazards_dangers/hazards.csv — новый вердикт: **approve_with_limits**

Счёт скриптом: 24 строки. Confidence: B 7, C 17. Частоты: common 9, contextual 12, rare 3. Пустых `source_refs` и дублей id нет. Используются 9 разных `event_triggers`.

| Проблема | Итог |
|---|---|
| 1 pf/season | Решена. Все `pf_ids` резолвятся в `place_families.csv`, все `season_periods` входят в каталожный набор, события вынесены в `event_triggers`. `check.mjs` теперь проверяет оба поля. |
| 2 smoky house | Решена. Оба WK claims approved. `book:709382 ¶258` (c1230, B) дословно подтверждает дым через волоковое окно. Опечатка исправлена. |
| 3 frequency basis | Решена. Basis-строка своя, не водная. Мелочь: одна общая строка на две строки таблицы («night/closed gates, or winter-wide cold»). |
| 4 enum как источник | Решена на C. `book:641351 ¶2758/¶2780` существуют (c1230, A). ¶2758 говорит об убийстве «без ссоры», то есть о разбое и потоке, а не о дорожном грабеже как таковом. На уровне C это допустимо. |
| 5 bear/wolf | Решена. «Разрытые муравейники» (¶124) и след лапы (¶120) подтверждены. `book:343305` имеет period modern_reference, это нормально для биологии следов. Кости медведя (¶535) и спад к XVII в. (`book:185148 ¶247`) подтверждены. `rare` остаётся заявленным редакторским минимумом. |
| 6 snakebite | Решена: B→C, неподтверждённый признак убран. |
| 7 weak fit | Решена: оставлено на C с note. `book:518606 ¶259` (ледоход 1143 г.) подтверждён. |
| 8 consequence_refs | Не решена. Это кросс-групповой флаг, в границах misc не исправляется. |

Оставшиеся ограничения:
- `consequence_refs` не сверены с id домена health_body.
- Для брода и склона взяты приближённые pf.
- Ставок встреч в источниках нет.
- В `hz_smoky_house_fire` уровень B держат только дым и глаза. «Огневой риск» опирается лишь на аналогию `book:439294` (ethnographic_late, по правилу не выше C) и приведён только в note. Отопление ограничено `winter`, хотя топят и весной и осенью.

### anachronism_denylist_lexicon/denylist.csv — новый вердикт: **rework** (узкий, механический)

Счёт скриптом: 20 строк (denylist 17, forbidden_assumption 3, period_term 0). Confidence: A 3, B 3, C 14. `applies_to_domains` резолвятся, покрыты все 12 каталожных терминов.

| Проблема | Итог |
|---|---|
| 1 статус ANTI | Решена: строки удалены. |
| 2 владелец | Решена частично. Для костюма владельцем назван `garments/denylist.csv` (24 строки). Вопрос с `nature-materials-weather/_shared/anachronism_denylist.json` («to be merged into … anachronism_denylist_lexicon», 28 терминов ru) не решён: список не слит, решения о владельце нет, он упомянут только как вход сканирования. Скан нашёл ещё два параллельных списка, не упомянутых в README: `crafts-tools-processes/materials_registry/late_materials_denylist.csv` (картофель, кукуруза, подсолнечник, табак, паровая машина, порох) и `buildings-interiors-containers/interiors/anti_patterns_ref.csv`. Решать, кто владелец, должен владелец каталога, это вне misc. |
| 3 покрытие | Решена. Для 10 новых строк стоит C с `gap:`, придуманных источников нет. Кукуруза и томат взяты по аналогии и честно помечены C. |
| 4 match_pattern | **Не решена по существу.** Колонка добавлена, но проект работает на JS, диалект regex не объявлен, а в JS `\w` и `\b` не видят кириллицу. Из-за этого 5 из 17 паттернов не находят даже собственный термин: `an_electric_motor`, `an_tea` (`\bчай\b`), `an_mechanical_clock_minutes`, `an_table_fork`, `an_glass_window_ordinary_house`. Если заменить `\w`/`\b` на Unicode-корректные, скан каталога даёт явные ложные срабатывания: `пушк` находит «опушка»/«опушкой» (мех и лесная опушка, 22 файла); `томат` — «автоматически» и «стоматологи»; `сахар` — «засахарившийся мёд»; `чай` — «иван-чай». Проверка брифа «0 совпадений» на этом файле провалится на законных данных. `check.mjs` проверяет только, что поле непустое. |
| 5 domains | Решена. |
| 6 confidence | Решена: potato A→B, fa B→C. Мелочь: датировка «в России — не ранее XVII–XVIII вв.» в `an_potato` по-прежнему без источника, это признано в note. |
| 7 windmill | Решена. Водяной привод имеет опору в WK (`claim:macro-b19-watermill-*`). |
| 8 glass | Решена. `book:622242 ¶1210` (c1230, B) говорит о круглом стекле и слюде в богатых постройках. `book:423821 ¶1601` имеет period medieval_general, это аналогия, но B держится на 622242. |
| 9 README count | Решена: 20 = 17 + 3. |
| 10 period_term | Не решена: 0 строк, заявлено честно. |

Что нужно сделать (только misc):
1. Объявить диалект `match_pattern` и переписать 5 паттернов Unicode-безопасно, например с флагом `u` и `\p{L}` вместо `\w`/`\b`.
2. Убрать ложные срабатывания: `пушк` с левой границей слова, без «опушк»; левая граница для `томат`/`сахар`; исключение «иван-чай» для `чай`.
3. Добавить в `check.mjs` два теста: каждый паттерн находит свой `term_ru` и не находит фиксированный список отрицательных примеров.
4. Упомянуть в README параллельные списки crafts и buildings как вход для решения владельца.

### Итог повторной проверки

| Файл | Вердикт |
|---|---|
| hazards_dangers/hazards.csv | approve_with_limits |
| anachronism_denylist_lexicon/denylist.csv | rework (match_pattern, узкий) |
