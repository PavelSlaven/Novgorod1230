import {
  compareRefs,
  fail,
  isEntityRef,
  plainRecord,
  ref,
  refKey,
  sameRef
} from './lower-dvina-trace-m2-conversation-shared.js';

export function perceivedChanges(records, { presentedEvidenceRecognized }) {
  const categories = new Set(records.map(({ signal }) => signal.category));
  return [...categories].sort().map((category) => {
    if (category === 'communication') {
      return 'The NPC received the current perceived message.';
    }
    if (category === 'environment') {
      return presentedEvidenceRecognized
        ? 'The NPC recognized the presented committed evidence.'
        : 'The NPC noticed a presented object but did not recognize it.';
    }
    if (category === 'others') {
      return 'The NPC perceived the present group in the current scene.';
    }
    if (category === 'objective') {
      return 'The NPC current objective is invalidated by committed state.';
    }
    return 'The NPC perceived a committed change to its own resources.';
  });
}

export function ownNpcProjection(actor) {
  if (!plainRecord(actor.identity_state)
      || !plainRecord(actor.machine_state)) {
    fail(
      'TRACE_M2_NPC_SUBJECTIVE_STATE_GAP',
      'The NPC own identity and subjective machine state are required.'
    );
  }
  return {
    participant_ref: actor.ref,
    instance_id: actor.instance_id,
    identity_state: structuredClone(actor.identity_state),
    machine_state: structuredClone(actor.machine_state)
  };
}

export function ownKnowledgeProjection(actor) {
  if (!plainRecord(actor.knowledge_profile_snapshot)) {
    fail(
      'TRACE_M2_NPC_KNOWLEDGE_GAP',
      'The NPC own knowledge profile snapshot is required.'
    );
  }
  return structuredClone(actor.knowledge_profile_snapshot);
}

export function ownMemoryProjection(actor, state, targetRef) {
  return {
    records: structuredClone(actor.knowledge_records ?? []),
    received_messages: structuredClone(
      (state.received_messages ?? []).filter(
        ({ listener_ref: listenerRef }) => sameRef(listenerRef, targetRef)
      )
    )
  };
}

export function committedPlayerKnowledgeRefs(state) {
  const refs = [];
  for (const record of state.knowledge ?? []) {
    if (isEntityRef(record)) refs.push(record);
    if (isEntityRef(record?.entity_ref)) refs.push(record.entity_ref);
    if (typeof record?.fact_id === 'string' && record.fact_id.trim()) {
      refs.push(ref('knowledge_fact', record.fact_id));
    }
    for (const evidenceId of record?.evidence_refs ?? []) {
      if (typeof evidenceId === 'string' && evidenceId.trim()) {
        refs.push(ref('evidence', evidenceId));
      }
    }
  }
  const byKey = new Map(refs.map((reference) => [
    refKey(reference),
    reference
  ]));
  return [...byKey.values()].sort(compareRefs);
}

export function allowedNpcContributionReferences(context, {
  entityRefs = [],
  knowledgeRefs = []
} = {}) {
  const policy = context.npcContributionReferencePolicy ?? {};
  const canonical = (references) => [...new Map(references.map((reference) => [
    refKey(reference), structuredClone(reference)
  ])).values()].sort(compareRefs);
  return {
    actor_refs: canonical([
      ref('player_character', context.state.actor_id),
      ...context.actualNpcActors.map(({ instance_id: instanceId }) =>
        ref('npc', instanceId))
    ]),
    entity_refs: canonical([
      ...(policy.entity_refs ?? []),
      ...entityRefs
    ]),
    knowledge_refs: canonical([
      ...(policy.knowledge_refs ?? []),
      ...knowledgeRefs
    ]),
    combat_target_refs: canonical(policy.combat_target_refs ?? [])
  };
}

export function allowedPlayerContributionReferences(context) {
  const knowledgeRefs = committedPlayerKnowledgeRefs(context.state);
  const entityRefs = [
    ...knowledgeRefs,
    ...(context.availableEvidence?.item_ref == null
      ? [] : [context.availableEvidence.item_ref])
  ];
  const canonical = (references) => [...new Map(references.map((reference) => [
    refKey(reference), structuredClone(reference)
  ])).values()].sort(compareRefs);
  return {
    actor_refs: canonical([
      ref('player_character', context.state.actor_id),
      ...context.actualNpcActors.map(({ instance_id: instanceId }) =>
        ref('npc', instanceId))
    ]),
    entity_refs: canonical(entityRefs),
    knowledge_refs: canonical(knowledgeRefs),
    combat_target_refs: canonical(context.actualNpcActors.map(
      ({ instance_id: instanceId }) => ref('npc', instanceId)
    ))
  };
}
