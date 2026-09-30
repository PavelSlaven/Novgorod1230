import assert from 'node:assert/strict';
import test from 'node:test';
import { requestTurnStepPlanWithRepair } from '../src/turn-step-plan-repair.js';

const actor = 'actor_mikula';
const action = 'Оторву полосу от подола рубахи.';
const request = {
  schema: 'turn_step_request_v1', request_id: 'request', root_turn_id: 'turn',
  committed_state_version: 1, working_revision: 0, step_index: 1,
  max_internal_steps: 8, root_player_action: action, remaining_intent: action,
  completed_steps: [], actor: { actor_id: actor },
  player_safe_state: { items: [{ item_id: 'shirt', name: 'нижняя рубаха',
    placement: { holder_character_id: actor, physical_position: 'equipped' } }] },
  available_domain_operations: []
};

const partial = (sourcePhysicalForm, effort = 'light') => ({
  schema: 'turn_step_plan_v1', request_id: 'request', committed_state_version: 1,
  working_revision: 0, step_index: 1,
  interpretation: { player_goal: action, grounded_attempt: action, adaptation: 'literal' },
  resolution: 'domain_request', goal_result: 'pending',
  activity: { owner: 'semantic', duration_class: 'brief', effort },
  operations: [{ op: 'request_item_use', actor_ref: actor, item_ref: 'shirt', use_kind: 'other',
    target_refs: [], action_production: { source_refs: ['shirt'], tool_refs: [],
      requested_output_count: null, identity_mode: 'independent_outputs', origin: 'direct_partition',
      result_class: 'partial_transformation', material_extent: 'minor',
      result_descriptor: { display_name: 'полоса ткани', physical_description: 'полоса льна',
        qualitative_facts: [], removed_physical_fact_refs: [], inscription_text: null,
        physical_form: 'long', source_fact_delta: { physical_description: 'рубаха с коротким подолом',
          qualitative_facts: [], removed_physical_fact_refs: [], physical_form: sourcePhysicalForm } },
      output_class: 'ordinary_mundane' } }],
  check: null, continuation: null, clarification: null, direct_result_kind: null,
  reason_code: 'action_production', reason: 'Игрок отрывает полосу.'
});

test('a lone enum error on the surviving source form gets the one semantic repair', async () => {
  const seen = [];
  const result = await requestTurnStepPlanWithRepair({ request,
    turnStepModel: async (_safe, repairContext) => {
      seen.push(repairContext?.structural_errors ?? null);
      return repairContext == null ? partial('none') : partial('regular');
    } });
  assert.equal(result.repaired, true);
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[1].map(({ path, code }) => [path, code]), [[
    '$.operations[0].action_production.result_descriptor.source_fact_delta.physical_form', 'enum']]);
  assert.equal(result.plan.operations[0].action_production.result_descriptor.source_fact_delta.physical_form,
    'regular');
});

test('the repair is one: a second invalid form is a typed failure', async () => {
  let calls = 0;
  await assert.rejects(() => requestTurnStepPlanWithRepair({ request,
    turnStepModel: async () => { calls += 1; return partial('none'); } }),
  (error) => error.code === 'TURN_STEP_PLAN_INVALID' && error.details.repair_attempted === true);
  assert.equal(calls, 2);
});

test('other lone enum errors stay deterministic failures without repair', async () => {
  let calls = 0;
  await assert.rejects(() => requestTurnStepPlanWithRepair({ request,
    turnStepModel: async () => { calls += 1; return partial('regular', 'colossal'); } }),
  (error) => error.code === 'TURN_STEP_PLAN_INVALID'
    && error.details.repair_suppressed === 'deterministic_structure_invalid');
  assert.equal(calls, 1);
});
