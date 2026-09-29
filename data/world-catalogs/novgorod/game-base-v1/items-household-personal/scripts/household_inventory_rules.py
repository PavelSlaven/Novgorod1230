"""Authored class-C inventory relations; all object ids belong to existing owners."""

FIRST_OPEN = "buildings-interiors-containers/containers/first_open_rule.json#d3_first_open_v1"
COMPOSITION_SOURCE = "households-psychology-speech/households_kinship/household_composition_profiles.csv"
FOOD_SOURCE = "food-drink/food/household_food_stock_profiles.csv"
HERD_SOURCE = "fauna-fish-invertebrates-livestock/fauna/herd_composition.csv"
ARCHIVE = "sources/master-archive-v1"

HOUSEHOLDS = [
    ("hh_poor_urban", "poor", "dwelling_interior", "hh_role_nov_role_householder", "0.75", "sc_scn001;sc_scn002"),
    ("hh_artisan_urban", "common_urban", "dwelling_interior", "hh_role_nov_role_craftsman_master", "1.00", "sc_scn003"),
    ("hh_rural_smerd", "rural", "peasant_homestead", "hh_role_nov_role_smerd_householder", "0.90", "sc_scn008"),
    # The food crosswalk deliberately has no dwelling PF for a fisher; do not invent one.
    ("hh_fisher", "fisher", "", "hh_role_nov_role_fisher", "0.90", ""),
    ("hh_merchant_urban", "merchant", "dwelling_interior", "hh_occ_nov_occ_long_distance_merchant", "1.50", "sc_scn004;sc_scn059"),
    ("hh_boyar_urban", "boyar", "dwelling_interior", "hh_role_nov_role_boyar", "2.00", "sc_scn005;sc_scn059"),
    ("hh_monastery", "clergy_monastery", "monastery_yard", "hh_role_nov_role_monk", "1.25", "sc_scn009;sc_scn049"),
]

HERD_PROFILE_BY_HOUSEHOLD = {
    "hh_poor_urban": "poor_household",
    "hh_artisan_urban": "craft_household",
    "hh_rural_smerd": "ordinary_household",
    "hh_fisher": "fisher_household",
    "hh_merchant_urban": "merchant_household",
    "hh_boyar_urban": "elite_household",
    "hh_monastery": "monastery_household",
}

