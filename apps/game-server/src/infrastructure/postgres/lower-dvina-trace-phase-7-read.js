import { canonicalDigest } from '@rus/materialization';
import {
  validateNpcDecisionBoundary,
  validateNpcDecisionSignal
} from '@rus/npc-runtime';
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';
import { tracePhase7WaitingTerminalCandidateId } from
  '../../runtime/lower-dvina-trace-phase-7-temporal.js';
import { tracePhase7WaitingTransitionId } from
  '../../runtime/lower-dvina-trace-phase-7-temporal-effect-owner.js';

export async function assertPhase7NormalizedRows(pool, payload) {
  const phase7 = payload.phase7_fire_rest;
  if (phase7 == null) return;
  if (phase7.status !== 'completed'
      || phase7.exact_elapsed_minutes !== 30
      || !phase7.activity_execution_id
      || !phase7.decision_request_id) fail();

  const zhdanko = payload.npcs.find(({ participant_slot_ref: slot }) =>
    slot === 'zhdanko_storehouse_controller');
  const bag = payload.containers.find(({ template_id: id }) =>
    id === 'trace_ld_v1_container_road_bag');
  if (!zhdanko || !bag) fail();

  const [activity, attempts, decision, npc, container, conditions, bodyHistory] =
    await Promise.all([
      pool.query(
        `SELECT id,status,state_version::text,activity_snapshot,
                execution_context_snapshot,
                cumulative_elapsed_numerator::text,
                cumulative_elapsed_denominator::text,
                remaining_time_numerator::text,
                remaining_time_denominator::text,next_attempt_ordinal,
                started_at_whole_minutes::text,
                last_processed_at_whole_minutes::text,
                terminal_change_set_id
           FROM party_runtime.party_timed_activity_executions WHERE id=$1`,
        [phase7.activity_execution_id]),
      pool.query(
        `SELECT attempt_ordinal,actual_time_numerator::text,
                actual_time_denominator::text,result_kind,result_code,
                clock_commit_mode,trace,body_effect_refs,
                started_at_whole_minutes::text,
                ended_at_whole_minutes::text,result_change_set_id
           FROM party_runtime.party_timed_activity_attempts
          WHERE activity_execution_id=$1 ORDER BY attempt_ordinal`,
        [phase7.activity_execution_id]),
      pool.query(
        `SELECT request_id,boundary_id,boundary_snapshot,signal_records
           FROM party_runtime.party_npc_decision_traces
          WHERE party_id=$1 AND request_id=$2`,
        [payload.party_id, phase7.decision_request_id]),
      pool.query(
        `SELECT npc_id,anchor_id,machine_state
           FROM party_runtime.party_npcs
          WHERE party_id=$1 AND npc_id=$2`,
        [payload.party_id, zhdanko.instance_id]),
      pool.query(
        `SELECT container_id,template_id,holder_npc_id,closure_state,
                state,state_version::text,updated_change_set_id
           FROM party_runtime.party_containers
          WHERE party_id=$1 AND container_id=$2`,
        [payload.party_id, bag.container_id]),
      pool.query(
        `SELECT condition_id,condition_profile_ref,status,state_version
           FROM party_runtime.party_actor_active_conditions
          WHERE party_id=$1 AND actor_kind='player_character'
            AND actor_id=$2 ORDER BY condition_id`,
        [payload.party_id, payload.actor_id]),
      pool.query(
        `SELECT subject_kind,subject_id,effect_ref,
                occurred_at_whole_minutes::text,
                occurred_at_subminute_numerator::text,
                occurred_at_subminute_denominator::text,change_set_id
           FROM party_runtime.party_body_temporal_history
          WHERE party_id=$1 AND history_id=$2`,
        [payload.party_id,
          `body-history:${payload.party_id}:trace-phase7:fire-rest`])
    ]);

  assertActivity(payload, activity, attempts, decision);
  assertNpcAndContainer(phase7, zhdanko, bag, npc, container);
  assertConditions(payload, conditions);
  assertBodyHistory(payload, bodyHistory);
}

