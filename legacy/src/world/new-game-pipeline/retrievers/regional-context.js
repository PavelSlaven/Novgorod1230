import {
  frameFromHistoricalFrame,
  getAllowedStatuses,
  getRetrieverQueryable,
  makeAudit,
  normalizeLoadPolicy,
  sourceIdsFromSources,
  sourceTrace
} from './common.js';
import { occupationGenerationGateSql, socialRoleGenerationGateSql } from '../../social-generation-gate.js';

const CONFIDENCE_VALUES = new Set(['unknown', 'low', 'medium_low', 'medium', 'medium_high', 'high']);
const FORBIDDEN_OUTPUT_KEYS = new Set([
  'start_location_id',
  'g1_id',
  'g2_id',
  'g3_id',
  'g4_id',
  'g5_anchor_id',
  'npc_ids',
  'items',
  'visible_scene',
  'intro_prose',
  'hidden_event',
  'player_character',
  'start_position'
]);

export async function retrieveRegionalContextPackage(input = {}, deps = {}) {
  const requestId = input.request_id ?? input.requestId ?? null;
  const frame = frameFromHistoricalFrame(input.historical_frame);
  const policy = normalizeLoadPolicy(input.load_policy);
  const statuses = getAllowedStatuses(policy);
  if (!frame.region_id) throw new Error('historical_frame.region.region_id is required for regional context retrieval.');
  if (deps.queryable == null) {
    const error = new Error('REGIONAL_CONTEXT_QUERYABLE_MISSING');
    error.code = 'REGIONAL_CONTEXT_QUERYABLE_MISSING';
    throw error;
  }

  const db = getRetrieverQueryable(deps);
  const limit = policy.max_records_per_group;

  const [
    region,
    historicalEvents,
    historicalAnchors,
    socialRolesRaw,
    occupationsRaw,
    placeRulesRaw,
    placeTemplatesRaw,
    placeLimitsRaw,
    landscapesRaw,
    waterRaw,
    landUseRaw,
    routeTemplatesRaw,
    routeModifiersRaw,
    graphEdgesRaw,
    edgeKnowledgeRaw,
    seasonalRulesRaw,
    weatherProfilesRaw,
    itemTemplatesRaw,
    priceBandsRaw,
    locationObjectRulesRaw,
    npcGenerationRulesRaw,
    npcKnowledgeRaw,
    rumorTemplatesRaw,
    buildingTemplatesRaw,
    contextPacksRaw
  ] = await Promise.all([
    one(db, `
      SELECT id, slug, canonical_name, display_name, alt_names, region_type, parent_region_id,
             period_start_year, period_end_year, summary, geographic_scope, natural_landscape,
             climate_summary, seasonal_rules, waterways_summary, roads_summary,
             settlement_logic_summary, political_summary, social_order_summary, economy_summary,
             military_pressure_summary, historical_context_summary, external_pressure_summary,
             common_risks_summary, npc_common_knowledge_summary, llm_generation_rules,
             llm_forbidden_assumptions, llm_context_summary, validation_notes, status,
             confidence, sources, audit_notes
      FROM world_base.regions
      WHERE id = $1
        AND status = ANY($2::text[])
        AND ($3::int IS NULL OR period_start_year IS NULL OR period_start_year <= $3)
        AND ($3::int IS NULL OR period_end_year IS NULL OR period_end_year >= $3)
    `, [frame.region_id, statuses, frame.year]),
    many(db, `
      SELECT id, region_id, slug, title, event_type, period_start_year, period_end_year,
             approximate_date, date_confidence, historical_status, summary, cause,
             participants, affected_regions, affected_places, current_phase, phase_logic,
             local_signs, economic_effect, road_effect, law_effect, social_effect,
             military_effect, religious_effect, npc_knowledge_effect, rumor_effect,
             what_commoners_know, what_traders_know, what_elites_know, what_clergy_know,
             what_outsiders_know, hidden_truth_policy, future_knowledge_forbidden,
             game_use, limits, status, confidence, sources, audit_notes
      FROM world_base.historical_events
      WHERE region_id = $1
        AND status = ANY($2::text[])
        AND ($3::int IS NULL OR period_start_year IS NULL OR period_start_year <= $3)
        AND ($3::int IS NULL OR period_end_year IS NULL OR period_end_year >= $3)
      ORDER BY COALESCE(period_start_year, 0), title, id
      LIMIT $4
    `, [frame.region_id, statuses, frame.year, limit]),
    many(db, `
      SELECT id, region_id, place_id, slug, canonical_name, display_name, anchor_type,
             summary, historical_status, period_start_year, period_end_year,
             approximate_bearing, distance_band, zone_of_influence, access_graph_edges,
             visible_signs, economic_influence, political_influence, religious_influence,
             military_influence, trade_influence, character_knowledge_common,
             character_knowledge_trader, character_knowledge_elite, character_knowledge_clergy,
             character_knowledge_outsider, discovery_conditions, llm_use_rules,
             llm_forbidden_changes, game_use, limits, status, confidence, sources, audit_notes
      FROM world_base.historical_anchors
      WHERE region_id = $1
        AND status = ANY($2::text[])
        AND ($3::int IS NULL OR period_start_year IS NULL OR period_start_year <= $3)
        AND ($3::int IS NULL OR period_end_year IS NULL OR period_end_year >= $3)
      ORDER BY display_name, canonical_name, id
      LIMIT $4
    `, [frame.region_id, statuses, frame.year, limit]),
    many(db, `
      SELECT rsr.id, rsr.region_id, rsr.title, rsr.slug, rsr.role_group, rsr.status_level, rsr.free_status, rsr.dependency_type,
             rsr.wealth_level, rsr.legal_capacity, rsr.mobility_level, rsr.social_respect, rsr.vulnerability_level,
             rsr.allowed_occupations, rsr.forbidden_occupations, rsr.allowed_weapons, rsr.forbidden_weapons,
             rsr.allowed_places, rsr.restricted_places, rsr.property_rights, rsr.travel_rights, rsr.trade_rights,
             rsr.court_rights, rsr.tax_obligations, rsr.service_obligations, rsr.typical_clothing,
             rsr.typical_equipment, rsr.typical_knowledge, rsr.typical_speech_register, rsr.typical_fears,
             rsr.typical_goals, rsr.who_commands_them, rsr.who_protects_them, rsr.who_can_punish_them,
             rsr.relation_to_church, rsr.relation_to_power, rsr.npc_generation_rules, rsr.player_character_rules,
             rsr.game_use, rsr.limits, rsr.status, rsr.confidence, rsr.sources, rsr.audit_notes
      FROM world_base.region_social_roles rsr
      WHERE rsr.region_id = $1 AND rsr.status = ANY($2::text[])
        AND ${socialRoleGenerationGateSql('rsr')}
      ORDER BY rsr.title, rsr.id
      LIMIT $3
    `, [frame.region_id, statuses, limit]),
    many(db, `
      SELECT id, region_id, title, slug, occupation_group, summary, allowed_social_roles,
             forbidden_social_roles, typical_status, typical_wealth, typical_gender_age_rules,
             required_location_types, required_economy_types, required_tools, required_materials,
             produced_goods, services_provided, seasonality, work_rhythm, income_logic,
             typical_skills, typical_attributes, typical_clothing, typical_equipment,
             typical_risks, typical_knowledge, typical_contacts, settlement_generation_weight,
             npc_generation_weight, rarity, is_historical_fact, is_generated_allowed,
             game_use, limits, status, confidence, sources, audit_notes
      FROM world_base.region_occupations ro
      WHERE ro.region_id = $1 AND ro.status = ANY($2::text[])
        AND ${occupationGenerationGateSql('ro')}
      ORDER BY ro.title, ro.id
      LIMIT $3
    `, [frame.region_id, statuses, limit]),
    many(db, `
      SELECT id, region_id, title, slug, template_type, summary, generation_allowed,
             max_instances_per_region, min_distance_from_major_place, required_landscape,
             required_economy, required_route_access, required_water_access, seasonal_availability,
             typical_population_band, typical_household_count, typical_wealth_level,
             typical_authority, typical_social_roles, typical_occupations, typical_buildings,
             typical_animals, typical_tools, typical_goods, typical_food_sources, typical_risks,
             typical_conflicts, layout_rules, naming_rules, access_rules, law_rules,
             religion_rules, trade_rules, defense_rules, npc_generation_rules,
             item_generation_rules, route_generation_rules, historical_plausibility_rules,
             game_use, limits, status, confidence, sources, audit_notes
      FROM world_base.region_place_generation_rules
      WHERE region_id = $1 AND status = ANY($2::text[])
      ORDER BY title, id
      LIMIT $3
    `, [frame.region_id, statuses, limit]),
    many(db, `
      SELECT rpt.id AS region_place_template_id, rpt.region_id, rpt.place_template_id,
             rpt.is_allowed, rpt.is_common, rpt.is_rare, rpt.generation_weight,
             rpt.allowed_scale_levels, rpt.allowed_node_types, rpt.regional_limits,
             rpt.game_use AS regional_game_use, rpt.limits AS regional_limits_text,
             rpt.status, rpt.confidence, rpt.sources, rpt.audit_notes,
             pt.slug, pt.title, pt.summary, pt.place_kind, pt.default_node_type,
             pt.can_exist_inside_landscape, pt.requires_water_nearby, pt.requires_route_nearby,
             pt.requires_land_use, pt.compatible_landscape_template_ids,
             pt.compatible_water_body_template_ids, pt.compatible_route_template_ids,
             pt.compatible_land_use_template_ids, pt.typical_scale_level,
             pt.settlement_density_effect, pt.access_logic, pt.social_logic,
             pt.economic_logic, pt.defense_logic, pt.game_use, pt.limits
      FROM world_base.region_place_templates rpt
      JOIN world_base.place_templates pt ON pt.id = rpt.place_template_id
      WHERE rpt.region_id = $1
        AND rpt.is_allowed = true
        AND rpt.status = ANY($2::text[])
        AND pt.status = ANY($2::text[])
      ORDER BY rpt.generation_weight DESC, pt.title, pt.id
      LIMIT $3
    `, [frame.region_id, statuses, limit]),
    many(db, `
      SELECT id, region_id, place_template_id, max_total, max_per_subregion,
             min_total_if_region_active, economic_basis_required, route_basis_required,
             water_basis_required, authority_basis_required, historical_anchor_basis_required,
             allowed_near_place_types, forbidden_near_place_types, minimum_distance_band,
             maximum_distance_band, density_logic, naming_policy, duplication_policy,
             game_use, limits, status, confidence, sources, audit_notes
      FROM world_base.place_generation_limits
      WHERE region_id = $1 AND status = ANY($2::text[])
      ORDER BY place_template_id, id
      LIMIT $3
    `, [frame.region_id, statuses, limit]),
    many(db, `
      SELECT rlt.id AS region_landscape_template_id, rlt.region_id, rlt.landscape_template_id,
             rlt.is_allowed, rlt.is_common, rlt.is_dominant, rlt.is_rare,
             rlt.generation_weight, rlt.allowed_scale_levels, rlt.allowed_node_types,
             rlt.regional_limits, rlt.game_use AS regional_game_use,
             rlt.limits AS regional_limits_text, rlt.status, rlt.confidence, rlt.sources,
             rlt.audit_notes, lt.slug, lt.title, lt.summary, lt.landscape_group,
             lt.base_environment, lt.dominant_vegetation, lt.forest_type, lt.moisture_level,
             lt.relief_type, lt.soil_ground_type, lt.openness, lt.seasonal_stability,
             lt.base_movement_multiplier, lt.default_orientation_difficulty,
             lt.base_risk_level, lt.game_use, lt.limits
      FROM world_base.region_landscape_templates rlt
      JOIN world_base.landscape_templates lt ON lt.id = rlt.landscape_template_id
      WHERE rlt.region_id = $1
        AND rlt.is_allowed = true
        AND rlt.status = ANY($2::text[])
        AND lt.status = ANY($2::text[])
      ORDER BY rlt.generation_weight DESC, lt.title, lt.id
      LIMIT $3
    `, [frame.region_id, statuses, limit]),
    many(db, `
      SELECT rwt.id AS region_water_body_template_id, rwt.region_id, rwt.water_body_template_id,
             rwt.is_allowed, rwt.is_common, rwt.is_dominant, rwt.is_rare,
             rwt.generation_weight, rwt.allowed_scale_levels, rwt.allowed_node_types,
             rwt.regional_limits, rwt.game_use AS regional_game_use,
             rwt.limits AS regional_limits_text, rwt.status, rwt.confidence, rwt.sources,
             rwt.audit_notes, wt.slug, wt.title, wt.summary, wt.water_body_type,
             wt.salinity, wt.flow_type, wt.typical_depth, wt.typical_width,
             wt.drinkable_default, wt.supports_boat, wt.supports_fishing, wt.supports_ford,
             wt.supports_ferry, wt.supports_bridge, wt.supports_winter_crossing,
             wt.freeze_pattern, wt.flood_risk, wt.base_crossing_risk, wt.navigation_use,
             wt.water_hazard_notes, wt.game_use, wt.limits
      FROM world_base.region_water_body_templates rwt
      JOIN world_base.water_body_templates wt ON wt.id = rwt.water_body_template_id
      WHERE rwt.region_id = $1
        AND rwt.is_allowed = true
        AND rwt.status = ANY($2::text[])
        AND wt.status = ANY($2::text[])
      ORDER BY rwt.generation_weight DESC, wt.title, wt.id
      LIMIT $3
    `, [frame.region_id, statuses, limit]),
    many(db, `
      SELECT rut.id AS region_land_use_template_id, rut.region_id, rut.land_use_template_id,
             rut.is_allowed, rut.is_common, rut.is_rare, rut.generation_weight,
             rut.allowed_scale_levels, rut.allowed_node_types, rut.regional_limits,
             rut.game_use AS regional_game_use, rut.limits AS regional_limits_text,
             rut.status, rut.confidence, rut.sources, rut.audit_notes,
             lut.slug, lut.title, lut.summary, lut.land_use_kind,
             lut.requires_settlement_nearby, lut.requires_water_nearby,
             lut.requires_specific_landscape, lut.compatible_landscape_template_ids,
             lut.compatible_water_body_template_ids, lut.seasonal_pattern,
             lut.labor_intensity, lut.economic_use, lut.visibility_effect,
             lut.movement_effect, lut.risk_effect, lut.game_use, lut.limits
      FROM world_base.region_land_use_templates rut
      JOIN world_base.land_use_templates lut ON lut.id = rut.land_use_template_id
      WHERE rut.region_id = $1
        AND rut.is_allowed = true
        AND rut.status = ANY($2::text[])
        AND lut.status = ANY($2::text[])
      ORDER BY rut.generation_weight DESC, lut.title, lut.id
      LIMIT $3
    `, [frame.region_id, statuses, limit]),
    many(db, `
      SELECT id, slug, title, summary, route_kind, default_edge_type, surface_type,
             requires_landscape_template, requires_water_body_template, supports_pedestrian,
             supports_horse, supports_cart, supports_sled, supports_boat,
             seasonal_availability, default_access_rule, default_orientation_difficulty,
             default_risk_level, default_movement_multiplier, game_use, limits,
             status, confidence, sources, audit_notes
      FROM world_base.route_templates
      WHERE status = ANY($1::text[])
      ORDER BY title, id
      LIMIT $2
    `, [statuses, limit]),
    many(db, `
      SELECT id, title, modifier_type, applies_to_edge_type, applies_to_terrain_type,
             applies_to_season, multiplier, summary, example, game_use, limits,
             status, confidence, sources, audit_notes
      FROM world_base.graph_edge_modifiers
      WHERE status = ANY($1::text[])
        AND ($2::text IS NULL OR applies_to_season IS NULL OR applies_to_season = $2)
      ORDER BY modifier_type, title, id
      LIMIT $3
    `, [statuses, frame.season, limit]),
    many(db, `
      SELECT ge.id, from_node.region_id AS region_id, ge.from_node_id, ge.to_node_id,
             ge.reverse_edge_id, ge.scale_level, ge.edge_type, ge.base_gu,
             ge.base_distance_km, ge.base_time_minutes, ge.base_time_hours,
             ge.base_time_days, ge.route_template_id, ge.landscape_template_id,
             ge.water_body_template_id, ge.terrain_type, ge.route_surface,
             ge.seasonal_rule, ge.access_rule, ge.risk_level, ge.known_to_commoners,
             ge.known_to_traders, ge.known_to_elites, ge.known_to_clergy,
             ge.known_to_character_default, ge.requires_guide, ge.requires_boat,
             ge.requires_horse, ge.requires_sled, ge.requires_permission,
             ge.requires_orientation_check, ge.orientation_difficulty,
             ge.movement_risk_profile, ge.failure_consequences, ge.historical_status,
             ge.status, ge.confidence, ge.sources, ge.audit_notes
      FROM world_base.graph_edges ge
      JOIN world_base.graph_nodes from_node ON from_node.id = ge.from_node_id
      WHERE from_node.region_id = $1
        AND ge.status = ANY($2::text[])
      ORDER BY ge.scale_level, ge.edge_type, ge.id
      LIMIT $3
    `, [frame.region_id, statuses, limit]),
    many(db, `
      SELECT gek.id, gek.region_id, gek.graph_edge_id, gek.social_role_id,
             gek.occupation_id, gek.knowledge_level, gek.knowledge_source,
             gek.accuracy, gek.common_mistakes, gek.seasonal_limitations,
             gek.danger_awareness, gek.landmarks_known, gek.places_known_on_graph_edge,
             gek.can_guide_others, gek.will_share_for_free, gek.will_share_for_payment,
             gek.will_hide_or_lie, gek.game_use, gek.limits, gek.status,
             gek.confidence, gek.sources, gek.audit_notes
      FROM world_base.graph_edge_knowledge_rules gek
      WHERE gek.region_id = $1
        AND gek.status = ANY($2::text[])
      ORDER BY gek.graph_edge_id, gek.social_role_id NULLS LAST, gek.occupation_id NULLS LAST, gek.id
      LIMIT $3
    `, [frame.region_id, statuses, limit]),
    many(db, `
      SELECT id, region_id, season, title, slug, weather_profile, daylight_profile,
             road_effects, river_effects, forest_effects, field_effects, food_effects,
             work_effects, trade_effects, war_effects, disease_effects,
             clothing_requirements, shelter_requirements, available_occupations,
             restricted_occupations, available_graph_edges, restricted_graph_edges,
             common_risks, common_scenes, game_use, limits, status, confidence,
             sources, audit_notes
      FROM world_base.seasonal_rules
      WHERE region_id = $1
        AND status = ANY($2::text[])
        AND ($3::text IS NULL OR season = $3)
      ORDER BY season, title, id
      LIMIT $4
    `, [frame.region_id, statuses, frame.season, limit]),
    many(db, `
      SELECT wp.id, wp.region_id, wp.seasonal_rule_id, wp.title, wp.slug,
             wp.weather_type, wp.summary, wp.temperature_band, wp.precipitation,
             wp.wind, wp.visibility, wp.ground_condition, wp.water_condition,
             wp.road_modifier, wp.movement_modifier, wp.body_state_risk,
             wp.npc_activity_effect, wp.trade_effect, wp.combat_effect,
             wp.stealth_effect, wp.fire_effect, wp.visible_description,
             wp.sound_description, wp.smell_description, wp.game_use, wp.limits,
             wp.status, wp.confidence, wp.sources, wp.audit_notes
      FROM world_base.weather_profiles wp
      LEFT JOIN world_base.seasonal_rules sr ON sr.id = wp.seasonal_rule_id
      WHERE wp.region_id = $1
        AND wp.status = ANY($2::text[])
        AND ($3::text IS NULL OR sr.season IS NULL OR sr.season = $3)
      ORDER BY wp.weather_type, wp.title, wp.id
      LIMIT $4
    `, [frame.region_id, statuses, frame.season, limit]),
    many(db, `
      SELECT id, region_id, material_culture_id, title, slug, item_type, summary,
             function, typical_material, weight_band, size_band, durability,
             quality_band, value_band, rarity, legal_status, social_status_signal,
             typical_owner_roles, typical_holder_roles, typical_locations,
             typical_containers, visibility_default, access_default, marking_default,
             risk_default, skill_use, attribute_use, possible_modifiers,
             failure_risks, damage_or_wear_rules, game_use, limits, status,
             confidence, sources, audit_notes
      FROM world_base.item_templates
      WHERE region_id = $1 AND status = ANY($2::text[])
      ORDER BY title, id
      LIMIT $3
    `, [frame.region_id, statuses, limit]),
    many(db, `
      SELECT id, region_id, title, slug, item_or_service_type, value_band,
             normal_price_description, cheap_condition, expensive_condition,
             scarcity_factors, seasonal_modifiers, war_modifiers, road_modifiers,
             status_modifiers, trade_place_modifiers, who_can_afford, who_can_sell,
             who_controls_supply, barter_options, tax_or_duty, risk_of_fraud,
             game_use, limits, status, confidence, sources, audit_notes
      FROM world_base.price_bands
      WHERE region_id = $1 AND status = ANY($2::text[])
      ORDER BY item_or_service_type, title, id
      LIMIT $3
    `, [frame.region_id, statuses, limit]),
    many(db, `
      SELECT id, region_id, place_template_id, place_id, location_type, building_type,
             object_category, item_template_id, probability_band, required_reason,
             required_owner, required_holder, visibility_default, access_default,
             legal_risk, social_risk, economic_justification, can_be_generated,
             must_be_pregenerated, forbidden_without_reason, container_policy,
             hidden_policy, game_use, limits, status, confidence, sources, audit_notes
      FROM world_base.location_object_rules
      WHERE region_id = $1 AND status = ANY($2::text[])
      ORDER BY place_template_id NULLS LAST, location_type NULLS LAST, object_category, id
      LIMIT $3
    `, [frame.region_id, statuses, limit]),
    many(db, `
      SELECT id, region_id, title, slug, npc_profile_type, applies_to_place_types,
             applies_to_location_types, allowed_social_roles, allowed_occupations,
             forbidden_roles, rarity_rules, name_rules, age_rules, gender_rules,
             status_rules, wealth_rules, clothing_rules, equipment_rules, speech_rules,
             knowledge_rules, fear_rules, goal_rules, authority_rules, reaction_to_strangers,
             reaction_to_violence, reaction_to_theft, reaction_to_trade, reaction_to_law,
             background_npc_minimum, scene_npc_minimum, key_npc_minimum,
             game_use, limits, status, confidence, sources, audit_notes
      FROM world_base.region_npc_generation_rules
      WHERE region_id = $1 AND status = ANY($2::text[])
      ORDER BY npc_profile_type, title, id
      LIMIT $3
    `, [frame.region_id, statuses, limit]),
    many(db, `
      SELECT id, region_id, social_role_id, occupation_id, knowledge_type, title,
             summary, knows_as_fact, knows_as_rumor, common_mistakes, cannot_know,
             taboo_topics, dangerous_to_say, who_they_trust, who_they_fear,
             regional_knowledge, local_place_knowledge, law_knowledge,
             economy_knowledge, religion_knowledge, historical_knowledge,
             route_knowledge, social_order_knowledge, price_knowledge,
             speech_style_notes, behavior_effect, game_use, limits, status,
             confidence, sources, audit_notes
      FROM world_base.region_npc_knowledge
      WHERE region_id = $1 AND status = ANY($2::text[])
      ORDER BY knowledge_type, title, id
      LIMIT $3
    `, [frame.region_id, statuses, limit]),
    many(db, `
      SELECT id, region_id, title, slug, rumor_type, summary, source_role,
             spread_places, spread_graph_edges, affected_roles, linked_event_id,
             linked_place_id, linked_risk_id, truth_status, distortion_level,
             what_is_visible, what_is_hidden, who_believes_it, who_denies_it,
             danger_of_repeating, possible_effects, expiration_or_update_rule,
             game_use, limits, status, confidence, sources, audit_notes
      FROM world_base.rumor_templates
      WHERE region_id = $1 AND status = ANY($2::text[])
      ORDER BY rumor_type, title, id
      LIMIT $3
    `, [frame.region_id, statuses, limit]),
    many(db, `
      SELECT id, region_id, title, slug, building_type, summary, allowed_place_types,
             allowed_location_types, required_economy, required_social_order,
             typical_owner, typical_controller, typical_users, materials,
             size_band, wealth_level, condition_band, layout_rules, room_templates,
             storage_rules, access_rules, locked_area_rules, hidden_area_rules,
             fire_risk, theft_risk, social_risk, typical_objects,
             typical_npc_roles, typical_activities, game_use, limits, status,
             confidence, sources, audit_notes
      FROM world_base.building_templates
      WHERE region_id = $1 AND status = ANY($2::text[])
      ORDER BY building_type, title, id
      LIMIT $3
    `, [frame.region_id, statuses, limit]),
    many(db, `
      SELECT id, region_id, title, slug, context_type, summary, included_tables,
             included_record_ids, prompt_text, hard_constraints, forbidden_assumptions,
             known_gaps, use_when, do_not_use_when, max_tokens_estimate,
             status, confidence, sources, audit_notes
      FROM world_base.llm_context_packs
      WHERE (region_id = $1 OR region_id IS NULL)
        AND context_type IN ('region_start', 'new_place_generation', 'npc_generation', 'route_generation', 'historical_check', 'scene_context', 'repair_context')
        AND status = ANY($2::text[])
      ORDER BY context_type, title, id
      LIMIT $3
    `, [frame.region_id, statuses, limit])
  ]);

  const historicalEventPhases = historicalEvents.length > 0
    ? await many(db, `
      SELECT id, event_id, region_id, phase_name, phase_order, date_start, date_end,
             date_confidence, trigger_condition, summary, visible_signs,
             hidden_processes, affected_places, affected_graph_edges, affected_roles,
             affected_goods, npc_behavior_changes, price_changes, security_changes,
             law_changes, rumor_templates, delayed_event_rules, what_character_can_know,
             what_character_cannot_know, game_use, limits, status, confidence,
             sources, audit_notes
      FROM world_base.historical_event_phases
      WHERE region_id = $1
        AND event_id = ANY($2::text[])
        AND status = ANY($3::text[])
      ORDER BY event_id, phase_order NULLS LAST, id
      LIMIT $4
    `, [frame.region_id, historicalEvents.map((event) => event.id), statuses, limit])
    : [];

  const normalizedRegion = region ? {
    ...region,
    game_use: region.llm_context_summary ?? region.summary ?? null,
    limits: stringifyLimits(region.llm_forbidden_assumptions, region.validation_notes)
  } : null;

  const socialRoles = socialRolesRaw.map(mapSocialRole);
  const occupations = occupationsRaw.map(mapOccupation);
  const allowedPlaceTemplates = placeTemplatesRaw.map(mapPlaceTemplate);
  const landscapeTemplates = landscapesRaw.map(mapLandscape);
  const waterTemplates = waterRaw.map(mapWater);
  const landUseTemplates = landUseRaw.map(mapLandUse);
  const routeTemplates = routeTemplatesRaw.map(mapRouteTemplate);
  const routeModifiers = routeModifiersRaw.map(mapRouteModifier);
  const graphEdges = graphEdgesRaw.map(mapGraphEdge);
  const edgeKnowledge = edgeKnowledgeRaw.map(mapEdgeKnowledgeRule);
  const seasonalRules = seasonalRulesRaw.map(mapSeasonalRule);
  const weatherProfiles = weatherProfilesRaw.map(mapWeatherProfile);
  const itemProfiles = itemTemplatesRaw.map(mapItemProfile);
  const objectRules = locationObjectRulesRaw.map(mapLocationObjectRule);
  const containerProfiles = buildContainerProfiles(itemProfiles, objectRules, buildingTemplatesRaw);
  const propertyRules = buildPropertyRules(objectRules, socialRoles);
  const npcArchetypes = npcGenerationRulesRaw.map(mapNpcGenerationRule);
  const knowledgeRules = npcKnowledgeRaw.map(mapNpcKnowledgeRule);
  const g5TemplateIndex = buildG5TemplateIndex(contextPacksRaw, allowedPlaceTemplates, buildingTemplatesRaw, placeRulesRaw);

  const sourceTraceRows = [
    ...sourceTrace('regions', normalizedRegion ? [normalizedRegion] : []),
    ...sourceTrace('historical_events', historicalEvents),
    ...sourceTrace('historical_event_phases', historicalEventPhases),
    ...sourceTrace('historical_anchors', historicalAnchors),
    ...sourceTrace('region_social_roles', socialRolesRaw),
    ...sourceTrace('region_occupations', occupationsRaw),
    ...sourceTrace('region_place_generation_rules', placeRulesRaw),
    ...sourceTrace('region_place_templates', placeTemplatesRaw.map((row) => ({ ...row, id: row.region_place_template_id }))),
    ...sourceTrace('place_generation_limits', placeLimitsRaw),
    ...sourceTrace('region_landscape_templates', landscapesRaw.map((row) => ({ ...row, id: row.region_landscape_template_id }))),
    ...sourceTrace('region_water_body_templates', waterRaw.map((row) => ({ ...row, id: row.region_water_body_template_id }))),
    ...sourceTrace('region_land_use_templates', landUseRaw.map((row) => ({ ...row, id: row.region_land_use_template_id }))),
    ...sourceTrace('route_templates', routeTemplatesRaw),
    ...sourceTrace('graph_edge_modifiers', routeModifiersRaw),
    ...sourceTrace('graph_edges', graphEdgesRaw),
    ...sourceTrace('graph_edge_knowledge_rules', edgeKnowledgeRaw),
    ...sourceTrace('seasonal_rules', seasonalRulesRaw),
    ...sourceTrace('weather_profiles', weatherProfilesRaw),
    ...sourceTrace('item_templates', itemTemplatesRaw),
    ...sourceTrace('price_bands', priceBandsRaw),
    ...sourceTrace('location_object_rules', locationObjectRulesRaw),
    ...sourceTrace('region_npc_generation_rules', npcGenerationRulesRaw),
    ...sourceTrace('region_npc_knowledge', npcKnowledgeRaw),
    ...sourceTrace('rumor_templates', rumorTemplatesRaw),
    ...sourceTrace('building_templates', buildingTemplatesRaw),
    ...sourceTrace('llm_context_packs', contextPacksRaw)
  ];
  const sourceRecordIds = [...new Set(sourceTraceRows.flatMap((row) => sourceIdsFromSources(row.sources)))];
  const sourceRecords = sourceRecordIds.length > 0 ? await querySourceRecords(db, sourceRecordIds) : [];
  const foundSourceIds = new Set(sourceRecords.map((row) => row.id));

  const packageDraft = {
    version: 1,
    schema: 'regional_context_package',
    request_id: requestId,
    load_policy: policy,
    frame,
    region_identity: normalizedRegion ? {
      region_id: normalizedRegion.id,
      slug: normalizedRegion.slug,
      title: normalizedRegion.display_name ?? normalizedRegion.canonical_name ?? normalizedRegion.id,
      canonical_name: normalizedRegion.canonical_name ?? null,
      alt_names: normalizedRegion.alt_names ?? [],
      region_type: normalizedRegion.region_type,
      parent_region_id: normalizedRegion.parent_region_id ?? null,
      period: { start_year: normalizedRegion.period_start_year, end_year: normalizedRegion.period_end_year },
      summary: normalizedRegion.summary,
      geographic_scope: normalizedRegion.geographic_scope,
      natural_landscape: normalizedRegion.natural_landscape,
      climate_summary: normalizedRegion.climate_summary,
      seasonal_rules: normalizedRegion.seasonal_rules ?? [],
      waterways_summary: normalizedRegion.waterways_summary ?? null,
      roads_summary: normalizedRegion.roads_summary ?? null,
      settlement_logic_summary: normalizedRegion.settlement_logic_summary,
      political_summary: normalizedRegion.political_summary,
      social_summary: normalizedRegion.social_order_summary,
      economic_summary: normalizedRegion.economy_summary,
      game_use: normalizedRegion.game_use,
      limits: normalizedRegion.limits,
      status: normalizedRegion.status,
      confidence: normalizedRegion.confidence,
      sources: normalizedRegion.sources ?? []
    } : null,
    historical_context: {
      year: frame.year,
      active_periods: [],
      active_events: historicalEvents.map(mapHistoricalEvent),
      active_event_phases: historicalEventPhases.map(mapHistoricalEventPhase),
      historical_anchors: historicalAnchors.map(mapHistoricalAnchor),
      political_pressures: compact([normalizedRegion?.political_summary, ...historicalEvents.map((event) => event.law_effect), ...historicalEvents.map((event) => event.military_effect)]),
      social_pressures: compact([normalizedRegion?.social_order_summary, ...historicalEvents.map((event) => event.social_effect)]),
      economic_pressures: compact([normalizedRegion?.economy_summary, ...historicalEvents.map((event) => event.economic_effect)]),
      forbidden_assumptions: [
        'Do not create a specific battle, envoy, riot, trial, tax collection or raid unless later selected by valid event/template data.'
      ]
    },
    social_context: {
      allowed_social_roles: socialRoles,
      roles: socialRoles,
      disallowed_social_assumptions: [
        'Do not assign a player or NPC role at regional context loading stage.',
        'Do not create a social role outside allowed_social_roles.'
      ]
    },
    occupation_context: {
      allowed_occupations: occupations,
      occupations
    },
    settlement_and_place_rules: {
      allowed_place_templates: allowedPlaceTemplates,
      place_templates: allowedPlaceTemplates,
      regional_place_generation_rules: placeRulesRaw.map(mapPlaceGenerationRule),
      place_generation_rules: placeRulesRaw.map(mapPlaceGenerationRule),
      place_generation_limits: placeLimitsRaw.map(mapPlaceGenerationLimit),
      forbidden_place_assumptions: [
        'Do not create a place type not present in allowed_place_templates.',
        'Do not create settlement scale or economy beyond regional limits.'
      ]
    },
    landscape_context: {
      allowed_landscapes: landscapeTemplates
    },
    water_context: {
      allowed_water_body_templates: waterTemplates
    },
    land_use_context: {
      allowed_land_use_templates: landUseTemplates
    },
    route_context: {
      allowed_route_templates: routeTemplates,
      route_templates: routeTemplates,
      canonical_graph_edges: graphEdges,
      seasonal_route_modifiers: routeModifiers.filter((row) => row.modifier_type === 'season' || row.applies_to_season),
      edge_knowledge_rules: edgeKnowledge,
      movement_modifiers: routeModifiers,
      forbidden_route_assumptions: [
        'Do not create a road, ferry, ford, bridge, winter road or portage unless allowed by route templates and graph edges.',
        'Do not give the character exact route knowledge unless allowed by map knowledge or edge knowledge rules.'
      ]
    },
    weather_and_season_context: {
      season: frame.season,
      clock: {
        time_of_day: frame.clock?.time_of_day ?? null,
        light_profile: frame.clock?.light_profile ?? null,
        day: frame.clock?.day ?? null,
        hour: frame.clock?.hour ?? null,
        minute: frame.clock?.minute ?? null
      },
      allowed_weather_profiles: weatherProfiles,
      seasonal_visibility_rules: seasonalRules.flatMap((rule) => compact([rule.daylight_profile, ...(asArray(rule.common_scenes))])),
      seasonal_route_effects: seasonalRules.flatMap((rule) => [...asArray(rule.road_effects), ...asArray(rule.river_effects), ...asArray(rule.available_graph_edges), ...asArray(rule.restricted_graph_edges)]),
      seasonal_work_rhythm: seasonalRules.flatMap((rule) => [...asArray(rule.work_effects), ...asArray(rule.available_occupations), ...asArray(rule.restricted_occupations)]),
      exposure_risk_rules: seasonalRules.flatMap((rule) => [...asArray(rule.common_risks), ...asArray(rule.clothing_requirements), ...asArray(rule.shelter_requirements)]),
      seasonal_rules: seasonalRules,
      forbidden_weather_assumptions: [
        'Do not create exact weather unless selected by a later weather/materialization step.',
        'Do not describe daylight if clock.light_profile is dark.'
      ]
    },
    item_context: {
      allowed_item_profiles: itemProfiles,
      item_templates: itemProfiles,
      goods_price_references: priceBandsRaw.map(mapPriceBand),
      trade_rules: placeRulesRaw.flatMap((row) => asArray(row.trade_rules)),
      forbidden_item_assumptions: [
        'Do not create items from player request alone.',
        'Every materialized item must have item_profile_id and materialization_reason.',
        'Ownership and access must be checked against property rules.'
      ]
    },
    container_context: {
      allowed_container_profiles: containerProfiles,
      container_access_rules: objectRules.filter((rule) => rule.container_policy || rule.object_category === 'container'),
      forbidden_container_assumptions: [
        'Do not create a container unless it is appropriate for selected place and ownership profile.',
        'Do not expose contents unless visibility/access rules allow it.'
      ]
    },
    property_context: {
      ownership_rules: propertyRules.ownership_rules,
      access_rules: propertyRules.access_rules,
      theft_risk_rules: propertyRules.theft_risk_rules,
      witness_rules: propertyRules.witness_rules,
      household_property_rules: propertyRules.household_property_rules,
      object_rules: objectRules,
      forbidden_property_assumptions: [
        'Do not mark an item as owned by the player without explicit character generation result.',
        'Do not let player freely take property unless ownership/access rules allow it.'
      ]
    },
    npc_context: {
      allowed_npc_archetypes: npcArchetypes,
      name_pools: npcArchetypes.flatMap((row) => asArray(row.name_rules)),
      key_npc_seeds: npcArchetypes.filter((row) => row.npc_profile_type === 'key'),
      social_role_links: socialRoles.map((row) => ({ social_role_id: row.social_role_id, title: row.title, npc_generation_rules: row.npc_generation_rules ?? [] })),
      occupation_links: occupations.map((row) => ({ occupation_id: row.occupation_id, title: row.title, npc_generation_weight: row.npc_generation_weight ?? null })),
      forbidden_npc_assumptions: [
        'Do not create NPC outside allowed archetypes, social roles and occupations.',
        'Do not create key NPC unless selected from key_npc_seeds or explicitly materialized later with audit.',
        'Do not assign hidden motives at regional context loading stage.'
      ]
    },
    knowledge_context: {
      common_knowledge: compact([normalizedRegion?.npc_common_knowledge_summary, normalizedRegion?.historical_context_summary]),
      role_based_knowledge_rules: socialRoles.map((row) => ({ social_role_id: row.social_role_id, typical_knowledge: row.typical_knowledge ?? [] })),
      occupation_based_knowledge_rules: occupations.map((row) => ({ occupation_id: row.occupation_id, typical_knowledge: row.typical_knowledge ?? [] })),
      route_knowledge_rules: edgeKnowledge,
      npc_knowledge_rules: knowledgeRules,
      rumor_templates: rumorTemplatesRaw.map(mapRumorTemplate),
      forbidden_knowledge_assumptions: [
        'Do not give the player complete map knowledge.',
        'Do not give exact route knowledge unless role, occupation or prior knowledge allows it.',
        'Rumors are not facts unless separately verified.'
      ]
    },
    g5_context: {
      g5_template_index: g5TemplateIndex,
      g4_type_to_allowed_anchor_rules: buildG4AnchorRules(allowedPlaceTemplates, placeRulesRaw, buildingTemplatesRaw),
      visibility_rules: objectRules.filter((rule) => rule.visibility_default),
      access_rules: [
        ...objectRules.filter((rule) => rule.access_default),
        ...buildingTemplatesRaw.flatMap((row) => asArray(row.access_rules))
      ],
      context_packs: contextPacksRaw.filter((pack) => pack.context_type === 'scene_context'),
      forbidden_g5_assumptions: [
        'Do not precreate all G5 for the region.',
        'Materialize G5 only after selected G4 start location is known.',
        'Every G5 anchor must be allowed by selected G4 type.'
      ]
    },
    source_trace: sourceTraceRows,
    source_records: sourceRecords.map((row) => ({
      source_id: row.id,
      title: row.title,
      source_type: row.source_type,
      reliability_level: row.reliability_level,
      status: row.status,
      confidence: row.confidence
    })),
    missing_or_weak_context: [],
    downstream_context_index: {},
    audit: makeAudit(true, [], [{ kind: 'regional_context_loader', region_id: frame.region_id, year: frame.year, season: frame.season }])
  };

  packageDraft.missing_or_weak_context = findMissingOrWeakContext(packageDraft);
  packageDraft.downstream_context_index = buildDownstreamContextIndex(packageDraft);
  const auditConcerns = buildRegionalContextConcerns(packageDraft, { frame, policy, foundSourceIds });
  packageDraft.audit = makeAudit(auditConcerns.length === 0, auditConcerns, [
    { kind: 'world_base_read', region_id: frame.region_id, year: frame.year, season: frame.season },
    { kind: 'loaded_groups', counts: contextCounts(packageDraft) },
    { kind: 'source_trace', record_count: packageDraft.source_trace.length, source_record_count: sourceRecords.length }
  ]);

  return packageDraft;
}

