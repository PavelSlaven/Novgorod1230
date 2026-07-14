import assert from 'node:assert/strict';
import test from 'node:test';
import { stage3Definition } from '@rus/new-game/stages/stage-3';

function input() {
  return {
    request_id: 'new-game-1',
    party_id: 'party-1',
    normalized_request: { year_request: { value: 1230 } },
    selection_policy: { require_sources: false },
    available_candidates: {
      regions: [{ region_id: 'region-1', title: 'Region', status: 'approved', sources: [] }],
      historical_periods: [
        { period_id: 'period-a', region_id: 'region-1', title: 'A', year_start: 1220, year_end: 1240, status: 'approved', sources: [] },
        { period_id: 'period-b', region_id: 'region-1', title: 'B', year_start: 1225, year_end: 1235, status: 'approved', sources: [] }
      ],
      season_rules: [{ season_rule_id: 'spring-rule', region_id: 'region-1', season_id: 'spring', status: 'approved', sources: [] }],
      time_of_day_policies: [{ time_of_day_policy_id: 'day-rule', time_of_day: 'day', hour_min: 10, hour_max: 16, light_profile: 'daylight' }],
      political_contexts: [{ region_id: 'region-1', summary: 'Approved political context.' }],
      social_contexts: [{ region_id: 'region-1', summary: 'Approved social context.' }],
      sources: []
    }
  };
}

test('Stage 3 exposes historical frames as a signed bounded option set and code projects the chosen frame', async () => {
  let seenRequest;
  const result = await stage3Definition.execute({ input: input(), services: {
    partyId: 'party-1', decisionSecret: 'secret', decisionExpiresAt: '2030-01-02T00:00:00.000Z', now: '2030-01-01T00:00:00.000Z',
    executor: async ({ input: request }) => {
      seenRequest = request;
      const option = request.options[1];
      return { version: 2, schema: 'bounded_decision_result_v2', request_id: request.request_id, state_version: request.state_version, option_id: option.option_id, command_token: option.command_token };
    }
  } });
  assert.equal(seenRequest.request_id, 'new-game-1:stage3');
  assert.equal(seenRequest.party_id, 'party-1');
  assert.equal(result.artifact.candidate_ids_used.historical_period_id, 'period-b');
  assert.equal(result.artifact.decision_trace.decision_protocol, 'bounded_decision_v2');
});

test('Stage 3 rejects free prose and unknown historical-frame output', async () => {
  await assert.rejects(() => stage3Definition.execute({ input: input(), services: {
    partyId: 'party-1', decisionSecret: 'secret', decisionExpiresAt: '2030-01-02T00:00:00.000Z', now: '2030-01-01T00:00:00.000Z', executor: async () => ({ selected_region: 'invented', prose: 'new historical fact' })
  } }), (error) => error.code === 'DECISION_RESULT_INVALID');
});
