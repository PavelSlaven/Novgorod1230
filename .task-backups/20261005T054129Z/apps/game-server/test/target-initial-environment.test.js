import test from 'node:test';
import assert from 'node:assert/strict';
import { createTargetCurrentFactualContext, hasPristineInitialPartySession,
  hasPristineInitialSessionShape } from
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

test('initial environment accepts only an absent session or an unchanged opening session', () => {
  const absent = { session_party_id: null, session_state_version: null,
    turn_number: null, last_turn_id: null, stage26_result: null };
  const opening = { session_party_id: 'party', session_state_version: 1,
    turn_number: 0, last_turn_id: null, stage26_result: { scenario_id: 'scenario' } };
  assert.equal(hasPristineInitialPartySession(absent, 'party', 'scenario'), true);
  assert.equal(hasPristineInitialPartySession(opening, 'party', 'scenario'), true);
  assert.equal(hasPristineInitialSessionShape(opening, 'party'), true);
  assert.equal(hasPristineInitialPartySession({ ...opening,
    stage26_result: { scenario_id: 'other' } }, 'party', 'scenario'), false);
  assert.equal(hasPristineInitialSessionShape({ ...opening, turn_number: 1 }, 'party'), false);
  assert.equal(hasPristineInitialSessionShape({ ...absent, turn_number: 0 }, 'party'), false);
});
