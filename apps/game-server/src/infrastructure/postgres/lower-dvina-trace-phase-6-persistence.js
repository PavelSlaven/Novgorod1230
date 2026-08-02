import { canonicalDigest } from '@rus/materialization';
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';
import { assertPhase6PlayerBody } from
  './lower-dvina-trace-phase-6-body-readback.js';

export async function assertPhase6NormalizedRows(pool, payload) {
  const history = payload.phase6_history ?? [];
  if (history.length === 0) return;
  const executionId = payload.phase6_carry_execution?.id;
  const routeExecutionId = history[0]?.traversal_interval
    ?.route_plan_execution_id;
  if (!executionId || !routeExecutionId) fail();
  const [activity, attempts, participants, resources, route, intervals,
    position, body, npcs, bodyHistory, knowledge] = await Promise.all([
    pool.query(
      `SELECT id,status,state_version::text,
              cumulative_elapsed_numerator::text,
              cumulative_elapsed_denominator::text,
              remaining_time_numerator::text,
              remaining_time_denominator::text,
              next_attempt_ordinal,progress,activity_snapshot,
              started_at_whole_minutes::text,
              last_processed_at_whole_minutes::text,
              terminal_change_set_id
         FROM party_runtime.party_timed_activity_executions WHERE id=$1`,
      [executionId]),
    pool.query(
      `SELECT attempt_ordinal,actual_time_numerator::text,
              actual_time_denominator::text,
              cumulative_time_before_numerator::text,
              cumulative_time_after_numerator::text,
              remaining_before_numerator::text,
              remaining_after_numerator::text,result_kind,result_code,
              progress_before,progress_after,resource_reservations,
              resource_consumptions,body_effect_refs,
              participant_attendance,trace,occurred_at_turn
         FROM party_runtime.party_timed_activity_attempts
        WHERE activity_execution_id=$1 ORDER BY attempt_ordinal`,
      [executionId]),
    pool.query(
      `SELECT participant_kind,participant_id,role_id,required,status
         FROM party_runtime.party_activity_participant_bindings
        WHERE activity_execution_id=$1
        ORDER BY participant_kind,participant_id`, [executionId]),
    pool.query(
      `SELECT resource_kind,resource_id,binding_kind,
              quantity_numerator::text,quantity_denominator::text,
              consumption_policy_ref
         FROM party_runtime.party_activity_resource_bindings
        WHERE activity_execution_id=$1 ORDER BY resource_id`, [executionId]),
    pool.query(
      `SELECT e.id,e.status,e.state_version::text,
              e.current_step_ordinal,e.active_travel_state_id,
              e.final_location_snapshot,t.id AS travel_state_id,
              t.segment_progress_ppm,
              t.cumulative_actual_time_numerator::text,
              t.cumulative_actual_time_denominator::text,
              t.next_interval_ordinal,t.status AS travel_status,
              t.state_version::text AS travel_state_version,
              t.closed_result
         FROM party_runtime.party_route_plan_executions e
         JOIN party_runtime.traveller_travel_states t
           ON t.route_plan_execution_id=e.id
        WHERE e.id=$1`, [routeExecutionId]),
    pool.query(
      `SELECT id,interval_ordinal,progress_before_ppm,
              planned_progress_after_ppm,actual_progress_after_ppm,
              actual_time_numerator::text,actual_time_denominator::text,
              cumulative_time_before_numerator::text,
              cumulative_time_after_numerator::text,result_kind,result_code,
              dynamic_snapshot,result_change_set_id,
              idempotency_record_id,occurred_at_turn
         FROM party_runtime.party_traversal_interval_results
        WHERE route_plan_execution_id=$1 ORDER BY interval_ordinal`,
      [routeExecutionId]),
    pool.query(
      `SELECT g4_id,g5_node_id,g5_anchor_id
         FROM party_runtime.party_positions WHERE party_id=$1`,
      [payload.party_id]),
    pool.query(
      `SELECT health,energy,satiety
         FROM party_runtime.party_actor_body_states
        WHERE party_id=$1 AND actor_kind='player_character'
          AND actor_id=$2`, [payload.party_id, payload.actor_id]),
    pool.query(
      `SELECT npc_id,anchor_id,machine_state
         FROM party_runtime.party_npcs WHERE party_id=$1 ORDER BY npc_id`,
      [payload.party_id]),
    pool.query(
      `SELECT subject_kind,subject_id,effect_ref,
              occurred_at_whole_minutes::text,
              occurred_at_subminute_numerator::text,
              occurred_at_subminute_denominator::text
         FROM party_runtime.party_body_temporal_history
        WHERE party_id=$1 AND history_id LIKE $2 ORDER BY subject_id`,
      [payload.party_id, `body-history:${executionId}:%`]),
    pool.query(
      `SELECT fact_id,knowledge_state,evidence
         FROM party_runtime.party_character_knowledge
        WHERE party_id=$1 AND character_id=$2
          AND fact_id=ANY($3::text[]) ORDER BY fact_id`,
      [payload.party_id, payload.actor_id,
        ['onisim_carried_to_camp_committed',
          'ratsha_under_group_observation_committed']])
  ]);
  const expectedExecution = payload.phase6_carry_execution;
  const terminal = expectedExecution.status === 'completed';
  const execution = activity.rows[0];
  const traversal = route.rows[0];
  if (activity.rowCount !== 1 || route.rowCount !== 1
      || attempts.rowCount !== history.length
      || intervals.rowCount !== history.length
      || execution.status !== expectedExecution.status
      || Number(execution.state_version) !== history.length
        + (terminal && history.length > 1 ? 2 : 1)
      || Number(execution.cumulative_elapsed_numerator)
        !== expectedExecution.cumulative_elapsed_minutes
      || Number(execution.remaining_time_numerator)
        !== 20 - expectedExecution.cumulative_elapsed_minutes
      || Number(execution.next_attempt_ordinal)
        !== expectedExecution.next_attempt_ordinal
      || execution.progress?.current !== expectedExecution.progress_ppm
      || canonicalDigest(execution.activity_snapshot?.replacement_boundary)
        !== canonicalDigest(persistedBoundary(
          history[0].internal_rebinding
        ))
      || traversal.status !== (terminal ? 'completed' : 'active')
      || Number(traversal.state_version) !== history.length + 2
      || Number(traversal.segment_progress_ppm)
        !== expectedExecution.progress_ppm
      || Number(traversal.cumulative_actual_time_numerator)
        !== expectedExecution.cumulative_elapsed_minutes
      || Number(traversal.next_interval_ordinal) !== history.length
      || traversal.travel_status !== (terminal ? 'closed' : 'paused_in_transit')
      || Number(traversal.travel_state_version) !== history.length
      || traversal.closed_result !== (terminal ? 'completed' : null)) fail();
  assertAttempts(history, attempts.rows, intervals.rows);
  assertBindings(payload, participants.rows, resources.rows);
  assertPhase6PlayerBody(payload, history, body, bodyHistory);
  if (terminal) {
    assertTerminal(payload, { position, npcs, knowledge });
  } else if (knowledge.rowCount !== 0) fail();
}

