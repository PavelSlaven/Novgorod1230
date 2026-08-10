import { canonicalDigest } from '@rus/materialization';
import { buildNpcSemanticDecisionTrace } from '@rus/npc-runtime';
import { semanticDecisionTraceReference } from
  './lower-dvina-trace-conversation-shared-projection.js';

export function projectCombatDecisionState({ state, decisionRecords = [],
  changeSetId, rootTurnId, workingRevision }) {
  const next = structuredClone(state);
  const signals = [...(next.npc_decision_signals ?? [])];
  const refs = [...(next.npc_semantic_decision_refs ?? [])];
  const consumed = new Set(next.consumed_npc_decision_signal_ids ?? []);
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
    }
  }
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