function assertActivity(payload, activity, attempts, decision) {
  const phase7 = payload.phase7_fire_rest;
  const execution = activity.rows[0];
  const attempt = attempts.rows[0];
  if (activity.rowCount !== 1 || attempts.rowCount !== 1
      || execution.id !== phase7.activity_execution_id
      || execution.status !== 'completed'
      || Number(execution.state_version) !== 2
      || execution.activity_snapshot?.activity_profile_ref
        !== 'trace_ld_v1_activity_fire_rest'
      || Number(execution.activity_snapshot?.exact_duration_minutes) !== 30
      || execution.execution_context_snapshot?.boundary_id
        !== phase7.decision_boundary_id
      || execution.execution_context_snapshot?.decision_request_id
        !== phase7.decision_request_id
      || Number(execution.cumulative_elapsed_numerator) !== 30
      || Number(execution.cumulative_elapsed_denominator) !== 1
      || Number(execution.remaining_time_numerator) !== 0
      || Number(execution.remaining_time_denominator) !== 1
      || Number(execution.next_attempt_ordinal) !== 1
      || execution.terminal_change_set_id !== phase7.change_set_id
      || Number(attempt.attempt_ordinal) !== 0
      || Number(attempt.actual_time_numerator) !== 30
      || Number(attempt.actual_time_denominator) !== 1
      || attempt.result_kind !== 'completed'
      || attempt.result_code !== 'phase_7_fire_rest_completed'
      || attempt.clock_commit_mode !== 'direct_party_clock'
      || attempt.trace?.autonomous_decision_request_id
        !== phase7.decision_request_id
      || !validPersistedCausality(
        attempt.trace?.causality, phase7, decision, payload.party_id
      )
      || canonicalDigest(attempt.trace?.npc_schedule_result)
        !== canonicalDigest(phase7.schedule_result)
      || attempt.result_change_set_id !== phase7.change_set_id
      || attempt.body_effect_refs?.length !== 1
      || attempt.body_effect_refs[0] !== phase7.body_effect_ref
      || String(execution.last_processed_at_whole_minutes)
        !== String(payload.clock.whole_minutes)
      || String(attempt.ended_at_whole_minutes)
        !== String(payload.clock.whole_minutes)) fail();
}

function validPersistedCausality(
  causality,
  phase7,
  decisionResult,
  partyId
) {
  const waitingCandidateRef = ref(
    'temporal_boundary_candidate', phase7.waiting_terminal_candidate_id
  );
  const completionCandidateRef = ref(
    'temporal_boundary_candidate',
    phase7.actor_step_completion_candidate_id
  );
  const transitionRef = ref(
    'npc_activity_factual_transition', phase7.waiting_transition_id
  );
  const signalRef = ref(
    'npc_decision_signal', phase7.decision_signal_id
  );
  const decision = decisionResult?.rows?.[0];
  const signal = decision?.signal_records?.[0];
  const boundary = decision?.boundary_snapshot;
  const candidate = causality?.waiting_terminal_candidate;
  const transition = causality?.waiting_transition;
  const decisionTraceRef = ref('npc_decision_trace', decision?.request_id);
  return causality?.waiting_terminal_candidate?.boundary_id
      === phase7.waiting_terminal_candidate_id
    && candidate?.boundary_id
      === tracePhase7WaitingTerminalCandidateId(partyId)
    && candidate?.idempotency_key === candidate?.boundary_id
    && candidate?.boundary_kind === 'npc_schedule'
    && candidate?.resolution_class === 'reaction_decision'
    && canonicalDigest(candidate?.source_ref)
      === canonicalDigest(ref(
        'party_timed_activity_execution', phase7.activity_execution_id
      ))
    && canonicalDigest(causality.waiting_terminal_candidate_ref)
      === canonicalDigest(waitingCandidateRef)
    && causality.waiting_transition?.transition_id
      === phase7.waiting_transition_id
    && transition?.transition_id
      === tracePhase7WaitingTransitionId(candidate?.boundary_id)
    && transition?.schema === 'rus.npc_activity_factual_transition.v1'
    && transition?.from === 'waiting'
    && transition?.to === 'decision_required'
    && canonicalDigest(causality.waiting_transition?.source_candidate_ref)
      === canonicalDigest(waitingCandidateRef)
    && canonicalDigest(causality.waiting_transition?.causal_parent_refs)
      === canonicalDigest([waitingCandidateRef])
    && canonicalDigest(causality.waiting_transition_ref)
      === canonicalDigest(transitionRef)
    && canonicalDigest(causality.decision_signal_ref)
      === canonicalDigest(signalRef)
    && decisionResult?.rowCount === 1
    && decision?.request_id === phase7.decision_request_id
    && decision?.boundary_id === phase7.decision_boundary_id
    && decision?.signal_records?.length === 1
    && validateNpcDecisionSignal(signal)
    && validateNpcDecisionBoundary(boundary)
    && signal?.signal_id === phase7.decision_signal_id
    && canonicalDigest(signal?.source_event_ref)
      === canonicalDigest(transitionRef)
    && canonicalDigest(signal?.causal_parent_refs)
      === canonicalDigest(causality.waiting_transition?.causal_parent_refs)
    && canonicalDigest(signal?.causal_parent_refs)
      === canonicalDigest([waitingCandidateRef])
    && canonicalDigest(signal?.occurred_at)
      === canonicalDigest(causality.waiting_transition?.occurred_at)
    && canonicalDigest(signal?.occurred_at)
      === canonicalDigest(causality.waiting_terminal_candidate?.scheduled_at)
    && canonicalDigest(signal?.subject_ref)
      === canonicalDigest(candidate?.primary_subject_ref)
    && canonicalDigest(boundary?.npc_ref)
      === canonicalDigest(candidate?.primary_subject_ref)
    && canonicalDigest(boundary?.categories)
      === canonicalDigest([signal?.category])
    && boundary?.decision_mode === 'autonomous'
    && canonicalDigest(boundary?.signal_refs)
      === canonicalDigest([signalRef])
    && canonicalDigest(boundary?.scheduled_at)
      === canonicalDigest(signal?.occurred_at)
    && canonicalDigest(causality.decision_boundary_ref)
      === canonicalDigest(ref(
        'npc_decision_boundary', phase7.decision_boundary_id
      ))
    && canonicalDigest(causality.decision_trace_ref)
      === canonicalDigest(decisionTraceRef)
    && canonicalDigest(
      causality.actor_step_completion_candidate?.source_ref
    ) === canonicalDigest(decisionTraceRef)
    && canonicalDigest(causality.actor_step_completion_candidate_ref)
      === canonicalDigest(completionCandidateRef)
    && causality.actor_step_completion_candidate?.boundary_id
      === phase7.actor_step_completion_candidate_id
    && canonicalDigest(
      causality.actor_step_completion_candidate?.causal_parent_refs
    ) === canonicalDigest([decisionTraceRef]);
}