# need, ref_kind, object_ref, requirement, quantity_norm, composition_factor,
# quantity_mode, materialization_scope, basis, derivation, source_refs
HOUSEHOLD_CORE = [
    ("water", "item", "it_hh_bucket_stave", "required", "1", "per_household", "formula", "stored", "logical_necessity", "воду нужно принести от источника", "task:D38;matcult:HOU0031"),
    ("water", "item", "it_hh_tub", "required", "1", "per_household", "formula", "stored", "logical_necessity", "запас воды нуждается в устойчивой ёмкости", "task:D38;items:it_hh_tub"),
    ("water", "item", "it_hh_kovsh", "required", "1", "per_household", "formula", "stored", "logical_necessity", "воду из общей ёмкости нужно зачерпывать", "task:D38;items:it_hh_kovsh"),
    ("cooking", "item", "it_hh_cooking_pot", "required", "1", "per_hearth", "formula", "stored", "logical_necessity", "горячая пища требует сосуда у очага", "task:D38;matcult:POT0019"),
    ("cooking", "item", "it_hh_oven_peel", "required", "1", "per_hearth", "formula", "stored", "logical_necessity", "подтверждённая печная лопата заменяет запрещённый для эпохи ухват", "task:D38;items:it_hh_oven_peel"),
    ("cooking", "item", "it_hh_frying_pan", "required", "1", "per_hearth", "formula", "stored", "logical_necessity", "жарение у очага требует сковороды", "task:D38;items:it_hh_frying_pan"),
    ("cooking", "item", "it_hh_pan_lifter", "required", "1", "per_hearth", "formula", "stored", "logical_necessity", "горячую сковороду нужно безопасно снимать", "task:D38;items:it_hh_pan_lifter"),
    ("cooking", "item", "it_hh_wooden_spoon", "required", "1", "per_eater", "formula", "stored", "logical_necessity", "каждому едоку нужна ложка", "task:D38;wk:claim:household-wooden-tableware"),
    ("cooking", "item", "it_hh_turned_bowl", "required", "1", "per_eater", "formula", "stored", "logical_necessity", "каждому едоку нужна миска", "task:D38;items:it_hh_turned_bowl"),
    ("cooking", "item", "it_hh_kitchen_knife", "required", "1", "per_household", "formula", "stored", "logical_necessity", "общая разделка пищи требует ножа", "task:D38;items:it_hh_kitchen_knife"),
    ("sleep", "matcult_item", "FUR0020", "required", "1", "per_two_sleepers", "formula", "scene", "sourced", "обычная подтверждённая форма — спальный настил; точная форма полатей не предполагается", "matcult:FUR0020"),
    ("sleep", "matcult_item", "FUR0002", "required", "1", "per_household", "formula", "scene", "sourced", "лавка служит сиденьем и частью обычной организации сна", "matcult:FUR0002;matcult_scene:SCN001"),
    ("sleep", "item", "it_hh_straw_mat", "required", "1", "per_sleeper", "formula", "stored", "logical_necessity", "настил требует подстилки на спящего", "task:D38;items:it_hh_straw_mat"),
    ("sleep", "item", "it_hh_wool_blanket", "required", "1", "per_two_sleepers", "formula", "stored", "logical_necessity", "спящим нужно укрытие; свёрнутый край обычного покрывала служит подголовьем без отдельной неподтверждённой подушки", "task:D38;items:it_hh_wool_blanket"),
    ("sleep", "master_item", "n1230:material_item:omi00528", "required", "1", "per_two_sleepers", "formula", "stored", "sourced", "овчина подтверждена как бытовой материал в жилище", "master_link:ILO003149"),
    ("light_heat", "item", "it_hh_splinter_holder_wood", "required", "1", "per_household", "formula", "scene", "logical_necessity", "лучину нужно закрепить над безопасным местом", "task:D38;items:it_hh_splinter_holder_wood"),
    ("light_heat", "item", "it_hh_splint", "required", "1", "per_household", "seasonal_stock", "stored", "logical_necessity", "вечерняя работа требует запаса лучины", "task:D38;items:it_hh_splint"),
    ("light_heat", "matcult_item", "INT0007", "required", "1", "per_heated_dwelling", "formula", "scene", "sourced", "жилые сцены прямо требуют каменно-глиняную печь", "matcult_scene:SCN001;matcult_scene:SCN002"),
    ("light_heat", "matcult_item", "MSC0046", "required", "1", "per_heated_dwelling", "seasonal_stock", "stored", "logical_necessity", "топящаяся печь требует сезонного запаса дров", "task:D38;matcult:MSC0046"),
    ("light_heat", "item", "it_hh_flint", "required", "1", "per_household", "formula", "stored", "logical_necessity", "для высекания огня нужен кремень", "task:D38;items:it_hh_flint"),
    ("light_heat", "item", "it_hh_tinder", "required", "1", "per_household", "seasonal_stock", "stored", "logical_necessity", "искра требует сухого трута", "task:D38;items:it_hh_tinder"),
    ("light_heat", "tool", "tl_firesteel", "required", "1", "per_household", "formula", "stored", "sourced", "кресало, кремень и трут образуют рабочий огнивный набор", "tools:tl_firesteel;wk:claim:ha-firesteel-ignition"),
    ("occupation_tools", "tool", "tl_axe_household", "required", "1", "per_household", "formula", "stored", "sourced", "обязательные дрова требуют хозяйственного топора для раскалывания и бытовой работы", "tools:tl_axe_household;matcult:MSC0046"),
    ("storage", "matcult_item", "FUR0006", "required", "1", "per_household", "formula", "scene", "sourced", "крупный ларь — подтверждённое основное хранение", "matcult:FUR0006"),
    ("storage", "matcult_item", "FUR0026", "required", "1", "per_household", "formula", "scene", "sourced", "сундук — подтверждённое закрытое хранение двора", "matcult:FUR0026"),
    ("storage", "matcult_item", "HOU0002", "conditional", "1", "per_locked_chest", "conditional_presence", "scene", "sourced", "железный замок появляется только на фактически запираемом сундуке", "matcult:FUR0026;matcult:HOU0002"),
    ("storage", "matcult_item", "HOU0003", "conditional", "1", "per_locked_chest", "conditional_presence", "stored", "sourced", "ключ появляется только вместе с фактически установленным замком сундука", "matcult:FUR0026;matcult:HOU0003"),
    ("storage", "item", "it_hh_bark_box", "required", "1", "per_household", "formula", "stored", "logical_necessity", "мелкие сухие вещи нужно отделять от сыпучего запаса", "task:D38;items:it_hh_bark_box"),
    ("storage", "item", "it_hh_small_cask", "required", "1", "per_household", "formula", "stored", "logical_necessity", "жидкий или квашеный запас требует малой бочки", "task:D38;items:it_hh_small_cask"),
    ("cleaning", "item", "it_hh_broom", "required", "1", "per_household", "formula", "scene", "logical_necessity", "жилое помещение и двор нужно подметать; та же обычная связка прутьев покрывает функцию печного помела без второго identity", "task:D38;items:it_hh_broom;book:624953 §114"),
    ("cleaning", "item", "it_hh_brush_wood", "required", "1", "per_household", "formula", "stored", "logical_necessity", "посуду и рабочие поверхности нужно оттирать", "task:D38;items:it_hh_brush_wood"),
    ("clothing_repair", "item", "it_hh_bone_needle", "required", "1", "per_household", "formula", "stored", "logical_necessity", "изношенная одежда требует иглы", "task:D38;items:it_hh_bone_needle"),
    ("clothing_repair", "item", "it_hh_thread_skein", "required", "1", "per_household", "seasonal_stock", "stored", "logical_necessity", "игла без нитки не чинит одежду", "task:D38;items:it_hh_thread_skein"),
    ("clothing_repair", "item", "it_hh_spindle", "required", "1", "per_spinner", "formula", "stored", "logical_necessity", "при наличии пряхи нить требует веретена", "task:D38;items:it_hh_spindle"),
    ("clothing_repair", "item", "it_hh_clay_whorl", "required", "1", "per_spindle", "formula", "stored", "logical_necessity", "веретено требует пряслица выбранной обычной формы", "task:D38;items:it_hh_clay_whorl"),
    ("clothing_repair", "item", "it_hh_distaff", "required", "1", "per_spinner", "formula", "stored", "logical_necessity", "прядение домашней нити требует прялки вместе с веретеном", "task:D38;items:it_hh_distaff"),
    ("clothing_repair", "tool", "tl_loom", "conditional", "1", "per_active_weaver", "conditional_presence", "scene", "sourced", "кросна появляются только при фактическом ткаче или мастерской", "workshop:ws_weaver_house;process:pc_weaving"),
    ("cooking", "item", "it_hh_hand_quern", "conditional", "1", "per_home_milling", "conditional_presence", "scene", "sourced", "ручные жернова появляются там, где зерно действительно мелют дома", "items:it_hh_hand_quern;wk:claim:food-practices-rye-flour-bread"),
    ("livestock_harness", "livestock_profile", "{herd_profile}", "conditional", "", "actual_herd", "delegated_profile", "delegated", "sourced", "скот берётся из существующего профиля стада, а не выдаётся каждому двору", HERD_SOURCE),
    ("livestock_harness", "transport", "trv_029", "conditional", "1", "per_work_horse", "conditional_presence", "stored", "sourced", "хомут нужен только фактически запрягаемой лошади", "transport_travel/transport_entities.csv#trv_029"),
    ("livestock_harness", "transport", "trv_028", "conditional", "1", "per_work_horse", "conditional_presence", "scene", "sourced", "оглобля относится к фактической упряжке, а не к каждому двору", "transport_travel/transport_entities.csv#trv_028"),
    ("livestock_harness", "transport", "trv_030", "conditional", "1", "per_work_horse", "conditional_presence", "stored", "sourced", "дуга относится к выбранной упряжке; сани могут обходиться без неё", "transport_travel/transport_entities.csv#trv_030"),
    ("child", "matcult_item", "FUR0001", "conditional", "1", "per_infant", "conditional_presence", "scene", "sourced", "люлька появляется только при младенце", "matcult:FUR0001"),
    ("child", "item", "it_hh_swaddling_cloth", "conditional", "1", "per_infant", "conditional_presence", "stored", "logical_necessity", "младенцу нужна пелёнка", "task:D38;items:it_hh_swaddling_cloth"),
    ("child", "item", "it_ps_toy_horse", "conditional", "1", "per_child", "conditional_presence", "stored", "logical_necessity", "при наличии ребёнка допустима одна обычная подтверждённая игрушка", "task:D38;items:it_ps_toy_horse"),
    ("ritual_church", "item", "it_ps_home_icon", "required", "1", "per_household", "formula", "scene", "logical_necessity", "домашняя молельная зона требует иконки подтверждённой формы", "task:D38;matcult:INT0005"),
    ("ritual_church", "item", "it_ps_pectoral_cross", "conditional", "1", "per_baptized_wearer", "conditional_presence", "stored", "logical_necessity", "нательный крест относится к носителю, не к безличному двору", "task:D38;items:it_ps_pectoral_cross"),
    ("ritual_church", "item", "it_hh_wax_candle", "conditional", "1", "per_ritual_need", "conditional_presence", "stored", "logical_necessity", "свеча появляется для конкретной молитвенной нужды", "task:D38;items:it_hh_wax_candle"),
    ("leisure", "item", "it_ps_knucklebone", "conditional", "1", "per_household", "conditional_presence", "stored", "logical_necessity", "простая игра возможна при свободном времени", "task:D38;items:it_ps_knucklebone"),
    ("leisure", "item", "it_ps_gusli_wing", "wealth_extra", "1", "per_household", "conditional_presence", "stored", "analogy", "музыкальный инструмент уместен не в каждом доме, а при достатке или музыканте", "matcult_scene:SCN057;items:it_ps_gusli_wing"),
    ("food_drink", "food_profile", "{household_type}", "required", "", "actual_household_members", "delegated_profile", "stored", "sourced", "при первом открытии хранилища хлеб, квас и сезонные запасы берутся join-ом по типу двора и сезону", FOOD_SOURCE),
]

