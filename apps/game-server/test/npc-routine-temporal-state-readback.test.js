import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTracePhase2TemporalSourceProof } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-temporal-state.js';

test('temporal readback preserves endpoint authoring versions and does not choose an ambiguous binding',
  async () => {
    const endpointRows = [1, 2].map((version) => ({ endpoint_id: 'yard-endpoint',
      source_endpoint_binding_ref: { entity_id: 'yard-endpoint',
        authoring_version: String(version) }, scene_baseline_id: `scene-${version}`,
      g5_site_id: `site-${version}`, position_id: `yard-position-${version}`,
      state_version: version, access_class_id: 'ordinary', capacity: 1,
      status: 'active' }));
    const schedule = { id: 'schedule-worker', npc_id: 'worker', status: 'inactive',
      causal_state_ref: { routine_state: { schema: 'npc_routine_state_v1' } } };
    const completed = { npc_id: 'worker', last_completed_movement: {
      destination_position_node_id: 'home-position',
      destination_location_ref: 'pf_home', completed_at: {
        whole_minutes: '12', subminute_numerator: '0',
        subminute_denominator: '1' } } };
    const pool = { async query(sql) {
      if (sql.includes('party_temporal_events e')) return { rows: [] };
      if (sql.includes('party_npc_spatial_schedules s')) return { rows: [schedule] };
      if (sql.includes('party_local_world_processes p')) return { rows: [] };
      if (sql.includes('party_world_route_endpoint_position_bindings b')) {
        return { rows: endpointRows };
      }
      if (sql.includes('DISTINCT ON (tr.npc_id)')) return { rows: [completed] };
      throw new Error('unexpected temporal query');
    } };

    const proof = await loadTracePhase2TemporalSourceProof(pool, 'party:test');
    const row = proof.npc_schedule_runtime[0];
    assert.deepEqual(row.route_endpoint_bindings.map(({ source_endpoint_binding_ref }) =>
      source_endpoint_binding_ref.authoring_version), ['1', '2']);
    assert.deepEqual(proof.route_endpoint_positions['yard-endpoint'], {
      position_id: null, status: 'ambiguous', binding_refs: [
        { entity_id: 'yard-endpoint', authoring_version: '1' },
        { entity_id: 'yard-endpoint', authoring_version: '2' }
      ]
    });
    assert.equal(row.last_completed_movement.destination_location_ref, 'pf_home');
    assert.equal(row.last_completed_movement.destination_position_node_id, 'home-position');
  });

test('unchanged canonical first-entry source and scene read back as an approved location fact', async () => {
  const schedule = scheduleWithInitialProof();
  const proof = await loadTemporalProof([schedule]);
  const row = proof.npc_schedule_runtime[0];
  assert.deepEqual(row.approved_location_bindings, [{
    position_node_id: 'home-position', location_ref: 'pf_home',
    binding_ref: { entity_id: 'household-composition', authoring_version: '3' }
  }]);
  assert.equal(Object.hasOwn(row, 'initial_location_proof'), false,
    'raw readback proof must not flow into transition.before');
  assert.equal(Object.hasOwn(row, 'npc_semantic_state'), false);
});

