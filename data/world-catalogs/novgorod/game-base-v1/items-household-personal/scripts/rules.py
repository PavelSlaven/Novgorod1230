"""Stated rules (editorial, candidate) shared by frequency and ownership builders.
Every mapping here is a rule with a stated basis; nothing is a measured number."""

# WK place-first-cartography environment families used as pf_id (verbatim WK ids).
# 'reality_batch_01_open_conditions' and 'reality_first_practical_conditions' are composition overlays, not places.
PF_CLASS = {
    # settled private plots and rooms
    "town_courtyard": "settled_private", "peasant_homestead": "settled_private", "rural_yard": "settled_private",
    "dwelling_interior": "settled_private", "outbuildings": "settled_private", "cellar_granary": "settled_private",
    "bathhouse": "settled_private", "orchard_garden": "settled_private",
    # workplaces
    "smithy": "workplace_master", "ordinary_workshop": "workplace_master", "mill": "workplace_master",
    "threshing_barn": "workplace_household", "grain_drying_shed_ovin": "workplace_household",
    # church
    "church_interior": "church", "churchyard": "church", "monastery_yard": "church",
    # public urban
    "town_street": "public_street", "market_square": "public_market", "river_wharf": "public_wharf",
    "town_wall_edge": "public_authority",
    # routes and crossings
    "road": "public_route", "village_lane": "public_route", "bridge_crossing": "public_authority",
    "ferry_landing": "public_ferry",
    # worked land and camps
    "arable_field": "worked_land", "hay_meadow": "worked_land", "pasture": "worked_land",
    "field_margin": "worked_land", "fishing_camp": "worked_land",
    # wild
    "broadleaf_woodland": "wild", "conifer_woodland": "wild", "mixed_woodland": "wild", "forest_edge": "wild",
    "bog": "wild", "marshy_stream": "wild", "lake_shore": "wild", "riverbank": "wild", "river_channel": "wild",
    "floodplain_meadow": "wild", "forest_track": "wild", "hunting_ground": "wild", "winter_ice_crossing": "wild",
}
OVERLAYS = {"reality_batch_01_open_conditions", "reality_first_practical_conditions"}

# master item_location_links.location_archetype -> pf_id list (basis: WK family descriptions vs master location_name_ru).
ARCH_PF = {
    "bathhouse": ["bathhouse"], "byre": ["outbuildings"], "stable": ["outbuildings"],
    "cellar": ["cellar_granary"], "storehouse": ["cellar_granary", "outbuildings"],
    "church": ["church_interior"], "monastery": ["monastery_yard"],
    "field": ["arable_field", "orchard_garden", "threshing_barn"],
    "fishing_site": ["fishing_camp"], "forest": ["mixed_woodland", "conifer_woodland", "broadleaf_woodland", "forest_edge"],
    "forge": ["smithy"], "hearth": ["dwelling_interior"], "hunting_camp": ["hunting_ground"],
    "leather_workshop": ["ordinary_workshop"], "pottery_workshop": ["ordinary_workshop"], "workshop": ["ordinary_workshop"],
    "textile_work_area": ["dwelling_interior", "ordinary_workshop"], "pier": ["river_wharf", "ferry_landing"],
    "refuse_area": ["town_courtyard", "peasant_homestead"], "riverbank": ["riverbank", "lake_shore"],
    "road": ["road", "village_lane"], "scribe_area": ["dwelling_interior", "church_interior"],
    "street": ["town_street"], "torg": ["market_square"], "urban_house": ["dwelling_interior"],
    "poor_house": ["dwelling_interior"], "wealthy_house": ["dwelling_interior"],
    "yard": ["town_courtyard", "peasant_homestead"],
}
ARCH_DROP = {
    "boat": "vehicle/container context, not a place family (belongs to containers_contents / transport_travel)",
    "cart_or_sledge": "vehicle/container context, not a place family (belongs to containers_contents / transport_travel)",
    "military_camp": "no WK place family for military camp (gap for military_security / place_families)",
    "construction_site": "activity overlay without WK place family (gap for place_families)",
}
ARCH_NOTE = {
    "storehouse": "клеть/амбар: WK cellar_granary + outbuildings", "field": "поле, огород или ток",
    "forest": "лес: три типа леса WK + опушка", "pier": "причал/мостки: wharf + перевоз",
    "refuse_area": "край двора, мусорная яма", "scribe_area": "письмо в доме или храме",
    "textile_work_area": "домашняя или мастерская текстильная зона",
}