RICH_EXTRAS = [
    ("light_heat", "item", "it_hh_candlestick_copper", "wealth_extra", "1", "per_household", "conditional_presence", "stored", "sourced", "медный подсвечник возможен как достаточная осветительная утварь, но не заменяет обязательный светец", "items:it_hh_candlestick_copper"),
    ("storage", "item", "it_hh_small_casket", "wealth_extra", "1", "per_household", "conditional_presence", "stored", "sourced", "небольшая шкатулка появляется только при наличии ценных мелочей", "items:it_hh_small_casket"),
    ("leisure", "item", "it_ps_chess_king", "wealth_extra", "1", "per_household", "conditional_presence", "stored", "sourced", "шахматная фигура принадлежит условному богатому игровому набору", "items:it_ps_chess_king"),
    ("leisure", "item", "it_ps_chess_pawn", "wealth_extra", "4", "per_household", "conditional_presence", "stored", "sourced", "пешки принадлежат тому же условному богатому игровому набору", "items:it_ps_chess_pawn"),
    ("leisure", "item", "it_ps_chess_rook", "wealth_extra", "1", "per_household", "conditional_presence", "stored", "sourced", "ладья принадлежит тому же условному богатому игровому набору", "items:it_ps_chess_rook"),
    ("ritual_church", "item", "it_ps_encolpion", "wealth_extra", "1", "per_eligible_wearer", "conditional_presence", "stored", "sourced", "энколпион возможен у конкретного состоятельного благочестивого владельца", "items:it_ps_encolpion"),
    ("clothing_repair", "item", "it_ps_mirror", "wealth_extra", "1", "per_household", "conditional_presence", "stored", "sourced", "металлическое зеркальце возможно в достаточном личном наборе", "items:it_ps_mirror"),
    ("clothing_repair", "item", "it_ps_razor", "conditional", "1", "per_household", "conditional_presence", "stored", "sourced", "бритва появляется у конкретного владельца, а не как обязательная вещь каждого двора", "items:it_ps_razor"),
    ("ritual_church", "item", "it_ps_stone_icon", "wealth_extra", "1", "per_household", "conditional_presence", "stored", "sourced", "каменная иконка возможна как личная святыня богатого двора", "items:it_ps_stone_icon"),
    ("ritual_church", "item", "it_ps_zmeevik", "wealth_extra", "1", "per_household", "conditional_presence", "stored", "sourced", "змеевик возможен как редкая личная подвеска, не как обязательная святыня", "items:it_ps_zmeevik"),
    ("import_luxury", "item", "it_hh_glazed_bowl_import", "wealth_extra", "1", "per_household", "conditional_presence", "stored", "sourced", "единичная привозная поливная чаша допустима в богатой кладовой", "matcult_scene:SCN059;matcult:TRD0050"),
    ("import_luxury", "garment_component", "gm_gm017", "wealth_extra", "1", "per_elite_outfit", "conditional_presence", "stored", "sourced", "шёлк представлен редкой импортной отделкой, не целым условным кафтаном", "clothing-appearance/garments/garment_components.csv#gm_gm017"),
    ("import_luxury", "food_item", "fd_wine_imported", "wealth_extra", "1", "per_attested_feast_or_liturgy", "conditional_presence", "stored", "sourced", "при первом открытии вино возможно только для конкретного пира, гостевого или литургического контекста; household food profile его не содержит", "food-drink/food/ingredients.csv#fd_wine_imported"),
    ("import_luxury", "currency", "cu_foreign_silver_coin", "contextual", "1", "per_attested_find", "conditional_presence", "stored", "sourced", "не ходячая монета 1230 года: только редкая находка, металл или остаток старого запаса", "economy-trade-measures/currencies_measures/currency_units.csv#cu_foreign_silver_coin"),
    ("import_luxury", "item", "it_hh_glass_drinking_vessel", "wealth_extra", "1", "per_attested_feast_or_liturgy", "conditional_presence", "stored", "analogy", "стеклянный сосуд — редкая привозная утварь; v2 не переносит дальнюю географию как локальное свидетельство", "book:624953 §344;book:624953 §346;book:624953 §348;book:622242 §2452"),
    ("import_luxury", "item", "it_hh_silver_feast_cup", "wealth_extra", "1", "per_attested_feast_or_liturgy", "conditional_presence", "stored", "analogy", "серебряная чаша появляется только как осторожная аналогия в статусном пиршественном контексте", "book:622242 §2450;book:301539 §1824"),
    ("import_luxury", "master_item", "n1230:material_item:fod0027", "wealth_extra", "1", "per_attested_trade_or_feast", "conditional_presence", "stored", "sourced", "редкая импортная пряность допустима только при конкретной купеческой партии или богатом пире; master research_only не становится массовым запасом", "book:301539 §925;book:203892 §13;sources/master-archive-v1/data/canonical/material_items.csv#n1230:material_item:fod0027"),
    ("import_luxury", "master_item", "n1230:material_item:frn0048", "contextual", "1", "per_attested_find", "conditional_presence", "stored", "analogy", "исключительный западный сосуд возможен лишь как отдельно установленная находка; master research_only не даёт ambient или обязательного запаса", "sources/master-archive-v1/data/canonical/material_items.csv#n1230:material_item:frn0048"),
    ("import_luxury", "master_item", "n1230:material_item:trd0002", "contextual", "1", "per_attested_find", "conditional_presence", "stored", "sourced", "ранний сребреник возможен в 1230 году только как отдельно установленная старая находка, не как ходячая монета", "sources/master-archive-v1/data/canonical/material_items.csv#n1230:material_item:trd0002"),
]