export function validateRegionalContextPackage(output = {}, { historicalFrame = null, loadPolicy = null } = {}) {
  const frame = frameFromHistoricalFrame(historicalFrame ?? output.frame ?? {});
  const policy = normalizeLoadPolicy(loadPolicy ?? output.load_policy ?? {});
  const foundSourceIds = new Set((output.source_records ?? []).map((row) => row.source_id ?? row.id).filter(Boolean));
  const concerns = buildRegionalContextConcerns(output, { frame, policy, foundSourceIds });
  if (output?.audit?.pass !== true) {
    concerns.push({
      code: 'REGIONAL_CONTEXT_AUDIT_NOT_PASSED',
      field: 'audit.pass',
      message: 'regional_context_package.audit.pass must be true before stage 4 can commit.'
    });
  }
  return {
    pass: concerns.length === 0,
    concerns,
    evidence: [
      { kind: 'regional_context_validation', region_id: frame.region_id, require_sources: policy.require_sources },
      { kind: 'loaded_groups', counts: contextCounts(output) }
    ]
  };
}

function buildRegionalContextConcerns(pkg = {}, { frame, policy, foundSourceIds = new Set() } = {}) {
  const concerns = [];
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) {
    return [{ code: 'REGIONAL_CONTEXT_INVALID_JSON', message: 'regional_context_package must be an object.' }];
  }
  if (pkg.schema !== 'regional_context_package') concerns.push(concern('REGIONAL_CONTEXT_SCHEMA_MISMATCH', 'schema', 'schema must be regional_context_package.'));
  if (pkg.version !== 1) concerns.push(concern('REGIONAL_CONTEXT_SCHEMA_MISMATCH', 'version', 'version must be 1.'));
  if (!pkg.region_identity) concerns.push(concern('REGIONAL_CONTEXT_MISSING_REGION_PROFILE', 'region_identity', 'region_identity is required.'));
  if (frame?.region_id && pkg.region_identity?.region_id !== frame.region_id) {
    concerns.push(concern('REGIONAL_CONTEXT_REGION_MISMATCH', 'region_identity.region_id', 'region_identity.region_id must match historical_frame.region.region_id.'));
  }

  const missing = findMissingOrWeakContext(pkg);
  for (const item of missing) {
    concerns.push(concern(item.code, item.field, item.message));
  }

  const trace = Array.isArray(pkg.source_trace) ? pkg.source_trace : [];
  if (trace.length === 0) concerns.push(concern('REGIONAL_CONTEXT_SOURCE_MISSING', 'source_trace', 'source_trace must not be empty.'));
  for (const entry of trace) {
    if (entry?.status === 'conflict') concerns.push(concern('REGIONAL_CONTEXT_CONFLICT_RECORD_USED', `source_trace.${entry.table}.${entry.id}`, 'conflict records are not allowed.'));
    if (entry?.status === 'rejected') concerns.push(concern('REGIONAL_CONTEXT_REJECTED_RECORD_USED', `source_trace.${entry.table}.${entry.id}`, 'rejected records are not allowed.'));
    if (entry?.status === 'draft' && !policy.allow_draft) concerns.push(concern('REGIONAL_CONTEXT_DRAFT_RECORD_NOT_ALLOWED', `source_trace.${entry.table}.${entry.id}`, 'draft records are not allowed by load_policy.'));
    if (entry?.status === 'needs_review' && !policy.allow_needs_review) concerns.push(concern('REGIONAL_CONTEXT_DRAFT_RECORD_NOT_ALLOWED', `source_trace.${entry.table}.${entry.id}`, 'needs_review records are not allowed by load_policy.'));
    if (entry?.confidence && !CONFIDENCE_VALUES.has(entry.confidence)) concerns.push(concern('REGIONAL_CONTEXT_SCHEMA_MISMATCH', `source_trace.${entry.table}.${entry.id}.confidence`, 'confidence value is not allowed.'));
    if (!entry?.game_use) concerns.push(concern('REGIONAL_CONTEXT_SCHEMA_MISMATCH', `source_trace.${entry.table}.${entry.id}.game_use`, 'game_use must be preserved in source_trace.'));
    if (!entry?.limits) concerns.push(concern('REGIONAL_CONTEXT_SCHEMA_MISMATCH', `source_trace.${entry.table}.${entry.id}.limits`, 'limits must be preserved in source_trace.'));
    const ids = sourceIdsFromSources(entry?.sources);
    if (policy.require_sources && ids.length === 0) concerns.push(concern('REGIONAL_CONTEXT_SOURCE_MISSING', `source_trace.${entry.table}.${entry.id}.sources`, 'sources must not be empty when load_policy.require_sources=true.'));
    for (const id of ids) {
      if (!foundSourceIds.has(id)) concerns.push(concern('REGIONAL_CONTEXT_SOURCE_NOT_FOUND', `source_trace.${entry.table}.${entry.id}.sources`, `source_id ${id} was not found in world_base.source_records.`));
    }
  }

  for (const path of findForbiddenKeys(pkg)) {
    const code = forbiddenCodeFor(path);
    concerns.push(concern(code, path, `regional_context_package must not contain downstream field ${path}.`));
  }

  if (!Array.isArray(pkg.audit?.evidence) || pkg.audit.evidence.length === 0) {
    concerns.push(concern('REGIONAL_CONTEXT_EMPTY_AUDIT_EVIDENCE', 'audit.evidence', 'audit.evidence must not be empty.'));
  }
  if (pkg.audit?.pass === false && (!Array.isArray(pkg.audit?.concerns) || pkg.audit.concerns.length === 0)) {
    concerns.push(concern('REGIONAL_CONTEXT_SCHEMA_MISMATCH', 'audit.concerns', 'audit.concerns must not be empty when audit.pass=false.'));
  }
  return dedupeConcerns(concerns);
}

