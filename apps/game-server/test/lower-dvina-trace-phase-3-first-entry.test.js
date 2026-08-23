import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveFirstEntry } from
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
  assert.throws(() => resolveFirstEntry({
    partyId: 'party', phase3Contracts: contracts,
    changeSetId: 'change', scenarioRevision: 24,
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
