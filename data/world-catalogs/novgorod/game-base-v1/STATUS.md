# Статус проверки game-base-v1

Производная сводка по последнему verdict каждого файла в `VERIFICATION.md` групп. Данные остаются candidate; импорт в world_base требует отдельного решения.

| Группа | Статус | approve | approve_with_limits | rework |
|---|---|---:|---:|---:|
| [buildings-interiors-containers](buildings-interiors-containers/VERIFICATION.md) | approve_with_limits | 5 | 19 | 0 |
| [clothing-appearance](clothing-appearance/VERIFICATION.md) | approve_with_limits | 5 | 13 | 0 |
| [crafts-tools-processes](crafts-tools-processes/VERIFICATION.md) | approve_with_limits | 0 | 12 | 0 |
| [economy-trade-measures](economy-trade-measures/VERIFICATION.md) | rework | 1 | 7 | 1 |
| [fauna-fish-invertebrates-livestock](fauna-fish-invertebrates-livestock/VERIFICATION.md) | approve_with_limits | 4 | 14 | 0 |
| [fauna-mammals-birds](fauna-mammals-birds/VERIFICATION.md) | approve_with_limits | 0 | 7 | 0 |
| [flora-herbs-berries-mushrooms](flora-herbs-berries-mushrooms/VERIFICATION.md) | rework | 0 | 9 | 1 |
| [flora-trees-shrubs](flora-trees-shrubs/VERIFICATION.md) | rework | 8 | 5 | 1 |
| [food-drink](food-drink/VERIFICATION.md) | approve_with_limits | 8 | 8 | 0 |
| [history-events-knowledge](history-events-knowledge/VERIFICATION.md) | approve_with_limits | 1 | 5 | 0 |
| [households-psychology-speech](households-psychology-speech/VERIFICATION.md) | rework | 0 | 10 | 2 |
| [items-household-personal](items-household-personal/VERIFICATION.md) | approve_with_limits | 4 | 8 | 0 |
| [items-weapons-armour](items-weapons-armour/VERIFICATION.md) | rework | 3 | 7 | 1 |
| [misc](misc/VERIFICATION.md) | approve_with_limits | 0 | 2 | 0 |
| [names-peoples](names-peoples/VERIFICATION.md) | rework | 1 | 7 | 1 |
| [nature-materials-weather](nature-materials-weather/VERIFICATION.md) | rework | 8 | 22 | 1 |
| [occupations-activities](occupations-activities/VERIFICATION.md) | rework | 0 | 5 | 2 |
| [places-binding](places-binding/VERIFICATION.md) | rework | 4 | 21 | 1 |
| [social-strata-law](social-strata-law/VERIFICATION.md) | approve_with_limits | 0 | 9 | 0 |
| [time-calendar-church](time-calendar-church/VERIFICATION.md) | approve_with_limits | 0 | 5 | 0 |
| [transport-health-recreation](transport-health-recreation/VERIFICATION.md) | approve_with_limits | 1 | 6 | 0 |
| **Итого** | | **53** | **201** | **11** |

## Вердикты по файлам

### buildings-interiors-containers