function findMissingOrWeakContext(pkg = {}) {
  const missing = [];
  addMissing(missing, !pkg.region_identity, 'REGIONAL_CONTEXT_MISSING_REGION_PROFILE', 'region_identity', 'Missing region profile.');
  addMissing(missing, isEmpty(pkg.historical_context?.active_events) && isEmpty(pkg.historical_context?.historical_anchors), 'REGIONAL_CONTEXT_MISSING_TIMELINE', 'historical_context', 'Missing regional timeline, events or historical anchors.');
  addMissing(missing, isEmpty(pkg.social_context?.allowed_social_roles), 'REGIONAL_CONTEXT_MISSING_SOCIAL_ROLES', 'social_context.allowed_social_roles', 'Missing social roles.');
  addMissing(missing, isEmpty(pkg.occupation_context?.allowed_occupations), 'REGIONAL_CONTEXT_MISSING_OCCUPATIONS', 'occupation_context.allowed_occupations', 'Missing occupations.');
  addMissing(missing, isEmpty(pkg.settlement_and_place_rules?.allowed_place_templates) && isEmpty(pkg.settlement_and_place_rules?.regional_place_generation_rules), 'REGIONAL_CONTEXT_MISSING_PLACE_RULES', 'settlement_and_place_rules', 'Missing place rules or templates.');
  addMissing(missing, isEmpty(pkg.landscape_context?.allowed_landscapes), 'REGIONAL_CONTEXT_MISSING_LANDSCAPE_RULES', 'landscape_context.allowed_landscapes', 'Missing landscape context.');
  addMissing(missing, isEmpty(pkg.water_context?.allowed_water_body_templates), 'REGIONAL_CONTEXT_MISSING_WATER_RULES', 'water_context.allowed_water_body_templates', 'Missing water context.');
  addMissing(missing, isEmpty(pkg.land_use_context?.allowed_land_use_templates), 'REGIONAL_CONTEXT_MISSING_LAND_USE_RULES', 'land_use_context.allowed_land_use_templates', 'Missing land use context.');
  addMissing(missing, isEmpty(pkg.route_context?.allowed_route_templates) || isEmpty(pkg.route_context?.canonical_graph_edges), 'REGIONAL_CONTEXT_MISSING_ROUTE_RULES', 'route_context', 'Missing route templates or canonical graph edges.');
  addMissing(missing, isEmpty(pkg.weather_and_season_context?.allowed_weather_profiles) && isEmpty(pkg.weather_and_season_context?.seasonal_rules), 'REGIONAL_CONTEXT_MISSING_WEATHER_RULES', 'weather_and_season_context', 'Missing weather and season context.');
  addMissing(missing, isEmpty(pkg.item_context?.allowed_item_profiles), 'REGIONAL_CONTEXT_MISSING_ITEM_PROFILES', 'item_context.allowed_item_profiles', 'Missing item profiles.');
  addMissing(missing, isEmpty(pkg.container_context?.allowed_container_profiles), 'REGIONAL_CONTEXT_MISSING_CONTAINER_PROFILES', 'container_context.allowed_container_profiles', 'Missing container profiles.');
  addMissing(missing, isEmpty(pkg.property_context?.ownership_rules) && isEmpty(pkg.property_context?.access_rules) && isEmpty(pkg.property_context?.object_rules), 'REGIONAL_CONTEXT_MISSING_PROPERTY_RULES', 'property_context', 'Missing property/access/object rules.');
  addMissing(missing, isEmpty(pkg.npc_context?.allowed_npc_archetypes) && isEmpty(pkg.npc_context?.social_role_links), 'REGIONAL_CONTEXT_MISSING_NPC_POOLS', 'npc_context', 'Missing NPC pools.');
  addMissing(missing, isEmpty(pkg.knowledge_context?.route_knowledge_rules) && isEmpty(pkg.knowledge_context?.npc_knowledge_rules) && isEmpty(pkg.knowledge_context?.common_knowledge), 'REGIONAL_CONTEXT_MISSING_KNOWLEDGE_CONTEXT', 'knowledge_context', 'Missing knowledge context.');
  addMissing(missing, isEmpty(pkg.g5_context?.g5_template_index) && isEmpty(pkg.g5_context?.g4_type_to_allowed_anchor_rules), 'REGIONAL_CONTEXT_MISSING_G5_CONTEXT', 'g5_context', 'Missing G5 materialization rules.');
  return missing;
}

