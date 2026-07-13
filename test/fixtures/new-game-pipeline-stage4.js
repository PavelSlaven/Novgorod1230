import { retrieveRegionalContextPackage } from '../../src/world/new-game-pipeline/retrievers/regional-context.js';
import { buildStage3FixtureOutput } from './new-game-pipeline-stage3.js';

const SOURCE_ID = 'src';
const REGION_ID = 'region_novgorod_land';

function approvedRow(id, extra = {}) {
  return {
    id,
    region_id: REGION_ID,
    status: 'approved',
    confidence: 'high',
    sources: [SOURCE_ID],
    game_use: 'fixture regional context',
    limits: 'read-only fixture',
    ...extra
  };
}

export function buildStage4LoadInput(requestId = 'req_fixture', overrides = {}) {
  return {
    request_id: requestId,
    normalized_request: overrides.normalized_request ?? null,
    historical_frame: overrides.historical_frame ?? buildStage3FixtureOutput(requestId),
    load_policy: {
      require_sources: false,
      allow_draft: false,
      allow_needs_review: false,
      ...(overrides.load_policy ?? {})
    }
  };
}

export function buildStage4FakeQueryable({ emptyGraph = false, emptyPlaceTemplates = false, emptyNpcArchetypes = false } = {}) {
  return {
    async query(sql) {
      const text = sql.replace(/\s+/gu, ' ');
      if (text.includes('FROM world_base.regions')) return rows([regionRow()]);
      if (text.includes('FROM world_base.historical_events')) return rows([approvedRow('event_1237', { title: 'event' })]);
      if (text.includes('FROM world_base.historical_anchors')) return rows([approvedRow('anchor_1', { title: 'anchor', anchor_type: 'landmark' })]);
      if (text.includes('FROM world_base.historical_event_phases')) return rows([approvedRow('phase_1', { event_id: 'event_1237', phase_name: 'active' })]);
      if (text.includes('FROM world_base.region_social_roles')) return rows([socialRoleRow()]);
      if (text.includes('FROM world_base.region_occupations')) return rows([occupationRow()]);
      if (text.includes('FROM world_base.region_place_generation_rules')) return rows([generationRuleRow()]);
      if (text.includes('FROM world_base.region_place_templates')) return rows(emptyPlaceTemplates ? [] : [placeTemplateRow()]);
      if (text.includes('FROM world_base.place_generation_limits')) return rows([approvedRow('limit_market', { place_template_id: 'pt_market' })]);
      if (text.includes('FROM world_base.region_landscape_templates')) return rows([landscapeRow()]);
      if (text.includes('FROM world_base.region_water_body_templates')) return rows([waterRow()]);
      if (text.includes('FROM world_base.region_land_use_templates')) return rows([landUseRow()]);
      if (text.includes('FROM world_base.route_templates')) return rows([approvedRow('route_path', { title: 'path', route_kind: 'path' })]);
      if (text.includes('FROM world_base.graph_edge_modifiers')) return rows([approvedRow('mod_winter', { modifier_type: 'seasonal', applies_to_season: 'winter' })]);
      if (text.includes('FROM world_base.graph_edges')) return rows(emptyGraph ? [] : [graphEdgeRow()]);
      if (text.includes('FROM world_base.graph_edge_knowledge_rules')) return rows([approvedRow('gek_1', { graph_edge_id: 'edge_g3_g4', knowledge_level: 'common' })]);
      if (text.includes('FROM world_base.seasonal_rules')) return rows([approvedRow('season_winter_novgorod', { season: 'winter', title: 'winter' })]);
      if (text.includes('FROM world_base.weather_profiles')) return rows([approvedRow('weather_cold', { title: 'cold' })]);
      if (text.includes('FROM world_base.item_templates')) return rows([itemTemplateRow()]);
      if (text.includes('FROM world_base.price_bands')) return rows([approvedRow('price_band_1', { title: 'bread band' })]);
      if (text.includes('FROM world_base.location_object_rules')) return rows([locationObjectRuleRow()]);
      if (text.includes('FROM world_base.region_npc_generation_rules')) return rows([approvedRow('npc_rule_1', { title: 'background npc' })]);
      if (text.includes('FROM world_base.npc_archetypes')) return rows(emptyNpcArchetypes ? [] : [npcArchetypeRow()]);
      if (text.includes('FROM world_base.region_npc_archetypes')) return rows(emptyNpcArchetypes ? [] : [regionNpcArchetypeRow()]);
      if (text.includes('FROM world_base.npc_name_pools')) return rows(emptyNpcArchetypes ? [] : [npcNamePoolRow()]);
      if (text.includes('FROM world_base.name_pools')) return rows([]);
      if (text.includes('FROM world_base.key_npc_seeds')) return rows(emptyNpcArchetypes ? [] : [keyNpcSeedRow()]);
      if (text.includes('FROM world_base.region_npc_knowledge')) return rows([approvedRow('npc_know_1', { knowledge_type: 'trade', title: 'market gossip' })]);
      if (text.includes('FROM world_base.rumor_templates')) return rows([approvedRow('rumor_1', { rumor_type: 'trade', title: 'rumor' })]);
      if (text.includes('FROM world_base.building_templates')) return rows([approvedRow('building_market', { building_type: 'market', allowed_place_types: ['market'], storage_rules: ['basket'] })]);
      if (text.includes('FROM world_base.llm_context_packs')) return rows([contextPackRow()]);
      if (text.includes('FROM world_base.source_records')) {
        return rows([{
          id: SOURCE_ID,
          title: 'fixture source',
          source_type: 'notes',
          reliability_level: 'medium',
          status: 'approved',
          confidence: 'high'
        }]);
      }
      if (text.includes('FROM world_base.graph_nodes') && text.includes('place_template_id IS NOT NULL')) {
        return rows([{ place_template_id: 'pt_market', count: 0 }]);
      }
      if (text.includes('FROM world_base.graph_nodes') && !text.includes('JOIN world_base.graph_nodes')) {
        return rows(emptyGraph ? [] : graphNodeRows());
      }
      return rows([]);
    }
  };
}