COMMON_ADORNMENTS = [
    ("personal_adornment", "adornment", "ad_new_glass_bracelet", "conditional", "1", "per_eligible_wearer", "conditional_presence", "stored", "sourced", "новгородские стеклянные браслеты местного и привозного производства доступны носителям разных достатков", "book:624953 §858;clothing-appearance/adornment_appearance/adornment.csv#ad_new_glass_bracelet"),
    ("personal_adornment", "adornment", "ad_ac020", "conditional", "1", "per_eligible_wearer", "conditional_presence", "stored", "sourced", "новгородское производство стеклянных бус и смешанные ожерелья допускают low, middle и high варианты", "book:624953 §843;clothing-appearance/adornment_appearance/adornment.csv#ad_ac020"),
]

BROAD_HOUSEHOLD_EXTRAS = [
    ("cooking", "item", "it_hh_clay_baking_pan", "conditional", "1", "per_hearth", "conditional_presence", "stored", "analogy", "глиняная сковородка — инорегиональная древнерусская форма, перенесённая условно", "book:624953 §301"),
    ("cooking", "item", "it_hh_clay_latka", "conditional", "1", "per_hearth", "conditional_presence", "stored", "analogy", "глиняная латка — инорегиональная древнерусская форма для подогревания и подачи пищи", "book:624953 §301;book:624953 §312"),
    ("cooking", "item", "it_hh_rectangular_clay_tray", "conditional", "1", "per_hearth", "conditional_presence", "stored", "analogy", "форма перенесена как осторожная аналогия из роменско-боршевских поселений VIII–X веков другого региона; применение только условное", "book:624953 §236"),
    ("cooking", "item", "it_hh_perforated_clay_vessel", "conditional", "1", "per_household", "conditional_presence", "stored", "analogy", "форма перенесена как осторожная аналогия из роменско-боршевских поселений VIII–X веков другого региона; функция не выводится автоматически", "book:624953 §236"),
    ("cooking", "item", "it_hh_kitchen_spatula", "required", "1", "per_household", "formula", "stored", "logical_necessity", f"готовящему двору нужна деревянная лопатка для работы с пищей; {ARCHIVE}/data/normalized_source_tables/material_entities/item_location_links.csv#ILO010150", "items:it_hh_kitchen_spatula"),
    ("cooking", "item", "it_hh_mortar", "conditional", "1", "per_household", "conditional_presence", "stored", "logical_necessity", f"ступа нужна только при домашнем дроблении зерна или иных продуктов; {ARCHIVE}/data/normalized_source_tables/material_entities/item_location_links.csv#ILO010200", "items:it_hh_mortar"),
    ("cooking", "item", "it_hh_sieve", "conditional", "1", "per_household", "conditional_presence", "stored", "logical_necessity", f"сито появляется при фактическом просеивании муки или зерна; {ARCHIVE}/data/canonical/material_items.csv#n1230:material_item:pot0031", "food-drink/food/recipes.csv#RCP0003"),
    ("storage", "item", "it_hh_salt_cup", "conditional", "1", "per_household", "conditional_presence", "stored", "logical_necessity", f"малая чаша нужна при отдельном хранении или подаче соли и жира; {ARCHIVE}/data/normalized_source_tables/material_entities/item_location_links.csv#ILO010205", "items:it_hh_salt_cup"),
    ("textiles", "item", "it_hh_dough_cloth", "conditional", "1", "per_feast_table", "conditional_presence", "stored", "analogy", "обычное льняное полотно может быть постелено на стол только в показанном пиршественном или гостевом контексте; отдельная поздняя скатерть не предполагается", "book:710857 §503;items:it_hh_dough_cloth"),
]

RICH_TRADE_EXTRAS = [
    ("occupation_tools", "matcult_item", "TRD0027", "wealth_extra", "1", "per_active_trade_stock", "conditional_presence", "stored", "logical_necessity", f"товарный тюк допустим только при фактическом запасе ткани купца; {ARCHIVE}/data/relations/relations.csv#ILO001887", f"{ARCHIVE}/data/canonical/material_items.csv#TRD0027"),
    ("occupation_tools", "matcult_item", "TRD0051", "wealth_extra", "1", "per_active_trade_stock", "conditional_presence", "stored", "logical_necessity", f"связка шкурок допустима только при фактической торговле мехом; {ARCHIVE}/data/relations/relations.csv#ILO003114", f"{ARCHIVE}/data/canonical/material_items.csv#TRD0051"),
    ("occupation_tools", "matcult_item", "TRD0052", "wealth_extra", "1", "per_active_trade_stock", "conditional_presence", "stored", "logical_necessity", f"тюк кожи допустим только при фактическом кожевенном товарном запасе; {ARCHIVE}/data/canonical/material_items.csv#TRD0052", "buildings-interiors-containers/containers/content_profiles.csv#cp_warehouse_bale"),
]