function buildDownstreamContextIndex(pkg) {
  const socialRoleIds = ids(pkg.social_context?.allowed_social_roles, 'social_role_id');
  const occupationIds = ids(pkg.occupation_context?.allowed_occupations, 'occupation_id');
  const placeTemplateIds = ids(pkg.settlement_and_place_rules?.allowed_place_templates, 'place_template_id');
  const landscapeTemplateIds = ids(pkg.landscape_context?.allowed_landscapes, 'landscape_template_id');
  const waterBodyTemplateIds = ids(pkg.water_context?.allowed_water_body_templates, 'water_body_template_id');
  const landUseTemplateIds = ids(pkg.land_use_context?.allowed_land_use_templates, 'land_use_template_id');
  const routeTemplateIds = ids(pkg.route_context?.allowed_route_templates, 'route_template_id');
  const graphEdgeIds = ids(pkg.route_context?.canonical_graph_edges, 'graph_edge_id');
  const itemProfileIds = ids(pkg.item_context?.allowed_item_profiles, 'item_profile_id');
  const containerProfileIds = ids(pkg.container_context?.allowed_container_profiles, 'container_profile_id');
  const npcArchetypeIds = ids(pkg.npc_context?.allowed_npc_archetypes, 'npc_archetype_id');
  return {
    for_start_candidate_retriever: {
      required_region_id: pkg.region_identity?.region_id ?? null,
      allowed_graph_edge_ids: graphEdgeIds,
      allowed_route_template_ids: routeTemplateIds,
      allowed_landscape_template_ids: landscapeTemplateIds,
      allowed_water_body_template_ids: waterBodyTemplateIds,
      allowed_land_use_template_ids: landUseTemplateIds,
      must_not_create: ['G5', 'NPC', 'item', 'player_character', 'intro_prose']
    },
    for_player_character_generator: {
      allowed_social_role_ids: socialRoleIds,
      allowed_occupation_ids: occupationIds,
      allowed_item_profile_ids: itemProfileIds,
      property_rule_count: (pkg.property_context?.ownership_rules ?? []).length + (pkg.property_context?.access_rules ?? []).length,
      must_not_select_start_node: true
    },
    for_npc_generator: {
      allowed_npc_archetype_ids: npcArchetypeIds,
      allowed_social_role_ids: socialRoleIds,
      allowed_occupation_ids: occupationIds,
      name_pool_count: pkg.npc_context?.name_pools?.length ?? 0,
      must_not_materialize_at_stage4: true
    },
    for_item_materializer: {
      allowed_item_profile_ids: itemProfileIds,
      allowed_container_profile_ids: containerProfileIds,
      allowed_place_template_ids: placeTemplateIds,
      must_require_materialization_reason: true
    },
    for_g5_materialization: {
      allowed_place_template_ids: placeTemplateIds,
      g5_template_ids: ids(pkg.g5_context?.g5_template_index, 'g5_template_id'),
      must_wait_for_selected_g4: true
    },
    social_role_ids: socialRoleIds,
    occupation_ids: occupationIds,
    place_template_ids: placeTemplateIds,
    item_template_ids: itemProfileIds
  };
}

