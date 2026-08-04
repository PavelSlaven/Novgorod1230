import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveTurnStepSemanticActivityTime } from '../src/index.js';

test('semantic activity time owner preserves global mixed-batch order', () => {
  const activity = semanticActivity();
  const result = resolveTurnStepSemanticActivityTime({
    batch: batch([
      directBodyEvent(),
      { target: 'party_events', value: {
        version: 1, schema: 'rus.domain_event.v1', event_id: 'event-1'
      } },
      { target: 'party_events', value: activity }
    ]),
    consequence: consequence(activity),
    clockBefore: timestamp('10'),
    clockAfter: timestamp('20'),
    exactElapsed: exact('10')
  });

  assert.deepEqual(result.semantic_activity_elapsed,
    { exact_minutes: { numerator: '5', denominator: '1' } });
  assert.equal(result.semantic_activity_resolutions.length, 1);
  assert.equal(result.semantic_activity_resolutions[0].fragment_order, 2);
  assert.deepEqual(result.semantic_activity_resolutions[0].execution, {
    status: 'completed',
    execution_scope: 'standalone',
    original_duration: {
      exact_minutes: { numerator: '5', denominator: '1' }
    },
    started_at: timestamp('10'),
    ended_at: timestamp('15')
  });
});

test('semantic activity time owner rejects malformed claims and clocks', () => {
  const activity = semanticActivity();
  const input = {
    batch: batch([{ target: 'party_events', value: activity }]),
    consequence: consequence(activity),
    clockBefore: timestamp('10'),
    clockAfter: timestamp('20'),
    exactElapsed: exact('10')
  };
  const malformed = structuredClone(input);
  delete malformed.batch.operations[0].value.effort;
  assert.throws(() => resolveTurnStepSemanticActivityTime(malformed), {
    code: 'TURN_SEMANTIC_ACTIVITY_TEMPORAL_INVALID'
  });

  const forgedClock = structuredClone(input);
  forgedClock.clockAfter.technical_time = 'forbidden';
  assert.throws(() => resolveTurnStepSemanticActivityTime(forgedClock), {
    code: 'TURN_STEP_TIME_WINDOW_INVALID'
  });
});

test('semantic activity owner validates an exact rational time window', () => {
  const activity = { ...semanticActivity(), duration_minutes: 1 };
  const input = {
    batch: batch([{ target: 'party_events', value: activity }]),
    consequence: consequence(activity),
    clockBefore: {
      whole_minutes: '10', subminute_numerator: '1',
      subminute_denominator: '2'
    },
    clockAfter: timestamp('12'),
    exactElapsed: exact('3', '2')
  };
  assert.doesNotThrow(() => resolveTurnStepSemanticActivityTime(input));
  assert.throws(() => resolveTurnStepSemanticActivityTime({
    ...input, exactElapsed: exact('4', '3')
  }), { code: 'TURN_STEP_TIME_WINDOW_INVALID' });
});

function batch(operations) {
  return {
    version: 1,
    schema: 'party_turn_step_operation_batch_v1',
    root_turn_id: 'turn:p:1',
    committed_state_version: 3,
    operations
  };
}

function semanticActivity() {
  return {
    version: 1,
    schema: 'rus.lower_dvina_trace_turn_step_semantic_activity.v1',
    activity_id: 'activity-1',
    root_turn_id: 'turn:p:1',
    step_index: 1,
    profile_ref: 'approved:brief-light',
    duration_class: 'brief',
    duration_minutes: 5,
    effort: 'light'
  };
}

function directBodyEvent() {
  return {
    target: 'party_state',
    value: {
      version: 1,
      schema: 'rus.lower_dvina_trace_turn_step_direct_operation.v1',
      operation_id: 'body-op',
      root_turn_id: 'turn:p:1',
      step_index: 1,
      operation_kind: 'apply_body_event',
      payload: {}
    }
  };
}

function consequence(activity) {
  return { state_changes: [{
    kind: 'semantic_activity',
    activity_id: activity.activity_id,
    profile_ref: activity.profile_ref,
    profile_pin: {
      artifact_id: 'owner-profiles', revision: 1, digest: '1'.repeat(64)
    },
    duration_class: activity.duration_class,
    effort: activity.effort,
    body_effect_profile_ref: 'body:brief:light'
  }] };
}

function timestamp(wholeMinutes) {
  return {
    whole_minutes: wholeMinutes,
    subminute_numerator: '0',
    subminute_denominator: '1'
  };
}

function exact(numerator, denominator = '1') {
  return { exact_minutes: { numerator, denominator } };
}
