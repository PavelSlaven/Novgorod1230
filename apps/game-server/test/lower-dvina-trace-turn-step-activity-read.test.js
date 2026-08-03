import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalDigest } from '@rus/materialization';
import { assertTurnStepSemanticActivityRows } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-activity-read.js';

test('M1 restart validator cross-binds ordered activity profile pins',
  async () => {
    const history = [activity('activity-1'), activity('activity-2')];
    const rows = [row(history[0], 0, '10', '15'),
      row(history[1], 1, '15', '20')];
    await assert.doesNotReject(() => assertTurnStepSemanticActivityRows(
      pool(rows), restartPayload(history)
    ));
    rows[1].rule_and_policy_pins.activity_profile.digest = '2'.repeat(64);
    await assert.rejects(() => assertTurnStepSemanticActivityRows(
      pool(rows), restartPayload(history)
    ), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  });

test('M1 restart treats fragment order and time continuity as turn-local',
  async () => {
    const first = activity('activity-1');
    const second = activity('activity-2', 'turn:p:2', 'request-2',
      'change-2', 'idem-2');
    const rows = [row(second, 0, '40', '45'), row(first, 0, '10', '15')];
    await assert.doesNotReject(() => assertTurnStepSemanticActivityRows(
      pool(rows), restartPayload([first, second])
    ));
  });

test('M1 restart enforces continuity against the previous activity per root',
  async () => {
    const first = activity('activity-a1', 'turn:p:1');
    const interleaved = activity('activity-b1', 'turn:p:2', 'request-2',
      'change-2', 'idem-2');
    const later = activity('activity-a2', 'turn:p:1');
    const rows = [row(first, 0, '10', '15'),
      row(interleaved, 0, '40', '45'), row(later, 1, '20', '25')];
    await assert.rejects(() => assertTurnStepSemanticActivityRows(
      pool(rows), restartPayload([first, interleaved, later])
    ), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  });

test('M1 restart cross-binds global activity position to the current batch',
  async () => {
    const expected = activity('activity-1');
    const value = row(expected, 1, '10', '15');
    const payload = restartPayload([expected]);
    payload.last_turn = { turn_step_operation_batch: {
      root_turn_id: 'turn:p:1',
      operations: [
        { target: 'party_state', value: { operation_id: 'body-op' } },
        { target: 'party_events', value: activityFragment(expected) }
      ]
    } };
    await assert.doesNotReject(() => assertTurnStepSemanticActivityRows(
      pool([value]), payload
    ));
    payload.last_turn.turn_step_operation_batch.operations.reverse();
    await assert.rejects(() => assertTurnStepSemanticActivityRows(
      pool([value]), payload
    ), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });

    const missing = structuredClone(payload);
    missing.last_turn.turn_step_operation_batch.operations.reverse();
    await assert.rejects(() => assertTurnStepSemanticActivityRows(
      pool([]), { ...missing, turn_step_activity_history: [] }
    ), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  });

test('M1 restart rejects tampered activity owner and causal bindings',
  async () => {
    const expected = activity('activity-1');
    const value = row(expected, 0, '10', '15');
    value.body_effect_refs[0].entity_id = 'body:forged';
    await assert.rejects(() => assertTurnStepSemanticActivityRows(
      pool([value]), restartPayload([expected])
    ), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  });

test('M1 restart rejects each tampered execution causal binding', async () => {
  const expected = activity('activity-1');
  const tampers = [
    (value) => { value.activity_owner_ref.entity_id = 'actor:forged'; },
    (value) => {
      value.originating_command_ref.entity_id = 'request:forged';
    },
    (value) => { value.originating_command_digest = '0'.repeat(64); },
    (value) => { value.preconditions_digest = '0'.repeat(64); },
    (value) => { value.execution_idempotency_record_id = 'idem:forged'; },
    (value) => { value.result_change_set_id = 'change:forged'; }
  ];
  for (const tamper of tampers) {
    const value = row(expected, 0, '10', '15');
    tamper(value);
    await assert.rejects(() => assertTurnStepSemanticActivityRows(
      pool([value]), restartPayload([expected])
    ), { code: 'TRACE_PHASE_2_SESSION_READ_INVALID' });
  }
});

function activity(id, rootTurnId = 'turn:p:1', requestId = 'request-1',
  changeSetId = 'change-1', idempotencyRecordId = 'idem-1') {
  return {
    version: 1,
    schema: 'rus.lower_dvina_trace_turn_step_semantic_activity.v1',
    activity_id: id,
    root_turn_id: rootTurnId,
    step_index: 1,
    profile_ref: 'approved:brief-light',
    profile_pin: { artifact_id: 'profiles', revision: 1,
      digest: '1'.repeat(64) },
    duration_class: 'brief', duration_minutes: 5, effort: 'light',
    body_effect_profile_ref: 'body:brief:light',
    request_id: requestId,
    change_set_id: changeSetId,
    idempotency_record_id: idempotencyRecordId,
    base_state_version: 3
  };
}

function row(activityValue, order, start, end) {
  activityValue.fragment_order = order;
  activityValue.owner_resolution = ownerResolution(
    activityValue, order, start, end);
  const timestamp = (prefix, whole) => ({
    [`${prefix}_whole_minutes`]: whole,
    [`${prefix}_subminute_numerator`]: '0',
    [`${prefix}_subminute_denominator`]: '1'
  });
  return {
    id: activityValue.activity_id,
    activity_snapshot: {
      schema: 'rus.turn_step.semantic_activity_execution.v1',
      activity_id: activityValue.activity_id,
      root_turn_id: activityValue.root_turn_id,
      step_index: activityValue.step_index,
      fragment_order: order,
      activity_profile_ref: activityValue.profile_ref,
      activity_profile_pin: structuredClone(activityValue.profile_pin),
      completion_model_snapshot: { kind: 'fixed_exact', fixed_duration: {
        numerator: '5', denominator: '1'
      } },
      duration_class: activityValue.duration_class,
      effort: activityValue.effort,
      body_effect_profile_ref: activityValue.body_effect_profile_ref
    },
    original_total_minutes: '5',
    status: 'completed', execution_scope: 'standalone',
    activity_series_id: `series:${activityValue.activity_id}`,
    updated_change_set_id: activityValue.change_set_id,
    terminal_change_set_id: activityValue.change_set_id,
    execution_idempotency_record_id:
      activityValue.idempotency_record_id,
    activity_owner_ref: { entity_kind: 'actor', entity_id: 'actor-1' },
    originating_command_ref: { entity_kind: 'semantic_command',
      entity_id: activityValue.request_id },
    originating_command_digest: canonicalDigest({
      root_turn_id: activityValue.root_turn_id,
      request_id: activityValue.request_id
    }),
    attempt_ordinal: 0, actual_time_numerator: '5',
    actual_time_denominator: '1', result_kind: 'completed',
    planned_time_numerator: '5', planned_time_denominator: '1',
    rule_and_policy_pins: {
      activity_profile: structuredClone(activityValue.profile_pin)
    },
    result_change_set_id: activityValue.change_set_id,
    attempt_idempotency_record_id: activityValue.idempotency_record_id,
    execution_context_snapshot: {
      root_turn_id: activityValue.root_turn_id,
      step_index: activityValue.step_index,
      fragment_order: order,
      duration_class: activityValue.duration_class,
      effort: activityValue.effort
    },
    body_effect_refs: [{ entity_kind: 'body_effect_profile',
      entity_id: activityValue.body_effect_profile_ref }],
    trace: {
      root_turn_id: activityValue.root_turn_id,
      step_index: activityValue.step_index,
      fragment_order: order,
      owner_profile_ref: activityValue.profile_ref,
      request_id: activityValue.request_id
    },
    ...timestamp('started_at', start),
    ...timestamp('last_processed_at', end),
    ...timestamp('attempt_started', start),
    ...timestamp('attempt_ended', end),
    preconditions_digest: canonicalDigest({
      party_id: 'p',
      committed_state_version: activityValue.base_state_version,
      activity: {
        schema: 'rus.turn_step.semantic_activity_execution.v1',
        activity_id: activityValue.activity_id,
        root_turn_id: activityValue.root_turn_id,
        step_index: activityValue.step_index,
        fragment_order: order,
        activity_profile_ref: activityValue.profile_ref,
        activity_profile_pin: structuredClone(activityValue.profile_pin),
        completion_model_snapshot: { kind: 'fixed_exact', fixed_duration: {
          numerator: '5', denominator: '1'
        } },
        duration_class: activityValue.duration_class,
        effort: activityValue.effort,
        body_effect_profile_ref: activityValue.body_effect_profile_ref
      }
    })
  };
}

function ownerResolution(activityValue, order, start, end) {
  const timestamp = (whole) => ({ whole_minutes: whole,
    subminute_numerator: '0', subminute_denominator: '1' });
  const exact = { exact_minutes: { numerator: '5', denominator: '1' } };
  return {
    version: 1, schema: 'turn_semantic_activity_resolution_v1',
    activity_id: activityValue.activity_id,
    root_turn_id: activityValue.root_turn_id,
    step_index: activityValue.step_index,
    fragment_order: order,
    profile_ref: activityValue.profile_ref,
    profile_pin: structuredClone(activityValue.profile_pin),
    duration_class: activityValue.duration_class,
    effort: activityValue.effort,
    body_effect_profile_ref: activityValue.body_effect_profile_ref,
    execution: { status: 'completed', execution_scope: 'standalone',
      original_duration: exact, started_at: timestamp(start),
      ended_at: timestamp(end) },
    attempt: { attempt_ordinal: 0, planned_time: exact, actual_time: exact,
      result_kind: 'completed', started_at: timestamp(start),
      ended_at: timestamp(end) }
  };
}

function restartPayload(history) {
  return { party_id: 'p', actor_id: 'actor-1',
    turn_step_activity_history: history };
}

function activityFragment(value) {
  return Object.fromEntries([
    'version', 'schema', 'activity_id', 'root_turn_id', 'step_index',
    'profile_ref', 'duration_class', 'duration_minutes', 'effort'
  ].map((key) => [key, value[key]]));
}

function pool(rows) {
  return { async query() { return { rows, rowCount: rows.length }; } };
}
