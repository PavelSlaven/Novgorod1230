import test from 'node:test';
import assert from 'node:assert/strict';
import { createTargetCurrentFactualContext, factualContextMatchesRequestOrigin } from
  '../src/infrastructure/postgres/target-current-factual-context.js';

test('factual context uses the committed origin for an ordered approach and source otherwise', () => {
  const request = { actor_id: 'actor', source_position_id: 'departure',
    approach_origin_position_id: 'arrival',
    ordered_local_edge_path: [{ edge_id: 'edge', from_position_id: 'arrival', to_position_id: 'departure' }] };
  assert.equal(factualContextMatchesRequestOrigin({ actor_id: 'actor', position: { position_id: 'arrival' } }, request), true);
  assert.equal(factualContextMatchesRequestOrigin({ actor_id: 'actor', position: { position_id: 'other' } }, request), false);
  assert.equal(factualContextMatchesRequestOrigin({ actor_id: 'actor', position: { position_id: 'departure' } },
    { actor_id: 'actor', source_position_id: 'departure' }), true);
  assert.equal(factualContextMatchesRequestOrigin({ actor_id: 'actor', position: { position_id: 'arrival' } },
    { actor_id: 'actor', source_position_id: 'departure' }), false);
});

test('initial environment rejects a missing, advanced, or attached party before reading facts', async () => {
  const reader = createTargetCurrentFactualContext({ runtime: {
    materialization_inputs: { calendar_profile: {},
      approved_actor_temporal_bundle: { temporal_records: [] } } } });
  for (const rows of [[], [{ state_version: 1, session_party_id: null }],
    [{ state_version: 0, session_party_id: 'party' }]]) {
    const queries = [];
    const transaction = { async query(sql, values) {
      queries.push([sql, values]);
      return { rows };
    } };
    await assert.rejects(reader.readInitialEnvironment({ transaction,
      partyId: 'party', actorId: 'actor' }),
    { code: 'TARGET_CURRENT_FACTUAL_CONTEXT_DATA_GAP' });
    assert.equal(queries.length, 1);
    assert.deepEqual(queries[0][1], ['party']);
  }
});
