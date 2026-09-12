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
