export function attachPendingConversationActivity({
  next,
  semanticExchange,
  activityExecutionId,
  startedAt,
  optionId,
  originatingRequestId
}) {
  const pending = next.pending_npc_conversation_execution
    ?? next.pending_player_conversation_execution ?? null;
  if (pending === null || pending.activity_execution_id != null) return;
  const withActivity = {
    ...pending,
    activity_execution_id: activityExecutionId,
    total_minutes: semanticExchange.exchange.time_budget.total_minutes,
    elapsed_minutes: semanticExchange.exchange.time_budget.elapsed_minutes,
    started_at: structuredClone(startedAt),
    option_id: optionId,
    originating_request_id: originatingRequestId,
    next_attempt_ordinal: 1,
    activity_state_version: 2
  };
  if (next.pending_npc_conversation_execution != null) {
    next.pending_npc_conversation_execution = withActivity;
  } else {
    next.pending_player_conversation_execution = withActivity;
  }
}

export function resumedPendingConversationActivity(state, semanticExchange) {
  let pending = null;
  if (semanticExchange?.resumed_npc_execution != null) {
    pending = state.pending_npc_conversation_execution;
  } else if (semanticExchange?.resumed_player_execution != null) {
    pending = state.pending_player_conversation_execution;
  } else {
    return null;
  }
  if (pending?.activity_execution_id == null
      || !Number.isSafeInteger(pending.activity_state_version)) {
    throw new Error('TRACE_M2_PENDING_CONVERSATION_ACTIVITY_INVALID');
  }
  return pending;
}