FREQ_WEIGHT = {"ubiquitous": 8, "common": 4, "contextual": 2, "rare": 1}
FREQ_RANK = {"rare": 0, "contextual": 1, "common": 2, "ubiquitous": 3}

# master category/subcategory -> ownership item_group
ME_GROUP = {
    "agriculture_fishing_hunting_consumables": "AG_FISH_HUNT", "bone_antler_horn_shell": "CR_MATERIAL",
    "clay_ceramic_mineral": "CR_MATERIAL", "ferrous_metal": "CR_MATERIAL", "fiber_textile_cordage": "CR_MATERIAL",
    "food_agricultural_materials": "FOOD", "glass_amber_inlay": "CR_MATERIAL", "leather_hide_fur": "CR_MATERIAL",
    "nonferrous_metal": "CR_MATERIAL", "packaging_trade_storage": "TRADE_PACKAGING",
    "refuse_deposits_environment": "REFUSE_SALVAGE", "small_household_personal": "HH_TOOLS_SMALL",
    "transport_camp_small_parts": "TRANSPORT_PARTS", "wood_bark_plant_materials": "CR_MATERIAL",
    "writing_bookmaking_religious": "PS_WRITING",
}
ME_SUB_GROUP = {
    "pottery_fragments_usewear_repairs_and_wasters": "REFUSE_SALVAGE",
    "doors_locks_chests_and_container_hardware": "HH_LOCKS",
    "nails_rivets_clamps_and_joinery_hardware": "CONSTRUCTION",
    "smithing_defects_scale_slag_and_corrosion": "CR_WASTE",
    "wire_chain_hooks_handles_and_small_mechanisms": "HH_TOOLS_SMALL",
    "cordage_rope_lashings": "HH_TOOLS_SMALL", "nets_lines_and_mesh_components": "AG_FISH_HUNT",
    "lime_mortar_plaster_and_construction_residues": "CONSTRUCTION",
    "stone_stock_abrasives_and_working_waste": "CR_MATERIAL",
    "boneworking_waste_and_archaeological_fragments": "CR_WASTE",
    "woodworking_waste_and_salvage": "CR_WASTE", "fuel_resin_tar_charcoal": "FUEL",
    "tags_tallies_marks_and_weighing_accessories": "PS_TRADE_ADMIN",
    "bandaging_care_and_body_related_materials": "HH_CARE",
    "cleaning_washing_bathing_and_hygiene_materials": "HH_CLEANING",
    "cooking_serving_and_hearth_smallware": "HH_COOKWARE",
    "fire_tinder_lighting_and_fuel_portions": "HH_FIRE_LIGHT",
    "sewing_mending_personal_carry_and_small_storage": "HH_SEWING",
    "painting_icon_and_church_consumables": "CHURCH_CONSUMABLES",
    "leather_blanks_components_and_repairs": "CR_MATERIAL",
    "sinew_gut_membrane_and_leather_waste": "CR_WASTE",
}
OCC_GROUP = {
    "agriculture": "AG_FISH_HUNT", "fishing": "AG_FISH_HUNT", "hunting": "AG_FISH_HUNT",
    "construction": "CONSTRUCTION", "crafts": "CR_TOOLS", "food": "FOOD", "household_items": "HH_TOOLS_SMALL",
    "interiors": "HH_FIRE_LIGHT", "pottery_and_vessels": "HH_COOKWARE", "trade": "TRADE_GOODS",
    "writing": "PS_WRITING", "music_and_games": "PS_PLAY", "miscellaneous": "REFUSE_SALVAGE",
    "land_transport": "TRANSPORT_PARTS", "food_system": "FOOD",
}