HOUSEHOLD_PROFILE_EXTRAS = {
    "hh_rural_smerd": [
        ("occupation_tools", "tool", ref, "required", "1", "per_household", "formula", "stored", "sourced", "орудие прямо входит в обязательный сельский рабочий комплект", f"tools:{ref}")
        for ref in ("tl_sokha", "tl_ralo", "tl_harrow", "tl_sickle", "tl_scythe_gorbusha", "tl_flail", "tl_pitchfork", "tl_rake", "tl_spade", "tl_hoe")
    ],
    "hh_fisher": [
        ("occupation_tools", "tool", ref, "required", "1", "per_active_fisher", "formula", "stored", "sourced", "орудие прямо входит в обязательный промысловый комплект рыбацкого двора", f"tools:{ref}")
        for ref in ("tl_fishhook", "tl_fishing_rod", "tl_fish_spear", "tl_net_seine")
    ],
    "hh_merchant_urban": [
        ("occupation_tools", "item", "it_ps_folding_balance", "required", "1", "per_active_trader", "formula", "stored", "sourced", "купцу нужен переносной весовой комплект", "items:it_ps_folding_balance"),
        ("occupation_tools", "item", "it_ps_weight_cubo", "conditional", "1", "per_active_trader", "conditional_presence", "stored", "sourced", "ранняя гирька допустима только в конкретном сохранившемся весовом наборе", "items:it_ps_weight_cubo"),
        ("occupation_tools", "item", "it_ps_weight_barrel", "required", "1", "per_active_trader", "formula", "stored", "sourced", "бочонковидная гирька входит в рабочий весовой комплект", "items:it_ps_weight_barrel"),
        ("occupation_tools", "item", "it_ps_weight_bag", "required", "1", "per_active_trader", "formula", "stored", "logical_necessity", "малые гири хранятся вместе в мешочке", "items:it_ps_weight_bag"),
        ("occupation_tools", "item", "it_ps_lead_plomb", "conditional", "1", "per_sealed_trade_lot", "conditional_presence", "stored", "sourced", "товарная пломба появляется только на фактически опломбированной партии", "items:it_ps_lead_plomb"),
        ("occupation_tools", "item", "it_ps_owner_tag", "conditional", "1", "per_labelled_trade_lot", "conditional_presence", "stored", "sourced", "владельческая бирка появляется только на помеченной партии", "items:it_ps_owner_tag"),
        ("occupation_tools", "item", "it_ps_bark_label", "conditional", "1", "per_labelled_trade_lot", "conditional_presence", "stored", "sourced", "берестяная товарная записка появляется только на подписанной партии", "items:it_ps_bark_label"),
    ],
    "hh_monastery": [
        ("occupation_tools", "tool", "tl_stylus", "conditional", "1", "per_literate_cell_or_church", "conditional_presence", "stored", "sourced", "писало появляется в фактически письменной келье или канцелярии", "tools:tl_stylus"),
        ("occupation_tools", "item", "it_ps_parchment", "conditional", "1", "per_literate_cell_or_church", "conditional_presence", "stored", "sourced", "пергамент появляется только при конкретной книжной или писцовой работе", "items:it_ps_parchment"),
        ("occupation_tools", "item", "it_ps_inkwell_horn", "conditional", "1", "per_literate_cell_or_church", "conditional_presence", "stored", "analogy", "роговая чернильница допустима лишь в фактически письменной келье", "items:it_ps_inkwell_horn"),
    ],
}

# D40 requires sets even where the place owner has no exact PF/scene yet. A gap is explicit,
# never repaired by inventing a place identity.
PLACE_SETS = [
    ("place_korchma", "", "", "", "1.25", "issue:#176:korchma_pf_scene_owner", "decision:D40;anti_pattern:AP014"),
    ("place_inn", "", "", "", "1.25", "issue:#176:inn_pf_scene_owner", "decision:D40;building:bt_izba_heated_single"),
    ("place_bathhouse", "bathhouse", "sc_x001_bathhouse", "", "1.00", "", "matcult_scene:SCN_X001;building:bt_bathhouse"),
    ("place_mill", "mill", "sc_scn020", "nov_occ_miller", "1.00", "issue:#176:confirm_watermill_region_1230", "matcult_scene:SCN020;building:bt_watermill"),
    ("place_wharf_hut", "river_wharf", "sc_scn007", "nov_occ_boatman;nov_occ_porter", "1.00", "issue:#176:wharf_hut_building_owner", "matcult_scene:SCN007;building:bt_wharf_vymol"),
    ("place_guardhouse", "town_wall_edge", "bt_guard_shelter", "nov_occ_gate_guard", "1.00", "issue:#176:guardhouse_interior_ownership", "matcult_scene:SCN043;matcult:FOR0007"),
    ("place_market_shop", "market_square", "sc_scn021", "nov_occ_market_stall_seller", "1.25", "", "matcult_scene:SCN021;building:bt_market_stall"),
]

