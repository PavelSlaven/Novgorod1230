import { fail, refKey, text } from
  './lower-dvina-trace-conversation-state-validation.js';

export function validateTerminalNpcOutcomes(values) {
  if (!Array.isArray(values)) {
    fail('TRACE_M2_NPC_TERMINAL_OUTCOMES_INVALID');
  }
  const outcomes = structuredClone(values);
  const outcomeKeys = new Set();
  const signalIds = new Set();
  for (const outcome of outcomes) {
    validateTerminalOutcome(outcome);
    const outcomeKey = `${refKey(outcome.npc_ref)}\u0000${
      refKey(outcome.same_time_batch_ref)}`;
    if (outcomeKeys.has(outcomeKey)) {
      fail('TRACE_M2_NPC_TERMINAL_OUTCOMES_INVALID');
    }
    outcomeKeys.add(outcomeKey);
    for (const signalId of outcome.signal_ids_to_consume) {
      if (signalIds.has(signalId)) {
        fail('TRACE_M2_NPC_TERMINAL_OUTCOMES_INVALID');
      }
      signalIds.add(signalId);
    }
  }
  return outcomes;
}

export function requirePendingDecisionTerminalLineage(state, outcome) {
  const sourceId = outcome.source_decision_trace_ref.entity_id;
  const traceRef = (state.npc_semantic_decision_refs ?? []).find(
    ({ request_id: requestId }) => requestId === sourceId
  );
  const trace = (state.npc_semantic_decision_traces ?? []).find(
    ({ request_id: requestId }) => requestId === sourceId
  );
  const npcId = traceRef?.npc_ref?.entity_id ?? trace?.npc_ref;
  if (npcId !== outcome.npc_ref.entity_id
      || (traceRef?.status ?? trace?.status) !== 'committed') {
    fail('TRACE_M2_SEMANTIC_SIGNAL_LINEAGE_INVALID');
  }
}

function validateTerminalOutcome(outcome) {
  const keys = Object.keys(outcome ?? {}).sort().join('\u0000');
  const signalKeys = terminalKeys(false);
  const persistedKeys = terminalKeys(true);
  const persistedDecisionTerminal = keys === persistedKeys;
  if (![signalKeys, persistedKeys].includes(keys)
      || outcome.npc_ref?.entity_kind !== 'npc'
      || !text(outcome.npc_ref?.entity_id)
      || outcome.same_time_batch_ref?.entity_kind !== 'temporal_batch'
      || !text(outcome.same_time_batch_ref?.entity_id)
      || outcome.outcome !== 'npc_unavailable'
      || !Array.isArray(outcome.signal_ids_to_consume)
      || outcome.signal_ids_to_consume.some((id) => !text(id))
      || (persistedDecisionTerminal
        ? outcome.signal_ids_to_consume.length !== 0
          || outcome.source_decision_trace_ref?.entity_kind
            !== 'npc_decision_trace'
          || !text(outcome.source_decision_trace_ref?.entity_id)
        : outcome.signal_ids_to_consume.length === 0)) {
    fail('TRACE_M2_NPC_TERMINAL_OUTCOMES_INVALID');
  }
}

function terminalKeys(persisted) {
  return [
    'npc_ref', 'outcome', 'same_time_batch_ref', 'signal_ids_to_consume',
    ...(persisted ? ['source_decision_trace_ref'] : [])
  ].sort().join('\u0000');
}
