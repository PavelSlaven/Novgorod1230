
import { canonicalDigest } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';
import { addElapsedTime } from '@rus/time-events-history';
import {
  assertPhase4AttackRows,
  assertPhase4StatementRows
} from './lower-dvina-trace-phase-4-read-semantics.js';
import {
  assertPhase4PromiseAndSurrender,
  assertPhase4SemanticPromiseAndSurrender
} from './lower-dvina-trace-phase-4-read-obligation.js';
import {
  isLowerDvinaTraceSemanticRevision
} from './lower-dvina-trace-semantic-conversation-read.js';
import {
  assertPhase5ArrivalResourceRows,
  loadPhase5ArrivalResourceRows
} from './lower-dvina-trace-phase-4-arrival-resource-proof.js';

/**
 * The snapshot is a cache, never the authority.  On every restart/replay the
 * Phase 4 subset is reconstructed from normalized P16 rows and compared with
 * the snapshot's closed factual history.
 */
export function assertPhase4PerceptionRows({
  semanticRevision,
  partyId,
  payload,
  movementHistory,
  rows,
  witnesses,
  replayRows
}) {
  const prefix = `perception:${partyId}:trace-phase4:`;
  const expectedSnapshots = new Map((payload.perceptions ?? [])
    .filter(({ perception_id: id }) => id.startsWith(prefix))
    .map((perception) => [perception.perception_id, perception]));
  const legacyArrivals = new Map(movementHistory.map(({
    turn_number: turn,
    consequence
  }) => [
    `perception:${partyId}:trace-phase4:${turn}:arrival`,
    consequence.movement.traversal.ids.execution_id
  ]));
  const expectedIds = semanticRevision
    ? [...expectedSnapshots.keys()].sort()
    : [...legacyArrivals.keys()].sort();
  if (canonicalDigest(rows.map(({ perception_id: id }) => id))
        !== canonicalDigest(expectedIds)
      || witnesses.length !== rows.length
      || replayRows.length !== rows.length) fail('perception_cardinality');
  const witnessById = new Map(witnesses.map((row) => [
    row.perception_id,
    row
  ]));
  const replayById = new Map(replayRows.map((row) => [
    row.perception_id,
    row
  ]));
  if (witnessById.size !== witnesses.length
      || replayById.size !== replayRows.length) fail('perception_identity');
  for (const row of rows) {
    const snapshot = expectedSnapshots.get(row.perception_id);
    const history = phase4HistoryForPerception(payload, row.perception_id);
    const witness = witnessById.get(row.perception_id);
    const replay = replayById.get(row.perception_id);
    if (!snapshot || !history || !witness || !replay
        || row.result_kind !== 'recognized'
        || row.status !== 'resolved'
        || row.change_set_id !== history.change_set_id
        || row.event_change_set_id !== history.change_set_id
        || row.terminal_change_set_id !== history.change_set_id
        || witness.witness_kind !== row.perceiver_kind
        || witness.witness_id !== row.perceiver_id
        || replay.party_id !== partyId
        || replay.perception_digest !== row.canonical_digest
        || replay.change_set_id !== history.change_set_id
        || replay.canonical_digest !== canonicalDigest({
          perception_id: replay.perception_id,
          canonical_input_digest: replay.canonical_input_digest,
          perception_digest: replay.perception_digest,
          expected_state_versions_digest:
            replay.expected_state_versions_digest,
          dependency_pins_digest: replay.dependency_pins_digest,
          policy_versions_digest: replay.policy_versions_digest,
          idempotency_key: replay.idempotency_key,
          change_set_id: replay.change_set_id
        })) fail('perception_common_lineage');
    const legacyRouteExecutionId = legacyArrivals.get(row.perception_id);
    if (legacyRouteExecutionId !== undefined) {
      if (row.event_kind !== 'committed_scene_observation'
          || row.event_version !== '2'
          || row.rule_ref?.route_execution_id !== legacyRouteExecutionId
          || row.knowledge_update_refs?.[0]?.entity_id
            !== 'onisim_found_alive') fail('legacy_arrival_perception');
      continue;
    }
    const exactPayload = m2PerceptionPayload(snapshot, row, partyId);
    if (!semanticRevision
        || row.perceiver_kind !== snapshot.observer_ref?.entity_kind
        || row.perceiver_id !== snapshot.observer_ref?.entity_id
        || row.canonical_digest !== canonicalDigest(exactPayload)
        || row.perceived_at_whole_minutes
          !== String(snapshot.occurred_at?.whole_minutes)
        || row.perceived_at_subminute_numerator
          !== String(snapshot.occurred_at?.subminute_numerator)
        || row.perceived_at_subminute_denominator
          !== String(snapshot.occurred_at?.subminute_denominator)) {
      fail('semantic_phase4_perception');
    }
  }
}

export function phase4HistoryForPerception(payload, perceptionId) {
  return (payload.phase4_history ?? []).find(({ turn_number: turn }) =>
    perceptionId.startsWith(
      `perception:${payload.party_id}:trace-phase4:${turn}:`
    ));
}

export function m2PerceptionPayload(snapshot, row, partyId) {
  if (snapshot.perception_id.endsWith(':ratsha-group')) {
    if (row.event_id !== snapshot.event_ref?.entity_id
        || row.event_kind !== 'committed_scene_observation'
        || row.event_version !== '2'
        || canonicalDigest(row.signal_refs)
          !== canonicalDigest([snapshot.signal_ref])
        || canonicalDigest(row.knowledge_update_refs)
          !== canonicalDigest([])) fail('ratsha_arrival_perception');
    return snapshot;
  }
  if (!snapshot.perception_id.includes(':knife-loss:')) {
    fail('unknown_phase4_perception');
  }
  const turnPrefix = snapshot.perception_id.slice(
    0,
    snapshot.perception_id.indexOf(':knife-loss:')
  );
  const turn = turnPrefix.slice(
    `perception:${partyId}:trace-phase4:`.length
  );
  const signalRef = {
    entity_kind: 'npc_decision_signal',
    entity_id:
      `decision-signal:${snapshot.source_event_ref.entity_id}:${snapshot.observer_ref.entity_id}`
  };
  if (row.event_id !== `event:${partyId}:trace-phase4:${turn}:knife-loss`
      || row.event_kind !== 'item_property_transition_observed'
      || row.event_version !== '2'
      || canonicalDigest(row.signal_refs) !== canonicalDigest([signalRef])
      || canonicalDigest(row.knowledge_update_refs) !== canonicalDigest([])) {
    fail('knife_loss_perception');
  }
  return {
    schema: 'rus.lower_dvina_trace_phase_4_knife_loss_perception.v1',
    perception_id: snapshot.perception_id,
    event_ref: { entity_kind: 'temporal_event', entity_id: row.event_id },
    source_event_ref: snapshot.source_event_ref,
    causal_parent_refs: snapshot.causal_parent_refs,
    observer_ref: snapshot.observer_ref,
    subject_ref: snapshot.subject_ref,
    observation_ref: snapshot.observation_ref,
    result_kind: snapshot.result_kind,
    occurred_at: snapshot.occurred_at,
    signal_ref: signalRef
  };
}
export function fail(invariant = null) {
  const error = phase2IntegrityError();
  if (invariant !== null) error.message += ` [${invariant}]`;
  throw error;
}

export function timestampColumns(prefix, timestamp) {
  return {
    [`${prefix}_whole_minutes`]: String(timestamp.whole_minutes),
    [`${prefix}_subminute_numerator`]: String(timestamp.subminute_numerator),
    [`${prefix}_subminute_denominator`]: String(timestamp.subminute_denominator)
  };
}
