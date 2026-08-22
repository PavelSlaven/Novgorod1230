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
      started_at: timestamp(0), next_boundary_at: timestamp(10),
      fuel_bindings: [{ fuel_ref: 'item:wood',
        fuel_class: 'ordinary_solid_fuel_unit' }] },
    current_timestamp: timestamp(2), trigger: 'actor_affected',
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

test('world process request requires the exact objective process projection',
  async () => {
    for (const mutate of [
      (value) => { delete value.process.scope_ref; },
      (value) => { value.process.hidden_state = true; },
      (value) => { value.process.fuel_bindings = ['item:wood']; },
      (value) => { value.process_state_version = null; },
      (value) => { value.process.started_at.whole_minutes = 'x'; },
      (value) => { value.process.next_boundary_at.subminute_denominator = '0'; },
      (value) => { value.current_timestamp.subminute_numerator = '-1'; }
    ]) {
      const invalid = request();
      mutate(invalid);
      await assert.rejects(resolveWorldProcessStep({ request: invalid,
        worldProcessStepModel: async () => null }), {
        code: 'TURN_WORLD_PROCESS_STEP_REQUEST_INVALID'
      });
    }
  });

function timestamp(wholeMinutes) {
  return { whole_minutes: String(wholeMinutes), subminute_numerator: '0',
    subminute_denominator: '1' };
}

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
