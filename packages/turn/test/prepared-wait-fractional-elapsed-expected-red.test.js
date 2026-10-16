import assert from 'node:assert/strict';
import test from 'node:test';
import { bindTurnStepPreparedConsequence, buildTurnStepPreparedEffectLedger,
  buildTurnStepPreparedTimeUpdate } from '../src/turn-step-prepared-effects.js';
import { buildTimeUpdateStage } from '../src/stages/time-update.js';

// A-army-358-02: expected red, issue: ожидание с дробным фактическим временем.
// The lead assigns the separate issue number; this is not the seasonal #358 check.
for (const fractional of [false, true]) {
  test(fractional
    ? 'ожидаемо красный, issue: ожидание — fractional prepared elapsed must reach time-update'
    : 'integral prepared wait reaches time-update (positive control)', async () => {
    const before = { whole_minutes: '10', subminute_numerator: '0', subminute_denominator: '1' };
    const after = fractional
      ? { whole_minutes: '10', subminute_numerator: '1', subminute_denominator: '2' }
      : { whole_minutes: '11', subminute_numerator: '0', subminute_denominator: '1' };
    const elapsed = { exact_minutes: { numerator: '1', denominator: fractional ? '2' : '1' } };
    const body = { health: 80, satiety: 60, energy: 40, active_conditions: [] };
    const activity = { version: 1,
      schema: 'rus.lower_dvina_trace_turn_step_semantic_activity.v1',
      activity_id: 'wait-1', root_turn_id: 'turn:wait:1', step_index: 1,
      profile_ref: 'approved:brief-none', duration_class: 'brief', duration_minutes: 1, effort: 'none' };
    const ledger = buildTurnStepPreparedEffectLedger({
      rootTurnId: activity.root_turn_id, committedStateVersion: 3,
      effects: [{ effect: {
        step_index: 1, effect_kind: 'semantic_activity',
        owner_ref: activity.profile_ref, operation_ref: activity.activity_id,
        availability: null, consequence: { duration_minutes: 1, body_effect_ref: null },
        time_update: { version: 2, schema: 'turn_time_update', owner: '@rus/time-events-history',
          clock_before: before, clock_after: after, exact_elapsed: elapsed,
          temporal_results: fractional ? [{ trace: { stopped_after_current_batch: true } }] : [] },
        body_update: { version: 1, schema: 'turn_body_update', owner: '@rus/body-state',
          applied: false, proposal: null, state_after: body }, body_state_before: body,
      }, working_projection_before: { clock: before }, working_projection_after: { clock: after } }],
    });
    const consequence = bindTurnStepPreparedConsequence({ duration_minutes: 1, state_changes: [{
      kind: 'semantic_activity', activity_id: activity.activity_id,
      profile_ref: activity.profile_ref,
      profile_pin: { artifact_id: 'owner-profiles', revision: 1, digest: '1'.repeat(64) },
      duration_class: activity.duration_class, effort: activity.effort,
      body_effect_profile_ref: 'body:brief:none',
    }] }, ledger);
    assert.deepEqual(buildTurnStepPreparedTimeUpdate(ledger).exact_elapsed, elapsed);
    assert.equal(consequence.duration_minutes, fractional ? 0.5 : 1);
    assert.equal(consequence.prepared_effect_ledger_digest, ledger.ledger_digest);
    await assert.doesNotReject(async () => {
      const result = await buildTimeUpdateStage({ retrievedState: { clock: before },
        consequence, preparedEffectLedger: ledger,
        turnStepOperationBatch: { version: 1, schema: 'party_turn_step_operation_batch_v1',
          root_turn_id: activity.root_turn_id, committed_state_version: 3,
          operations: [{ target: 'party_events', value: activity }] } });
      assert.deepEqual(result.exact_elapsed, elapsed);
      assert.deepEqual(result.clock_after, after);
      assert.equal(result.semantic_activity_resolutions[0].execution.status,
        fractional ? 'paused' : 'completed');
    }, 'valid prepared waiting time must survive the final time-update stage');
  });
}
