import { canonicalDigest } from '@rus/materialization';
import {
  buildNpcDecisionSignal,
  evaluateNpcDecisionSignals
} from '@rus/npc-runtime';

export function aggregateTemporalNpcDecisionSignals({
  temporal,
  factual_state,
  npc_ref,
  active_mode,
  current_intent = null,
  decision_capability,
  same_time_batch_ordinal = 1
} = {}) {
  const projection = temporal?.state_projection ?? temporal?.projection;
  const descriptors = projection?.npc_decision_signal_descriptors;
  const scheduledAt = temporal?.result?.clock_after;
  if (!Array.isArray(descriptors)
      || typeof factual_state?.party_id !== 'string'
      || !Number.isSafeInteger(factual_state?.party_state?.state_version)
      || !Number.isSafeInteger(same_time_batch_ordinal)
      || same_time_batch_ordinal < 1) {
    fail('temporal_change_set_conflict',
      'Paused NPC decision batch requires descriptors and factual state.');
  }
  if (descriptors.length === 0) {
    return null;
  }
  for (const descriptor of descriptors) {
    if (typeof descriptor?.perceived_change_summary !== 'string'
        || descriptor.perceived_change_summary.trim()
          !== descriptor.perceived_change_summary
        || descriptor.perceived_change_summary.length === 0) {
      fail('temporal_change_set_conflict',
        'Every NPC decision signal source requires one NPC-safe semantic summary.');
    }
  }
  const sameTimeBatchRef = {
    entity_kind: 'temporal_batch',
    entity_id: `temporal-batch:${factual_state.party_id}:${
      scheduledAt.whole_minutes}:${scheduledAt.subminute_numerator}/${
      scheduledAt.subminute_denominator}:${same_time_batch_ordinal}`
  };
  const persistedInputs = (factual_state.npc_semantic_decision_inputs ?? [])
    .filter(({ boundary_snapshot: boundary }) =>
      canonicalDigest(boundary?.npc_ref) === canonicalDigest(npc_ref)
        && canonicalDigest(boundary?.same_time_batch_ref)
          === canonicalDigest(sameTimeBatchRef));
  if (persistedInputs.length > 1) {
    fail('idempotency_conflict',
      'NPC same-time batch has ambiguous persisted decision inputs.');
  }
  const persistedDecisionInput = persistedInputs[0] ?? null;
  const knownSignalRecords = factual_state.npc_decision_signals ?? [];
  const consumedSignalIds =
    factual_state.consumed_npc_decision_signal_ids ?? [];
  const signalInputs = descriptors.map((descriptor) => ({
    signal: buildNpcDecisionSignal(descriptor),
    perceived_change_summary: descriptor.perceived_change_summary
  }));
  const signals = signalInputs.map(({ signal }) => signal);
  const knownById = new Map(knownSignalRecords.map((record) =>
    [record?.signal?.signal_id, record]));
  for (const signal of signals) {
    const known = knownById.get(signal.signal_id);
    if (known
        && canonicalDigest(known.signal) !== canonicalDigest(signal)) {
      fail('idempotency_conflict',
        'Persisted NPC signal identity has different canonical content.');
    }
  }
  const evaluation = evaluateNpcDecisionSignals({
    npc_ref,
    active_mode,
    current_intent,
    decision_capability,
    resolved_signals: signals,
    consumed_signal_ids: consumedSignalIds,
    same_time_batch_ref: sameTimeBatchRef,
    state_version: String(factual_state.party_state.state_version),
    persisted_boundary_id:
      persistedDecisionInput?.boundary_snapshot?.boundary_id ?? null
  });
  if (evaluation.boundary === null) {
    return null;
  }
  const byId = new Map(signals.map((signal) => [signal.signal_id, signal]));
  const summaryById = new Map(signalInputs.map(
    ({ signal, perceived_change_summary: summary }) =>
      [signal.signal_id, summary]
  ));
  const orderedSignals = evaluation.boundary.signal_refs.map(
    ({ entity_id: signalId }) => byId.get(signalId));
  if (orderedSignals.some((signal) => signal === undefined)) {
    fail('temporal_change_set_conflict',
      'NPC decision boundary references a missing resolved signal.');
  }
  return Object.freeze({
    boundary: evaluation.boundary,
    ordered_signals: structuredClone(orderedSignals),
    perceived_changes: orderedSignals.map((signal) => ({
      source_event_ref: structuredClone(signal.source_event_ref),
      summary: summaryById.get(signal.signal_id)
    })),
    persisted_decision_input: structuredClone(persistedDecisionInput),
    same_time_batch_ref: structuredClone(sameTimeBatchRef),
    same_time_batch_ordinal: same_time_batch_ordinal,
    new_signal_records: orderedSignals
      .filter((signal) => !knownById.has(signal.signal_id))
      .map((signal) => ({
        signal: structuredClone(signal),
        same_time_batch_key: sameTimeBatchRef.entity_id
      }))
  });
}

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}