function ref(entityKind, entityId) {
  return { entity_kind: entityKind, entity_id: entityId };
}

function assertNpcAndContainer(phase7, zhdanko, bag, npc, container) {
  const npcRow = npc.rows[0];
  const bagRow = container.rows[0];
  if (npc.rowCount !== 1 || container.rowCount !== 1
      || npcRow.npc_id !== zhdanko.instance_id
      || npcRow.anchor_id !== zhdanko.anchor_id
      || canonicalDigest(npcRow.machine_state)
        !== canonicalDigest(zhdanko.machine_state)
      || canonicalDigest(npcRow.machine_state?.last_schedule_execution)
        !== canonicalDigest(phase7.schedule_result)
      || bagRow.container_id !== bag.container_id
      || bagRow.template_id !== bag.template_id
      || bagRow.holder_npc_id !== bag.holder_npc_id
      || bagRow.closure_state !== bag.closure_state
      || canonicalDigest(bagRow.state) !== canonicalDigest(bag.state)
      || Number(bagRow.state_version) !== bag.state_version
      || (phase7.schedule_option_id === 'move_bag'
        && bagRow.updated_change_set_id !== phase7.change_set_id)) fail();
}

function assertConditions(payload, result) {
  const expected = [...(payload.body_state.active_conditions ?? [])]
    .sort((left, right) => left.storage_condition_id.localeCompare(
      right.storage_condition_id));
  if (result.rowCount !== expected.length) fail();
  for (const [index, condition] of expected.entries()) {
    const row = result.rows[index];
    if (row.condition_id !== condition.storage_condition_id
        || row.status !== 'active'
        || Number(row.state_version) !== condition.state_version
        || canonicalDigest(row.condition_profile_ref)
          !== canonicalDigest(condition.condition_profile_ref)) fail();
  }
}

function assertBodyHistory(payload, result) {
  const phase7 = payload.phase7_fire_rest;
  const row = result.rows[0];
  const proposal = payload.last_turn?.body_update?.proposal;
  if (result.rowCount !== 1 || !proposal
      || row.subject_kind !== 'player_character'
      || row.subject_id !== payload.actor_id
      || row.change_set_id !== phase7.change_set_id
      || canonicalDigest(row.effect_ref) !== canonicalDigest({
        entity_kind: 'body_effect',
        entity_id: phase7.body_effect_ref,
        activity_attempt_id: phase7.activity_execution_id,
        condition_transitions: proposal.condition_transitions ?? []
      })
      || canonicalDigest({
        whole_minutes: row.occurred_at_whole_minutes,
        subminute_numerator: row.occurred_at_subminute_numerator,
        subminute_denominator: row.occurred_at_subminute_denominator
      }) !== canonicalDigest(payload.clock)) fail();
}

function fail() {
  throw phase2IntegrityError();
}
