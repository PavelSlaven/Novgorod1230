import { canonicalDigest } from '@rus/materialization';
import {
  npcScheduleDecisionTransitionId,
  validateNpcDecisionBoundary,
  validateNpcDecisionSignal
} from '@rus/npc-runtime';
import { tracePhase7WaitingTerminalCandidateId } from
  '../../runtime/lower-dvina-trace-phase-7-temporal.js';
import { semanticSignalsMatchDecisionBoundary } from
  './lower-dvina-trace-semantic-decision-shapes.js';
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';

export function assertPhase7PersistedActivity(payload, activity, attempts, decision) {
  const phase7 = payload.phase7_fire_rest;
  const execution = activity.rows[0];
  const completed = phase7.status === 'completed';
  const records = attempts.rows;
  const finalAttempt = records.at(-1);
  const actualElapsed = records.reduce((sum, attempt) =>
    sum + Number(attempt.actual_time_numerator), 0);
  const completedAt = (payload.body_effect_history ?? []).find(
    ({ effect_ref: effectRef }) => effectRef === phase7.body_effect_ref
  )?.occurred_at;
  if (activity.rowCount !== 1
      || attempts.rowCount !== phase7.next_attempt_ordinal
      || attempts.rowCount < 1
      || execution.id !== phase7.activity_execution_id
      || execution.status !== phase7.status
      || Number(execution.state_version) !== attempts.rowCount + 1
      || execution.activity_snapshot?.activity_profile_ref
        !== 'trace_ld_v1_activity_fire_rest'
      || Number(execution.activity_snapshot?.exact_duration_minutes) !== 30
      || execution.execution_context_snapshot?.boundary_id
        !== phase7.decision_boundary_id
      || execution.execution_context_snapshot?.decision_request_id
        !== phase7.decision_request_id
      || Number(execution.cumulative_elapsed_numerator)
        !== phase7.exact_elapsed_minutes
      || Number(execution.cumulative_elapsed_denominator) !== 1
      || Number(execution.remaining_time_numerator)
        !== 30 - phase7.exact_elapsed_minutes
      || Number(execution.remaining_time_denominator) !== 1
      || Number(execution.next_attempt_ordinal) !== attempts.rowCount
      || execution.terminal_change_set_id
        !== (completed ? phase7.change_set_id : null)
      || actualElapsed !== phase7.exact_elapsed_minutes
      || records.some((attempt, index) =>
        Number(attempt.attempt_ordinal) !== index
          || Number(attempt.actual_time_denominator) !== 1
          || attempt.clock_commit_mode !== 'direct_party_clock'
          || attempt.trace?.autonomous_decision_request_id
            !== phase7.decision_request_id
          || index < records.length - 1
            && (attempt.result_kind !== 'paused'
              || attempt.body_effect_refs?.length !== 0))
      || finalAttempt.result_kind !== (completed ? 'completed' : 'paused')
      || finalAttempt.result_code !== (completed
        ? 'phase_7_fire_rest_completed' : 'external_temporal_boundary')
      || !validPersistedCausality(
        finalAttempt.trace?.causality, phase7, decision, payload.party_id)
      || canonicalDigest(finalAttempt.trace?.npc_schedule_result)
        !== canonicalDigest(phase7.schedule_result)
      || finalAttempt.result_change_set_id !== phase7.change_set_id
      || finalAttempt.body_effect_refs?.length !== (completed ? 1 : 0)
      || completed && finalAttempt.body_effect_refs[0] !== phase7.body_effect_ref
      || String(execution.last_processed_at_whole_minutes)
        !== String(finalAttempt.ended_at_whole_minutes)
      || completed && String(finalAttempt.ended_at_whole_minutes)
        !== String(completedAt?.whole_minutes)) fail();
}

function validPersistedCausality(causality, phase7, decisionResult, partyId) {
  const waitingCandidateRef = ref(
    'temporal_boundary_candidate', phase7.waiting_terminal_candidate_id);
  const completionCandidateRef = ref(
    'temporal_boundary_candidate', phase7.actor_step_completion_candidate_id);
  const transitionRef = ref(
    'npc_activity_factual_transition', phase7.waiting_transition_id);
  const signalRef = ref('npc_decision_signal', phase7.decision_signal_id);
  const decision = decisionResult?.rows?.[0];
  const signals = decision?.signal_records;
  const signal = signals?.find(({ signal_id: signalId }) =>
    signalId === phase7.decision_signal_id);
  const boundary = decision?.boundary_snapshot;
  const candidate = causality?.waiting_terminal_candidate;
  const transition = causality?.waiting_transition;
  const decisionTraceRef = ref('npc_decision_trace', decision?.request_id);
  return causality?.waiting_terminal_candidate?.boundary_id
      === phase7.waiting_terminal_candidate_id
    && candidate?.boundary_id === tracePhase7WaitingTerminalCandidateId(partyId)
    && candidate?.idempotency_key === candidate?.boundary_id
    && candidate?.boundary_kind === 'npc_schedule'
    && candidate?.resolution_class === 'npc_schedule'
    && canonicalDigest(candidate?.source_ref) === canonicalDigest(ref(
      'party_timed_activity_execution', phase7.activity_execution_id))
    && canonicalDigest(causality.waiting_terminal_candidate_ref)
      === canonicalDigest(waitingCandidateRef)
    && causality.waiting_transition?.transition_id === phase7.waiting_transition_id
    && transition?.transition_id
      === npcScheduleDecisionTransitionId(candidate?.boundary_id)
    && transition?.schema === 'rus.npc_activity_factual_transition.v1'
    && transition?.from === 'waiting' && transition?.to === 'decision_required'
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
    && Array.isArray(signals) && signals.length > 0
    && signals.every(validateNpcDecisionSignal)
    && semanticSignalsMatchDecisionBoundary(signals, boundary)
    && validateNpcDecisionSignal(signal)
    && validateNpcDecisionBoundary(boundary)
    && signal?.signal_id === phase7.decision_signal_id
    && canonicalDigest(signal?.source_event_ref) === canonicalDigest(transitionRef)
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
    && canonicalDigest(boundary?.categories) === canonicalDigest([
      'self', 'others', 'environment', 'objective', 'communication'
    ].filter((category) => signals.some((entry) => entry.category === category)))
    && boundary?.decision_mode === 'autonomous'
    && canonicalDigest(boundary?.signal_refs)
      === canonicalDigest(signals.map(({ signal_id: signalId }) =>
        ref('npc_decision_signal', signalId)))
    && canonicalDigest(boundary?.scheduled_at)
      === canonicalDigest(signal?.occurred_at)
    && canonicalDigest(causality.decision_boundary_ref)
      === canonicalDigest(ref('npc_decision_boundary',
        phase7.decision_boundary_id))
    && canonicalDigest(causality.decision_trace_ref)
      === canonicalDigest(decisionTraceRef)
    && canonicalDigest(causality.actor_step_completion_candidate?.source_ref)
      === canonicalDigest(decisionTraceRef)
    && canonicalDigest(causality.actor_step_completion_candidate_ref)
      === canonicalDigest(completionCandidateRef)
    && causality.actor_step_completion_candidate?.boundary_id
      === phase7.actor_step_completion_candidate_id
    && canonicalDigest(
      causality.actor_step_completion_candidate?.causal_parent_refs)
      === canonicalDigest([decisionTraceRef]);
}

const ref = (entityKind, entityId) => ({
  entity_kind: entityKind, entity_id: entityId
});
function fail() { throw phase2IntegrityError(); }
