import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { canonicalDigest } from '@rus/materialization';
import { loadTargetAuthoredStartProfile } from '../../apps/game-server/src/internal/live-world-authored-starts.js';
import { buildCalendarProjectionProfile } from '../../apps/game-server/src/internal/lower-dvina-trace-phase-1a-bundle.js';

const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const base = 'data/world-catalogs/novgorod/';
// Catalog approval/pins below are isolated test authority, never operational evidence.
export async function targetCanonicalStartFixture({ startRuntime } = {}) {
  const start = startRuntime?.profile.canonical_start.start
    ?? await json(`${base}live-world-runtime-v17/target-start-candidate.json`);
  const place = start.initial_placement;
  const manifestPath = `${base}m2c-npc-canonical-import-manifest.json`;
  const manifest = await json(manifestPath);
  const rows = (table) => json(resolve(dirname(manifestPath), manifest.datasets.find((entry) => entry.table === table).file));
  const header = (await rows('spatial_v3_scene_templates')).find((row) => row.id === place.scene_template_ref.id);
  const closure = { header };
  for (const [key, table] of Object.entries({ g6_slots: 'spatial_v3_g6_template_slots',
    position_slots: 'spatial_v3_scene_position_templates', endpoint_slots: 'spatial_v3_scene_endpoint_slots',
    movement_edges: 'spatial_v3_scene_movement_edge_templates' })) {
    closure[key] = (await rows(table)).filter((row) => row.scene_template_id === header.id && row.scene_template_version === header.version);
  }
  const node = (await rows('spatial_v3_nodes')).find((row) => row.id === place.canonical_g5_ref.id);
  const binding = { ...node, parent_id: place.g4_ref.id, scene_template_id: header.id,
    scene_template_version: header.version, materialization_profile_id: place.scene_materialization_profile_ref.id };
  const world = { version: 1, schema: 'world_base_reference_snapshot', readonly_checksum: 'isolated-target-source',
    allowed_region_ids: [], allowed_graph_node_ids: [], allowed_graph_edge_ids: [], allowed_place_template_ids: [],
    allowed_npc_candidate_ids: [], allowed_item_profile_ids: [], allowed_container_profile_ids: [],
    allowed_property_rule_ids: [], allowed_source_ids: [], canonical_g5_scene_bindings: [binding], scene_template_closures: [closure] };
  const pin = { schema: 'rus.runtime_catalog_pin.v2', catalog_scope: 'item_container_materialization_v2',
    catalog_revision_id: 'item_container_spatial_v3_target_001', catalog_digest: 'd'.repeat(64),
    import_id: 'isolated-test-import', import_audit_digest: 'a'.repeat(64), record_registry_digest: 'b'.repeat(64),
    runtime_contract_digest: 'c'.repeat(64), compatible_world_revision_id: start.world_pin.world_revision_id,
    compatible_world_catalog_digest: start.world_pin.world_catalog_digest,
    compatible_world_pin_manifest_digest: start.world_pin.manifest_sha256, activation_event_id: 'isolated-test-activation' };
  const records = {};
  for (const table of ['item_templates', 'item_template_inventory_profiles', 'item_template_quantity_profiles',
    'universal_categories', 'item_template_category_bindings']) {
    records[table] = (await json(`data/knowledge-source/imports/item-container-120-v5/candidate/tables/${table}.json`))
      .map((row) => ({ ...row, status: 'approved' }));
  }
  const domain = { schema: 'rus.verified_item_catalog.v2', verified: true, pin, records_by_table: records };
  const profile = startRuntime?.profile
    ?? await loadTargetAuthoredStartProfile({ worldBaseReferenceSnapshot: world, domainCatalog: domain });
  const runtime = await rows('spatial_v3_npc_runtime_profiles');
  const npcClosure = { schema: 'rus.m2c_npc_binding_bundle.v1', world_revision_id: start.world_pin.world_revision_id,
    g4_ref: place.g4_ref, canonical_g5_ref: place.canonical_g5_ref,
    composition: (await rows('spatial_v3_g4_npc_composition_bindings')).find((row) => row.canonical_g5_id === node.id),
    runtime_profiles: runtime, regional_context_profiles: await rows('spatial_v3_npc_regional_context_profiles') };
  const actorProfiles = {};
  for (const { table } of profile.canonical_start.player_basis.appearance.source_tables) {
    actorProfiles[table] = await json(`${base}spatial-v3/candidates/spatial-v3-production-v4/datasets/${table}.json`);
  }
  const temporal = [];
  for (const family of ['calendar_daylight_light_profiles', 'weather_transition_profiles_processes', 'body_time_effect_profiles_thresholds']) {
    temporal.push(...await json(`${base}temporal-v4/datasets/${family}.json`));
  }
  const actors = profile.actor_catalog;
  const archetypes = (values, key) => [...new Set(values.map((row) => row[key]))].map((id) => ({ id, status: 'approved' }));
  const actorBundle = { schema: 'rus.procedural_actor_temporal_bundle.v1', world_pin: start.world_pin,
    roles: actors.roles, occupations: actors.occupations,
    role_archetypes: archetypes(actors.roles, 'role_archetype_id'),
    occupation_archetypes: archetypes(actors.occupations, 'occupation_archetype_id'),
    legal_status_archetypes: archetypes(actors.roles, 'legal_status_archetype_id'),
    social_position_archetypes: archetypes(actors.roles, 'social_position_archetype_id'),
    occupation_skill_defaults: [], actor_profiles: actorProfiles, temporal_records: temporal };
  const attributeProfile = (await json(`${base}procedural-scene-v2/actor-base-attributes-v1/candidate.json`)).profile;
  const actorRuntime = { schema: 'rus.actor_base_attributes_runtime_profile.v1', catalog_scope: 'actor_base_attributes_v1',
    catalog_revision_id: 'actor_base_attributes_spatial_v3_target_001', catalog_digest: 'e'.repeat(64),
    activation_event_id: 'isolated-actor-activation', import_id: 'isolated-actor-import', import_audit_digest: 'a'.repeat(64),
    record_registry_digest: 'b'.repeat(64), runtime_contract_digest: 'c'.repeat(64),
    profile_id: attributeProfile.profile_id, profile_digest: canonicalDigest(attributeProfile), profile: attributeProfile };
  const acousticManifest = await json(`${base}m2c-acoustic-import-manifest.json`);
  const acoustics = await json(resolve(base, acousticManifest.datasets.find((row) => row.table === 'spatial_v3_g6_acoustic_baselines').file));
  return { party_id: 'target-canonical-fixture', scenario_id: profile.scenario_id, scenario_definition_revision: 1,
    scenario_manifest_digest: profile.manifest_digest,
    world_revision_id: start.world_pin.world_revision_id, world_catalog_digest: start.world_pin.world_catalog_digest,
    materializer_version: 'code_materializer_v3', rng_algorithm_id: 'mulberry32_v1', seed_context: 'target-canonical-test',
    idempotency_key: 'target-canonical-test', trigger: 'new_game', occurrence: 0, existing_party_state: { baseline_exists: false },
    world_compatibility: { world_revision_id: start.world_pin.world_revision_id }, scenario_bundle: profile,
    domain_catalog_pin: pin, domain_catalog: domain, world_base_reference_snapshot: world,
    approved_actor_temporal_bundle: actorBundle, canonical_npc_closure: npcClosure,
    actor_base_attributes_runtime_profile: actorRuntime, actor_equipment_activation: { status: 'active' },
    calendar_profile: buildCalendarProjectionProfile(temporal.find((row) => row.record_id === start.initial_environment_inputs.calendar_record_ref.id)),
    canonical_acoustic_rows: acoustics.filter((row) => row.canonical_g5_id === node.id)
      .map((row) => ({ ...row, authoring_digest: row.canonical_digest })) };
}
