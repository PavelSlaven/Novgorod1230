import assert from 'node:assert/strict';
import test from 'node:test';
import { validateWorldProcessStepPlan } from '@rus/turn';
import { assembleWorldProcessStepPlan,
  createLowerDvinaTraceWorldProcessStepModel } from
  '../src/runtime/lower-dvina-trace-world-process-llm.js';
import { worldProcessRequest } from './lower-dvina-trace-turn-step-llm-test-helpers.js';

test('world process model assembles exact envelope from qualitative choice', async () => {
  let prompt;
  const input = worldProcessRequest();
  const model = createLowerDvinaTraceWorldProcessStepModel({
    roleRunner: { async run(call) {
      prompt = call.messages[0].content;
      return { output: { interpretation: {
        grounded_transition: 'Вода ослабляет огонь.' },
      outcome_choice: 'outcome_2', affected_refs: ['fire:1'] } };
    } }
  });
  const plan = await model(input);
  assert.equal(validateWorldProcessStepPlan(plan, input), true);
  assert.equal(plan.request_id, input.request_id);
  assert.equal(plan.process_outcome, input.outcome_contract[1].process_outcome);
  assert.equal(plan.reason_code, input.outcome_contract[1].reason_code);
  assert.deepEqual(plan.fact_changes, []);
  assert.doesNotMatch(prompt, /Copy request_id/u);
  assert.match(prompt, /affected_refs may contain only unique refs supplied by request/u);
});

test('world-process assembly does not default omitted affected refs', () => {
  const input = worldProcessRequest();
  const plan = assembleWorldProcessStepPlan({ interpretation: {
    grounded_transition: 'Вода ослабляет огонь.' },
  outcome_choice: 'outcome_2' }, input);
  assert.equal(plan.affected_refs, undefined);
  assert.equal(validateWorldProcessStepPlan(plan, input), false);
});