function assertAttempts(history, attempts, intervals) {
  for (const [index, entry] of history.entries()) {
    const attempt = attempts[index];
    const interval = intervals[index];
    const expected = entry.traversal_interval;
    if (Number(attempt.attempt_ordinal) !== index
        || attempt.actual_time_numerator !== entry.exact_elapsed.numerator
        || Number(attempt.cumulative_time_before_numerator)
          !== Number(entry.cumulative_elapsed_before.numerator)
        || Number(attempt.cumulative_time_after_numerator)
          !== Number(entry.cumulative_elapsed_after.numerator)
        || canonicalDigest(attempt.trace?.internal_rebinding)
          !== canonicalDigest(entry.internal_rebinding)
        || canonicalDigest(attempt.trace?.carrier_inventory_snapshots)
          !== canonicalDigest(entry.carrier_inventory_snapshots)
        || interval.id !== expected.id
        || Number(interval.interval_ordinal) !== index
        || Number(interval.progress_before_ppm)
          !== entry.progress_before_ppm
        || Number(interval.actual_progress_after_ppm)
          !== entry.progress_after_ppm
        || interval.actual_time_numerator
          !== expected.actual_time_numerator
        || interval.result_kind !== expected.result_kind
        || canonicalDigest(interval.dynamic_snapshot)
          !== canonicalDigest(expected.dynamic_snapshot)
        || interval.result_change_set_id !== entry.change_set_id
        || Number(interval.occurred_at_turn) !== entry.turn_number) fail();
  }
}

