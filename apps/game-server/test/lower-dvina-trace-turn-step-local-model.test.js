import assert from 'node:assert/strict';
import test from 'node:test';
import { validateTurnStepPlan } from '@rus/turn';
import { assembleTurnStepPlan, createLowerDvinaTraceTurnStepModel } from
  '../src/runtime/lower-dvina-trace-phase-2-llm.js';
import { output, request } from
  './lower-dvina-trace-turn-step-llm-test-helpers.js';

test('turn step repair preserves valid nested fields omitted by the model', async () => {
  const input = request();
  const original = assembleTurnStepPlan(output(), input);
  delete original.interpretation.player_goal;
  const model = createLowerDvinaTraceTurnStepModel({ roleRunner: {
    async run() { return { output: {
      interpretation: { player_goal: input.root_player_action }
    } }; }
  } });
  const plan = await model(input, { original_output: original,
    structural_errors: [{ path: '$.interpretation.player_goal',
      code: 'required', message: 'is required' }] });
  assert.equal(plan.interpretation.adaptation, 'literal');
  assert.equal(plan.interpretation.grounded_attempt, 'открыть сундук');
  assert.equal(validateTurnStepPlan(plan, { request: input }).ok, true);
});

test('assembler derives domain resolution from an unseen domain operation', () => {
  const input = request();
  const plan = assembleTurnStepPlan({ ...output(), resolution: 'direct',
    operation_choice: null, operations: [{ op: 'request_discovery',
      actor_ref: input.actor.actor_ref, discovery_kind: 'inspect',
      target_refs: ['location:unseen-workyard'], query: 'осмотреть навес' }] }, input);
  assert.equal(plan.resolution, 'domain_request');
  assert.deepEqual(plan.activity,
    { owner: 'domain', duration_class: null, effort: null });
});

test('assembler restores an omitted player goal from the code-owned request', () => {
  const input = request({ root_player_action: 'Проверить незнакомый след.' });
  const semantic = output(); delete semantic.interpretation.player_goal;
  const plan = assembleTurnStepPlan(semantic, input);
  assert.equal(plan.interpretation.player_goal, input.root_player_action);
  assert.equal(validateTurnStepPlan(plan, { request: input }).ok, true);
});

test('assembler preserves typed player-safe observation scope', () => {
  const input = request();
  const plan = assembleTurnStepPlan({ ...output(), resolution: 'direct',
    goal_result: 'achieved', activity: { owner: 'semantic',
      duration_class: 'moment', effort: 'none' }, operations: [],
    continuation: null, observation_scope: 'player_safe_existing_facts' }, input);
  assert.equal(plan.observation_scope, 'player_safe_existing_facts');
  assert.equal(validateTurnStepPlan(plan, { request: input }).ok, true);
});
