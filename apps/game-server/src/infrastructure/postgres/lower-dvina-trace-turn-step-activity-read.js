import { canonicalDigest } from '@rus/materialization';
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';

export async function assertTurnStepSemanticActivityRows(pool, payload) {
  const history = payload.turn_step_activity_history ?? [];
  assertCurrentBatch(history, payload);
  if (history.length === 0) return;
  const ids = history.map(({ activity_id: id }) => id);
  if (new Set(ids).size !== ids.length) throw phase2IntegrityError();
  const result = await pool.query(
    `SELECT e.id,e.activity_snapshot,e.original_total_minutes::text,
            e.status,e.execution_scope,e.activity_series_id,
            e.updated_change_set_id,e.terminal_change_set_id,
            e.idempotency_record_id AS execution_idempotency_record_id,
            e.activity_owner_ref,e.originating_command_ref,
            e.originating_command_digest,e.preconditions_digest,
            e.started_at_whole_minutes::text,
            e.started_at_subminute_numerator::text,
            e.started_at_subminute_denominator::text,
            e.last_processed_at_whole_minutes::text,
            e.last_processed_at_subminute_numerator::text,
            e.last_processed_at_subminute_denominator::text,
            a.attempt_ordinal,a.actual_time_numerator::text,
            a.actual_time_denominator::text,a.result_kind,
            a.planned_time_numerator::text,
            a.planned_time_denominator::text,
            a.started_at_whole_minutes::text AS attempt_started_whole_minutes,
            a.started_at_subminute_numerator::text
              AS attempt_started_subminute_numerator,
            a.started_at_subminute_denominator::text
              AS attempt_started_subminute_denominator,
            a.ended_at_whole_minutes::text AS attempt_ended_whole_minutes,
            a.ended_at_subminute_numerator::text
              AS attempt_ended_subminute_numerator,
            a.ended_at_subminute_denominator::text
              AS attempt_ended_subminute_denominator,
            a.result_change_set_id,
            a.idempotency_record_id AS attempt_idempotency_record_id,
            a.execution_context_snapshot,a.body_effect_refs,
            a.rule_and_policy_pins,a.trace
       FROM party_runtime.party_timed_activity_executions e
       JOIN party_runtime.party_timed_activity_attempts a
         ON a.activity_execution_id=e.id
      WHERE e.id=ANY($1::text[])`,
    [ids]
  );
  if (result.rows.length !== history.length) throw phase2IntegrityError();
  const rows = new Map(result.rows.map((row) => [row.id, row]));
  if (rows.size !== result.rows.length) throw phase2IntegrityError();
  const previousByRoot = new Map();
  for (let index = 0; index < history.length; index += 1) {
    const expected = history[index];
    const row = rows.get(expected.activity_id);
    if (!row) throw phase2IntegrityError();
    assertActivity(expected, row, expected.fragment_order, payload);
    const previous = previousByRoot.get(expected.root_turn_id);
    if (previous && !sameTimestamp(endTimestamp(previous),
      startTimestamp(row))) throw phase2IntegrityError();
    previousByRoot.set(expected.root_turn_id, row);
  }
}