test('mismatched current scene, stale placement and composition context produce no location fact', async () => {
  const wrongSite = scheduleWithInitialProof();
  wrongSite.current_position_node_id = 'yard-position';
  wrongSite.npc_placement.position_node_id = 'yard-position';
  wrongSite.initial_location_proof = {
    ...wrongSite.initial_location_proof,
    schedule_position_node_id: 'yard-position', position_node_id: 'yard-position',
    position_template_slot_key: 'home-slot', position_template_instance_ordinal: 0,
    g6_id: 'yard-g6', g6_host_id: 'yard-site', g6_scene_baseline_id: 'yard-scene',
    g6_source_scene_template_ref: { entity_id: 'scene-template', authoring_version: '1' },
    scene_baseline_id: 'yard-scene',
    scene_baseline_scene_template_ref: { entity_id: 'scene-template', authoring_version: '1' },
    site_id: 'yard-site', site_canonical_g5_ref: { entity_id: 'canonical-yard', authoring_version: '2' },
    placement_position_node_id: 'yard-position'
  };
  const stalePlacement = scheduleWithInitialProof();
  stalePlacement.initial_location_proof.placement_state_version = 2;
  stalePlacement.causal_state_ref.routine_state.schedule_context = {
    home_scope_ref: 'pf_home', composition_ref: { id: 'household-composition', version: 3 }
  };
  const missingSourceVersion = scheduleWithInitialProof();
  delete missingSourceVersion.npc_semantic_state.source_binding
    .place_population_composition_ref.version;
  const missingZone = scheduleWithInitialProof();
  delete missingZone.npc_semantic_state.zone_ref;

  const proof = await loadTemporalProof([wrongSite, stalePlacement,
    missingSourceVersion, missingZone]);
  assert.deepEqual(proof.npc_schedule_runtime.map((row) => row.approved_location_bindings),
    [[], [], [], []]);
});

async function loadTemporalProof(schedules) {
  const pool = { async query(sql) {
    if (sql.includes('party_temporal_events e')) return { rows: [] };
    if (sql.includes('party_npc_spatial_schedules s')) return { rows: schedules };
    if (sql.includes('party_local_world_processes p')) return { rows: [] };
    if (sql.includes('party_world_route_endpoint_position_bindings b')) return { rows: [] };
    if (sql.includes('DISTINCT ON (tr.npc_id)')) return { rows: [] };
    throw new Error('unexpected temporal query');
  } };
  return loadTracePhase2TemporalSourceProof(pool, 'party:test');
}

function scheduleWithInitialProof() {
  const source = { world_revision_id: 'world-v1',
    g4_ref: { id: 'canonical-g4', version: 7 },
    canonical_g5_ref: { id: 'canonical-home', version: 4 },
    place_family_id: 'pf_home',
    place_population_composition_ref: { id: 'household-composition', version: 3,
      world_revision_id: 'world-v1' } };
  return { id: 'schedule-worker', npc_id: 'worker', status: 'inactive',
    current_position_node_id: 'home-position',
    causal_state_ref: { routine_state: { schema: 'npc_routine_state_v1',
      schedule_context: { home_scope_ref: 'pf_home', composition_ref: {
        id: 'household-composition', version: 3 } } } },
    npc_semantic_state: { source_binding: source, location_profile_ref: 'pf_home',
      zone_ref: 'home-slot' },
    npc_placement: { entity_kind: 'npc', entity_id: 'worker',
      position_node_id: 'home-position', state_version: 1,
      updated_change_set_id: 'first-entry-change' },
    initial_location_proof: {
      party_world_revision_id: 'world-v1', schedule_position_node_id: 'home-position',
      position_node_id: 'home-position', position_template_slot_key: 'home-slot',
      position_template_instance_ordinal: 0, position_status: 'active',
      g6_id: 'home-g6', g6_status: 'active', g6_host_kind: 'g5_site',
      g6_host_id: 'home-site', g6_scene_baseline_id: 'home-scene',
      g6_source_scene_template_ref: { entity_id: 'scene-template', authoring_version: '1' },
      scene_baseline_id: 'home-scene', scene_baseline_status: 'active',
      scene_baseline_source_kind: 'canonical_template',
      scene_baseline_scene_template_ref: { entity_id: 'scene-template', authoring_version: '1' },
      site_id: 'home-site', site_status: 'active', site_origin: 'canonical',
      site_canonical_g5_ref: { entity_id: 'canonical-home', authoring_version: '4' },
      site_parent_g4_id: 'canonical-g4', site_generated_template_ref: null,
      placement_position_node_id: 'home-position', placement_state_version: 1,
      placement_updated_change_set_id: 'first-entry-change',
      actor_profile_created_change_set_id: 'first-entry-change'
    } };
}
