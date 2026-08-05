import { fail } from './lower-dvina-trace-conversation-state-validation.js';

export function projectRepeatedPendingNpcExecution(next, semanticExchange) {
  return projectPendingNpcConversationExecution({
    next,
    semanticExchange,
    exchange: semanticExchange.exchange,
    traces: [],
    decisions: [],
    fail
  });
}

export function projectPendingNpcConversationExecution({
  next,
  semanticExchange,
  exchange,
  traces,
  decisions,
  fail
}) {
  const pending = semanticExchange.pending_npc_execution ?? null;
  if (pending === null) {
    if (exchange.session_status !== 'suspended') {
      delete next.pending_npc_conversation_execution;
    }
    return next;
  }
  const priorPending = next.pending_npc_conversation_execution ?? null;
  const resumedTraceRef = semanticExchange.resumed_npc_execution
    ?.decision_trace_ref ?? null;
  const pendingTrace = traces.find(
    ({ request_id: requestId }) => requestId === pending.plan?.request_id
  ) ?? (resumedTraceRef?.entity_id === pending.plan?.request_id
    ? { request_id: resumedTraceRef.entity_id } : undefined);
  const pendingRequest = decisions.find(({ request: candidate }) =>
    candidate.request_id === pending.plan?.request_id)?.request ?? (
    priorPending?.decision_trace_ref?.entity_id === pending.plan?.request_id
      ? {
          conversation_id: priorPending.conversation_id,
          exchange_id: priorPending.exchange_id,
          npc_ref: priorPending.npc_ref
        } : undefined
  );
  if (pendingTrace === undefined
      || pendingRequest === undefined
      || pending.plan?.conversation_id !== pendingRequest.conversation_id
      || pending.plan?.exchange_id !== pendingRequest.exchange_id
      || pending.contribution_index < 2
      || pending.remaining_minutes < 0
      || pending.remaining_exchange_minutes < pending.remaining_minutes
      || !Array.isArray(pending.remaining_responder_refs)
      || pending.same_time_batch_ref?.entity_kind !== 'temporal_batch'
      || typeof pending.same_time_batch_ref?.entity_id !== 'string'
      || (pending.plan.resolution === 'check_required'
        ? pending.check_result?.outcome?.band
            !== pending.social_delivery_result?.outcome_band
        : pending.check_result !== null
          || pending.social_delivery_result !== null)) {
    fail(
      'TRACE_M2_PENDING_NPC_EXECUTION_INVALID',
      'A suspended NPC contribution must reference its committed semantic decision.'
    );
  }
  next.pending_npc_conversation_execution = {
    schema: 'pending_npc_conversation_execution_v1',
    decision_trace_ref: {
      entity_kind: 'npc_decision_trace',
      entity_id: pendingTrace.request_id
    },
    conversation_id: pendingRequest.conversation_id,
    exchange_id: pendingRequest.exchange_id,
    source_input_digest: semanticExchange.input_digest,
    npc_ref: structuredClone(pendingRequest.npc_ref),
    contribution_index: pending.contribution_index,
    remaining_minutes: pending.remaining_minutes,
    remaining_exchange_minutes: pending.remaining_exchange_minutes,
    remaining_responder_refs:
      structuredClone(pending.remaining_responder_refs),
    same_time_batch_ref: structuredClone(pending.same_time_batch_ref),
    boundary_id: pending.boundary_id,
    check_result: structuredClone(pending.check_result),
    social_delivery_result:
      structuredClone(pending.social_delivery_result),
    ...(priorPending?.conversation_id === pendingRequest.conversation_id
      && priorPending?.exchange_id === pendingRequest.exchange_id
      ? preservedActivity(
          priorPending, semanticExchange.exchange.time_budget.elapsed_minutes
        ) : {})
  };
  return next;
}

function preservedActivity(pending, elapsedDelta) {
  return {
    ...Object.fromEntries([
    'activity_execution_id', 'total_minutes', 'elapsed_minutes', 'started_at',
    'option_id', 'originating_request_id', 'next_attempt_ordinal',
    'activity_state_version'
  ].filter((key) => pending[key] !== undefined)
      .map((key) => [key, structuredClone(pending[key])])),
    elapsed_minutes: pending.elapsed_minutes + elapsedDelta,
    next_attempt_ordinal: pending.next_attempt_ordinal + 1,
    activity_state_version: pending.activity_state_version + 1
  };
}
