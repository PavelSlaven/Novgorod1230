-- Review before applying. Schema: world_base; table: region_place_generation_rules.
-- This patch replaces the old narrow template_type CHECK with an expanded list needed by Novgorod region_place_generation_rules.
ALTER TABLE world_base.region_place_generation_rules
  DROP CONSTRAINT IF EXISTS region_place_generation_rules_template_type_check;

ALTER TABLE world_base.region_place_generation_rules
  ADD CONSTRAINT region_place_generation_rules_template_type_check
  CHECK (template_type IN ('village', 'fishing_village', 'forest_camp', 'charcoal_burner_camp', 'logging_camp', 'winter_hut', 'pogost', 'ferry', 'ford', 'roadside_inn', 'market_site', 'monastery_dependency', 'watch_post', 'hunting_camp', 'beekeeping_site', 'isolated_farmstead', 'hamlet', 'nucleated_village', 'dispersed_settlement_cluster', 'rural_church_center', 'estate_center', 'monastic_grange', 'monastery', 'hermitage_skete', 'pilgrimage_shrine', 'forest_work_camp', 'fishing_station', 'fish_weir_site', 'river_landing', 'boat_landing', 'periodic_fairground', 'town', 'city_major_center', 'fortified_town', 'posad_suburb', 'crossroads', 'bridge_site', 'portage', 'hillfort_gorodishche', 'administrative_court', 'toll_customs_post', 'watermill_site', 'saltworks', 'clay_pit_pottery_site', 'iron_smelting_site', 'shipyard_boatyard'));
