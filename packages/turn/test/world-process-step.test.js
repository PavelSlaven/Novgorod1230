import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveWorldProcessStep } from '../src/world-process-step.js';

function request() {
  return {
    schema: 'world_process_step_request_v1', request_id: 'req:water',
    party_state_version: 7, process_state_version: 2,
    process_mode: 'local_exact', process_kind: 'fire',
    process: { process_ref: 'fire:1', scope_ref: 'anchor:shore',
      causal_basis_ref: 'item:hearth', status: 'active',
      started_at: { day: 1, second: 0 },
      next_boundary_at: { day: 1, second: 600 },
      fuel_bindings: ['item:wood'] },
    current_timestamp: { day: 1, second: 120 }, trigger: 'actor_affected',
    subject_state: { source_refs: ['water'],
      facts: ['water portion'], quantities: [{ ref: 'water', value: 1,
        unit: 'portion' }] },
    environment_state: { scope_ref: 'anchor:shore', facts: [] },
    allowed_outcomes: ['no_effect', 'continue', 'complete']
  };
}

test('world process semantic step accepts only a bounded qualitative result', async () => {
  const seen = [];
  const result = await resolveWorldProcessStep({ request: request(),
    worldProcessStepModel: async (input) => {
      seen.push(input);
      return { schema: 'world_process_step_plan_v1', request_id: input.request_id,
        process_ref: 'fire:1', process_state_version: 2,
        interpretation: { grounded_transition: 'water extinguishes fire' },
        process_outcome: 'complete', affected_refs: ['water'],
        fact_changes: [], reason_code: 'water_extinguishes' };
    } });
  assert.equal(seen.length, 1);
  assert.equal(Object.isFrozen(seen[0]), true);
  assert.equal(result.process_outcome, 'complete');
});

test('world process semantic step rejects unrequested effects and numeric deltas', async () => {
  await assert.rejects(resolveWorldProcessStep({ request: request(),
    worldProcessStepModel: async () => ({
      schema: 'world_process_step_plan_v1', request_id: 'req:water',
      process_ref: 'fire:1', process_state_version: 2,
      interpretation: { grounded_transition: 'water extinguishes fire' },
      process_outcome: 'complete', affected_refs: ['item:foreign'],
      fact_changes: [], reason_code: 'water_extinguishes', resource_deltas: []
    }) }), { code: 'TURN_WORLD_PROCESS_STEP_PLAN_INVALID' });
});
