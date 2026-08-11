import { canonicalDigest } from '@rus/materialization';
import { buildNpcSemanticDecisionTrace } from '@rus/npc-runtime';
import { semanticDecisionTraceReference } from
  './lower-dvina-trace-conversation-shared-projection.js';
import { validateTerminalNpcOutcomes } from
  './lower-dvina-trace-conversation-terminal-state.js';

export function projectCombatDecisionState({ state, decisionRecords = [],
  signalRecords = [], sameTimeBatchKey = null, changeSetId, rootTurnId,
  workingRevision }) {
  const next = structuredClone(state);
  const signals = [...(next.npc_decision_signals ?? [])];
  const refs = [...(next.npc_semantic_decision_refs ?? [])];
  const consumed = new Set(next.consumed_npc_decision_signal_ids ?? []);
  const decisionSignalIds = new Set();
  for (const decision of decisionRecords) {
    const trace = buildNpcSemanticDecisionTrace({
      request: decision.request,
      plan: decision.proposal?.plan,
      root_turn_id: rootTurnId,
      working_revision: workingRevision,
      applied_change_set_id: changeSetId
    });
    appendUnique(refs, semanticDecisionTraceReference(trace),
      ({ request_id: id }) => id, 'TRACE_COMBAT_DECISION_TRACE_CONFLICT');
    for (const signal of decision.orderedSignals ?? []) {
      appendUnique(signals, { signal: structuredClone(signal),
        same_time_batch_key:
          decision.boundary.same_time_batch_ref.entity_id },
      (record) => record.signal.signal_id, 'TRACE_COMBAT_SIGNAL_CONFLICT');
      consumed.add(signal.signal_id);
      decisionSignalIds.add(signal.signal_id);
    }
  }
  if (signalRecords.length > 0 && !sameTimeBatchKey) {
    fail('TRACE_COMBAT_SIGNAL_BATCH_GAP');
  }
  const terminalByNpc = new Map();
  for (const signal of signalRecords) {
    appendUnique(signals, { signal: structuredClone(signal),
      same_time_batch_key: sameTimeBatchKey },
    (record) => record.signal.signal_id, 'TRACE_COMBAT_SIGNAL_CONFLICT');
    consumed.add(signal.signal_id);
    if (!decisionSignalIds.has(signal.signal_id)) {
      const ids = terminalByNpc.get(signal.subject_ref.entity_id) ?? [];
      ids.push(signal.signal_id);
      terminalByNpc.set(signal.subject_ref.entity_id, ids);
    }
  }
  const terminalOutcomes = [...(next.npc_decision_terminal_outcomes ?? [])];
  for (const [npcId, signalIds] of terminalByNpc) appendUnique(
    terminalOutcomes, { npc_ref: { entity_kind: 'npc', entity_id: npcId },
      same_time_batch_ref: { entity_kind: 'temporal_batch',
        entity_id: sameTimeBatchKey }, outcome: 'npc_unavailable',
      signal_ids_to_consume: [...signalIds].sort() },
    (outcome) => `${outcome.npc_ref.entity_id}\0${
      outcome.same_time_batch_ref.entity_id}`,
    'TRACE_COMBAT_TERMINAL_OUTCOME_CONFLICT');
  next.npc_decision_terminal_outcomes = validateTerminalNpcOutcomes(
    terminalOutcomes);
  next.npc_decision_signals = signals;
  next.npc_semantic_decision_refs = refs;
  next.consumed_npc_decision_signal_ids = [...consumed].sort();
  return next;
}

function appendUnique(records, addition, identity, code) {
  const id = identity(addition);
  const prior = records.find((entry) => identity(entry) === id);
  if (prior && canonicalDigest(prior) !== canonicalDigest(addition)) fail(code);
  if (!prior) records.push(structuredClone(addition));
}

function fail(code) { throw Object.assign(new Error(code), { code }); }
