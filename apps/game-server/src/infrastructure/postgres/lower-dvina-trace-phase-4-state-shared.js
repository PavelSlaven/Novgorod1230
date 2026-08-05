import { canonicalDigest } from '@rus/materialization';
import { buildNpcDecisionSignal } from '@rus/npc-runtime';

export function requireSignalMapping(mapping, {
  category,
  perceptionRequirement,
  targetNpcRef = null,
  targetNpcRefs = null
}) {
  const descriptor = mapping?.signal_descriptors;
  if (!mapping
      || mapping.perception_requirement !== perceptionRequirement
      || !Array.isArray(descriptor)
      || descriptor.length !== 1
      || descriptor[0].category !== category
      || descriptor[0].significance !== 'material'
      || (targetNpcRef !== null && mapping.target_npc_ref !== targetNpcRef)
      || (targetNpcRefs !== null
        && JSON.stringify(mapping.target_npc_refs)
          !== JSON.stringify(targetNpcRefs))) {
    semanticFail('TRACE_M2_PHASE_4_SIGNAL_MAPPING_INVALID');
  }
  return mapping;
}

export function signalRecord({
  clock,
  descriptor,
  sourceEventRef,
  subjectRef,
  perceptionRef,
  partyId = null,
  causalParentRefs = [],
  batchKey = null,
  expectedSignalRef = null
}) {
  const signal = buildNpcDecisionSignal({
    occurred_at: structuredClone(clock),
    category: descriptor.category,
    significance: descriptor.significance,
    source_event_ref: sourceEventRef,
    subject_ref: subjectRef,
    scope_refs: [],
    perception_required: perceptionRef !== null,
    source_perception_ref: perceptionRef,
    causal_parent_refs: causalParentRefs
  });
  if (expectedSignalRef !== null
      && (expectedSignalRef.entity_kind !== 'npc_decision_signal'
        || expectedSignalRef.entity_id !== signal.signal_id)) {
    semanticFail('TRACE_M2_PHASE_4_SIGNAL_IDENTITY_INVALID');
  }
  return {
    signal,
    same_time_batch_key: batchKey ?? sameTimeBatchKey(partyId, clock)
  };
}

export function appendPerceptions(current = [], added) {
  if (!Array.isArray(current)) {
    semanticFail('TRACE_M2_PHASE_4_PERCEPTION_STATE_INVALID');
  }
  const byId = new Map(current.map((entry) => [entry.perception_id, entry]));
  for (const perception of added) {
    if (!perception.perception_id || byId.has(perception.perception_id)) {
      semanticFail('TRACE_M2_PHASE_4_PERCEPTION_STATE_INVALID');
    }
    byId.set(perception.perception_id, perception);
  }
  return [...byId.values()].sort((left, right) =>
    left.perception_id.localeCompare(right.perception_id, 'en'));
}

export function sameTimeBatchKey(partyId, clock) {
  return `conversation-batch:${canonicalDigest({
    schema: 'rus.lower_dvina_trace_conversation_batch_identity.v1',
    party_id: partyId,
    exact_game_timestamp: clock
  }).slice(0, 32)}`;
}

export function ref(entityKind, entityId) {
  return { entity_kind: entityKind, entity_id: entityId };
}

export function npcRef(entityId) {
  return ref('npc', entityId);
}

export function appendSemanticSpeakerInteraction({
  next, state, semantic, responseKind, statement, turnNumber, activityRef
}) {
  const projection = semantic[responseKind];
  const audience = semantic.audiences.find(({ statement_ref: statementRef }) =>
    statementRef.entity_kind === 'conversation_statement'
      && statementRef.entity_id === statement.statement_id);
  if (!projection
      || projection.objective_truth_write !== 'forbidden'
      || projection.statement_ref?.entity_kind !== 'conversation_statement'
      || projection.statement_ref.entity_id !== statement.statement_id
      || projection.utterance_text !== statement.utterance_text
      || !audience) {
    semanticFail('TRACE_M2_PHASE_4_SPEAKER_STATEMENT_INVALID');
  }
  next.interactions = [...(next.interactions ?? []), {
    interaction_id:
      `interaction:${state.party_id}:trace-phase4:${turnNumber}:${responseKind}`,
    activity_ref: activityRef,
    statement_ref: statement.statement_id,
    speaker_npc_id: statement.speaker_ref.entity_id,
    utterance_text: statement.utterance_text,
    dominant_act: statement.dominant_act,
    interaction_tags: structuredClone(statement.interaction_tags),
    topic_refs: structuredClone(statement.topic_refs),
    claims: structuredClone(statement.claims),
    actual_listener_refs:
      structuredClone(audience.actual_listener_refs),
    truth_projection: 'speaker_statement_only',
    objective_truth_write: 'forbidden'
  }];
}

export function sameRef(left, right) {
  return left?.entity_kind === right?.entity_kind
    && left?.entity_id === right?.entity_id;
}

export function semanticFail(code) {
  throw Object.assign(
    new Error('The Phase 4 semantic negotiation projection is incomplete.'),
    { code }
  );
}

export function mergeKnowledge(current = [], added = []) {
  const byId = new Map(current.map((entry) => [entry.fact_id, entry]));
  for (const entry of added) if (!byId.has(entry.fact_id)) {
    byId.set(entry.fact_id, entry);
  }
  return [...byId.values()].sort((left, right) =>
    left.fact_id.localeCompare(right.fact_id));
}
