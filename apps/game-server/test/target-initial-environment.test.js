import test from 'node:test';
import assert from 'node:assert/strict';
import { createTargetCurrentFactualContext } from
  '../src/infrastructure/postgres/target-current-factual-context.js';

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