| Файл | Последний verdict |
|---|---|
| `buildings/building_types.csv` | [approve_with_limits](buildings-interiors-containers/VERIFICATION.md#buildingsbuilding_typescsv--approve_with_limits-51) |
| `buildings/building_parts.csv` | [approve_with_limits](buildings-interiors-containers/VERIFICATION.md#buildingsbuilding_partscsv--approve_with_limits-73) |
| `buildings/building_type_parts.csv` | [approve_with_limits](buildings-interiors-containers/VERIFICATION.md#buildingsbuilding_type_partscsv--approve_with_limits-288) |
| `buildings/materials_vocab.csv` | [approve_with_limits](buildings-interiors-containers/VERIFICATION.md#buildingsmaterials_vocabcsv--approve_with_limits-41) |
| `buildings/settlement_form.csv` | [approve_with_limits](buildings-interiors-containers/VERIFICATION.md#buildingssettlement_formcsv--approve_with_limits-22) |
| `buildings/settlement_building_mix.csv` | [approve_with_limits](buildings-interiors-containers/VERIFICATION.md#buildingssettlement_building_mixcsv--approve_with_limits-112) |
| `interiors/scenes.csv` | [approve_with_limits](buildings-interiors-containers/VERIFICATION.md#interiorsscenescsv--approve_with_limits-69) |
| `interiors/scene_items.csv` | [approve](buildings-interiors-containers/VERIFICATION.md#interiorsscene_itemscsv--approve-795) |
| `interiors/furniture_fixtures_light.csv` | [approve](buildings-interiors-containers/VERIFICATION.md#interiorsfurniture_fixtures_lightcsv--approve-75) |
| `interiors/anti_patterns_ref.csv` | [approve](buildings-interiors-containers/VERIFICATION.md#interiorsanti_patterns_refcsv--approve-53) |
| `interiors/matcult_item_refs.csv` | [approve](buildings-interiors-containers/VERIFICATION.md#interiorsmatcult_item_refscsv--approve-458) |
| `containers/container_forms.csv` | [approve](buildings-interiors-containers/VERIFICATION.md#containerscontainer_formscsv--approve-55) |
| `containers/content_categories.csv` | [approve_with_limits](buildings-interiors-containers/VERIFICATION.md#containerscontent_categoriescsv--approve_with_limits-41) |
| `containers/content_profiles.csv` | [approve_with_limits](buildings-interiors-containers/VERIFICATION.md#containerscontent_profilescsv--approve_with_limits-65) |
| `containers/content_profile_entries.csv` | [approve_with_limits](buildings-interiors-containers/VERIFICATION.md#containerscontent_profile_entriescsv--approve_with_limits-152) |
| `containers/place_containers.csv` | [approve_with_limits](buildings-interiors-containers/VERIFICATION.md#containersplace_containerscsv--approve_with_limits-186) |
| `containers/item_to_container_crosswalk.csv` | [approve_with_limits](buildings-interiors-containers/VERIFICATION.md#containersitem_to_container_crosswalkcsv--approve_with_limits-87) |
| `containers/first_open_rule.json` | [approve_with_limits](buildings-interiors-containers/VERIFICATION.md#containersfirst_open_rulejson--approve_with_limits-1) |
| `landmarks/landmarks.csv` | [approve_with_limits](buildings-interiors-containers/VERIFICATION.md#landmarkslandmarkscsv--approve_with_limits-76) |
| `ambience/settlement_ambience_texts.csv` | [approve_with_limits](buildings-interiors-containers/VERIFICATION.md#ambiencesettlement_ambience_textscsv--approve_with_limits) |
| `ambience/presence_tokens.csv` | [approve_with_limits](buildings-interiors-containers/VERIFICATION.md#ambiencepresence_tokenscsv--approve_with_limits-9) |
| `ambience/g4_human_layer_binding.csv` | [approve_with_limits](buildings-interiors-containers/VERIFICATION.md#ambienceg4_human_layer_bindingcsv--approve_with_limits) |
| `sources.csv` | [approve_with_limits](buildings-interiors-containers/VERIFICATION.md#sourcescsv--approve_with_limits-44) |
| `buildings/sf_pf_crosswalk.csv` | [approve_with_limits](buildings-interiors-containers/VERIFICATION.md#buildingssf_pf_crosswalkcsv--approve_with_limits) |

### clothing-appearance

| Файл | Последний verdict |
|---|---|
| `garments/garments.csv` | [approve_with_limits](clothing-appearance/VERIFICATION.md#verdicts-by-file) |
| `garments/costume_disposition.csv` | [approve](clothing-appearance/VERIFICATION.md#verdicts-by-file) |
| `garments/garment_components.csv` | [approve_with_limits](clothing-appearance/VERIFICATION.md#verdicts-by-file) |
| `garments/garment_categories.csv` | [approve](clothing-appearance/VERIFICATION.md#verdicts-by-file) |
| `garments/region_clothing_profiles.csv` | [approve_with_limits](clothing-appearance/VERIFICATION.md#verdicts-by-file) |
| `garments/equipment_slots.csv` | [approve](clothing-appearance/VERIFICATION.md#verdicts-by-file) |
| `garments/wear_states.csv` | [approve_with_limits](clothing-appearance/VERIFICATION.md#verdicts-by-file) |
| `garments/denylist.csv` | [approve_with_limits](clothing-appearance/VERIFICATION.md#verdicts-by-file) |
| `garments/materials_colors.csv` | [approve_with_limits](clothing-appearance/VERIFICATION.md#verdicts-by-file) |
| `outfits_by_role/outfits.csv` | [approve_with_limits](clothing-appearance/VERIFICATION.md#verdicts-by-file) |
| `outfits_by_role/runtime_clothing_profiles.json` | [approve_with_limits](clothing-appearance/VERIFICATION.md#verdicts-by-file) |
| `outfits_by_role/role_clothing_map.csv` | [approve_with_limits](clothing-appearance/VERIFICATION.md#verdicts-by-file) |
| `outfits_by_role/foreign_origin_profiles.csv` | [approve](clothing-appearance/VERIFICATION.md#verdicts-by-file) |
| `outfits_by_role/liturgical_outfits.csv` | [approve](clothing-appearance/VERIFICATION.md#вердикты) |
| `outfits_by_role/outfit_compatibility_exceptions.csv` | [approve_with_limits](clothing-appearance/VERIFICATION.md#verdicts-by-file) |
| `adornment_appearance/adornment.csv` | [approve_with_limits](clothing-appearance/VERIFICATION.md#вердикты) |
| `adornment_appearance/vocabulary_extension_requests.csv` | [approve_with_limits](clothing-appearance/VERIFICATION.md#вердикты) |
| `sources.csv` | [approve_with_limits](clothing-appearance/VERIFICATION.md#verdicts-by-file) |

### crafts-tools-processes

| Файл | Последний verdict |
|---|---|
| `craft_tools_gear/tools_gear.csv` | [approve_with_limits](crafts-tools-processes/VERIFICATION.md#craft_tools_geartools_gearcsv--approve_with_limits) |
| `craft_tools_gear/occupation_tools.csv` | [approve_with_limits](crafts-tools-processes/VERIFICATION.md#craft_tools_gearoccupation_toolscsv--approve_with_limits) |
| `craft_processes/processes.csv` | [approve_with_limits](crafts-tools-processes/VERIFICATION.md#craft_processesprocessescsv--approve_with_limits) |
| `craft_processes/process_steps.csv` | [approve_with_limits](crafts-tools-processes/VERIFICATION.md#craft_processesprocess_stepscsv--approve_with_limits) |
| `craft_processes/process_products.csv` | [approve_with_limits](crafts-tools-processes/VERIFICATION.md#craft_processesprocess_productscsv--approve_with_limits) |
| `workshops/workshops.csv` | [approve_with_limits](crafts-tools-processes/VERIFICATION.md#workshopsworkshopscsv--approve_with_limits) |
| `materials_registry/materials.csv` | [approve_with_limits](crafts-tools-processes/VERIFICATION.md#materials_registrymaterialscsv--approve_with_limits) |
| `materials_registry/late_materials_denylist.csv` | [approve_with_limits](crafts-tools-processes/VERIFICATION.md#materials_registrylate_materials_denylistcsv--approve_with_limits) |
| `materials_registry/material_crosswalk.csv` | [approve_with_limits](crafts-tools-processes/VERIFICATION.md#materials_registrymaterial_crosswalkcsv--approve_with_limits) |
| `materials_registry/material_resolution.csv` | [approve_with_limits](crafts-tools-processes/VERIFICATION.md#materials_registrymaterial_resolutioncsv--approve_with_limits) |
| `sources/sources.csv` | [approve_with_limits](crafts-tools-processes/VERIFICATION.md#sourcessourcescsv--approve_with_limits) |
| `craft_tools_gear/occupation_pf_crosswalk.csv` | [approve_with_limits](crafts-tools-processes/VERIFICATION.md#craft_tools_gearoccupation_pf_crosswalkcsv--approve_with_limits-1) |

### economy-trade-measures

| Файл | Последний verdict |
|---|---|
| `currencies_measures/currency_units.csv` | [approve_with_limits](economy-trade-measures/VERIFICATION.md#currencies_measurescurrency_unitscsv--approve_with_limits) |
| `currencies_measures/measure_units.csv` | [approve_with_limits](economy-trade-measures/VERIFICATION.md#currencies_measuresmeasure_unitscsv--approve_with_limits) |
| `trade_goods_markets/trade_goods.csv` | [approve_with_limits](economy-trade-measures/VERIFICATION.md#trade_goods_marketstrade_goodscsv--approve_with_limits) |
| `trade_goods_markets/markets_practice.csv` | [rework](economy-trade-measures/VERIFICATION.md#trade_goods_marketsmarkets_practicecsv--rework-точечная) |
| `price_bands/price_bands.csv` | [approve_with_limits](economy-trade-measures/VERIFICATION.md#price_bandsprice_bandscsv--approve_with_limits) |
| `price_bands/compensation_reference.csv` | [approve_with_limits](economy-trade-measures/VERIFICATION.md#price_bandscompensation_referencecsv--approve_with_limits) |
| `services_hire_labor/services.csv` | [approve_with_limits](economy-trade-measures/VERIFICATION.md#services_hire_laborservicescsv--approve_with_limits) |
| `sources/books.csv` | [approve](economy-trade-measures/VERIFICATION.md#sourcesbookscsv--approve) |
| `trade_goods_markets/markets_practice.csv (и scripts/build_trade_goods_markets.mjs)` | [approve_with_limits](economy-trade-measures/VERIFICATION.md#trade_goods_marketsmarkets_practicecsv-и-scriptsbuild_trade_goods_marketsmjs--approve_with_limits-было-rework) |

### fauna-fish-invertebrates-livestock

| Файл | Последний verdict |
|---|---|
| `fauna/fish.csv` | [approve_with_limits](fauna-fish-invertebrates-livestock/VERIFICATION.md#3-вердикты-по-файлам) |
| `fauna/fishing_methods.csv` | [approve_with_limits](fauna-fish-invertebrates-livestock/VERIFICATION.md#3-вердикты-по-файлам) |
| `fauna/water_body_pf_crosswalk.csv` | [approve_with_limits](fauna-fish-invertebrates-livestock/VERIFICATION.md#3-вердикты-по-файлам) |
| `fauna/invertebrates_herps.csv` | [approve_with_limits](fauna-fish-invertebrates-livestock/VERIFICATION.md#3-вердикты-по-файлам) |
| `fauna/fauna_presence.csv` | [approve_with_limits](fauna-fish-invertebrates-livestock/VERIFICATION.md#3-вердикты-по-файлам) |
| `fauna/livestock_species.csv` | [approve](fauna-fish-invertebrates-livestock/VERIFICATION.md#3-вердикты-по-файлам) |
| `fauna/livestock_types.csv` | [approve_with_limits](fauna-fish-invertebrates-livestock/VERIFICATION.md#3-вердикты-по-файлам) |
| `fauna/livestock_care.csv` | [approve_with_limits](fauna-fish-invertebrates-livestock/VERIFICATION.md#3-вердикты-по-файлам) |
| `fauna/livestock_ailments.csv` | [approve_with_limits](fauna-fish-invertebrates-livestock/VERIFICATION.md#3-вердикты-по-файлам) |
| `fauna/livestock_products.csv` | [approve](fauna-fish-invertebrates-livestock/VERIFICATION.md#3-вердикты-по-файлам) |
| `fauna/livestock_identification_marks.csv` | [approve_with_limits](fauna-fish-invertebrates-livestock/VERIFICATION.md#3-вердикты-по-файлам) |
| `fauna/herd_composition.csv` | [approve_with_limits](fauna-fish-invertebrates-livestock/VERIFICATION.md#3-вердикты-по-файлам) |
| `fauna/household_type_crosswalk.csv` | [approve_with_limits](fauna-fish-invertebrates-livestock/VERIFICATION.md#3-вердикты-по-файлам) |
| `fauna/place_type_livestock.csv` | [approve_with_limits](fauna-fish-invertebrates-livestock/VERIFICATION.md#3-вердикты-по-файлам) |
| `fauna/anachronism_denylist_fauna.csv` | [approve](fauna-fish-invertebrates-livestock/VERIFICATION.md#3-вердикты-по-файлам) |
| `sources.csv` | [approve_with_limits](fauna-fish-invertebrates-livestock/VERIFICATION.md#3-вердикты-по-файлам) |
| `README.md, validation_report.json` | [approve](fauna-fish-invertebrates-livestock/VERIFICATION.md#3-вердикты-по-файлам) |
| `fauna/rpgr_pf_crosswalk.csv` | [approve_with_limits](fauna-fish-invertebrates-livestock/VERIFICATION.md#faunarpgr_pf_crosswalkcsv--approve_with_limits) |

### fauna-mammals-birds

| Файл | Последний verdict |
|---|---|
| `fauna/mammals.csv` | [approve_with_limits](fauna-mammals-birds/VERIFICATION.md#faunamammalscsv--approve_with_limits-44-rows-10-checked-in-full-against-sources-all-44-by-script) |
| `fauna/birds.csv` | [approve_with_limits](fauna-mammals-birds/VERIFICATION.md#faunabirdscsv--approve_with_limits-149-rows-16-checked-in-full-against-sources-all-149-by-script) |
| `fauna/wild_habitat_presence.csv` | [approve_with_limits](fauna-mammals-birds/VERIFICATION.md#faunawild_habitat_presencecsv--approve_with_limits-was-rework) |
| `fauna/fauna_categories.csv` | [approve_with_limits](fauna-mammals-birds/VERIFICATION.md#faunafauna_categoriescsv--approve_with_limits-was-rework) |
| `fauna/taxa_checks.csv` | [approve_with_limits](fauna-mammals-birds/VERIFICATION.md#faunataxa_checkscsv--approve_with_limits-27-rows-13-checked-against-sources) |
| `fauna/sources.csv` | [approve_with_limits](fauna-mammals-birds/VERIFICATION.md#faunasourcescsv--approve_with_limits-21-rows-12-checked-against-the-url-or-file) |
| `README.md` | [approve_with_limits](fauna-mammals-birds/VERIFICATION.md#readmemd--approve_with_limits) |

### flora-herbs-berries-mushrooms

| Файл | Последний verdict |
|---|---|
| `herbs_mosses_aquatic.csv` | [approve_with_limits](flora-herbs-berries-mushrooms/VERIFICATION.md#итог) |
| `berries_mushrooms.csv` | [approve_with_limits](flora-herbs-berries-mushrooms/VERIFICATION.md#вердикты) |
| `cultivated_plants.csv` | [approve_with_limits](flora-herbs-berries-mushrooms/VERIFICATION.md#итог) |
| `flora_habitat_presence.csv` | [approve_with_limits](flora-herbs-berries-mushrooms/VERIFICATION.md#итог) |
| `field_state_calendar.csv` | [approve_with_limits](flora-herbs-berries-mushrooms/VERIFICATION.md#вердикты) |
| `anachronism_denylist_flora.csv` | [rework](flora-herbs-berries-mushrooms/VERIFICATION.md#вердикты) |
| `sources.csv` | [approve_with_limits](flora-herbs-berries-mushrooms/VERIFICATION.md#итог) |
| `flora/berries_mushrooms.csv` | [approve_with_limits](flora-herbs-berries-mushrooms/VERIFICATION.md#вердикты) |
| `flora/field_state_calendar.csv` | [approve_with_limits](flora-herbs-berries-mushrooms/VERIFICATION.md#вердикты) |
| `flora/anachronism_denylist_flora.csv` | [approve_with_limits](flora-herbs-berries-mushrooms/VERIFICATION.md#floraanachronism_denylist_floracsv--approve_with_limits) |

### flora-trees-shrubs

| Файл | Последний verdict |
|---|---|
| `flora/trees_shrubs.csv` | [approve_with_limits](flora-trees-shrubs/VERIFICATION.md#вердикты) |
| `flora/tree_habitat_presence.csv` | [approve_with_limits](flora-trees-shrubs/VERIFICATION.md#вердикты) |
| `flora/wood_use_kolchin1968.csv` | [approve](flora-trees-shrubs/VERIFICATION.md#итог) |
| `flora/woody_denylist.csv` | [approve](flora-trees-shrubs/VERIFICATION.md#итог) |
| `flora/woody_categories.csv` | [approve](flora-trees-shrubs/VERIFICATION.md#итог) |
| `flora/landscape_template_woody_check.csv` | [approve](flora-trees-shrubs/VERIFICATION.md#итог) |
| `flora/sources.csv` | [approve_with_limits](flora-trees-shrubs/VERIFICATION.md#вердикты) |
| `tree_habitat_presence.csv` | [rework](flora-trees-shrubs/VERIFICATION.md#tree_habitat_presencecsv--rework) |
| `trees_shrubs.csv` | [approve_with_limits](flora-trees-shrubs/VERIFICATION.md#trees_shrubscsv--approve_with_limits) |
| `wood_use_kolchin1968.csv` | [approve](flora-trees-shrubs/VERIFICATION.md#wood_use_kolchin1968csv--approve) |
| `woody_denylist.csv` | [approve](flora-trees-shrubs/VERIFICATION.md#woody_denylistcsv--approve) |
| `woody_categories.csv` | [approve](flora-trees-shrubs/VERIFICATION.md#woody_categoriescsv--approve) |
| `landscape_template_woody_check.csv` | [approve](flora-trees-shrubs/VERIFICATION.md#landscape_template_woody_checkcsv--approve) |
| `sources.csv` | [approve_with_limits](flora-trees-shrubs/VERIFICATION.md#sourcescsv--approve_with_limits) |

### food-drink

| Файл | Последний verdict |
|---|---|
| `food/ingredients.csv` | [approve_with_limits](food-drink/VERIFICATION.md#вердикты-по-файлам) |
| `food/ingredient_months.csv` | [approve](food-drink/VERIFICATION.md#вердикты-по-файлам) |
| `food/taxon_refs.csv` | [approve_with_limits](food-drink/VERIFICATION.md#вердикты-по-файлам) |
| `food/household_food_stock_profiles.csv` | [approve_with_limits](food-drink/VERIFICATION.md#вердикты-по-файлам) |
| `dishes/dishes_meals.csv` | [approve_with_limits](food-drink/VERIFICATION.md#вердикты-по-файлам) |
| `dishes/recipe_steps.csv` | [approve_with_limits](food-drink/VERIFICATION.md#вердикты-по-файлам) |
| `dishes/meal_profiles.csv` | [approve](food-drink/VERIFICATION.md#вердикты-по-файлам) |
| `dishes/meal_slot_rules.csv` | [approve](food-drink/VERIFICATION.md#повторная-проверка-2026-09-26) |
| `dishes/fasting_rules.csv` | [approve](food-drink/VERIFICATION.md#вердикты-по-файлам) |
| `dishes/preservation_storage.csv` | [approve_with_limits](food-drink/VERIFICATION.md#вердикты-по-файлам) |
| `dishes/spoilage_states.csv` | [approve](food-drink/VERIFICATION.md#вердикты-по-файлам) |
| `dishes/sensory_lexicon.csv` | [approve_with_limits](food-drink/VERIFICATION.md#вердикты-по-файлам) |
| `dishes/famine_1230.csv` | [approve](food-drink/VERIFICATION.md#вердикты-по-файлам) |
| `sources.csv` | [approve](food-drink/VERIFICATION.md#вердикты-по-файлам) |
| `README.md (×3)` | [approve](food-drink/VERIFICATION.md#вердикты-по-файлам) |
| `food/household_type_pf_crosswalk.csv` | [approve_with_limits](food-drink/VERIFICATION.md#foodhousehold_type_pf_crosswalkcsv--approve_with_limits) |

### history-events-knowledge

| Файл | Последний verdict |
|---|---|
| `historical_events/events.csv` | [approve_with_limits](history-events-knowledge/VERIFICATION.md#historical_eventseventscsv--approve_with_limits) |
| `historical_events/event_phases.csv` | [approve_with_limits](history-events-knowledge/VERIFICATION.md#historical_eventsevent_phasescsv--approve_with_limits) |
| `historical_figures/figures.csv` | [approve_with_limits](history-events-knowledge/VERIFICATION.md#historical_figuresfigurescsv--approve_with_limits) |
| `knowledge_rumors/knowledge_rumors.csv` | [approve_with_limits](history-events-knowledge/VERIFICATION.md#knowledge_rumorsknowledge_rumorscsv--approve_with_limits) |
| `polities_external_relations/polities_external_relations.csv` | [approve_with_limits](history-events-knowledge/VERIFICATION.md#polities_external_relationspolities_external_relationscsv--approve_with_limits) |
| `sources/novgorod_1230_extract.json` | [approve](history-events-knowledge/VERIFICATION.md#sourcesnovgorod_1230_extractjson--approve) |

### households-psychology-speech

| Файл | Последний verdict |
|---|---|
| `household_composition_profiles.csv` | [rework](households-psychology-speech/VERIFICATION.md#household_composition_profilescsv--rework-2) |
| `marriage_inheritance_rules.csv` | [approve_with_limits](households-psychology-speech/VERIFICATION.md#marriage_inheritance_rulescsv--approve_with_limits) |
| `kinship_terms.csv` | [approve_with_limits](households-psychology-speech/VERIFICATION.md#kinship_termscsv--approve_with_limits) |
| `psychology_profiles.csv` | [rework](households-psychology-speech/VERIFICATION.md#psychology_profilescsv--rework-2) |
| `speech_registers.csv` | [approve_with_limits](households-psychology-speech/VERIFICATION.md#speech_registerscsv--approve_with_limits) |
| `address_forms.csv` | [approve_with_limits](households-psychology-speech/VERIFICATION.md#address_formscsv--approve_with_limits) |
| `norms.csv` | [approve_with_limits](households-psychology-speech/VERIFICATION.md#normscsv--approve_with_limits) |
| `households_kinship/household_composition_profiles.csv` | [approve_with_limits](households-psychology-speech/VERIFICATION.md#households_kinshiphousehold_composition_profilescsv--approve_with_limits) |
| `households_kinship/kinship_terms.csv` | [approve_with_limits](households-psychology-speech/VERIFICATION.md#повторная-проверка-2026-09-26) |
| `npc_psychology/psychology_profiles.csv` | [approve_with_limits](households-psychology-speech/VERIFICATION.md#npc_psychologypsychology_profilescsv--approve_with_limits) |
| `speech_address/speech_registers.csv` | [approve_with_limits](households-psychology-speech/VERIFICATION.md#повторная-проверка-2026-09-26) |
| `social_norms_honour_hospitality/norms.csv` | [approve_with_limits](households-psychology-speech/VERIFICATION.md#повторная-проверка-2026-09-26) |

### items-household-personal

| Файл | Последний verdict |
|---|---|
| `items/household.csv` | [approve_with_limits](items-household-personal/VERIFICATION.md#itemshouseholdcsv--approve_with_limits) |
| `items/personal.csv` | [approve_with_limits](items-household-personal/VERIFICATION.md#itemspersonalcsv--approve_with_limits) |
| `items/item_categories.csv` | [approve_with_limits](items-household-personal/VERIFICATION.md#itemsitem_categoriescsv--approve_with_limits) |
| `items/mass_policy.csv` | [approve](items-household-personal/VERIFICATION.md#itemsmass_policycsv--approve) |
| `items/condition_vocab.csv` | [approve](items-household-personal/VERIFICATION.md#itemscondition_vocabcsv--approve) |
| `items/item_place_frequency.csv` | [approve_with_limits](items-household-personal/VERIFICATION.md#itemsitem_place_frequencycsv--approve_with_limits-3) |
| `items/archetype_pf_map.csv` | [approve_with_limits](items-household-personal/VERIFICATION.md#itemsarchetype_pf_mapcsv--approve_with_limits) |
| `items/ownership_rules.csv` | [approve_with_limits](items-household-personal/VERIFICATION.md#itemsownership_rulescsv--approve_with_limits) |
| `items/recognizers.csv` | [approve](items-household-personal/VERIFICATION.md#itemsrecognizerscsv--approve) |
| `items/mark_pools.csv` | [approve_with_limits](items-household-personal/VERIFICATION.md#itemsmark_poolscsv--approve_with_limits) |
| `items/identifying_text_pools.csv` | [approve_with_limits](items-household-personal/VERIFICATION.md#itemsidentifying_text_poolscsv--approve_with_limits) |
| `reports/frequency_dropped.csv` | [approve](items-household-personal/VERIFICATION.md#reportsfrequency_droppedcsv--approve) |

### items-weapons-armour

| Файл | Последний verdict |
|---|---|
| `items/weapons_armour.csv` | [approve_with_limits](items-weapons-armour/VERIFICATION.md#itemsweapons_armourcsv--approve_with_limits) |
| `items/weapon_status_access.csv` | [rework](items-weapons-armour/VERIFICATION.md#itemsweapon_status_accesscsv--rework) |
| `items/weapon_equipment_profiles.csv` | [approve_with_limits](items-weapons-armour/VERIFICATION.md#itemsweapon_equipment_profilescsv--approve_with_limits) |
| `items/weapon_source_crosswalk.csv` | [approve_with_limits](items-weapons-armour/VERIFICATION.md#itemsweapon_source_crosswalkcsv--approve_with_limits) |
| `items/weapon_denylist.csv` | [approve_with_limits](items-weapons-armour/VERIFICATION.md#itemsweapon_denylistcsv--approve_with_limits) |
| `military/security.csv` | [approve_with_limits](items-weapons-armour/VERIFICATION.md#militarysecuritycsv--approve_with_limits) |
| `military/military_events.csv` | [approve](items-weapons-armour/VERIFICATION.md#militarymilitary_eventscsv--approve) |
| `military/combat_likelihood_by_role.csv` | [approve_with_limits](items-weapons-armour/VERIFICATION.md#militarycombat_likelihood_by_rolecsv--approve_with_limits) |
| `authoring/master_military_snapshot.csv` | [approve](items-weapons-armour/VERIFICATION.md#authoringmaster_military_snapshotcsv-master_sources_snapshotcsv--approve) |
| `master_sources_snapshot.csv` | [approve](items-weapons-armour/VERIFICATION.md#authoringmaster_military_snapshotcsv-master_sources_snapshotcsv--approve) |
| `items/role_tier_pf_crosswalk.csv` | [approve_with_limits](items-weapons-armour/VERIFICATION.md#itemsrole_tier_pf_crosswalkcsv--approve_with_limits) |

### misc

| Файл | Последний verdict |
|---|---|
| `hazards_dangers/hazards.csv` | [approve_with_limits](misc/VERIFICATION.md#итог-повторной-проверки) |
| `anachronism_denylist_lexicon/denylist.csv` | [approve_with_limits](misc/VERIFICATION.md#anachronism_denylist_lexicondenylistcsv--approve_with_limits) |

### names-peoples

| Файл | Последний verdict |
|---|---|
| `personal_names/personal_names.csv` | [approve_with_limits](names-peoples/VERIFICATION.md#personal_namespersonal_namescsv--approve_with_limits) |
| `personal_names/coverage-report.json` | [approve](names-peoples/VERIFICATION.md#personal_namescoverage-reportjson--approve) |
| `personal_names/README.md and the group README.md` | [rework](names-peoples/VERIFICATION.md#personal_namesreadmemd-and-the-group-readmemd--rework-text-errors) |
| `place_names/place_names.csv` | [approve_with_limits](names-peoples/VERIFICATION.md#place_namesplace_namescsv--approve_with_limits) |
| `peoples_origins/peoples_origins.csv` | [approve_with_limits](names-peoples/VERIFICATION.md#peoples_originspeoples_originscsv--approve_with_limits) |
| `scripts/build-peoples-origins.mjs` | [approve_with_limits](names-peoples/VERIFICATION.md#scriptsbuild-peoples-originsmjs--approve_with_limits) |
| `peoples_origins/README.md` | [approve_with_limits](names-peoples/VERIFICATION.md#peoples_originsreadmemd--approve_with_limits) |
| `personal_names/README.md` | [approve_with_limits](names-peoples/VERIFICATION.md#personal_namesreadmemd--approve_with_limits) |
| `README.md (группа)` | [approve_with_limits](names-peoples/VERIFICATION.md#readmemd-группа--approve_with_limits) |

### nature-materials-weather

| Файл | Последний verdict |
|---|---|
| `ground_types.csv` | [approve_with_limits](nature-materials-weather/VERIFICATION.md#natural_materials_soils) |
| `landscape_ground_binding.csv` | [approve](nature-materials-weather/VERIFICATION.md#natural_materials_soils) |
| `natural_materials.csv` | [approve_with_limits](nature-materials-weather/VERIFICATION.md#natural_materials_soils) |
| `material_landscape_presence.csv` | [approve_with_limits](nature-materials-weather/VERIFICATION.md#natural_materials_soils) |
| `g4_ground_and_materials.csv` | [approve_with_limits](nature-materials-weather/VERIFICATION.md#natural_materials_soils) |
| `finite_source_profiles_ext.json` | [approve_with_limits](nature-materials-weather/VERIFICATION.md#natural_materials_soils) |
| `access_tools.csv` | [approve_with_limits](nature-materials-weather/VERIFICATION.md#natural_materials_soils) |
| `climate_monthly_normals.csv` | [approve](nature-materials-weather/VERIFICATION.md#weather_climate) |
| `temperature_profile.csv` | [approve](nature-materials-weather/VERIFICATION.md#weather_climate) |
| `weather_states.csv` | [approve_with_limits](nature-materials-weather/VERIFICATION.md#weather_climate) |
| `weather_season_climatology.csv` | [approve_with_limits](nature-materials-weather/VERIFICATION.md#weather_climate) |
| `weather_transitions.csv` | [approve_with_limits](nature-materials-weather/VERIFICATION.md#weather_climate) |
| `temperature_anomalies.csv` | [approve_with_limits](nature-materials-weather/VERIFICATION.md#weather_climate) |
| `temperature_anomaly_transitions.csv` | [approve_with_limits](nature-materials-weather/VERIFICATION.md#weather_climate) |
| `weather_state_temperature_modifiers.csv` | [approve_with_limits](nature-materials-weather/VERIFICATION.md#weather_climate) |
| `precipitation_phase_and_bands.csv` | [approve_with_limits](nature-materials-weather/VERIFICATION.md#weather_climate) |
| `realized_weather_matrix.csv` | [approve_with_limits](nature-materials-weather/VERIFICATION.md#weather_climate) |
| `seasonal_phenomena.csv` | [approve_with_limits](nature-materials-weather/VERIFICATION.md#weather_climate) |
| `historical_weather_1224_1231.csv` | [approve](nature-materials-weather/VERIFICATION.md#weather_climate) |
| `light_profile_by_month.csv` | [approve](nature-materials-weather/VERIFICATION.md#weather_climate) |
| `local_landscape_modifiers.csv` | [approve_with_limits](nature-materials-weather/VERIFICATION.md#weather_climate) |
| `ground_water_condition_rules.csv` | [approve_with_limits](nature-materials-weather/VERIFICATION.md#weather_climate) |
| `weather_transition_profile_v2.candidate.json` | [approve_with_limits](nature-materials-weather/VERIFICATION.md#weather_climate) |
| `presentation_texts.csv` | [rework](nature-materials-weather/VERIFICATION.md#presentation_textscsv--rework-узкий) |
| `member_phrases.csv` | [approve_with_limits](nature-materials-weather/VERIFICATION.md#member_phrasescsv--approve_with_limits) |
| `habitat_allowlist.csv` | [approve_with_limits](nature-materials-weather/VERIFICATION.md#natural_presentation_texts) |
| `reports/denied_landscape_words.csv` | [approve](nature-materials-weather/VERIFICATION.md#natural_presentation_texts) |
| `_shared/g4_nature_index.json` | [approve](nature-materials-weather/VERIFICATION.md#_shared-reports) |
| `_shared/anachronism_denylist.json` | [approve_with_limits](nature-materials-weather/VERIFICATION.md#_shared-reports) |
| `reports/counts.json` | [approve](nature-materials-weather/VERIFICATION.md#_shared-reports) |
| `natural_presentation_texts/presentation_texts.csv` | [approve_with_limits](nature-materials-weather/VERIFICATION.md#natural_presentation_textspresentation_textscsv--approve_with_limits-2) |

### occupations-activities

| Файл | Последний verdict |
|---|---|
| `occupations/occupations_additions.csv` | [approve_with_limits](occupations-activities/VERIFICATION.md#occupationsoccupations_additionscsv--approve_with_limits) |
| `carried_inventories/carried_inventories.csv` | [approve_with_limits](occupations-activities/VERIFICATION.md#carried_inventoriescarried_inventoriescsv--approve_with_limits) |
| `activities_observable/activities_new_occupations.csv` | [approve_with_limits](occupations-activities/VERIFICATION.md#activities_observableactivities_new_occupationscsv--approve_with_limits) |
| `npc_runtime_profiles/` | [rework](occupations-activities/VERIFICATION.md#npc_runtime_profiles--rework-не-произведено) |
| `skills_competences/` | [rework](occupations-activities/VERIFICATION.md#skills_competences--rework-не-произведено) |
| `npc_runtime_profiles/npc_runtime_profiles.json` | [approve_with_limits](occupations-activities/VERIFICATION.md#npc_runtime_profilesnpc_runtime_profilesjson--approve_with_limits) |
| `skills_competences/skills_competences.json` | [approve_with_limits](occupations-activities/VERIFICATION.md#skills_competencesskills_competencesjson--approve_with_limits) |

### places-binding

| Файл | Последний verdict |
|---|---|
| `places/place_families.csv` | [approve_with_limits](places-binding/VERIFICATION.md#placesplace_familiescsv--approve_with_limits) |
| `places/place_family_facets.csv` | [approve](places-binding/VERIFICATION.md#placesplace_family_facetscsv--approve) |
| `places/crosswalk_v6_g4_location_types.csv` | [approve_with_limits](places-binding/VERIFICATION.md#placescrosswalk_v6_g4_location_typescsv--approve_with_limits) |
| `places/crosswalk_scene_templates.csv` | [approve_with_limits](places-binding/VERIFICATION.md#placescrosswalk_scene_templatescsv--approve_with_limits) |
| `places/crosswalk_master_location_archetypes.csv` | [approve](places-binding/VERIFICATION.md#placescrosswalk_master_location_archetypescsv--approve) |
| `places/node_binding.csv` | [approve_with_limits](places-binding/VERIFICATION.md#placesnode_bindingcsv--approve_with_limits) |
| `presence/frequency_rule.json` | [approve_with_limits](places-binding/VERIFICATION.md#presencefrequency_rulejson--approve_with_limits) |
| `presence/presence_rules.csv` | [approve_with_limits](places-binding/VERIFICATION.md#presencepresence_rulescsv--approve_with_limits-2) |
| `categories/place_family_categories.csv` | [approve_with_limits](places-binding/VERIFICATION.md#categoriesplace_family_categoriescsv--approve_with_limits) |
| `categories/category_registry.csv` | [approve_with_limits](places-binding/VERIFICATION.md#categoriescategory_registrycsv--approve_with_limits-1) |
| `limits/place_generation_limits.csv` | [approve_with_limits](places-binding/VERIFICATION.md#limitsplace_generation_limitscsv--approve_with_limits) |
| `limits/audit_comparison.csv` | [approve](places-binding/VERIFICATION.md#limitsaudit_comparisoncsv--approve) |
| `parameters/parameter_definitions.csv` | [approve_with_limits](places-binding/VERIFICATION.md#parametersparameter_definitionscsv--approve_with_limits) |
| `parameters/category_parameters.csv` | [approve_with_limits](places-binding/VERIFICATION.md#parameterscategory_parameterscsv--approve_with_limits) |
| `inputs/pr98-extract.json` | [approve](places-binding/VERIFICATION.md#inputspr98-extractjson--approve) |
| `reports/validation.json` | [approve_with_limits](places-binding/VERIFICATION.md#reportsvalidationjson--approve_with_limits) |
| `presence/people_presence_authoring.csv` | [approve_with_limits](places-binding/VERIFICATION.md#presencepeople_presence_authoringcsv--approve_with_limits) |
| `scripts/validate.mjs (интеграционные проверки C002)` | [approve_with_limits](places-binding/VERIFICATION.md#scriptsvalidatemjs-интеграционные-проверки-c002--approve_with_limits) |
| `scripts/validate.mjs` | [approve_with_limits](places-binding/VERIFICATION.md#scriptsvalidatemjs--approve_with_limits) |
| `slots/materialization_slot_rules.csv` | [rework](places-binding/VERIFICATION.md#slotsmaterialization_slot_rulescsv--rework) |
| `slots/no_required_slots.csv` | [approve_with_limits](places-binding/VERIFICATION.md#slotsno_required_slotscsv--approve_with_limits-1) |
| `scripts/validate.mjs (слоты C003)` | [approve_with_limits](places-binding/VERIFICATION.md#scriptsvalidatemjs-слоты-c003--approve_with_limits) |
| `presence/presence_rules.csv (перенос placement_owner_ref)` | [approve_with_limits](places-binding/VERIFICATION.md#presencepresence_rulescsv-перенос-placement_owner_ref--approve_with_limits) |
| `slots/materialization_slot_rules.csv и slots/slot_candidates.csv` | [approve_with_limits](places-binding/VERIFICATION.md#slotsmaterialization_slot_rulescsv-и-slotsslot_candidatescsv--approve_with_limits) |
| `slots/materialization_rules.json` | [approve_with_limits](places-binding/VERIFICATION.md#slotsmaterialization_rulesjson--approve_with_limits) |
| `scripts/validate.mjs (слоты C003b)` | [approve_with_limits](places-binding/VERIFICATION.md#scriptsvalidatemjs-слоты-c003b--approve_with_limits) |

### social-strata-law

| Файл | Последний verdict |
|---|---|
| `social_strata_legal_status/roles/new_role_candidates.tsv` | [approve_with_limits](social-strata-law/VERIFICATION.md#social_strata_legal_statusrolesnew_role_candidatestsv--approve_with_limits) |
| `law_justice_governance/law/offences_sanctions.csv` | [approve_with_limits](social-strata-law/VERIFICATION.md#law_justice_governancelawoffences_sanctionscsv--approve_with_limits) |
| `law_justice_governance/law/procedures.csv` | [approve_with_limits](social-strata-law/VERIFICATION.md#law_justice_governancelawprocedurescsv--approve_with_limits) |
| `law_justice_governance/law/institutions.csv` | [approve_with_limits](social-strata-law/VERIFICATION.md#law_justice_governancelawinstitutionscsv--approve_with_limits) |
| `incidents_conflicts/conflicts/incidents.csv` | [approve_with_limits](social-strata-law/VERIFICATION.md#incidents_conflictsconflictsincidentscsv--approve_with_limits) |
| `incidents_conflicts/conflicts/escalation_rules.csv` | [approve_with_limits](social-strata-law/VERIFICATION.md#incidents_conflictsconflictsescalation_rulescsv-resolution_rulescsv-status_law_effectscsv--approve_with_limits) |
| `resolution_rules.csv` | [approve_with_limits](social-strata-law/VERIFICATION.md#incidents_conflictsconflictsescalation_rulescsv-resolution_rulescsv-status_law_effectscsv--approve_with_limits) |
| `status_law_effects.csv` | [approve_with_limits](social-strata-law/VERIFICATION.md#incidents_conflictsconflictsescalation_rulescsv-resolution_rulescsv-status_law_effectscsv--approve_with_limits) |
| `README.md (группа и домены)` | [approve_with_limits](social-strata-law/VERIFICATION.md#readmemd-группа-и-домены--approve_with_limits) |

### time-calendar-church

| Файл | Последний verdict |
|---|---|
| `time/paschalia_1230_1250.json` | [approve_with_limits](time-calendar-church/VERIFICATION.md#timepaschalia_1230_1250json--approve_with_limits) |
| `time/calendar_1230_1250.csv` | [approve_with_limits](time-calendar-church/VERIFICATION.md#timecalendar_1230_1250csv--approve_with_limits) |
| `time/schedules_routines.csv` | [approve_with_limits](time-calendar-church/VERIFICATION.md#timeschedules_routinescsv--approve_with_limits) |
| `religion/church_practice.csv` | [approve_with_limits](time-calendar-church/VERIFICATION.md#religionchurch_practicecsv--approve_with_limits) |
| `religion/lifecycle_rites_burial.csv` | [approve_with_limits](time-calendar-church/VERIFICATION.md#religionlifecycle_rites_burialcsv--approve_with_limits) |

### transport-health-recreation

| Файл | Последний verdict |
|---|---|
| `sources/book_evidence_transport_health_recreation.csv` | [approve](transport-health-recreation/VERIFICATION.md#sourcesbook_evidence_transport_health_recreationcsv--approve) |
| `transport_travel/transport_entities.csv` | [approve_with_limits](transport-health-recreation/VERIFICATION.md#transport_traveltransport_entitiescsv--approve_with_limits) |
| `transport_travel/route_modes.csv` | [approve_with_limits](transport-health-recreation/VERIFICATION.md#transport_travelroute_modescsv--approve_with_limits-было-rework) |
| `health_body/health_entities.csv` | [approve_with_limits](transport-health-recreation/VERIFICATION.md#health_bodyhealth_entitiescsv--approve_with_limits) |
| `recreation_culture/recreation_entities.csv` | [approve_with_limits](transport-health-recreation/VERIFICATION.md#recreation_culturerecreation_entitiescsv--approve_with_limits) |
| `README (группа и домены)` | [approve_with_limits](transport-health-recreation/VERIFICATION.md#readme-группа-и-домены--approve_with_limits) |
| `scripts/` | [approve_with_limits](transport-health-recreation/VERIFICATION.md#scripts--approve_with_limits) |
