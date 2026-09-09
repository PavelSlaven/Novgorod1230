import assert from 'node:assert/strict';
import test from 'node:test';
import { validateTurnStepPlan } from '../src/turn-step-contracts.js';
import { requestTurnStepPlanWithRepair } from
  '../src/turn-step-plan-repair.js';

const actor = 'actor_mikula';
const request = {
  schema: 'turn_step_request_v1', request_id: 'request', root_turn_id: 'turn',
  committed_state_version: 1, working_revision: 0, step_index: 1,
  max_internal_steps: 8, root_player_action: 'переложить вещь',
  remaining_intent: 'переложить вещь', completed_steps: [],
  actor: { actor_id: actor }, player_safe_state: { items: [{ item_id: 'cloth',
    placement: { holder_character_id: actor, physical_position: 'hands' } },
  { item_id: 'coat', placement: {
    holder_character_id: actor, physical_position: 'worn' } }] },
  available_domain_operations: []
};

function plan(entity_ref, relation) {
  return {
    schema: 'turn_step_plan_v1', request_id: 'request',
    committed_state_version: 1, working_revision: 0, step_index: 1,
    interpretation: { player_goal: 'переложить вещь',
      grounded_attempt: 'переложить вещь', adaptation: 'literal' },
    resolution: 'direct', goal_result: 'achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'light' },
    operations: [{ op: 'move_entity', entity_ref,
      placement: { relation, target_ref: actor } }], check: null,
    continuation: null, clarification: null, direct_result_kind: null,
    reason_code: 'move',
    reason: 'Вещь перемещается.'
  };
}

test('move_entity rejects a player-safe placement that is already satisfied', () => {
  const held = validateTurnStepPlan(plan('cloth', 'held_by'), { request });
  assert.equal(held.ok, false);
  assert.equal(held.errors.some(({ code }) =>
    code === 'operation_semantic_grounding'), true);
  assert.equal(validateTurnStepPlan(plan('coat', 'worn_by'), { request }).ok,
    false);
  assert.equal(validateTurnStepPlan(plan('cloth', 'worn_by'), { request }).ok,
    true);
  const attachedToActor = validateTurnStepPlan(
    plan('cloth', 'attached_to'), { request });
  assert.equal(attachedToActor.ok, false);
  assert.equal(attachedToActor.errors.some(({ code }) =>
    code === 'placement_target_kind'), true);
  request.player_safe_state.items[1].placement.physical_position = 'worn_quick';
  assert.equal(validateTurnStepPlan(plan('coat', 'worn_by'), { request }).ok,
    true);
});

test('structural repair repeating an unknown ref fails technically',
  async () => {
    let calls = 0;
    await assert.rejects(() => requestTurnStepPlanWithRepair({ request,
      turnStepModel: async () => {
        const value = plan('mistyped-ref', 'held_by');
        return ++calls === 1
          ? { ...value, interpretation: { adaptation: 'literal' } } : value;
      } }), (error) => error.code === 'TURN_STEP_PLAN_INVALID'
        && error.details.repair_attempted === true);
    assert.equal(calls, 2);
  });

test('direct result kind is structural and write-free', () => {
  const observation = { ...plan('cloth', 'worn_by'), operations: [],
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    direct_result_kind: 'player_safe_observation' };
  assert.equal(validateTurnStepPlan(observation, { request }).ok, true);
  assert.equal(validateTurnStepPlan({ ...observation,
    direct_result_kind: 'player_safe_item_observation' }, { request }).ok, true);
  assert.equal(validateTurnStepPlan({ ...observation,
    direct_result_kind: 'no_state_gesture' }, { request }).ok, true);
  for (const invalid of [
    { ...observation, direct_result_kind: null },
    { ...observation, direct_result_kind: 'weather' },
    { ...observation, goal_result: 'not_achieved' },
    { ...observation, activity: { owner: 'semantic', duration_class: 'brief',
      effort: 'none' } },
    { ...observation, operations: plan('cloth', 'worn_by').operations }
  ]) assert.equal(validateTurnStepPlan(invalid, { request }).ok, false);
});
