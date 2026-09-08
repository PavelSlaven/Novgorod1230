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