PLACE_LENS_CORE = [
    ("furniture", "matcult_item", "FUR0002", "conditional", "1", "per_workplace", "conditional_presence", "scene", "sourced", "лавка — обычная неподвижная мебель и место сидения", "book:624953 §47;book:624953 §53"),
    ("storage", "item", "it_hh_bark_box", "required", "1", "per_workplace", "formula", "stored", "sourced", "берестяные коробы подтверждены как распространённая тара", "book:624953 §500"),
    ("light_heat", "item", "it_hh_splinter_holder_wood", "conditional", "1", "per_indoor_workplace", "conditional_presence", "scene", "sourced", "с XIII века лучину держал светец", "book:624953 §100"),
    ("food_drink", "food_profile", "hh_artisan_urban", "conditional", "", "actual_servings", "delegated_profile", "stored", "analogy", "еда работника или посетителя остаётся сезонным join к существующему профилю, а не новым запасом", FOOD_SOURCE),
    ("water", "item", "it_hh_bucket_stave", "required", "1", "per_workplace", "formula", "stored", "sourced", "деревянное ведро известно на Руси с IX века", "book:624953 §463"),
    ("vessels", "item", "it_hh_kovsh", "required", "1", "per_workplace", "formula", "stored", "logical_necessity", "воду или напиток из общей тары зачерпывают отдельным сосудом", "decision:D40"),
    ("occupation_tools", "item", "it_hh_rope", "conditional", "1", "per_workplace", "conditional_presence", "stored", "logical_necessity", "перенос и увязка имущества требуют верёвки только при соответствующей работе", "decision:D40"),
    ("textiles", "item", "it_hh_rag", "conditional", "1", "per_workplace", "conditional_presence", "stored", "analogy", "льняная или шерстяная ветошь переиспользует существующий текстильный предмет; источник описывает более широкий текстильный быт", "book:624953 §933"),
    ("shrines", "matcult_item", "REL0001", "conditional", "1", "per_ritual_need", "conditional_presence", "scene", "analogy", "домашняя божница допустима в жилом или служебном христианском месте; поздняя московская аналогия не переносится на баню", "book:814112 §899"),
    ("waste_traces", "matcult_item", "MSC0041", "conditional", "1", "actual_work_batches", "conditional_presence", "scene", "logical_necessity", "мусор или след появляется только из фактически совершённой работы и не является свежим обязательным предметом", "decision:D40;matcult:MSC0041"),
    ("stocks", "matcult_item", "MSC0046", "conditional", "1", "per_hearth", "conditional_presence", "stored", "logical_necessity", "колотые дрова появляются только при действующем очаге или печи", "decision:D40;matcult:MSC0046"),
]

SERVICE_CORE = PLACE_LENS_CORE + [
    ("cleaning", "item", "it_hh_broom", "required", "1", "per_workplace", "formula", "scene", "logical_necessity", "занятое место требует уборки", "decision:D40"),
]

