import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPhase2Snapshot } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-state.js';

function state(schema) {
  return { schema, party_id: 'party:inspection', party_state: {
    state_version: 2, session_state_version: 2, body_state_version: 2,
    clock_state_version: 2, turn_number: 2 },
  body_state: { active_conditions: [] }, body_effect_history: [],
  clock: clock('10'), clock_weather_light: {}, items: [], knowledge: [] };
}

function input(current) {
  return { state: current, nextVersion: 3, turnNumber: 3, nextItems: [],
    nextKnowledge: [], nextBodyState: { active_conditions: [] },
    changeSetId: 'change:inspection', inputDigest: 'input', visibleEnvelope: {
      package_id: 'visible:inspection', package_digest: 'digest' }, factual: {
      player_input: { request_id: 'request:inspection',
        idempotency_key: 'idem:inspection', raw_text: 'Осмотреть крушение.',
        received_at: '1230-01-01T00:00:00Z' }, mode_resolution: {
        option_id: 'inspect_wreck_in_detail', decision_trace: {
          action_set_digest: 'actions' } }, availability: {
        check_requests: [{}] }, consequence: { check_result: null },
      time_update: { clock_after: clock('25') }, body_update: {
        proposal: { execution_variant_id: 'inspection' } } } };
}

function clock(whole_minutes) {
  return { whole_minutes, subminute_numerator: '0',
    subminute_denominator: '1' };
}

test('inspection preserves the current snapshot schema', () => {
  for (const schema of ['rus.lower_dvina_trace_turn_snapshot.v2',
    'rus.lower_dvina_trace_phase_2_snapshot.v1']) {
    assert.equal(buildPhase2Snapshot(input(state(schema))).schema, schema);
  }
});