async function one(db, sql, params) {
  const { rows } = await db.query(sql, params);
  return rows[0] ?? null;
}

async function many(db, sql, params) {
  const { rows } = await db.query(sql, params);
  return rows;
}

async function querySourceRecords(db, ids) {
  const { rows } = await db.query(`
    SELECT id, title, slug, source_type, author, publication_year, period_covered,
           region_covered, reliability_level, usefulness, limitations, status,
           confidence, audit_notes
    FROM world_base.source_records
    WHERE id = ANY($1::text[])
  `, [ids]);
  return rows;
}

function mapHistoricalEvent(row) {
  return pick(row, ['id', 'region_id', 'slug', 'title', 'event_type', 'period_start_year', 'period_end_year', 'approximate_date', 'summary', 'current_phase', 'local_signs', 'economic_effect', 'road_effect', 'law_effect', 'social_effect', 'military_effect', 'religious_effect', 'npc_knowledge_effect', 'rumor_effect', 'game_use', 'limits', 'status', 'confidence', 'sources', 'audit_notes']);
}

function mapHistoricalEventPhase(row) {
  return pick(row, ['id', 'event_id', 'region_id', 'phase_name', 'phase_order', 'date_start', 'date_end', 'summary', 'visible_signs', 'affected_places', 'affected_graph_edges', 'affected_roles', 'security_changes', 'law_changes', 'rumor_templates', 'what_character_can_know', 'what_character_cannot_know', 'game_use', 'limits', 'status', 'confidence', 'sources', 'audit_notes']);
}