function assertBindings(payload, participants, resources) {
  const intent = payload.phase6_history[0].internal_rebinding;
  const persisted = payload.phase6_carry_execution.participant_bindings;
  if (intent.outgoing_actor_id !== persisted.player_actor_id
      || intent.incoming_actor_id !== persisted.replacement_carrier_id
      || canonicalDigest(intent.initial_carrier_ids)
        !== canonicalDigest(persisted.initial_carrier_ids)) {
    fail();
  }
  const expectedParticipants = [
    ['player_character', payload.actor_id, 'player_clerk'],
    ['npc', intent.initial_carrier_ids[1], 'eremey_fisher'],
    ['npc', intent.initial_carrier_ids[2], 'ratsha_storehouse_helper'],
    ['npc', intent.replacement_carrier_id,
      'resolved_participating_fisher'],
    ['npc', payload.phase6_carry_execution.traversal
      ?.final_travel_state?.context_snapshot?.carried_actor_id
        ?? carriedActor(payload), 'onisim_boatman']
  ].map(([participant_kind, participant_id, role_id]) => ({
    participant_kind, participant_id, role_id, required: true,
    status: 'active'
  })).sort((left, right) => left.participant_kind.localeCompare(
    right.participant_kind) || left.participant_id.localeCompare(
    right.participant_id));
  if (canonicalDigest(participants) !== canonicalDigest(expectedParticipants)) {
    fail();
  }
  const assembly = payload.phase6_carry_execution.assembly_snapshot;
  const expectedResources = [assembly.net_item_id, assembly.poles_item_id]
    .sort().map((resourceId) => ({
      resource_kind: 'item',
      resource_id: resourceId,
      binding_kind: 'required_tool',
      quantity_numerator: '1',
      quantity_denominator: '1'
    }));
  const actualResources = resources.map((entry) => ({
    resource_kind: entry.resource_kind,
    resource_id: entry.resource_id,
    binding_kind: entry.binding_kind,
    quantity_numerator: entry.quantity_numerator,
    quantity_denominator: entry.quantity_denominator
  }));
  if (canonicalDigest(actualResources) !== canonicalDigest(expectedResources)) {
    fail();
  }
}

function persistedBoundary(rebinding) {
  const value = structuredClone(rebinding);
  delete value.initial_carrier_ids;
  delete value.replacement_carrier_id;
  delete value.replaced_carrier_id;
  delete value.player_decision_required;
  delete value.preserve_elapsed;
  delete value.preserve_progress;
  delete value.applied_in_this_attempt;
  delete value.body_effect_due_in_this_attempt;
  delete value.deferred_by_same_time_external;
  delete value.effect_occurred_at;
  delete value.temporal_candidate;
  return value;
}

function assertTerminal(payload, values) {
  const { position, npcs, knowledge } = values;
  if (position.rowCount !== 1
      || position.rows[0].g4_id !== payload.position.g4_id
      || position.rows[0].g5_node_id !== payload.position.g5_node_id
      || position.rows[0].g5_anchor_id !== payload.position.g5_anchor_id
      || knowledge.rowCount !== 2) fail();
  const actualNpcs = new Map(npcs.rows.map((npc) => [npc.npc_id, npc]));
  for (const expected of payload.npcs) {
    if (!expected.machine_state?.phase6_body_effect) continue;
    const actual = actualNpcs.get(expected.instance_id);
    if (!actual || actual.anchor_id !== expected.anchor_id
        || canonicalDigest(actual.machine_state)
          !== canonicalDigest(expected.machine_state)) fail();
  }
  const facts = knowledge.rows.map(({ fact_id: id }) => id).sort();
  if (canonicalDigest(facts) !== canonicalDigest([
    'onisim_carried_to_camp_committed',
    'ratsha_under_group_observation_committed'
  ])) fail();
}

function carriedActor(payload) {
  const values = payload.npcs.filter(
    ({ participant_slot_ref: ref }) => ref === 'onisim_boatman'
  );
  if (values.length !== 1) fail();
  return values[0].instance_id;
}

function fail() {
  throw phase2IntegrityError();
}
