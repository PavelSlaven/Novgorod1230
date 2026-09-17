import assert from 'node:assert/strict';
import test from 'node:test';

import { firstEntryPhysicalWrites, resolveFirstEntry } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-3-first-entry.js';

const contracts = {
  route: { route_id: 'trace_ld_v1_route_wreck_to_camp' },
  sourceEndpoint: { endpoint_id: 'source' },
  destinationEndpoint: { endpoint_id: 'destination' }
};

test('Phase 8 route bypasses Phase 3 first-entry lifecycle', () => {
  assert.equal(resolveFirstEntry({
    partyId: 'party', state: {}, phase3Contracts: contracts,
    changeSetId: 'change', scenarioRevision: 24,
    factual: { mode_resolution: {
      command_id: 'lower_dvina_trace.follow_known_route_to_zhdanko_storehouse'
    }, consequence: { phase8_kind: 'movement' } }
  }), null);
});

test('designated first-entry route still rejects mismatched binding', () => {
  for (const scenarioRevision of [24, 32]) assert.throws(() => resolveFirstEntry({
    partyId: 'party', phase3Contracts: contracts,
    changeSetId: 'change', scenarioRevision,
    state: { first_entry_preparation: {
      binding: {
        route_command_id: 'lower_dvina_trace.follow_path_to_fishing_camp',
        route_ref: 'wrong-route', destination: {}
      },
      spatial_v3: {
        source: { endpoint_ref: { endpoint_id: 'source' } },
        target: { endpoint_ref: { endpoint_id: 'destination' }, g4_id: 'g4' }
      },
      scene: {}
    } },
    factual: { mode_resolution: {
      command_id: 'lower_dvina_trace.follow_path_to_fishing_camp'
    }, consequence: { phase3_kind: 'movement', movement: {
      route_ref: 'trace_ld_v1_route_wreck_to_camp', destination: {}
    } } }
  }), (error) => error.code === 'TRACE_PHASE_3_FIRST_ENTRY_ROUTE_MISMATCH');
});

test('first entry creates one quiet baseline profile for every G6', () => {
  const g6 = (id, stateVersion) => ({ target_table: 'party_g6_instances',
    id, record: { id, scene_baseline_id: 'baseline',
      acoustic_uniformity: 'uniform', state_version: stateVersion } });
  const rows = firstEntryPhysicalWrites({ partyId: 'party',
    changeSetId: 'change', target: {
      g4_id: 'g4', g5_site_id: 'g5', scene_baseline_id: 'baseline',
      g6_instance_id: 'g6:main', position_id: 'position:main',
      canonical_g5_ref: {}, materialization_trace_id: 'trace',
      materializer_version: 'v1', catalog_digest: 'digest',
      base_static_template: {
        scene_template_ref: {},
        g6: { acoustic_uniformity: 'uniform' },
        position: {}
      },
      s1_physical_writes: [g6('g6:interior', 0)]
    } });
  const profiles = rows.filter(({ target_table: table }) =>
    table === 'g6_acoustic_profiles');
  assert.deepEqual(profiles.map(({ id, record }) => ({ id,
    ambient_noise: record.ambient_noise,
    acoustic_uniformity: record.acoustic_uniformity,
    state_version: record.state_version })), [
    { id: 'g6:main', ambient_noise: 0,
      acoustic_uniformity: 'uniform', state_version: 1 },
    { id: 'g6:interior', ambient_noise: 0,
      acoustic_uniformity: 'uniform', state_version: 0 }
  ]);
});

test('revision 35 admits the prepared fishing-camp first-entry lifecycle', () => {
  const template = { entity_ref: { entity_kind: 'scene_template',
    entity_id: 'trace_ld_v1_tpl_fishing_camp' }, authoring_version: '1' };
  const target = { status: 'unprepared', g4_id: 'g4:camp',
    endpoint_ref: { endpoint_id: 'destination' }, g5_site_id: 'g5:camp',
    scene_baseline_id: 'baseline:camp', g6_instance_id: 'g6:camp',
    position_id: 'position:camp', canonical_g5_ref: { entity_id: 'g5:camp' },
    materialization_trace_id: 'trace:35', materializer_version: 'v1',
    catalog_digest: 'catalog:35', base_static_template: {
      scene_template_ref: template,
      g6: { source_scene_template_ref: template, acoustic_uniformity: 'uniform' },
      position: { source_scene_template_ref: template }
    }, s1_physical_writes: [
      { target_table: 'party_g6_instances', id: 'g6:camp:interior', record: {
        id: 'g6:camp:interior', scene_baseline_id: 'baseline:camp',
        source_scene_template_ref: template, acoustic_uniformity: 'uniform', state_version: 1 } },
      { target_table: 'scene_position_nodes', id: 'position:camp:interior', record: {
        id: 'position:camp:interior', g6_instance_id: 'g6:camp:interior' } },
      ...['out', 'back'].map((id, index) => ({ target_table: 'scene_movement_edges',
        id: `edge:${id}`, record: { id: `edge:${id}`, scene_baseline_id: 'baseline:camp',
          source_scene_template_ref: template, reverse_edge_id: `edge:${index ? 'out' : 'back'}`,
          from_position_id: index ? 'position:camp:interior' : 'position:camp',
          to_position_id: index ? 'position:camp' : 'position:camp:interior' } })),
      ...['out', 'back'].map((id, index) => ({ target_table: 'visibility_links',
        id: `link:${id}`, record: { id: `link:${id}`, scene_baseline_id: 'baseline:camp',
          source_scene_template_ref: template, reverse_link_id: `link:${index ? 'out' : 'back'}`,
          from_position_id: index ? 'position:camp:interior' : 'position:camp',
          to_position_id: index ? 'position:camp' : 'position:camp:interior' } }))
    ] };
  const lifecycle = resolveFirstEntry({ partyId: 'party:35', changeSetId: 'change:35',
    scenarioRevision: 35, phase3Contracts: contracts, state: {
      actor_id: 'actor:35', journey_location: { id: 'journey:35', state_version: 1 },
      first_entry_preparation: { binding: { route_ref: contracts.route.route_id,
        destination: { location_profile_ref: 'trace_ld_v1_loc_fishing_camp' } }, scene: {},
        spatial_v3: { source: { g4_id: 'g4:shore', position_id: 'position:shore',
          endpoint_ref: { endpoint_id: 'source' } }, target, preparation_snapshot_id: 'snapshot:35',
          preparation_snapshot_digest: 'digest:35', preparation_member_ordinal: 0,
          preparation_member_digest: 'member:35', route_plan_id: 'route-plan:35',
          route_plan_digest: 'route-digest:35', route_plan_execution_id: 'route-execution:35',
          preparation_claim_id: 'claim:35', journey_location_id: 'journey:35' } }
    }, factual: { mode_resolution: { command_id:
      'lower_dvina_trace.follow_path_to_fishing_camp' }, consequence: {
      phase3_kind: 'movement', movement: { route_ref: contracts.route.route_id,
        destination: { location_ref: 'trace_ld_v1_loc_fishing_camp' } } } } });
  assert.equal(lifecycle.operation_kind, 'first_entry');
  assert.equal(lifecycle.approved_write_sets[0].inserts.length, 12);
});