PLACE_ROWS = {
    "place_korchma": SERVICE_CORE + [
        ("water", "item", "it_hh_tub", "required", "1", "per_workplace", "formula", "stored", "logical_necessity", "вода для подачи хранится в устойчивой ёмкости", "decision:D40"),
        ("cooking", "item", "it_hh_cooking_pot", "required", "1", "per_hearth", "formula", "stored", "logical_necessity", "показанное приготовление горячей пищи требует горшка", "decision:D40;matcult:POT0019"),
        ("cooking", "item", "it_hh_wooden_spoon", "required", "1", "per_served_eater", "formula", "stored", "logical_necessity", "подача еды требует ложки на едока", "decision:D40"),
        ("cooking", "item", "it_hh_turned_bowl", "required", "1", "per_served_eater", "formula", "stored", "logical_necessity", "подача еды требует миски на едока", "decision:D40"),
        ("food_drink", "food_profile", "hh_merchant_urban", "required", "", "actual_servings", "delegated_profile", "stored", "analogy", "сезонный ассортимент делегирован существующему купеческому пищевому профилю", FOOD_SOURCE),
        ("storage", "item", "it_hh_small_cask", "required", "1", "per_drink_kind", "formula", "stored", "logical_necessity", "разные партии напитков требуют отдельных ёмкостей", "decision:D40"),
        ("leisure", "item", "it_ps_die", "conditional", "1", "per_workplace", "conditional_presence", "stored", "analogy", "игра появляется только при показанном досуге посетителей", "items:it_ps_die"),
        ("leisure", "item", "it_ps_gusli_lyre", "wealth_extra", "1", "per_hired_musician", "conditional_presence", "scene", "sourced", "гусли появляются только вместе с музыкантом", "matcult_scene:SCN057"),
        ("import_luxury", "food_item", "fd_wine_imported", "wealth_extra", "1", "per_attested_feast_or_liturgy", "conditional_presence", "stored", "sourced", "привозное вино возможно лишь для конкретного пира или гостя", "food-drink/food/ingredients.csv#fd_wine_imported"),
        ("import_luxury", "item", "it_hh_glass_drinking_vessel", "wealth_extra", "1", "per_attested_feast_or_liturgy", "conditional_presence", "stored", "analogy", "редкий стеклянный сосуд — осторожная аналогия только для состоятельного гостя или пира", "book:624953 §348"),
        ("import_luxury", "item", "it_hh_silver_feast_cup", "wealth_extra", "1", "per_attested_feast_or_liturgy", "conditional_presence", "stored", "analogy", "серебряная чаша не обычная посуда, а осторожная аналогия единичной пиршественной утвари", "book:622242 §2450;book:301539 §1824"),
    ],
    "place_inn": SERVICE_CORE + [
        ("water", "item", "it_hh_tub", "required", "1", "per_workplace", "formula", "stored", "logical_necessity", "ночлег требует запаса воды", "decision:D40"),
        ("cooking", "item", "it_hh_cooking_pot", "required", "1", "per_hearth", "formula", "stored", "logical_necessity", "гостевой ночлег с пищей требует горшка", "decision:D40"),
        ("cooking", "item", "it_hh_wooden_spoon", "required", "1", "per_served_eater", "formula", "stored", "logical_necessity", "еда требует ложки на показанного едока", "decision:D40"),
        ("food_drink", "food_profile", "hh_merchant_urban", "required", "", "actual_servings", "delegated_profile", "stored", "analogy", "сезонный ассортимент делегирован существующему пищевому профилю", FOOD_SOURCE),
        ("sleep", "item", "it_hh_straw_mat", "required", "1", "per_sleeper", "formula", "stored", "logical_necessity", "каждому показанному постояльцу нужна подстилка", "decision:D40"),
        ("sleep", "item", "it_hh_wool_blanket", "required", "1", "per_two_sleepers", "formula", "stored", "logical_necessity", "ночлег требует укрытия", "decision:D40"),
        ("storage", "matcult_item", "FUR0026", "required", "1", "per_workplace", "formula", "scene", "sourced", "гостевой дом нуждается в закрытом хранении", "matcult:FUR0026"),
        ("vessels", "item", "it_hh_wooden_cup", "required", "1", "per_served_eater", "formula", "stored", "sourced", "ночлег с питьём требует посуды по числу обслуживаемых гостей", "book:624953 §346"),
        ("textiles", "item", "it_hh_towel", "conditional", "1", "per_sleeper", "conditional_presence", "stored", "logical_necessity", "постояльцу выдаётся полотно только при фактическом ночлеге", "decision:D40"),
        ("light_heat", "item", "it_hh_firesteel", "required", "1", "per_hearth", "formula", "stored", "logical_necessity", "занятый постоялый двор должен разжигать очаг", "decision:D40"),
    ],
    "place_bathhouse": [row for row in PLACE_LENS_CORE if row[2] != "REL0001"] + [
        ("water", "matcult_item", "HOU0001", "required", "1", "per_workplace", "formula", "stored", "sourced", "базовая норма — одно ведро; сцена бани допускает второе", "matcult_scene:SCN_X001"),
        ("water", "matcult_item", "HOU0036", "required", "1", "per_workplace", "formula", "scene", "sourced", "сцена бани прямо задаёт кадку", "matcult_scene:SCN_X001"),
        ("light_heat", "matcult_item", "INT0042", "required", "1", "per_workplace", "formula", "scene", "sourced", "сцена прямо задаёт банную каменку", "matcult_scene:SCN_X001"),
        ("cleaning", "item", "it_hh_bath_besom", "required", "1", "per_workplace", "formula", "stored", "sourced", "банный веник принадлежит существующему каталогу", "items:it_hh_bath_besom"),
        ("cleaning", "item", "it_hh_bast_scrubber", "required", "1", "per_workplace", "formula", "stored", "logical_necessity", "мытьё требует мочала", "items:it_hh_bast_scrubber"),
        ("storage", "item", "it_hh_small_box", "required", "1", "per_workplace", "formula", "stored", "logical_necessity", "сухие принадлежности хранятся отдельно от воды", "decision:D40"),
        ("textiles", "item", "it_hh_towel", "required", "1", "per_bather", "formula", "stored", "analogy", "моющемуся требуется утиральное полотно; форма текстиля перенесена как бытовая аналогия", "book:624953 §933;decision:D40"),
        ("vessels", "item", "it_hh_washtub", "required", "1", "per_workplace", "formula", "scene", "sourced", "лохань переиспользует существующую форму водной тары", "items:it_hh_washtub"),
        ("vessels", "item", "it_hh_trough", "conditional", "1", "per_workplace", "conditional_presence", "scene", "sourced", "корыто допустимо в большой занятой бане, но не обязательно в малой", "items:it_hh_trough"),
    ],
    "place_mill": SERVICE_CORE + [
        ("occupation_tools", "matcult_item", "AGR0017", "required", "1", "per_active_station", "formula", "scene", "sourced", "сцена мельницы прямо задаёт комплект помола", "matcult_scene:SCN020"),
        ("occupation_tools", "matcult_item", "AGR0001", "required", "1", "per_active_station", "formula", "scene", "sourced", "сцена мельницы прямо задаёт рабочее ведро", "matcult_scene:SCN020"),
        ("food_drink", "food_profile", "hh_rural_smerd", "required", "", "actual_work_batches", "delegated_profile", "stored", "analogy", "сезонное зерно делегировано существующему сельскому пищевому профилю", FOOD_SOURCE),
        ("storage", "matcult_item", "FOD0051", "required", "3", "actual_work_batches", "formula", "stored", "sourced", "сцена задаёт три-пятнадцать мешков или ёмкостей зерна", "matcult_scene:SCN020"),
        ("cleaning", "item", "it_hh_brush_wood", "required", "1", "per_workplace", "formula", "stored", "logical_necessity", "рабочие поверхности очищают от муки", "decision:D40"),
        ("furniture", "matcult_item", "FUR0008", "required", "1", "per_active_station", "formula", "scene", "sourced", "рабочий столик входит в обстановку действующего помола", "matcult:FUR0008"),
        ("storage", "item", "it_hh_cloth_sack", "required", "3", "actual_work_batches", "formula", "stored", "logical_necessity", "зерно и муку разделяют по рабочим партиям", "decision:D40"),
        ("stocks", "matcult_item", "AGR0009", "required", "1", "actual_work_batches", "formula", "stored", "sourced", "зерновой ларь принадлежит существующему сельскохозяйственному каталогу", "matcult:AGR0009;book:622242 §1418"),
        ("waste_traces", "matcult_item", "MSC0025", "conditional", "1", "per_hearth", "conditional_presence", "scene", "logical_necessity", "зола появляется только после фактической топки", "decision:D40;matcult:MSC0025"),
    ],
    "place_wharf_hut": SERVICE_CORE + [
        ("sleep", "item", "it_hh_straw_mat", "conditional", "1", "per_sleeper", "conditional_presence", "stored", "logical_necessity", "ночная вахта получает подстилку только при фактическом ночлеге", "decision:D40"),
        ("occupation_tools", "matcult_item", "STR0011", "required", "1", "per_workplace", "formula", "scene", "sourced", "пристанская сцена прямо задаёт причальную конструкцию", "matcult_scene:SCN007"),
        ("occupation_tools", "matcult_item", "TRD0047", "required", "1", "per_workplace", "formula", "stored", "sourced", "сцена торгового двора у воды требует грузовую тару", "matcult_scene:SCN007"),
        ("storage", "matcult_item", "TRD0052", "required", "5", "actual_work_batches", "formula", "stored", "sourced", "сцена задаёт пять-тридцать грузовых ёмкостей", "matcult_scene:SCN007"),
        ("storage", "item", "it_hh_small_cask", "conditional", "1", "actual_work_batches", "conditional_presence", "stored", "sourced", "малая бочка допустима для конкретной партии воды или припаса", "book:624953 §457"),
        ("textiles", "item", "it_hh_wool_blanket", "conditional", "1", "per_sleeper", "conditional_presence", "stored", "logical_necessity", "укрытие появляется только при фактическом ночном дежурстве", "decision:D40"),
        ("furniture", "matcult_item", "FUR0008", "required", "1", "per_workplace", "formula", "scene", "sourced", "рабочая поверхность нужна для учёта и перевязки груза", "matcult:FUR0008"),
        ("light_heat", "item", "it_hh_firesteel", "conditional", "1", "per_hearth", "conditional_presence", "stored", "logical_necessity", "огниво появляется только у отапливаемой занятой избы", "decision:D40"),
        ("vessels", "item", "it_hh_dipper", "required", "1", "per_workplace", "formula", "stored", "logical_necessity", "дежурные и грузчики зачерпывают воду из общей тары", "decision:D40"),
    ],
    "place_guardhouse": SERVICE_CORE + [
        ("water", "item", "it_hh_bucket_hollowed", "required", "1", "per_workplace", "formula", "stored", "logical_necessity", "дежурному посту нужна вода", "decision:D40"),
        ("cooking", "item", "it_hh_cooking_pot", "conditional", "1", "per_hearth", "conditional_presence", "stored", "logical_necessity", "горшок появляется только у длительно занятого поста с очагом", "decision:D40"),
        ("occupation_tools", "matcult_item", "FOR0002", "required", "1", "per_workplace", "formula", "scene", "sourced", "воротная сцена прямо задаёт оборонительную конструкцию", "matcult_scene:SCN043"),
        ("vessels", "item", "it_hh_wooden_spoon", "required", "1", "per_served_eater", "formula", "stored", "sourced", "дежурному пайку нужна ложка", "book:624953 §442"),
        ("vessels", "item", "it_hh_turned_bowl", "required", "1", "per_served_eater", "formula", "stored", "sourced", "дежурному пайку нужна миска", "book:624953 §243"),
        ("sleep", "item", "it_hh_wool_blanket", "required", "1", "per_sleeper", "formula", "stored", "logical_necessity", "ночной караул требует укрытия отдыхающему", "decision:D40"),
        ("light_heat", "item", "it_hh_firesteel", "required", "1", "per_hearth", "formula", "stored", "logical_necessity", "длительно занятый пост должен разжигать огонь", "decision:D40"),
    ],
    "place_market_shop": SERVICE_CORE + [
        ("occupation_tools", "matcult_item", "TRD0017", "required", "1", "per_workplace", "formula", "scene", "sourced", "торговая сцена прямо задаёт прилавок", "matcult_scene:SCN021"),
        ("occupation_tools", "matcult_item", "TRD0037", "required", "1", "per_workplace", "formula", "stored", "sourced", "торговая сцена прямо задаёт весовой комплект", "matcult_scene:SCN021"),
        ("storage", "matcult_item", "TRD0001", "required", "3", "actual_work_batches", "formula", "stored", "sourced", "сцена задаёт три-двадцать торговых или тарных единиц", "matcult_scene:SCN021"),
        ("storage", "matcult_item", "POT0001", "required", "1", "per_workplace", "formula", "stored", "sourced", "торговая сцена прямо разрешает керамическую тару", "matcult_scene:SCN021"),
        ("import_luxury", "item", "it_hh_glazed_bowl_import", "wealth_extra", "1", "per_workplace", "conditional_presence", "stored", "sourced", "импортная чаша единична и требует конкретной партии", "matcult:TRD0050;matcult_scene:SCN059"),
        ("stocks", "adornment", "ad_new_glass_bracelet", "conditional", "1", "per_active_trade_stock", "conditional_presence", "stored", "sourced", "стеклянный браслет местного или привозного производства допустим как конкретный товар, но не как импортная роскошь", "book:624953 §858;clothing-appearance/adornment_appearance/adornment.csv#ad_new_glass_bracelet"),
        ("storage", "item", "it_hh_cloth_sack", "required", "3", "actual_work_batches", "formula", "stored", "logical_necessity", "сыпучий и мелкий товар хранится раздельными партиями", "decision:D40"),
        ("stocks", "matcult_item", "TRD0027", "conditional", "1", "per_active_trade_stock", "conditional_presence", "stored", "sourced", "товарный тюк появляется только при фактической продаже ткани", "matcult:TRD0027"),
        ("import_luxury", "item", "it_hh_glass_drinking_vessel", "wealth_extra", "1", "per_active_trade_stock", "conditional_presence", "stored", "analogy", "стеклянный сосуд возможен как единичный привозной товар по осторожной аналогии", "book:624953 §344;book:624953 §348"),
        ("import_luxury", "item", "it_hh_silver_feast_cup", "wealth_extra", "1", "per_active_trade_stock", "conditional_presence", "stored", "analogy", "серебряная утварь возможна только как редкий статусный товар по осторожной аналогии", "book:622242 §2450"),
    ],
}

