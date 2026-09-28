"""Reviewed D40 dispositions for utility exclusions outside archaeological traces."""

ARCHIVE = "sources/master-archive-v1"

# source_id, return_kind, target_owner, target_refs, basis, rule, check
RETURN_DISPOSITIONS = [
    ("boat", "owner_handoff", "transport_travel", "trv_003;trv_004;trv_006;trv_014;ct_boat_hold;cp_boat_cargo", "sourced", "лодка является транспортом, а груз остаётся у владельца контейнеров", "pass:existing_transport_and_container_ids"),
    ("cart_or_sledge", "owner_handoff", "transport_travel", "trv_022;trv_023;trv_031;trv_032;ct_cart_body;cp_cart_load", "sourced", "сани и телега являются транспортом, а груз остаётся у владельца контейнеров", "pass:existing_transport_and_container_ids"),
    ("MIL0004", "owner_handoff", "transport_travel", "ct_cart_body;ct_boat_hold;cp_cart_load;cp_boat_cargo", "analogy", "обозная укладка возвращается как груз конкретного транспорта, не как новый универсальный контейнер", "pass:period_1180_1260;no_standardized_military_crates"),
    ("MIL0006", "owner_handoff", "place_families", "issue:#176:military_camp", "analogy", "временное костровое место требует лагерной сцены, а не домашнего очага", "pass:period_1180_1260;no_metal_brazier"),
    ("MIL0009", "owner_handoff", "horse_equipment", "issue:#176:military_camp;owner:fauna", "analogy", "кол привязи допустим только при конкретной лошади и лагерном действии", "pass:period_1180_1260;wood_rope_no_modern_chain"),
    ("MIL0014", "owner_handoff", "place_families", "issue:#176:military_camp", "analogy", "статусная палатка остаётся условным временным укрытием с обязательным референсом", "pass:period_1180_1260;reference_required"),
    ("MIL0015", "existing_identity", "items_household_personal", "it_hh_turned_bowl;it_hh_hollowed_bowl", "sourced", "походное употребление переиспользует существующую деревянную миску", "pass:period_1180_1260;wooden_form"),
    ("MIL0026", "owner_handoff", "clothing_appearance", "owner:garments_adornment", "sourced", "воинский пояс передаётся владельцу одежды без создания второго предметного ID", "pass:period_1180_1260;no_late_decor"),
    ("MIL0028", "owner_handoff", "place_families", "issue:#176:military_camp", "analogy", "подвес котла допустим только в конкретной лагерной готовке", "pass:period_1180_1260;no_folding_iron_tripod"),
    ("MIL0031", "existing_identity", "craft_tools", "tl_axe_household;tl_axe_carpenter;tl_spade", "analogy", "лагерь переиспользует обычные топор и лопату, а не новый армейский комплект", "pass:period_1180_1260;no_standardized_kit"),
    ("MIL0032", "owner_handoff", "place_families", "issue:#176:military_camp", "analogy", "простой навес остаётся условным временным укрытием с обязательным референсом", "pass:period_1180_1260;reference_required"),
    ("HNT0004", "owner_handoff", "hunting", "owner:hunting_tools", "analogy", "манок требует отдельного охотничьего владельца и не тождествен музыкальной флейте", "pass:period_1180_1260;no_modern_mechanical_call"),
    ("HNT0010", "owner_handoff", "hunting_fur", "fa_m_beaver;mt_fur", "sourced", "бобровая шкура связывается с существующими владельцами зверя и меха", "pass:period_1180_1260;existing_fauna_and_material"),
    ("HNT0011", "owner_handoff", "containers_hunting", "owner:portable_cage;issue:#175", "analogy", "переносная клетка требует владельца тары и охотничьего действия", "pass:period_1180_1260;no_welded_mesh_or_spring_latch"),
    ("HNT0012", "owner_handoff", "fauna_hunting", "fa_dom_dog;ls_dog_hunting", "analogy", "поводок допустим только у фактической охотничьей собаки", "pass:period_1180_1260;no_carabiner_plastic_or_nylon"),
    ("HNT0013", "owner_handoff", "fauna_hunting", "fa_b_goshawk;fa_b_peregrine;fa_b_gyrfalcon;decision:F34;issue:#175", "analogy", "живая ловчая птица остаётся fauna identity; обучение требует отдельного решения F34/#175", "pass:period_1180_1260;reference_required;no_wild_to_trained_inference"),
    ("HNT0017", "existing_identity", "transport_travel", "trv_022;trv_023", "sourced", "промысловые ручные сани переиспользуют существующие транспортные идентичности", "pass:period_1180_1260;no_wheeled_sledge_merge"),
    ("HNT0028", "owner_handoff", "hunting_transport", "tl_ski_hunting;trv_034;issue:#176:hunting_snowshoe_form", "analogy", "плетёная лапка остаётся условной исследовательской формой, а зимнее перемещение опирается на подтверждённые новгородские лыжи: book:624953 §1314; book:624953 §1315; book:624953 §1316", "pass:confidence_D_is_not_anachronism;reference_required;no_automatic_snowshoe_form"),
]
