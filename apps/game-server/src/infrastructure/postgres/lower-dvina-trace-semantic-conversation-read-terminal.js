import { validateTerminalNpcOutcomes } from
  './lower-dvina-trace-conversation-terminal-state.js';
import { fail } from
  './lower-dvina-trace-semantic-conversation-read-shared.js';

export function terminalConsumedSignalIds(
  payload,
  decisionSignalIds,
  decisionTraceRefs
) {
  const snapshotSignals = new Map((payload.npc_decision_signals ?? []).map(
    (record) => [record?.signal?.signal_id, record]
  ));
  const signalIds = [];
  for (const outcome of validateTerminalNpcOutcomes(
    payload.npc_decision_terminal_outcomes ?? []
  )) {
    if (outcome.source_decision_trace_ref !== undefined) {
      const sourceId = outcome.source_decision_trace_ref.entity_id;
      const source = decisionTraceRefs.find(
        ({ request_id: requestId }) => requestId === sourceId
      );
      if (source?.npc_ref?.entity_id !== outcome.npc_ref.entity_id
          || source.status !== 'committed') fail();
      continue;
    }
    for (const signalId of outcome.signal_ids_to_consume) {
      const snapshot = snapshotSignals.get(signalId);
      if (!snapshot || decisionSignalIds.has(signalId)
          || snapshot.same_time_batch_key
            !== outcome.same_time_batch_ref.entity_id
          || snapshot.signal.subject_ref.entity_id
            !== outcome.npc_ref.entity_id) fail();
      decisionSignalIds.add(signalId);
      signalIds.push(signalId);
    }
  }
  return signalIds;
}
