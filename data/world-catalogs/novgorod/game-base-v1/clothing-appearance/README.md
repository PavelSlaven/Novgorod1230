# Clothing, role outfits, adornment and appearance (candidate)

Group `clothing-appearance` of game-base-v1. Region: Novgorod Land around 1230. The working range is 1180–1260.
Every row has `status=candidate`. Nothing here is approved. Approval is a separate pass (AGENTS.md: the author does not approve its own data).

| Domain | Folder | Main tables |
|---|---|---|
| garments | [garments/](garments/README.md) | garments.csv, costume_disposition.csv, garment_categories.csv, region_clothing_profiles.csv, equipment_slots.csv, wear_states.csv, denylist.csv, materials_colors.csv, garment_components.csv |
| outfits_by_role | [outfits_by_role/](outfits_by_role/README.md) | outfits.csv, runtime_clothing_profiles.json, role_clothing_map.csv, foreign_origin_profiles.csv, liturgical_outfits.csv |
| adornment_appearance | [adornment_appearance/](adornment_appearance/README.md) | adornment.csv, vocabulary_extension_requests.csv |

Shared: `sources.csv`, which lists all 66 sources: costume SRC001–050, 7 web sources, the sqlite database, risovalka, WK and v17.

## Reproduce

```
python scripts/build.py   # regenerates every CSV/JSON from sources + rule tables in build.py
python scripts/check.py   # acceptance checks; prints PASS/FAIL and row counts
```

Uses only the Python stdlib. The inputs are read-only:
- `../../sources/costume-dataset-v1/data/*.csv`: 180 items, 46 combinations, 10 foreign profiles, palette, 20 anti-patterns, 50 sources. Status candidate, validation PASS.
- `data/novgorod-region/novgorod_social_roles_v1_enriched.tsv` (71 roles) and `novgorod_occupations_v1_enriched.tsv` (68 occupations).
- `check.py` reads the vocabulary from `Novgorod-runtime/packages/actors/src/index.js` (`ACTOR_BASE_APPEARANCE_VOCABULARY`). If that file is missing, it uses an embedded copy.

## Universal vs regional

`garment_categories.csv` holds the universal layer: `domain=garment`, `region_id` empty, 59 categories such as `garment.kind.tunic_shirt`.
Each row in `garments.csv` is a Novgorod instance. It has `region_id=region_novgorod_land` and a `garment_category` that points to the universal category.
`region_clothing_profiles.csv` is the regional permission layer, shaped like `world_base.region_clothing_profiles`.

## Row counts (from check.py, 2026-09-26)

| File | Rows |
|---|---|
| garments/garments.csv | 95 |
| garments/costume_disposition.csv | 180 |
| garments/garment_components.csv | 7 |
| garments/garment_categories.csv | 59 |
| garments/region_clothing_profiles.csv | 81 |
| garments/equipment_slots.csv | 32 |
| garments/wear_states.csv | 9 |
| garments/denylist.csv | 24 |
| garments/materials_colors.csv | 24 |
| outfits_by_role/outfits.csv | 111 |
| outfits_by_role/runtime_clothing_profiles.json | 14 profiles / 75 variants |
| outfits_by_role/role_clothing_map.csv | 71 |
| outfits_by_role/foreign_origin_profiles.csv | 10 |
| outfits_by_role/liturgical_outfits.csv | 3 |
| outfits_by_role/outfit_compatibility_exceptions.csv | 0 |
| adornment_appearance/adornment.csv | 35 (23 items + 12 appearance rows) |
| adornment_appearance/vocabulary_extension_requests.csv | 5 |
| sources.csv | 66 |

## Main gaps for the owner

1. **Vocabulary.** @rus/actors has no `age_category=child`, so child outfits cannot be selected at runtime. It has no marital-status selector, so women's headwear is dropped from the runtime projection. It lacks the values `hair_covered_by_headwear`, `single_braid_maiden` and `emaciated`. All of these are in `vocabulary_extension_requests.csv`.
2. **Slot categories.** Only `garment.equipment_slot.base_garment` and `outer_garment` are registered in v17. `lower_garment` and `footwear` are used in m2c data but not registered. The other slots are new. See `equipment_slots.csv`.
3. **Item templates.** Four garments reuse existing v17 templates (see `existing_runtime_template`). The rest get proposed ids `item_tpl_nov_<gm_id>_v1` that must be created at import.
4. **Visual profile vocabulary.** 38 garments need `garment.visible_fabric` and `main_visible_color` values outside the current v17 set (`visual_new_values`).
5. **Occupations.** Profiles have few allowed occupations: elite 1, destitute 1, foreign_west 1. For example, a boyar has no occupation of his own in the occupations TSV.
6. **Not done, needs the MIA 65 scan with OCR:** Izyumova (footwear) and Sedova (jewellery). The web fragment of Sedova is used only for temple rings.