# default owner by pf class for context in_use_or_stored
CLASS_OWNER = {
    "settled_private": "household", "workplace_master": "master", "workplace_household": "household",
    "church": "church", "public_street": "household", "public_market": "trader", "public_wharf": "trader",
    "public_authority": "authority", "public_route": "household", "public_ferry": "master",
    "worked_land": "household", "wild": "lost_unknown",
}
CLASS_OWNER_NOTE = {
    "public_street": "вещь в употреблении у улицы относится к прилегающему двору (скамья, кадка у ворот); потерянное — lost_unknown",
    "public_route": "вещь у дороги в употреблении — двор-пользователь или путник (carried); оставленное — lost_unknown",
    "public_ferry": "перевоз: снасть и лодочные принадлежности — перевозчик как master",
    "public_authority": "городская стена/мост: общественные сооружения под властью (город, князь, тысяцкий) без именованного лица",
    "worked_land": "пашня/луг/пастбище/стан: двор-пользователь; общинное пастбище — household с оговоркой communal (v5 property_communal_resource)",
    "workplace_household": "овин/гумно — хозяйственные постройки двора",
    "wild": "в диком месте в употреблении никто не держит вещь: только lost_unknown (рукотворное) или ownerless (природное)",
}

# item_group-level overrides of the in_use_or_stored owner: (group, pf_class) -> owner_kind
GROUP_OVERRIDE = {
    ("PS_TRADE_ADMIN", "public_market"): "trader", ("PS_TRADE_ADMIN", "public_wharf"): "trader",
    ("TRADE_GOODS", "settled_private"): "household", ("TRADE_PACKAGING", "settled_private"): "household",
    ("CR_TOOLS", "settled_private"): "household", ("CR_MATERIAL", "settled_private"): "household",
    ("CR_WASTE", "public_market"): "ownerless", ("REFUSE_SALVAGE", "public_street"): "ownerless",
    ("REFUSE_SALVAGE", "public_market"): "ownerless", ("REFUSE_SALVAGE", "public_wharf"): "ownerless",
    ("REFUSE_SALVAGE", "public_route"): "ownerless", ("REFUSE_SALVAGE", "public_authority"): "ownerless",
    ("REFUSE_SALVAGE", "public_ferry"): "ownerless", ("REFUSE_SALVAGE", "worked_land"): "household",
    ("CR_WASTE", "public_street"): "ownerless", ("CR_WASTE", "public_route"): "ownerless",
    ("FOOD", "public_market"): "trader", ("FOOD", "public_wharf"): "trader",
    ("PS_RELIGIOUS", "public_market"): "trader", ("CHURCH_CONSUMABLES", "settled_private"): "household",
    ("CHURCH_CONSUMABLES", "workplace_master"): "master",
}

OWNER_META = {
    # owner_kind: holder_kind, controller_kind, access_policy, recognizers_rule, property profile (v5 id)
    "household": ("household_member", "household_head", "owner_permission_required",
                  "owner;household_members;frequent_witnesses(neighbours,regular_visitors)", "property_context_household_personal_v1"),
    "master": ("master_or_apprentice", "master", "master_permission_required",
               "owner(master);apprentices_workers;regular_customers", "property_context_craft_work_v1"),
    "trader": ("trader", "trader", "trade_exchange_or_permission",
               "owner(trader);neighbouring_traders;buyers_who_handled_item", "property_trade_stock_v1"),
    "church": ("clergy_or_warden", "church_institution", "clergy_permission_required",
               "clergy;church_warden;regular_parishioners_or_brethren", "property_religious_object_v1"),
    "authority": ("official_or_guard", "authority_institution", "official_permission_required",
                  "officials;guards;regular_users", "property_context_trade_administration_v1"),
    "lost_unknown": ("none", "none", "finder_may_take_subject_to_found_item_rules(@rus/social-law)",
                     "none_until_owner_is_committed(owner recognizes if later materialized)", ""),
    "ownerless": ("none", "none", "free_to_take_subject_to_parcel_rules",
                  "none", ""),
}
GROUP_PROPERTY = {  # refine property profile for household owner by item group
    "AG_FISH_HUNT": "property_context_fishing_v1", "FOOD": "property_context_food_trade_household_v1",
    "CR_TOOLS": "property_workshop_tool_property_v1", "PS_RELIGIOUS": "property_religious_object_v1",
    "PS_WRITING": "property_context_writing_accounting_v1", "PS_TRADE_ADMIN": "property_context_trade_administration_v1",
}

CONTEXTS = ["in_use_or_stored", "displayed_for_sale", "carried_on_person", "loose_dropped", "discarded_refuse", "natural_in_situ"]


def own_id(pf, ctx, group):
    return f"own_{pf}__{ctx}__{group.lower()}"