function mapHistoricalAnchor(row) {
  return pick(row, ['id', 'region_id', 'place_id', 'slug', 'canonical_name', 'display_name', 'anchor_type', 'summary', 'historical_status', 'period_start_year', 'period_end_year', 'approximate_bearing', 'distance_band', 'zone_of_influence', 'access_graph_edges', 'visible_signs', 'economic_influence', 'political_influence', 'religious_influence', 'military_influence', 'trade_influence', 'character_knowledge_common', 'character_knowledge_trader', 'character_knowledge_elite', 'character_knowledge_clergy', 'character_knowledge_outsider', 'discovery_conditions', 'llm_use_rules', 'llm_forbidden_changes', 'game_use', 'limits', 'status', 'confidence', 'sources', 'audit_notes']);
}

function mapSocialRole(row) {
  return {
    id: row.id,
    social_role_id: row.id,
    region_id: row.region_id,
    slug: row.slug,
    title: row.title,
    status_group: row.role_group,
    role_group: row.role_group,
    legal_status: row.free_status ?? row.legal_capacity,
    wealth_band: row.wealth_level,
    rights_summary: compact([row.property_rights, row.travel_rights, row.trade_rights, row.court_rights]).join(' | '),
    obligations_summary: compact([row.tax_obligations, row.service_obligations]).join(' | '),
    typical_occupation_ids: asArray(row.allowed_occupations),
    allowed_occupations: asArray(row.allowed_occupations),
    allowed_places: asArray(row.allowed_places),
    typical_equipment: asArray(row.typical_equipment),
    typical_knowledge: asArray(row.typical_knowledge),
    npc_generation_rules: asArray(row.npc_generation_rules),
    player_character_rules: asArray(row.player_character_rules),
    game_use: row.game_use,
    limits: row.limits,
    status: row.status,
    confidence: row.confidence,
    sources: row.sources ?? [],
    audit_notes: row.audit_notes ?? null
  };
}

function mapOccupation(row) {
  return {
    id: row.id,
    occupation_id: row.id,
    region_id: row.region_id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    occupation_group: row.occupation_group,
    required_social_role_ids: asArray(row.allowed_social_roles),
    allowed_social_roles: asArray(row.allowed_social_roles),
    typical_place_template_ids: asArray(row.required_location_types),
    required_location_types: asArray(row.required_location_types),
    seasonal_pattern: row.seasonality,
    seasonality: row.seasonality,
    tools_or_item_profile_ids: asArray(row.required_tools),
    required_tools: asArray(row.required_tools),
    produced_goods: asArray(row.produced_goods),
    services_provided: asArray(row.services_provided),
    typical_equipment: asArray(row.typical_equipment),
    typical_risks: asArray(row.typical_risks),
    typical_knowledge: asArray(row.typical_knowledge),
    npc_generation_weight: row.npc_generation_weight,
    is_generated_allowed: row.is_generated_allowed,
    game_use: row.game_use,
    limits: row.limits,
    status: row.status,
    confidence: row.confidence,
    sources: row.sources ?? [],
    audit_notes: row.audit_notes ?? null
  };
}

function mapPlaceTemplate(row) {
  return {
    id: row.place_template_id,
    region_place_template_id: row.region_place_template_id,
    place_template_id: row.place_template_id,
    region_id: row.region_id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    place_kind: row.place_kind,
    default_node_type: row.default_node_type,
    is_allowed: row.is_allowed,
    is_common: row.is_common,
    is_rare: row.is_rare,
    generation_weight: row.generation_weight,
    allowed_scale_levels: asArray(row.allowed_scale_levels),
    allowed_node_types: asArray(row.allowed_node_types),
    required_landscape_template_ids: [],
    compatible_landscape_template_ids: asArray(row.compatible_landscape_template_ids),
    compatible_water_body_template_ids: asArray(row.compatible_water_body_template_ids),
    compatible_land_use_template_ids: asArray(row.compatible_land_use_template_ids),
    required_route_template_ids: asArray(row.compatible_route_template_ids),
    social_role_constraints: compact([row.social_logic]),
    occupation_constraints: [],
    economic_constraints: compact([row.economic_logic]),
    population_or_household_limits: compact([row.settlement_density_effect]),
    regional_limits: row.regional_limits,
    game_use: row.regional_game_use ?? row.game_use,
    limits: row.regional_limits_text ?? row.limits,
    status: row.status,
    confidence: row.confidence,
    sources: row.sources ?? [],
    audit_notes: row.audit_notes ?? null
  };
}

function mapPlaceGenerationRule(row) {
  return pick(row, ['id', 'region_id', 'title', 'slug', 'template_type', 'summary', 'generation_allowed', 'max_instances_per_region', 'min_distance_from_major_place', 'required_landscape', 'required_economy', 'required_route_access', 'required_water_access', 'seasonal_availability', 'typical_population_band', 'typical_household_count', 'typical_wealth_level', 'typical_authority', 'typical_social_roles', 'typical_occupations', 'typical_buildings', 'typical_tools', 'typical_goods', 'typical_risks', 'typical_conflicts', 'layout_rules', 'access_rules', 'law_rules', 'trade_rules', 'npc_generation_rules', 'item_generation_rules', 'route_generation_rules', 'historical_plausibility_rules', 'game_use', 'limits', 'status', 'confidence', 'sources', 'audit_notes']);
}

