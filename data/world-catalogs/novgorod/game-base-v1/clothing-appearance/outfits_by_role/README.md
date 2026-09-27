# outfits_by_role: NPC outfits by role, sex, age and season (candidate)

## What is here
- `role_clothing_map.csv` maps all 71 roles from `novgorod_social_roles_v1_enriched.tsv` to exactly one of 14 costume classes. Each role gets a `clothing_profile_id`, plus a note wherever the choice needed judgement.
- `outfits.csv` has 111 rows: class × sex × season group (warm = summer; cool = spring, spring_rasputitsa, autumn; cold = winter) × marital status. There is one column per slot holding a `gm_id`. `runtime_selectable` marks the 75 rows the runtime can select. The 36 non-selectable rows are 30 unmarried-female rows and 6 child rows.
- `runtime_clothing_profiles.json` has 14 profiles and 75 variants in the shape read by `approved-procedural-npc.js approvedClothing()`. Each profile carries `allowed_role_refs`, `allowed_occupation_refs` and `property_binding` (owner = holder = controller = actor, source_ref `rule_property_context_household_personal_v1`). Each variant carries `sex_categories`, all 4 adult `age_categories`, `seasons`, `required_clothing_slot_refs` and `equipment_templates`, one per slot.
- `foreign_origin_profiles.csv` holds the 10 costume foreigner profiles with links to their combos. There is no runtime selector for origin.
- `liturgical_outfits.csv` has 3 liturgy-only kits (CMB021, CMB022, CMB044).
- `outfit_compatibility_exceptions.csv` is the log of mismatches between items and variants on season, sex, status or slot. It is currently empty.

## Method
Outfits come from the costume combinations. The per-slot choices are in `KITS` in `build.py`, with the combos cited in `provenance` and `source_refs`. Where a combo does not cover a season or a slot, these stated rules apply:
- R1: season filter. An item is used only in seasons its `season` allows. The build log checks this.
- R2: the winter kit comes from the winter combo of the same status band (CMB002, 008, 011, 030, 035).
- R3: a base shirt is added where a combo lists only outer layers (WK claim `clothing-shirt-principal-garment`).
- R4: trousers are added for men where a combo omits them.
- R5: a belt is added where a combo omits it.
- R6: clergy and monastic winter layer = the common kozhukh and fur cap. Confidence C, because the costume data has no clergy winter combo.
- R7: carried items are excluded: knife, pouch, tools, ice cleats, weapons, armour, crosses. They belong to other domains.
- R8: women's headwear depends on marital status. `outfits.csv` has both variants: married gets HW006 + HW007, and HW011 in winter; unmarried gets HW010. The runtime projection drops the head slots because approvedClothing cannot select by marital status.
- Elite-band outfits accept items whose band is `high`. CMB013 and CMB027 use such items.
- Occupations: `allowed_occupation_refs` is the union of occupations whose `allowed_social_role_ids` include a role of the class.
- The destitute class uses the poor kit with `default_condition_state=patched`. Basis: sqlite social_groups «нищие, беженцы, голодающие» (A, НПЛ 1230) and risovalka §1 Б.

## Acceptance (`scripts/check.py`, PASS)
- Same rule as the runtime: for each profile, sex, age and season there is at most one variant, and exactly one where the sex is supported. That is 560 combinations checked.
- Every slot has exactly one template with `physical_position=equipped`.
- owner, holder and controller are all `actor`.
- Every role maps to exactly one profile and is listed in that profile's `allowed_role_refs`.
- Every `gm_id` resolves, is daily-eligible and matches its slot. Лапти are never used.

## Known gaps
- The warrior, priest and foreign_west profiles have no female variants on purpose, so the runtime will report `PROCEDURAL_NPC_CLOTHING_DATA_GAP` for a woman in those roles.
- There is no origin selector, so Baltic, Finno-Ugric and other-Rus visitors (CMB038–043) exist only as descriptive profiles.
- No marital or child selector exists yet (see `adornment_appearance/vocabulary_extension_requests.csv`).
- `world_revision_id` is `TBD_by_import`. Proposed `item_template_ref` values must be created. Four garments reuse existing v17 templates.
- There is no rural wealthy variant: the starosta and miller get the rural kit. The church scribe is placed with the clergy (C).
- Famine 1230 has no separate outfit. It is expressed through the destitute condition state and the build weights in adornment_appearance.
