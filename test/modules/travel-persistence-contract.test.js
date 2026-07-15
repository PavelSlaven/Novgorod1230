import test from 'node:test';
import assert from 'node:assert/strict';
import { RUNTIME_MIGRATIONS } from '../../apps/game-server/src/infrastructure/postgres/migrations.js';
import {
  adaptPartyWriteBatchTarget,
  resolvePartySpecTarget,
  validatePartyAdapterTargetSafety
} from '../../packages/party-store/src/stage-25/schema-mapping.js';

test('travel persistence is the third ordered party-runtime migration', () => {
  assert.equal(RUNTIME_MIGRATIONS.length, 3);
  assert.match(RUNTIME_MIGRATIONS[2], /party_runtime\.party_journeys/);
  assert.match(RUNTIME_MIGRATIONS[2], /party_runtime\.party_journey_legs/);
  assert.match(RUNTIME_MIGRATIONS[2], /position_kind/);
});

test('Stage 25 maps normalized journeys, legs and edge-progress positions only to party_runtime', () => {
  assert.equal(resolvePartySpecTarget('party_journeys').actualTargetTable, 'party_journeys');
  assert.equal(resolvePartySpecTarget('party_journey_legs').actualTargetTable, 'party_journey_legs');
  const position = adaptPartyWriteBatchTarget({
    target_table: 'party_current_position',
    records: [{
      party_id: 'party:1', position_kind: 'edge_progress', journey_id: 'journey:1', journey_leg_id: 'leg:1', edge_id: 'edge:1',
      from_g4_id: 'g4:from', to_g4_id: 'g4:to', progress_permille: 250, last_confirmed_g4_id: 'g4:from', last_route_id: 'route:1'
    }]
  });
  assert.equal(position.target_schema, 'party_runtime');
  assert.deepEqual(position.records[0], {
    party_id: 'party:1', position_kind: 'edge_progress', g4_id: null, g5_node_id: null, g5_anchor_id: null,
    journey_id: 'journey:1', journey_leg_id: 'leg:1', edge_id: 'edge:1', from_g4_id: 'g4:from', to_g4_id: 'g4:to',
    progress_permille: 250, last_confirmed_g4_id: 'g4:from', last_route_id: 'route:1'
  });
  assert.equal(validatePartyAdapterTargetSafety({ write_batches: [{ target_table: 'party_journeys', records: [{ party_id: 'party:1' }] }] }).pass, true);
});
