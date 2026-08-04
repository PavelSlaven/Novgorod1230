import { fail } from './lower-dvina-trace-m2-conversation-shared.js';

export function findResumableConversationSession(state, playerRef, targetRef) {
  const pending = state.pending_npc_conversation_execution ?? null;
  const candidates = (state.conversation_sessions ?? []).filter((session) =>
    (session?.status === 'active'
      || (session?.status === 'suspended'
        && pending?.conversation_id === session.conversation_id
        && pending?.npc_ref?.entity_kind === targetRef.entity_kind
        && pending?.npc_ref?.entity_id === targetRef.entity_id))
      && session.location_ref?.entity_id === state.position.location_ref
      && session.active_participant_refs?.some((participant) =>
        participant.entity_kind === playerRef.entity_kind
          && participant.entity_id === playerRef.entity_id)
      && session.active_participant_refs?.some((participant) =>
        participant.entity_kind === targetRef.entity_kind
          && participant.entity_id === targetRef.entity_id));
  if (candidates.length > 1) {
    fail(
      'TRACE_M2_CONVERSATION_SESSION_AMBIGUOUS',
      'Only one active or reproducibly suspended conversation may be resumed.'
    );
  }
  return candidates[0] ?? null;
}

export function hydratedPendingNpcExecution(context) {
  const pending = context.state.pending_npc_conversation_execution ?? null;
  if (pending === null) return null;
  const trace = (context.state.npc_semantic_decision_traces ?? []).find(
    ({ request_id: requestId }) =>
      requestId === pending.decision_trace_ref?.entity_id
  );
  if (!trace
      || trace.plan?.request_id !== pending.decision_trace_ref.entity_id
      || trace.plan?.conversation_id !== pending.conversation_id
      || trace.plan?.exchange_id !== pending.exchange_id
      || trace.plan?.speaker_ref?.entity_id !== pending.npc_ref?.entity_id
      || !Number.isSafeInteger(pending.contribution_index)
      || !Number.isSafeInteger(pending.remaining_minutes)
      || !Number.isSafeInteger(pending.remaining_exchange_minutes)
      || typeof pending.boundary_id !== 'string'
      || !Array.isArray(pending.remaining_responder_refs)
      || pending.same_time_batch_ref?.entity_kind !== 'temporal_batch'
      || typeof pending.same_time_batch_ref?.entity_id !== 'string') {
    fail(
      'TRACE_M2_PENDING_NPC_EXECUTION_INVALID',
      'A suspended conversation requires its exact hydrated decision trace.'
    );
  }
  return {
    plan: structuredClone(trace.plan),
    boundary_id: pending.boundary_id,
    contribution_index: pending.contribution_index,
    remaining_minutes: pending.remaining_minutes,
    remaining_exchange_minutes: pending.remaining_exchange_minutes,
    remaining_responder_refs:
      structuredClone(pending.remaining_responder_refs ?? []),
    same_time_batch_ref: structuredClone(pending.same_time_batch_ref),
    source_decision_trace_ref:
      structuredClone(pending.decision_trace_ref)
  };
}