export async function buildRegionalContextFixtureOutput(requestId = 'req_fixture', overrides = {}) {
  const input = buildStage4LoadInput(requestId, overrides);
  const pkg = await retrieveRegionalContextPackage(input, {
    queryable: buildStage4FakeQueryable()
  });
  if (!overrides || Object.keys(overrides).length === 0) return pkg;
  return structuredClone({ ...pkg, ...overrides });
}

function rows(value) {
  return { rows: value };
}

function regionRow() {
  return approvedRow(REGION_ID, {
    slug: 'novgorod',
    display_name: 'Новгородская земля',
    canonical_name: 'Новгородская земля',
    region_type: 'land',
    period_start_year: 1230,
    period_end_year: 1250,
    summary: 'approved region',
    social_order_summary: 'городская община',
    economy_summary: 'торговля',
    npc_common_knowledge_summary: 'зимой рынок пустеет',
    historical_context_summary: 'вечевые порядки',
    llm_context_summary: 'regional fixture context'
  });
}

function socialRoleRow() {
  return approvedRow('role_merchant', {
    slug: 'merchant',
    title: 'купец',
    role_group: 'merchant',
    social_position_archetype_id: 'spa_merchant',
    social_class_id: 'sc_merchant',
    role_archetype_id: 'sra_merchant',
    mapping_review_status: 'approved',
    allowed_occupations: ['occ_merchant'],
    allowed_places: ['market'],
    property_rights: 'may own stall',
    typical_equipment: [],
    typical_knowledge: []
  });
}

function occupationRow() {
  return approvedRow('occ_merchant', {
    slug: 'merchant',
    title: 'торговец',
    occupation_archetype_id: 'oa_merchant',
    mapping_review_status: 'approved',
    allowed_social_roles: ['role_merchant'],
    required_location_types: ['market'],
    typical_equipment: []
  });
}

function placeTemplateRow() {
  return {
    region_place_template_id: 'rpt_market',
    region_id: REGION_ID,
    place_template_id: 'pt_market',
    is_allowed: true,
    is_common: true,
    is_rare: false,
    generation_weight: 10,
    allowed_scale_levels: ['G4'],
    allowed_node_types: ['location'],
    regional_limits: null,
    regional_game_use: 'fixture place template',
    regional_limits_text: 'fixture limits',
    status: 'approved',
    confidence: 'high',
    sources: [SOURCE_ID],
    region_place_template_game_use: 'fixture place template',
    region_place_template_limits: 'fixture limits',
    region_place_template_status: 'approved',
    region_place_template_confidence: 'high',
    region_place_template_sources: [SOURCE_ID],
    slug: 'market',
    title: 'торг',
    summary: 'торговый ряд',
    place_kind: 'market',
    default_node_type: 'location',
    can_exist_inside_landscape: true,
    requires_water_nearby: false,
    requires_route_nearby: false,
    requires_land_use: false,
    compatible_landscape_template_ids: [],
    compatible_water_body_template_ids: [],
    compatible_route_template_ids: [],
    compatible_land_use_template_ids: [],
    typical_scale_level: 'G4',
    access_logic: null,
    social_logic: null,
    economic_logic: null,
    defense_logic: null,
    game_use: 'fixture place template',
    limits: 'fixture limits',
    place_template_game_use: 'fixture place template',
    place_template_limits: 'fixture limits',
    place_template_status: 'approved',
    place_template_confidence: 'high',
    place_template_sources: [SOURCE_ID],
    status: 'approved',
    confidence: 'high',
    sources: [SOURCE_ID]
  };
}