function mapPlaceGenerationLimit(row) {
  return pick(row, ['id', 'region_id', 'place_template_id', 'max_total', 'max_per_subregion', 'min_total_if_region_active', 'economic_basis_required', 'route_basis_required', 'water_basis_required', 'authority_basis_required', 'historical_anchor_basis_required', 'allowed_near_place_types', 'forbidden_near_place_types', 'minimum_distance_band', 'maximum_distance_band', 'density_logic', 'naming_policy', 'duplication_policy', 'game_use', 'limits', 'status', 'confidence', 'sources', 'audit_notes']);
}

function mapLandscape(row) {
  return {
    landscape_template_id: row.landscape_template_id,
    title: row.title,
    landscape_group: row.landscape_group,
    base_environment: row.base_environment,
    base_movement_multiplier: row.base_movement_multiplier,
    default_orientation_difficulty: row.default_orientation_difficulty,
    base_risk_level: row.base_risk_level,
    is_common: row.is_common,
    is_dominant: row.is_dominant,
    is_rare: row.is_rare,
    allowed_scale_levels: asArray(row.allowed_scale_levels),
    allowed_node_types: asArray(row.allowed_node_types),
    regional_limits: row.regional_limits,
    game_use: row.regional_game_use ?? row.game_use,
    limits: row.regional_limits_text ?? row.limits,
    status: row.status,
    confidence: row.confidence,
    sources: row.sources ?? [],
    audit_notes: row.audit_notes ?? null
  };
}

function mapWater(row) {
  return {
    water_body_template_id: row.water_body_template_id,
    title: row.title,
    water_body_type: row.water_body_type,
    salinity: row.salinity,
    flow_type: row.flow_type,
    supports_boat: row.supports_boat,
    supports_ford: row.supports_ford,
    supports_ferry: row.supports_ferry,
    supports_bridge: row.supports_bridge,
    supports_winter_crossing: row.supports_winter_crossing,
    freeze_pattern: row.freeze_pattern,
    flood_risk: row.flood_risk,
    base_crossing_risk: row.base_crossing_risk,
    regional_limits: row.regional_limits,
    game_use: row.regional_game_use ?? row.game_use,
    limits: row.regional_limits_text ?? row.limits,
    status: row.status,
    confidence: row.confidence,
    sources: row.sources ?? [],
    audit_notes: row.audit_notes ?? null
  };
}

function mapLandUse(row) {
  return {
    land_use_template_id: row.land_use_template_id,
    title: row.title,
    land_use_kind: row.land_use_kind,
    requires_settlement_nearby: row.requires_settlement_nearby,
    requires_water_nearby: row.requires_water_nearby,
    compatible_landscape_template_ids: asArray(row.compatible_landscape_template_ids),
    compatible_water_body_template_ids: asArray(row.compatible_water_body_template_ids),
    seasonal_pattern: row.seasonal_pattern,
    labor_intensity: row.labor_intensity,
    economic_use: row.economic_use,
    movement_effect: row.movement_effect,
    risk_effect: row.risk_effect,
    regional_limits: row.regional_limits,
    game_use: row.regional_game_use ?? row.game_use,
    limits: row.regional_limits_text ?? row.limits,
    status: row.status,
    confidence: row.confidence,
    sources: row.sources ?? [],
    audit_notes: row.audit_notes ?? null
  };
}

function mapRouteTemplate(row) {
  return {
    route_template_id: row.id,
    ...pick(row, ['id', 'slug', 'title', 'summary', 'route_kind', 'default_edge_type', 'surface_type', 'requires_landscape_template', 'requires_water_body_template', 'supports_pedestrian', 'supports_horse', 'supports_cart', 'supports_sled', 'supports_boat', 'seasonal_availability', 'default_access_rule', 'default_orientation_difficulty', 'default_risk_level', 'default_movement_multiplier', 'game_use', 'limits', 'status', 'confidence', 'sources', 'audit_notes'])
  };
}

function mapRouteModifier(row) {
  return pick(row, ['id', 'title', 'modifier_type', 'applies_to_edge_type', 'applies_to_terrain_type', 'applies_to_season', 'multiplier', 'summary', 'example', 'game_use', 'limits', 'status', 'confidence', 'sources', 'audit_notes']);
}

function mapGraphEdge(row) {
  return { graph_edge_id: row.id, ...pick(row, ['id', 'region_id', 'from_node_id', 'to_node_id', 'reverse_edge_id', 'scale_level', 'edge_type', 'base_gu', 'base_distance_km', 'base_time_minutes', 'base_time_hours', 'base_time_days', 'route_template_id', 'landscape_template_id', 'water_body_template_id', 'seasonal_rule', 'access_rule', 'risk_level', 'known_to_commoners', 'known_to_traders', 'known_to_elites', 'known_to_clergy', 'known_to_character_default', 'requires_guide', 'requires_boat', 'requires_horse', 'requires_sled', 'requires_permission', 'requires_orientation_check', 'orientation_difficulty', 'movement_risk_profile', 'failure_consequences', 'historical_status', 'status', 'confidence', 'sources', 'audit_notes']) };
}

function mapEdgeKnowledgeRule(row) {
  return pick(row, ['id', 'region_id', 'graph_edge_id', 'social_role_id', 'occupation_id', 'knowledge_level', 'knowledge_source', 'accuracy', 'common_mistakes', 'seasonal_limitations', 'danger_awareness', 'landmarks_known', 'places_known_on_graph_edge', 'can_guide_others', 'will_share_for_free', 'will_share_for_payment', 'will_hide_or_lie', 'game_use', 'limits', 'status', 'confidence', 'sources', 'audit_notes']);
}

function mapSeasonalRule(row) {
  return pick(row, ['id', 'region_id', 'season', 'title', 'slug', 'weather_profile', 'daylight_profile', 'road_effects', 'river_effects', 'forest_effects', 'field_effects', 'food_effects', 'work_effects', 'trade_effects', 'war_effects', 'disease_effects', 'clothing_requirements', 'shelter_requirements', 'available_occupations', 'restricted_occupations', 'available_graph_edges', 'restricted_graph_edges', 'common_risks', 'common_scenes', 'game_use', 'limits', 'status', 'confidence', 'sources', 'audit_notes']);
}

function mapWeatherProfile(row) {
  return pick(row, ['id', 'region_id', 'seasonal_rule_id', 'title', 'slug', 'weather_type', 'summary', 'temperature_band', 'precipitation', 'wind', 'visibility', 'ground_condition', 'water_condition', 'road_modifier', 'movement_modifier', 'body_state_risk', 'npc_activity_effect', 'trade_effect', 'combat_effect', 'stealth_effect', 'fire_effect', 'visible_description', 'sound_description', 'smell_description', 'game_use', 'limits', 'status', 'confidence', 'sources', 'audit_notes']);
}

function mapItemProfile(row) {
  return {
    id: row.id,
    item_profile_id: row.id,
    item_template_id: row.id,
    region_id: row.region_id,
    title: row.title,
    slug: row.slug,
    item_group: row.item_type,
    item_type: row.item_type,
    summary: row.summary,
    function: row.function,
    typical_place_template_ids: asArray(row.typical_locations),
    typical_locations: asArray(row.typical_locations),
    typical_social_role_ids: asArray(row.typical_owner_roles),
    typical_owner_roles: asArray(row.typical_owner_roles),
    typical_holder_roles: asArray(row.typical_holder_roles),
    typical_occupation_ids: [],
    ownership_default: row.legal_status,
    materialization_conditions: asArray(row.failure_risks),
    rarity: row.rarity,
    value_band: row.value_band,
    legal_or_social_risk: row.risk_default ?? row.legal_status ?? row.social_status_signal,
    seasonal_limits: [],
    typical_containers: asArray(row.typical_containers),
    visibility_default: row.visibility_default,
    access_default: row.access_default,
    game_use: row.game_use,
    limits: row.limits,
    status: row.status,
    confidence: row.confidence,
    sources: row.sources ?? [],
    audit_notes: row.audit_notes ?? null
  };
}

function mapPriceBand(row) {
  return pick(row, ['id', 'region_id', 'title', 'slug', 'item_or_service_type', 'value_band', 'normal_price_description', 'cheap_condition', 'expensive_condition', 'scarcity_factors', 'seasonal_modifiers', 'war_modifiers', 'road_modifiers', 'status_modifiers', 'trade_place_modifiers', 'who_can_afford', 'who_can_sell', 'who_controls_supply', 'barter_options', 'tax_or_duty', 'risk_of_fraud', 'game_use', 'limits', 'status', 'confidence', 'sources', 'audit_notes']);
}

function mapLocationObjectRule(row) {
  return pick(row, ['id', 'region_id', 'place_template_id', 'place_id', 'location_type', 'building_type', 'object_category', 'item_template_id', 'probability_band', 'required_reason', 'required_owner', 'required_holder', 'visibility_default', 'access_default', 'legal_risk', 'social_risk', 'economic_justification', 'can_be_generated', 'must_be_pregenerated', 'forbidden_without_reason', 'container_policy', 'hidden_policy', 'game_use', 'limits', 'status', 'confidence', 'sources', 'audit_notes']);
}

function mapNpcGenerationRule(row) {
  return {
    npc_archetype_id: row.id,
    ...pick(row, ['id', 'region_id', 'title', 'slug', 'npc_profile_type', 'applies_to_place_types', 'applies_to_location_types', 'allowed_social_roles', 'allowed_occupations', 'forbidden_roles', 'rarity_rules', 'name_rules', 'age_rules', 'gender_rules', 'status_rules', 'wealth_rules', 'clothing_rules', 'equipment_rules', 'speech_rules', 'knowledge_rules', 'fear_rules', 'goal_rules', 'authority_rules', 'reaction_to_strangers', 'reaction_to_violence', 'reaction_to_theft', 'reaction_to_trade', 'reaction_to_law', 'background_npc_minimum', 'scene_npc_minimum', 'key_npc_minimum', 'game_use', 'limits', 'status', 'confidence', 'sources', 'audit_notes'])
  };
}

