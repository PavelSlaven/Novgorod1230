import { canonicalDigest } from '../../src/index.js';

const facets = ['sex_category','age_category','build','skin_tone','face_shape',
  'hair_color','hair_length','hair_style','facial_hair','eye_color'];
const values = ['male','adult','average','light','oval','dark_brown','short',
  'straight','short_beard','brown'];
const actorProfiles = {
  region_demographic_profiles: [{ id: 'demo', status: 'approved' }],
  region_appearance_profiles: [{ id: 'look', status: 'approved' }],
  region_demographic_profile_entries: facets.slice(0, 2).map(entry),
  region_appearance_profile_entries: facets.slice(2).map(entry),
  region_category_options: facets.map((facet) => ({ id: `option:${facet}`,
    category_id: `category:${facet}`, status: 'approved' })),
  universal_categories: facets.map((facet) => ({ id: `category:${facet}`, facet,
    stable_code: values[facets.indexOf(facet)], status: 'approved' }))
};
const role = { role_id: 'role', role_title: 'рыбак', region_id: 'novgorod',
  role_archetype_id: 'role-a', legal_status_archetype_id: 'legal-a',
  social_position_archetype_id: 'social-a', status: 'approved',
  attitude_to_strangers: 'осторожен' };
const occupation = { occupation_id: 'occupation', region_id: 'novgorod',
  occupation_archetype_id: 'fishing_water', status: 'approved',
  allowed_social_role_ids: 'role', daily_schedule_summer: 'approved schedule',
  typical_property: 'property', typical_tools: 'tools',
  typical_clothing: 'clothing', typical_containers: 'containers',
  typical_local_knowledge: 'local', typical_route_knowledge: 'routes',
  common_relationships: 'relations', common_fears: 'fears',
  common_goals: 'goals', how_to_materialize_as_background_npc: 'background',
  how_to_materialize_as_scene_npc: 'scene',
  how_to_materialize_as_key_npc: 'key', llm_adaptation_rules: 'adapt',
  llm_forbidden_uses: 'forbid' };
const activity = { record_id: 'activity', record_kind: 'activity_profile',
  status: 'approved', payload: { activity_profile_id: 'activity-work',
    activity_category_id: 'work', resource_requirements: {
      mode: 'intrinsic_none' }, body_effect_profile_refs: [{ entity_ref: {
      entity_kind: 'body_effect_profile', entity_id: 'body-time' } }] } };
const bodyTime = { record_id: 'body-time', record_kind: 'body_effect_profile',
  status: 'approved', payload: { body_effect_profile_id: 'body-time' } };
const bundle = { schema: 'rus.procedural_actor_temporal_bundle.v1',
  roles: [role], occupations: [occupation],
  role_archetypes: [{ id: 'role-a', status: 'approved' }],
  occupation_archetypes: [{ id: 'fishing_water', status: 'approved' }],
  legal_status_archetypes: [{ id: 'legal-a', status: 'approved' }],
  social_position_archetypes: [{ id: 'social-a', status: 'approved' }],
  occupation_skill_defaults: [{ occupation_archetype_id: 'fishing_water',
    skill_id: 'fishing', value: 2, status: 'approved' }],
  actor_profiles: actorProfiles, temporal_records: [activity, bodyTime] };
const environment = { schema: 'rus.approved_initial_environment.v1',
  season: 'summer', day_part: 'daylight', light_state: 'daylight',
  weather_state: { weather_state_id: 'clear' } };
const body = { status: 'approved', profile_id: 'ordinary-adult',
  source_ref: 'approved_body_profiles:ordinary-adult',
  schema: 'rus.body_state.profile.v1', version: 1,
  values: { health: 100, energy: 80, satiety: 70 },
  condition_bindings: [] };
body.record_digest = canonicalDigest(body);
const archetypes = ['agriculture', 'animal_husbandry', 'craft_production',
  'domestic_service', 'fishing_water', 'forest_hunting', 'illicit_marginal',
  'military_security', 'religious_literate', 'trade_exchange',
  'transport_guiding'];
const actorBaseAttributesProfile = { schema: 'rus.actor_base_attributes_profile.v1',
  version: 1, profile_id: 'ordinary-worker-v1',
  algorithm_version: 'actor_base_attributes_v1', rng_version: 'mulberry32_v1',
  ordinary_array: [13, 12, 11, 10, 9, 8], occupation_archetype_priorities:
    archetypes.map((occupation_archetype_id) => ({
      mapping_id: `${occupation_archetype_id}:ordinary`, occupation_archetype_id,
      priority_tiers: [['strength'], ['endurance'], ['dexterity'], ['attention'],
        ['reason'], ['influence']] })) };
const actorBaseAttributesRuntimeProfile = { schema:
  'rus.actor_base_attributes_runtime_profile.v1',
  catalog_scope: 'actor_base_attributes_v1', catalog_revision_id: 'attributes-v1',
  catalog_digest: '1'.repeat(64), activation_event_id: 'activation-v1',
  import_id: 'import-v1', import_audit_digest: '2'.repeat(64),
  record_registry_digest: '4'.repeat(64),
  runtime_contract_digest: '3'.repeat(64),
  profile_id: actorBaseAttributesProfile.profile_id,
  profile_digest: canonicalDigest(actorBaseAttributesProfile),
  profile: actorBaseAttributesProfile };
const binding = { schema: 'rus.approved_procedural_npc_binding.v1',
  status: 'approved', actor_slot_ref: 'worker:1', role_ref: 'role',
  occupation_ref: 'occupation', profile_level: 'background',
  actor_profile_rule_ref: 'actor-profile', demographic_profile_ref: 'demo',
  appearance_profile_ref: 'look', anchor_id: 'anchor', g5_node_id: 'node',
  location_profile_ref: 'location', zone_ref: 'main',
  activity_record_ref: 'activity', observable_activity: {
    source_ref: 'approved_occupations:occupation:daily_schedule_summer',
    value: 'чинит сети' }, body_profile: body,
  profile_candidate_set_digest: 'a'.repeat(64),
  profile_record_digest: 'b'.repeat(64),
  world_revision_id: 'world', world_catalog_digest: 'd'.repeat(64),
  parent_seed_digest: 'e'.repeat(64),
  actor_base_attributes_runtime_profile: actorBaseAttributesRuntimeProfile,
  initial_equipment_candidates: [] };

function entry(facet) { return { id: `entry:${facet}`,
  [facets.indexOf(facet) < 2 ? 'demographic_profile_id'
    : 'appearance_profile_id']: facets.indexOf(facet) < 2 ? 'demo' : 'look',
  facet, option_id: `option:${facet}`, weight: 1, status: 'approved' }; }

export { binding, bundle, environment };
