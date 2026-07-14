import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeStage9SelectionPolicy, runStage9StartNodeSelector } from '@rus/new-game/stages/stage-9';

function input() {
  const candidates = ['a', 'b'].map((id) => ({ candidate_id: id, scale_level: 'G4', node_chain: { g1_node_id: 'g1', g2_node_id: 'g2', g3_node_id: 'g3', g4_node_id: `g4-${id}` }, g4_node_id: `g4-${id}`, source_trace: [{ source_id: `source-${id}` }] }));
  const links = candidates.map((candidate) => ({ candidate_place_template_link_id: `link-${candidate.candidate_id}`, candidate_id: candidate.candidate_id, place_template_id: `place-${candidate.candidate_id}`, node_chain: candidate.node_chain, source_trace: candidate.source_trace }));
  return {
    version: 1, schema: 'start_node_selector_input', request_id: 'stage9-request',
    normalized_request: { schema: 'new_game_normalized_request' },
    historical_frame: { schema: 'historical_frame', region: { region_id: 'region' }, year: { value: 1230 }, calendar: { season: 'spring' }, clock: { day: 1, hour: 12, minute: 0, time_of_day: 'day', light_profile: 'daylight' } },
    regional_context_package: { schema: 'regional_context_package' },
    start_candidate_set: { schema: 'start_candidate_set', selection_status: 'ready', candidates, downstream_constraints: { must_choose_from_candidate_ids: ['a', 'b'] } },
    candidate_place_template_set: { schema: 'candidate_place_template_set', selection_status: 'ready', candidate_template_links: links, downstream_constraints: { must_choose_candidate_template_link_id: ['link-a', 'link-b'] } },
    npc_candidate_set: { schema: 'npc_candidate_set', selection_status: 'ready', npc_candidates: [] },
    item_profile_candidate_set: { schema: 'item_profile_candidate_set', selection_status: 'ready', item_profile_candidates: [] },
    selection_policy: normalizeStage9SelectionPolicy({ require_sources: false })
  };
}

test('Stage 9 exposes only bounded commands and code builds selected_start_node', async () => {
  let executorCalls = 0;
  const result = await runStage9StartNodeSelector(input(), {
    partyId: 'party-stage9',
    decisionSecret: 'stage9-secret', decisionExpiresAt: '2030-01-01T00:00:00.000Z', now: '2029-01-01T00:00:00.000Z',
    executor: async ({ input: request }) => {
      executorCalls += 1;
      assert.equal(request.schema, 'bounded_decision_request_v2');
      assert.equal(request.options.length, 2);
      const option = request.options[1];
      return { version: 2, schema: 'bounded_decision_result_v2', request_id: request.request_id, state_version: request.state_version, option_id: option.option_id, command_token: option.command_token };
    }
  });
  assert.equal(executorCalls, 1);
  assert.equal(result.status, 'ready');
  assert.equal(result.output.selected.selected_candidate_id, 'b');
  assert.equal(result.output.selection_reasoning.decision_protocol, 'bounded_decision_v2');
});

test('Stage 9 rejects legacy free-form LLM output without semantic retries', async () => {
  let executorCalls = 0;
  const result = await runStage9StartNodeSelector(input(), {
    partyId: 'party-stage9',
    decisionSecret: 'stage9-secret', decisionExpiresAt: '2030-01-01T00:00:00.000Z', now: '2029-01-01T00:00:00.000Z',
    executor: async () => { executorCalls += 1; return { version: 1, schema: 'selected_start_node', selection_status: 'selected' }; }
  });
  assert.equal(executorCalls, 1);
  assert.equal(result.status, 'requires_repair');
  assert.ok(result.gate.concerns.some((item) => item.code === 'DECISION_RESULT_INVALID'));
});