function mapNpcKnowledgeRule(row) {
  return pick(row, ['id', 'region_id', 'social_role_id', 'occupation_id', 'knowledge_type', 'title', 'summary', 'knows_as_fact', 'knows_as_rumor', 'common_mistakes', 'cannot_know', 'taboo_topics', 'dangerous_to_say', 'regional_knowledge', 'local_place_knowledge', 'law_knowledge', 'economy_knowledge', 'religion_knowledge', 'historical_knowledge', 'route_knowledge', 'social_order_knowledge', 'price_knowledge', 'speech_style_notes', 'behavior_effect', 'game_use', 'limits', 'status', 'confidence', 'sources', 'audit_notes']);
}

function mapRumorTemplate(row) {
  return pick(row, ['id', 'region_id', 'title', 'slug', 'rumor_type', 'summary', 'source_role', 'spread_places', 'spread_graph_edges', 'affected_roles', 'linked_event_id', 'linked_place_id', 'linked_risk_id', 'truth_status', 'distortion_level', 'what_is_visible', 'danger_of_repeating', 'possible_effects', 'expiration_or_update_rule', 'game_use', 'limits', 'status', 'confidence', 'sources', 'audit_notes']);
}

function buildContainerProfiles(itemProfiles, objectRules, buildingTemplates) {
  const profiles = new Map();
  for (const item of itemProfiles) {
    for (const label of item.typical_containers ?? []) {
      const key = slug(label);
      profiles.set(key, {
        container_profile_id: `container_profile:${key}`,
        title: label,
        source: 'item_templates.typical_containers',
        item_profile_ids: [...new Set([...(profiles.get(key)?.item_profile_ids ?? []), item.item_profile_id])]
      });
    }
  }
  for (const rule of objectRules) {
    if (rule.container_policy || rule.object_category === 'container') {
      const key = slug(rule.object_category ?? rule.container_policy ?? rule.id);
      profiles.set(key, {
        container_profile_id: `container_profile:${key}`,
        title: rule.object_category ?? rule.container_policy ?? rule.id,
        source: 'location_object_rules',
        location_object_rule_ids: [...new Set([...(profiles.get(key)?.location_object_rule_ids ?? []), rule.id])]
      });
    }
  }
  for (const building of buildingTemplates) {
    for (const entry of asArray(building.storage_rules)) {
      const key = slug(typeof entry === 'string' ? entry : JSON.stringify(entry));
      profiles.set(key, {
        container_profile_id: `container_profile:${key}`,
        title: typeof entry === 'string' ? entry : key,
        source: 'building_templates.storage_rules',
        building_template_ids: [...new Set([...(profiles.get(key)?.building_template_ids ?? []), building.id])]
      });
    }
  }
  return [...profiles.values()];
}

function buildPropertyRules(objectRules, socialRoles) {
  return {
    ownership_rules: [
      ...objectRules.filter((rule) => rule.required_owner),
      ...socialRoles.filter((role) => role.rights_summary).map((role) => ({ social_role_id: role.social_role_id, property_rights: role.rights_summary }))
    ],
    access_rules: objectRules.filter((rule) => rule.access_default || rule.required_holder),
    theft_risk_rules: objectRules.filter((rule) => rule.legal_risk || rule.social_risk),
    witness_rules: objectRules.filter((rule) => rule.visibility_default),
    household_property_rules: objectRules.filter((rule) => rule.required_owner || rule.required_holder)
  };
}

function buildG5TemplateIndex(contextPacks, placeTemplates, buildingTemplates, placeRules) {
  const packs = contextPacks.filter((pack) => pack.context_type === 'scene_context' || pack.context_type === 'new_place_generation');
  const fromPacks = packs.map((pack) => ({
    g5_template_id: `llm_context_pack:${pack.id}`,
    source_table: 'world_base.llm_context_packs',
    source_id: pack.id,
    title: pack.title,
    context_type: pack.context_type,
    summary: pack.summary,
    included_tables: pack.included_tables ?? [],
    included_record_ids: pack.included_record_ids ?? [],
    hard_constraints: pack.hard_constraints ?? [],
    forbidden_assumptions: pack.forbidden_assumptions ?? [],
    game_use: null,
    limits: null,
    status: pack.status,
    confidence: pack.confidence,
    sources: pack.sources ?? []
  }));
  const fromPlaces = placeTemplates.map((place) => ({
    g5_template_id: `place_template:${place.place_template_id}`,
    source_table: 'world_base.region_place_templates',
    source_id: place.region_place_template_id,
    place_template_id: place.place_template_id,
    title: place.title,
    allowed_node_types: place.allowed_node_types,
    allowed_scale_levels: place.allowed_scale_levels,
    status: place.status,
    confidence: place.confidence,
    sources: place.sources ?? []
  }));
  const fromBuildings = buildingTemplates.map((building) => ({
    g5_template_id: `building_template:${building.id}`,
    source_table: 'world_base.building_templates',
    source_id: building.id,
    title: building.title,
    building_type: building.building_type,
    allowed_place_types: asArray(building.allowed_place_types),
    allowed_location_types: asArray(building.allowed_location_types),
    room_templates: asArray(building.room_templates),
    layout_rules: asArray(building.layout_rules),
    access_rules: asArray(building.access_rules),
    status: building.status,
    confidence: building.confidence,
    sources: building.sources ?? []
  }));
  const fromPlaceRules = placeRules.map((rule) => ({
    g5_template_id: `place_generation_rule:${rule.id}`,
    source_table: 'world_base.region_place_generation_rules',
    source_id: rule.id,
    title: rule.title,
    template_type: rule.template_type,
    layout_rules: asArray(rule.layout_rules),
    access_rules: asArray(rule.access_rules),
    status: rule.status,
    confidence: rule.confidence,
    sources: rule.sources ?? []
  }));
  return [...fromPacks, ...fromPlaces, ...fromBuildings, ...fromPlaceRules];
}

function buildG4AnchorRules(placeTemplates, placeRules, buildingTemplates) {
  return placeTemplates.map((place) => ({
    place_template_id: place.place_template_id,
    g4_type: place.place_kind ?? place.default_node_type,
    allowed_anchor_sources: [
      ...placeRules.filter((rule) => rule.template_type === place.place_kind).map((rule) => ({ source_table: 'world_base.region_place_generation_rules', id: rule.id, layout_rules: asArray(rule.layout_rules), access_rules: asArray(rule.access_rules) })),
      ...buildingTemplates.filter((building) => asArray(building.allowed_place_types).includes(place.place_kind) || asArray(building.allowed_place_types).includes(place.place_template_id)).map((building) => ({ source_table: 'world_base.building_templates', id: building.id, building_type: building.building_type, room_templates: asArray(building.room_templates), typical_objects: asArray(building.typical_objects) }))
    ]
  }));
}

function contextCounts(pkg = {}) {
  return {
    active_events: pkg.historical_context?.active_events?.length ?? 0,
    social_roles: pkg.social_context?.allowed_social_roles?.length ?? 0,
    occupations: pkg.occupation_context?.allowed_occupations?.length ?? 0,
    place_templates: pkg.settlement_and_place_rules?.allowed_place_templates?.length ?? 0,
    landscapes: pkg.landscape_context?.allowed_landscapes?.length ?? 0,
    water_templates: pkg.water_context?.allowed_water_body_templates?.length ?? 0,
    land_use_templates: pkg.land_use_context?.allowed_land_use_templates?.length ?? 0,
    route_templates: pkg.route_context?.allowed_route_templates?.length ?? 0,
    graph_edges: pkg.route_context?.canonical_graph_edges?.length ?? 0,
    weather_profiles: pkg.weather_and_season_context?.allowed_weather_profiles?.length ?? 0,
    seasonal_rules: pkg.weather_and_season_context?.seasonal_rules?.length ?? 0,
    item_profiles: pkg.item_context?.allowed_item_profiles?.length ?? 0,
    container_profiles: pkg.container_context?.allowed_container_profiles?.length ?? 0,
    npc_archetypes: pkg.npc_context?.allowed_npc_archetypes?.length ?? 0,
    g5_templates: pkg.g5_context?.g5_template_index?.length ?? 0
  };
}

function findForbiddenKeys(value, path = '') {
  if (!value || typeof value !== 'object') return [];
  const found = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_OUTPUT_KEYS.has(key)) found.push(childPath);
    if (child && typeof child === 'object') found.push(...findForbiddenKeys(child, childPath));
  }
  return found;
}

function forbiddenCodeFor(path) {
  if (/npc/u.test(path)) return 'REGIONAL_CONTEXT_CREATED_NPC';
  if (/item|items/u.test(path)) return 'REGIONAL_CONTEXT_CREATED_ITEM';
  if (/g5|anchor/u.test(path)) return 'REGIONAL_CONTEXT_CREATED_G5';
  if (/visible_scene/u.test(path)) return 'REGIONAL_CONTEXT_CREATED_VISIBLE_SCENE';
  return 'REGIONAL_CONTEXT_CREATED_LOCATION';
}

function ids(rows = [], key) {
  return [...new Set((Array.isArray(rows) ? rows : []).map((row) => row?.[key] ?? row?.id).filter(Boolean))];
}

function stringifyLimits(value, fallback = null) {
  if (value == null || (Array.isArray(value) && value.length === 0)) return fallback;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function compact(values) {
  return values.filter((value) => value != null && value !== '' && !(Array.isArray(value) && value.length === 0));
}

function pick(row, keys) {
  return Object.fromEntries(keys.map((key) => [key, row?.[key]]));
}

function slug(value) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9_]+/gu, '_').replace(/^_+|_+$/gu, '') || 'unknown';
}

function isEmpty(value) {
  return !Array.isArray(value) || value.length === 0;
}

function addMissing(target, condition, code, field, message) {
  if (condition) target.push({ code, field, message });
}

function concern(code, field, message) {
  return { code, field, message };
}

function dedupeConcerns(concerns) {
  const seen = new Set();
  const result = [];
  for (const item of concerns) {
    const key = `${item.code}:${item.field}:${item.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}
