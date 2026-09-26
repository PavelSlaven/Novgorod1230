# garments: clothing and footwear (candidate)

## What is here
- `garments.csv` has 95 wearable items. Of these, 92 come from the costume dataset and 3 are new: вотола, корзно and лапти (disputed).
  Fields: `gm_id`, names in Russian and English, the universal `garment_category`, `region_id` and `equipment_slot`; `usage_context` (daily, work, travel, liturgy, burial, hypothesis, disputed, ice, riding); material with `material_ids` (palette MAT001–015 plus local codes such as glass, amber, fur_ordinary, birch_bark_bast); `dye_color` with `color_ids` (COL001–008) and `dye_evidence_refs`; `decoration`; `sex`, `age`, `marital_status`, `status_band` (low, middle, high, elite) with `status_basis`; `season` with `season_basis`; `wear_states`; `mark_slots`; `runtime_daily_eligible`; `existing_runtime_template`; visual fields; `source_refs`; `confidence`; `status`.
- `costume_disposition.csv` accounts for all 180 costume items: 92 garments, 7 components, 18 moved to adornment and 63 rejected. Every rejection has a reason and a target domain: weapons_armor 40, personal_items 17, colour evidence only 2, type undetermined 1, craft_materials 1, profile marker 1, duplicate 1.
- `garment_components.csv` has 7 parts that are not equipment slots: trims GM017/GF010, buckles and fittings, straps, shoe laces.
- `garment_categories.csv` is the universal layer: 59 categories, `domain=garment`, `region_id` empty.
- `region_clothing_profiles.csv` has 81 regional permissions, one per daily-eligible garment, shaped like `world_base.region_clothing_profiles`. Its `constraints` field holds sex, age, season, status_band, marital_status and validity dates.
- `equipment_slots.csv` has 32 slots. It records `in_runtime_code` and whether the category is registered in v17.
- `wear_states.csv` has 9 states: new, serviceable, worn, patched, dirty, torn, wet, rusted, broken. Each is tied to a material class. Only `serviceable` exists in v17 today.
- `denylist.csv` has 24 patterns: the 20 costume anti-patterns plus 4 anachronisms (картофель, петлицы, трикотаж, анилин). `check.py` applies them.
- `materials_colors.csv` is the costume palette (24 rows) with dye evidence attached.

## Method (all in `scripts/build.py`)
1. Each costume subcategory is mapped to a disposition, slot, universal category and usage context through the `SUB` table.
2. Seasons are parsed from `season_scope` by regex rules (`SEASON_RULES`). With no match, the item gets all seasons and `context_only`.
   Rule S2: if a season-named combo (for example «…зимой» or «…летом») lists an item as required, that season is added. The combo is recorded in `season_basis`.
3. Status band is parsed from `social_scope` and `status_markers` (`STATUS_RULES` range rules, then `STATUS_KW` keywords).
4. Materials and colours are mapped by regex to palette ids. Colour to dye evidence comes from approved WK claims: lac red, indigo for blue and green, chrysin yellow, ellagic brown-black.
5. Approved WK production-v1 concept and claim ids are attached by item identity (`WK` table).
6. Wear states depend on material class. `mark_slots` depends on the slot and lists the visible surfaces for trim or owner marks. This is a design rule, confidence C.
7. `runtime_daily_eligible=false` for liturgy, burial, hypotheses (понёва GF013, Baltic dress FR005), disputed items (лапти), and ice or riding attachments.

## Disputed dating (researched)
- **Лапти.** Status: disputed and excluded from all outfits. Osipov (Nauka i Zhizn, 2007) reports A. V. Kurbatov's view that woven footwear appears in Novgorod city layers no earlier than the late 15th to early 16th century. Osipov doubts this and allows for under-reporting (web:WEB01). Costume ANTI005 and the sqlite note agree that lapti must not be the town norm. The row is kept, confidence C, for rural use only after the owner decides.
- **Понёва (GF013).** Status: hypothesis, C, not runtime-eligible. Savenkova (2015, web:WEB05) reconstructs how понёвы were decorated from Novgorod textile finds. The abstract gives no date, so the item is not moved to 1230 as the norm. ANTI015 (сарафан) stays in the denylist.

## Acceptance (`scripts/check.py`, PASS)
- All 180 costume items are transferred or rejected with a reason.
- Every garment has a slot from `equipment_slots.csv` and a valid season.
- The denylist has 0 hits on name, material, colour and decoration. Лапти are allowed only as the disputed row and never appear in outfits.

## Known gaps
- Женская поясная и нижняя одежда: apart from the понёва hypothesis, sources show only the long shirt plus a wool over-layer. No lower garment for women is attested.
- Visual snapshot values outside the v17 vocabulary are listed in `visual_new_values` (38 rows).
- Izyumova (MIA 65) on footwear typology is not used. It needs OCR.
