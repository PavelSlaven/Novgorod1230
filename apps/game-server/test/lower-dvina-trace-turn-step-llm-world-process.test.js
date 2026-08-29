import assert from 'node:assert/strict';
import test from 'node:test';
import { validateWorldProcessStepPlan } from '@rus/turn';
import { createLowerDvinaTraceWorldProcessStepModel } from
  '../src/runtime/lower-dvina-trace-world-process-llm.js';
import { worldProcessRequest } from './lower-dvina-trace-turn-step-llm-test-helpers.js';

test('world process prompt supplies complete bounded plan shape', async () => {
  let prompt;
  const input = worldProcessRequest();
  const model = createLowerDvinaTraceWorldProcessStepModel({
    roleRunner: { async run(call) {
      prompt = call.messages[0].content;
      return { output: { schema: 'world_process_step_plan_v1' } };
    } }
  });
  await model(input);
  const shape = JSON.parse(prompt.match(
    /Use this complete valid shape:\n(\{[^\n]+\})/u
  )[1]);
  assert.equal(validateWorldProcessStepPlan(shape, input), true);
  assert.deepEqual(Object.keys(shape), [
    'schema', 'request_id', 'process_ref', 'process_state_version',
    'interpretation', 'process_outcome', 'affected_refs', 'fact_changes',
    'reason_code'
  ]);
  assert.equal(shape.process_outcome, input.outcome_contract[0].process_outcome);
  assert.equal(shape.reason_code, input.outcome_contract[0].reason_code);
  assert.deepEqual(shape.fact_changes, []);
  assert.match(prompt, /affected_refs may contain only unique refs supplied by request/u);
});