function generationRuleRow() {
  return approvedRow('rule_market', {
    title: 'market rule',
    slug: 'market',
    template_type: 'market',
    generation_allowed: true,
    required_landscape: null,
    required_economy: null,
    required_route_access: null,
    required_water_access: null,
    typical_authority: 'market elders'
  });
}

function landscapeRow() {
  return {
    region_landscape_template_id: 'rlt_forest',
    region_id: REGION_ID,
    landscape_template_id: 'lt_forest',
    is_allowed: true,
    generation_weight: 5,
    title: 'лес',
    landscape_group: 'forest',
    status: 'approved',
    confidence: 'high',
    sources: [SOURCE_ID],
    game_use: 'fixture landscape',
    limits: 'fixture limits'
  };
}

function waterRow() {
  return {
    region_water_body_template_id: 'rwt_river',
    region_id: REGION_ID,
    water_body_template_id: 'wbt_river',
    is_allowed: true,
    generation_weight: 5,
    title: 'река',
    water_body_type: 'river',
    status: 'approved',
    confidence: 'high',
    sources: [SOURCE_ID],
    game_use: 'fixture water',
    limits: 'fixture limits'
  };
}

function landUseRow() {
  return {
    region_land_use_template_id: 'rut_field',
    region_id: REGION_ID,
    land_use_template_id: 'lut_field',
    is_allowed: true,
    generation_weight: 5,
    title: 'поле',
    land_use_kind: 'field',
    status: 'approved',
    confidence: 'high',
    sources: [SOURCE_ID],
    game_use: 'fixture land use',
    limits: 'fixture limits'
  };
}

function itemTemplateRow() {
  return {
    id: 'item_bread',
    title: 'хлеб',
    item_type: 'food',
    typical_locations: ['market'],
    typical_containers: ['basket'],
    typical_owner_roles: ['role_merchant'],
    typical_holder_roles: ['role_merchant'],
    status: 'approved',
    confidence: 'high',
    sources: [SOURCE_ID],
    game_use: 'fixture item',
    limits: 'fixture limits'
  };
}

function locationObjectRuleRow() {
  return approvedRow('lor_basket', {
    object_category: 'container',
    required_owner: true,
    access_default: 'restricted'
  });
}

function contextPackRow() {
  return approvedRow('ctx_g5', {
    title: 'g5',
    context_type: 'scene_context',
    summary: 'scene context pack'
  });
}

function graphNodeRows() {
  return [
    approvedRow('g1', { title: 'cell', node_type: 'region_cell', scale_level: 'G1' }),
    approvedRow('g2', { title: 'zone', node_type: 'subregion', scale_level: 'G2', parent_node_id: 'g1' }),
    approvedRow('g3', { title: 'place', node_type: 'place', scale_level: 'G3', parent_node_id: 'g2' }),
    {
      ...approvedRow('g4', {
        title: 'market location',
        node_type: 'location',
        scale_level: 'G4',
        parent_node_id: 'g3',
        place_template_id: 'pt_market',
        land_use_template_ids: []
      })
    }
  ];
}

function graphEdgeRow() {
  return {
    id: 'edge_g3_g4',
    region_id: REGION_ID,
    from_node_id: 'g3',
    to_node_id: 'g4',
    scale_level: 'G4',
    edge_type: 'path',
    status: 'approved',
    confidence: 'high',
    sources: [SOURCE_ID],
    game_use: 'fixture edge',
    limits: 'fixture limits'
  };
}

function npcArchetypeRow() {
  return approvedRow('arch_merchant', {
    slug: 'merchant_archetype',
    title: 'торговый человек',
    archetype_group: 'merchant',
    profile_level_default: 'scene',
    allowed_social_role_ids: ['role_merchant'],
    allowed_occupation_ids: ['occ_merchant'],
    typical_place_template_ids: ['pt_market', 'market'],
    time_of_day_rules: ['all_day'],
    seasonal_rules: ['all_seasons'],
    typical_interaction_modes: ['trade', 'talk'],
    typical_knowledge_scope: ['market'],
    typical_risk_profile: ['commerce']
  });
}

function regionNpcArchetypeRow() {
  return approvedRow('rna_merchant', {
    npc_archetype_id: 'arch_merchant',
    is_allowed: true
  });
}

function npcNamePoolRow() {
  return approvedRow('pool_merchant', {
    slug: 'merchant_names',
    title: 'merchant names',
    social_role_ids: ['role_merchant'],
    occupation_ids: ['occ_merchant']
  });
}

function keyNpcSeedRow() {
  return approvedRow('seed_market_elder', {
    slug: 'market_elder',
    title: 'старейшина ряда',
    social_role_id: 'role_merchant',
    occupation_id: 'occ_merchant',
    npc_archetype_id: 'arch_merchant',
    allowed_place_template_ids: ['pt_market'],
    allowed_graph_node_ids: ['start_candidate_g4'],
    availability_start_year: 1230,
    availability_end_year: 1250,
    activation_conditions: ['market_day']
  });
}