function assertActivity(expected, row, order, payload) {
  const snapshot = row.activity_snapshot;
  const started = startTimestamp(row);
  const ended = endTimestamp(row);
  const owner = expected.owner_resolution;
  const ownerExecution = owner?.execution;
  const ownerAttempt = owner?.attempt;
  const context = {
    root_turn_id: expected.root_turn_id,
    step_index: expected.step_index,
    fragment_order: order,
    duration_class: expected.duration_class,
    effort: expected.effort
  };
  const trace = {
    root_turn_id: expected.root_turn_id,
    step_index: expected.step_index,
    fragment_order: order,
    owner_profile_ref: expected.profile_ref,
    request_id: expected.request_id
  };
  const expectedSnapshot = {
    schema: 'rus.turn_step.semantic_activity_execution.v1',
    activity_id: expected.activity_id,
    root_turn_id: expected.root_turn_id,
    step_index: expected.step_index,
    fragment_order: order,
    activity_profile_ref: expected.profile_ref,
    activity_profile_pin: expected.profile_pin,
    completion_model_snapshot: {
      kind: 'fixed_exact',
      fixed_duration: structuredClone(
        ownerExecution?.original_duration?.exact_minutes)
    },
    duration_class: expected.duration_class,
    effort: expected.effort,
    body_effect_profile_ref: expected.body_effect_profile_ref
  };
  const valid = row.id === expected.activity_id
    && owner?.fragment_order === order
    && row.original_total_minutes
      === ownerExecution?.original_duration?.exact_minutes?.numerator
    && row.status === ownerExecution?.status
    && row.execution_scope === ownerExecution?.execution_scope
    && row.activity_series_id === `series:${expected.activity_id}`
    && row.updated_change_set_id === expected.change_set_id
    && row.terminal_change_set_id === expected.change_set_id
    && row.execution_idempotency_record_id
      === expected.idempotency_record_id
    && same(row.activity_owner_ref, {
      entity_kind: 'actor', entity_id: payload.actor_id
    })
    && same(row.originating_command_ref, {
      entity_kind: 'semantic_command', entity_id: expected.request_id
    })
    && row.originating_command_digest === canonicalDigest({
      root_turn_id: expected.root_turn_id,
      request_id: expected.request_id
    })
    && row.preconditions_digest === canonicalDigest({
      party_id: payload.party_id,
      committed_state_version: expected.base_state_version,
      activity: expectedSnapshot
    })
    && row.attempt_ordinal === ownerAttempt?.attempt_ordinal
    && row.planned_time_numerator
      === ownerAttempt?.planned_time?.exact_minutes?.numerator
    && row.planned_time_denominator
      === ownerAttempt?.planned_time?.exact_minutes?.denominator
    && row.actual_time_numerator
      === ownerAttempt?.actual_time?.exact_minutes?.numerator
    && row.actual_time_denominator
      === ownerAttempt?.actual_time?.exact_minutes?.denominator
    && row.result_kind === ownerAttempt?.result_kind
    && same(snapshot, expectedSnapshot)
    && snapshot?.activity_id === expected.activity_id
    && snapshot?.root_turn_id === expected.root_turn_id
    && snapshot?.step_index === expected.step_index
    && snapshot?.fragment_order === order
    && snapshot?.activity_profile_ref === expected.profile_ref
    && same(snapshot?.activity_profile_pin, expected.profile_pin)
    && snapshot?.duration_class === expected.duration_class
    && snapshot?.effort === expected.effort
    && snapshot?.body_effect_profile_ref
      === expected.body_effect_profile_ref
    && row.result_change_set_id === expected.change_set_id
    && row.attempt_idempotency_record_id
      === expected.idempotency_record_id
    && same(row.execution_context_snapshot, context)
    && same(row.body_effect_refs, [{
      entity_kind: 'body_effect_profile',
      entity_id: expected.body_effect_profile_ref
    }])
    && same(row.rule_and_policy_pins, {
      activity_profile: expected.profile_pin
    })
    && same(row.trace, trace)
    && sameTimestamp(started, ownerExecution?.started_at)
    && sameTimestamp(ended, ownerExecution?.ended_at)
    && sameTimestamp(started, attemptStartTimestamp(row))
    && sameTimestamp(ended, attemptEndTimestamp(row))
    && sameTimestamp(attemptStartTimestamp(row), ownerAttempt?.started_at)
    && sameTimestamp(attemptEndTimestamp(row), ownerAttempt?.ended_at);
  if (!valid) throw phase2IntegrityError();
}

function assertCurrentBatch(history, payload) {
  const batch = payload.last_turn?.turn_step_operation_batch;
  if (!Array.isArray(batch?.operations)) return;
  const claimed = batch.operations.flatMap((fragment, fragmentOrder) =>
    fragment?.target === 'party_events'
      && fragment.value?.schema
        === 'rus.lower_dvina_trace_turn_step_semantic_activity.v1'
      ? [{ fragment, fragmentOrder }]
      : []);
  const current = history.filter(({ root_turn_id: root }) =>
    root === batch.root_turn_id);
  if (current.length !== claimed.length) throw phase2IntegrityError();
  for (const { fragment, fragmentOrder } of claimed) {
    const expected = current.find((entry) =>
      entry.fragment_order === fragmentOrder);
    if (!expected || !same(fragment.value, activityFragment(expected))) {
      throw phase2IntegrityError();
    }
  }
}

function activityFragment(value) {
  return Object.fromEntries([
    'version', 'schema', 'activity_id', 'root_turn_id', 'step_index',
    'profile_ref', 'duration_class', 'duration_minutes', 'effort'
  ].map((key) => [key, value[key]]));
}

function startTimestamp(row) {
  return timestamp(row, 'started_at');
}

function endTimestamp(row) {
  return timestamp(row, 'last_processed_at');
}

function attemptStartTimestamp(row) {
  return timestamp(row, 'attempt_started');
}

function attemptEndTimestamp(row) {
  return timestamp(row, 'attempt_ended');
}

function timestamp(row, prefix) {
  return {
    whole_minutes: row[`${prefix}_whole_minutes`],
    subminute_numerator: row[`${prefix}_subminute_numerator`],
    subminute_denominator: row[`${prefix}_subminute_denominator`]
  };
}

function sameTimestamp(left, right) {
  return same(left, right);
}

function same(left, right) {
  return canonicalDigest(left) === canonicalDigest(right);
}
