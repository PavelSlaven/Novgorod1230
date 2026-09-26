// Manual crosswalk (judgment) for foreign material codes used by other game-base domains.
// [foreign_code, mt_ids(; empty = out of registry scope), method, note]
module.exports = [
  // English generic tokens (items-household-personal, items-weapons-armour, nature, clothing)
  ['wood','mt_wood_generic','en_token',''], ['iron','mt_iron','en_token',''], ['steel_edge','mt_steel;mt_iron','en_token','наварное стальное лезвие на железной основе'],
  ['stone','mt_fieldstone','en_token','порода не указана'], ['glass','mt_glass','en_token',''], ['amber','mt_amber','en_token',''],
  ['tin_alloy','mt_tin','en_token',''], ['tin_or_lead_alloy','mt_tin;mt_lead','en_token',''], ['lead','mt_lead','en_token',''], ['silver','mt_silver','en_token',''],
  ['copper_alloy','mt_nonferrous_generic','en_token','сплав не назначается без данных (WK metal-classes-composition)'],
  ['fur_ordinary','mt_fur','en_token','вид зверя — fauna'], ['birch_bark','mt_birch_bark','en_token',''], ['birch_bark_bast','mt_birch_bark;mt_bast_linden','en_token',''],
  ['bast','mt_bast_linden','en_token',''], ['clay','mt_clay','en_token',''], ['glaze','mt_glaze','en_token','ограничено: поливная посуда редка'],
  ['plant_fiber','mt_flax;mt_hemp;mt_bast_linden','en_token','волокно не указано'], ['linen','mt_flax','en_token',''], ['flax','mt_flax','en_token',''], ['hemp','mt_hemp','en_token',''],
  ['textile','mt_textile_generic','en_token',''], ['wool','mt_wool','en_token',''], ['felt','mt_felt','en_token',''], ['cord','mt_cordage','en_token',''],
  ['beeswax','mt_beeswax','en_token',''], ['tallow','mt_tallow','en_token',''], ['tinder_fungus','mt_tinder_fungus','en_token',''],
  ['twigs','mt_wood_generic','en_token','ветки'], ['leafy_twigs','mt_wood_generic','en_token','ветки с листвой (веник)'], ['straw','mt_straw','en_token',''],
  ['grass','mt_hay','en_token','сухая трава'], ['hay','mt_hay','en_token',''], ['willow_or_roots','mt_wood_willow;mt_roots','en_token',''], ['reed_or_splint','mt_reed;mt_wood_generic','en_token',''],
  ['leather','mt_leather_veg','en_token','способ выделки не указан'], ['rawhide','mt_rawhide','en_token',''], ['bone_or_antler','mt_bone;mt_antler','en_token',''], ['horn','mt_horn','en_token',''],
  ['feather','mt_feather','en_token',''], ['parchment','mt_parchment','en_token',''], ['gesso','mt_gesso','en_token',''], ['pigment','mt_ochre;mt_carbon_black','en_token','пигмент не указан'],
  ['hair','mt_hair','en_token',''], ['horsehair','mt_horsehair','en_token',''], ['gut_or_metal_string','mt_sinew_gut;mt_nonferrous_generic','en_token',''],
  ['ore','mt_bog_ore','en_token',''], ['plant_bark','mt_birch_bark;mt_bark_pine;mt_bark_tanning','en_token','кора не указана'], ['plant_resin','mt_pine_resin','en_token',''],
  ['wood_resinous','mt_wood_pine','en_token','смолистая древесина'], ['wood_dead','mt_firewood;mt_wood_generic','en_token','сухостой, валежник'], ['wood_drift','mt_wood_generic','en_token','плавник'],
  ['plant_stem','mt_reed;mt_straw','en_token',''], ['moss','mt_moss','en_token',''], ['plant_root','mt_roots','en_token',''], ['water','mt_water','en_token',''],
  // soil / ground classes belong to natural_materials_soils (nature domain), not to the craft materials registry
  ['ground','','out_of_scope:soil_class',''], ['alluvial','','out_of_scope:soil_class',''], ['lake-alluvial','','out_of_scope:soil_class',''], ['moraine','','out_of_scope:soil_class',''],
  ['fluvioglacial','','out_of_scope:soil_class',''], ['organic','','out_of_scope:soil_class',''], ['lacustrine','','out_of_scope:soil_class',''], ['lacustrine-glacial','','out_of_scope:soil_class',''],
  ['mineral_ground','','out_of_scope:soil_class',''], ['mineral_stone','','out_of_scope:soil_class',''], ['organic_ground','','out_of_scope:soil_class',''],
  // buildings materials_vocab overrides where the Russian name is not enough
  ['mat_log_crown','mt_wood_pine;mt_wood_spruce','vocab_manual','венцовое бревно'], ['mat_sill_log','mt_wood_pine;mt_wood_oak','vocab_manual','лежень'], ['mat_pile','mt_wood_oak;mt_wood_pine','vocab_manual','свая'],
  ['mat_pole','mt_wood_generic','vocab_manual','жердь'], ['mat_slab','mt_wood_generic','vocab_manual','горбыль'], ['mat_lemekh','mt_wood_aspen','vocab_manual','осиновый лемех'],
  ['mat_roof_tes','mt_wood_pine;mt_wood_spruce','vocab_manual','кровельный тёс'], ['mat_shingle_conifer','mt_wood_pine;mt_wood_spruce','vocab_manual',''], ['mat_hardwood_bar','mt_wood_oak','vocab_manual',''],
  ['mat_hearth_stone','mt_fieldstone','vocab_manual',''], ['mat_shell_rock','mt_limestone','vocab_manual','ракушечник — разновидность известняка'], ['mat_lime_mortar','mt_lime;mt_quartz_sand','vocab_manual',''],
  ['mat_lime_plaster','mt_lime','vocab_manual',''], ['mat_pigment','mt_ochre;mt_carbon_black;mt_lazurite;mt_red_lead;mt_celadonite','vocab_manual',''], ['mat_wood_peg','mt_wood_generic','vocab_manual','нагель'],
  ['mat_iron_nail','mt_iron','vocab_manual',''], ['mat_iron_clamp','mt_iron','vocab_manual',''], ['mat_iron_hinge','mt_iron','vocab_manual',''], ['mat_iron_hasp','mt_iron','vocab_manual',''], ['mat_iron_metal','mt_iron','vocab_manual',''],
  ['mat_rope','mt_cordage;mt_hemp;mt_flax;mt_bast_linden','vocab_manual',''], ['mat_wattle','mt_wood_willow','vocab_manual','прутья плетня'], ['mat_glass_fragment','mt_glass','vocab_manual','оконное стекло — ограничено (dl_glass_window_common)'],
  ['mat_textile_felt','mt_wool;mt_felt','vocab_manual',''], ['mat_earth','mt_earth','vocab_manual',''], ['mat_boulder','mt_fieldstone','vocab_manual',''], ['mat_plank_hewn','mt_wood_pine;mt_wood_spruce','vocab_manual','тёсаная доска; порода по умолчанию хвойная'],
  ['mat_log_conifer','mt_wood_pine;mt_wood_spruce','vocab_manual','хвойное бревно'],
  ['органическое волокно','mt_flax;mt_hemp;mt_bast_linden','ru_token',''], ['растительное волокно','mt_flax;mt_hemp;mt_bast_linden','ru_token',''], ['пигмент','mt_ochre;mt_carbon_black','ru_token',''], ['fluvioglacial sand','','out_of_scope:soil_class',''],
  ['mat_plank_split','mt_wood_pine;mt_wood_spruce','vocab_manual','плаха'],
];
