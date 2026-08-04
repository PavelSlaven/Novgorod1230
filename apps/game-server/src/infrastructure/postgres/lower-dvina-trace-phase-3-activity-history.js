import { activityHistoryEntry } from
  './lower-dvina-trace-phase-3-activity-state.js';

export function appendPhase3ActivityHistory({
  next,
  state,
  factual,
  turnNumber,
  inputDigest,
  changeSetId
}) {
  const historyEntry = activityHistoryEntry({
    partyId: state.party_id, turnNumber, factual, inputDigest, changeSetId
  });
  const pendingActivity = factual.consequence.conversation?.semantic_exchange
    ?.resumed_npc_execution == null
    ? null : state.pending_npc_conversation_execution;
  if (pendingActivity?.activity_execution_id == null) {
    next.activity_history = [...(next.activity_history ?? []), historyEntry];
    return;
  }
  const priorEntry = (next.activity_history ?? []).find(
    ({ activity_execution_id: id }) =>
      id === pendingActivity.activity_execution_id
  );
  if (priorEntry == null) {
    throw new Error('TRACE_M2_PENDING_NPC_ACTIVITY_INVALID');
  }
  const resumedEntry = {
    ...historyEntry,
    activity_execution_id: pendingActivity.activity_execution_id,
    request_id: priorEntry.request_id,
    input_digest: priorEntry.input_digest,
    duration_minutes: pendingActivity.total_minutes,
    started_at: structuredClone(priorEntry.started_at)
  };
  const budget = resumedEntry.execution_result
    ?.semantic_exchange_projection?.time_budget;
  if (budget != null) {
    const cumulativeElapsed = pendingActivity.elapsed_minutes
      + budget.elapsed_minutes;
    budget.total_minutes = pendingActivity.total_minutes;
    budget.elapsed_minutes = cumulativeElapsed;
    budget.remaining_minutes = pendingActivity.total_minutes
      - cumulativeElapsed;
  }
  next.activity_history = (next.activity_history ?? []).map((entry) =>
    entry.activity_execution_id === pendingActivity.activity_execution_id
      ? resumedEntry : entry
  );
}