WORKSHOP_SHARED = [
    ("water", "item", "it_hh_bucket_stave", "required", "1", "per_workplace", "formula", "stored", "logical_necessity", "вода нужна людям или указанному процессу", "task:D38"),
    ("light_heat", "item", "it_hh_splinter_holder_wood", "conditional", "1", "per_indoor_workplace", "conditional_presence", "scene", "logical_necessity", "светец нужен только в закрытой мастерской без достаточного дневного света", "task:D38"),
    ("storage", "item", "it_hh_bark_box", "required", "1", "per_workplace", "formula", "stored", "logical_necessity", "мелкий инструмент и заготовки нельзя держать россыпью", "task:D38"),
    ("cleaning", "item", "it_hh_broom", "required", "1", "per_workplace", "formula", "scene", "logical_necessity", "работа оставляет обрезки, золу или пыль", "task:D38"),
]

REJECTED_ANACHRONISMS = [
    ("ухват", "deny", "items README: для 1230 подтверждена печная лопата/чапельник, а не поздний ухват", "it_hh_oven_peel"),
    ("чугунная печь", "deny", "anti-pattern AP011: современная чугунная печь с трубой", "INT0007"),
    ("бумажная книга", "deny", "items denylist и датировка материала", "parchment_or_birch_bark"),
    ("массовая поливная посуда", "deny", "late-materials rule restricted: допустима только единичная импортная чаша", "it_hh_glazed_bowl_import"),
    ("местный шёлк", "deny", "mt_silk origin=import; местного шелководства нет", "gm_gm017"),
    ("обычная ходячая иноземная монета", "deny", "currency note: импорт серебряной монеты прекратился к 1229", "cu_foreign_silver_coin:context_only"),
    ("generic D&D tavern", "deny", "anti-pattern AP014: набор корчмы не создаёт выдуманные PF, scene или owner", "place_korchma_with_explicit_issue_176_gap"),
]
