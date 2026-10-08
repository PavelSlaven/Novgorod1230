import {
  compareRefs,
  fail,
  isEntityRef,
  plainRecord,
  ref,
  refKey,
  sameRef
} from './lower-dvina-trace-m2-conversation-shared.js';
import { selectBoundedActorContext } from '@rus/visibility-knowledge-memory';

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
  const roleRef = trustedRoleRef(actor.role_ref)
    ?? trustedRoleRef(actor.social_role?.role_ref);
  return {
    participant_ref: actor.ref,
    instance_id: actor.instance_id,
    identity_state: structuredClone(actor.identity_state),
    machine_state: structuredClone(actor.machine_state),
    ...(roleRef == null ? {} : { social_role: { role_ref: roleRef } })
  };
}

/**
 * The speaker's own persisted character as a hidden position for the NPC
 * responder. Only labels reach the model; refs and the rest of semantic_state
 * stay out. Missing or malformed data yields null.
 */
export function projectNpcCharacterBehavior(actor) {
  const character = actor?.semantic_state?.character;
  if (!plainRecord(character)) return null;
  const texts = (value, min, max) => Array.isArray(value)
    && value.length >= min && value.length <= max
    && value.every(filled) ? value.map((entry) => entry.trim()) : null;
  const values = texts(character.value_labels_ru, 2, 2);
  const goals = texts(character.goals_ru, 1, 2);
  if (!filled(character.temperament_label_ru) || !filled(character.fear_ru)
      || values === null || goals === null) return null;
  return { temperament: character.temperament_label_ru.trim(), values, goals,
    fears: [character.fear_ru.trim()] };
}

function filled(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function trustedRoleRef(value) {
  if (typeof value === 'string' && value) return value;
  return plainRecord(value) && typeof value.id === 'string' && value.id
    ? value.id : null;
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

export function currentSceneObservationProjection(state,
  details = state.current_visible_context?.sensory_details) {
  if (!Array.isArray(details)) return [];
  const unique = [...new Set(details.filter(
    (text) => typeof text === 'string' && text.trim().length > 0
  ))];
  return unique.map((text, index) => ({
    observation_ref: ref('perception_result',
      `current-scene:${state.party_state.state_version}:${index + 1}`),
    source_type: 'direct_perception',
    observed_at: structuredClone(state.clock),
    fact_text: text
  }));
}

export function ownMemoryProjection(actor, state, targetRef,
  currentObservations = currentSceneObservationProjection(state)) {
  return {
    records: selectBoundedActorContext(actor.knowledge_records ?? []),
    received_messages: selectBoundedActorContext(
      (state.received_messages ?? []).filter(
        ({ listener_ref: listenerRef }) => sameRef(listenerRef, targetRef)
      )),
    current_observations: selectBoundedActorContext(currentObservations)
  };
}

export function receivedConversationMessage(context, working, statement) {
  const audiences = [
    ...(context.state.conversation_audiences ?? []),
    ...(working.audiences ?? [])
  ];
  return audiences.find(({ statement_ref: reference }) =>
    reference?.entity_id === statement.statement_id)
    ?.received_messages.find(({ listener_ref: listenerRef }) =>
      sameRef(listenerRef, context.targetRef));
}

export function visibleConversationContributionFor(
  context,
  working,
  contribution
) {
  if (sameRef(contribution.speaker_ref, context.targetRef)) {
    if (contribution.schema === 'conversation_non_statement_contribution_v1') {
      return { ...contribution, nonverbal_audience: null };
    }
    return contribution;
  }
  if (contribution.schema === 'conversation_statement_event_v1') {
    return receivedConversationMessage(context, working, contribution);
  }
  return contribution.nonverbal_audience?.observations?.find(
    ({ observer_ref: observerRef }) => sameRef(observerRef, context.targetRef)
  );
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
  const knowledgeScopeId = context.targetActor?.knowledge_profile_snapshot
    ?.profile_id;
  const ownKnowledgeScope = typeof knowledgeScopeId === 'string'
      && knowledgeScopeId.trim() === knowledgeScopeId
      && knowledgeScopeId.length > 0
    ? [ref('knowledge_scope', knowledgeScopeId)] : [];
  const canonical = (references) => [...new Map(references.map((reference) => [
    refKey(reference), structuredClone(reference)
  ])).values()].sort(compareRefs);
  return {
    actor_refs: canonical(context.conversationActorRefs ?? [
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
      ...ownKnowledgeScope,
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

const RELATION_RU = Object.freeze({
  spouse: 'они супруги',
  kin_parent_child: 'между ними установлена связь родителя и ребёнка',
  kin_siblings: 'между ними установлена связь брата и сестры',
  kin_uncle_nephew: 'между ними установлена связь дяди и племянника',
  master_servant: 'между ними установлена связь господина и слуги',
  dependent_patron: 'между ними установлена связь зависимого и покровителя',
  joint_work: 'между ними установлена связь совместной работы',
  co_resident: 'они указаны как совместно живущие',
  community_member: 'они указаны как члены одной общины'
});

const REGISTER_RU = Object.freeze({
  plain_oral: 'Говори просто, обычной устной речью.',
  everyday_oral: 'Говори привычной повседневной устной речью.',
  formal_literate: 'Говори сдержанно и почтительно, книжной речью.'
});

/** Project only approved, exact speech facts for the NPC's recognized interlocutor. */
export function interlocutorSpeechProjection(context, contribution,
  perceivedMessage) {
  const speakerRef = contribution?.speaker_ref;
  if (!filled(speakerRef?.entity_kind) || !filled(speakerRef?.entity_id)
      || !sameRef(perceivedMessage?.speaker_ref, speakerRef)) return null;

  const interlocutor = speakerRef.entity_kind === 'player_character'
    ? null
    : (context.actualNpcActors ?? []).find((actor) =>
      sameRef(actor.ref, speakerRef));
  if (speakerRef.entity_kind !== 'player_character' && !interlocutor) return null;

  const targetKeys = actorSpeechKeys(context.targetActor);
  const interlocutorKeys = speakerRef.entity_kind === 'player_character'
    ? playerSpeechKeys(context.state?.player_profile)
    : actorSpeechKeys(interlocutor);
  const interlocutorRelationships = (
    context.targetActor?.semantic_state?.relationships ?? []
  ).filter((edge) => edge?.target_actor_id === speakerRef.entity_id
    && filled(edge?.kind));
  const relationship = interlocutorRelationships[0];
  const occupationKnowledge = interlocutorRelationships.find((edge) =>
    edge.kind === relationship?.kind
    && filled(edge.source_rule_ref?.id)
    && positiveVersion(edge.source_rule_ref?.version));
  const relation = typeof RELATION_RU[relationship?.kind] === 'string'
    ? RELATION_RU[relationship.kind] : undefined;
  const address = selectSpeechAddress(
    context.npcSpeechAddressForms
      ?? context.npcSemanticModel?.npcSpeechAddressForms ?? [], {
    targetKeys,
    interlocutorKeys: occupationKnowledge
      ? interlocutorKeys
      : { ...interlocutorKeys, occupation: undefined },
    speakerRef: context.targetRef,
    addresseeRef: speakerRef,
    relationshipKind: relationship?.kind,
    sourceRuleRef: occupationKnowledge?.source_rule_ref
      ?? relationship?.source_rule_ref
  });
  const register = speechRegister(
    context.npcSpeechRegisters
      ?? context.npcSemanticModel?.npcSpeechRegisters ?? [],
    context.targetActor
  );
  const result = {
    ...(relation === undefined ? {} : { relation }),
    ...(address === undefined ? {} : { address }),
    ...(register === undefined ? {} : { register })
  };
  return Object.keys(result).length === 0 ? null : result;
}

function actorSpeechKeys(actor) {
  return { role: actor?.role_ref?.id, occupation: actor?.occupation_ref?.id };
}

function playerSpeechKeys(profile) {
  const social = profile?.social_status;
  return { role: social?.social_role_id, occupation: social?.occupation_id };
}

function selectSpeechAddress(forms, {
  targetKeys, interlocutorKeys, speakerRef, addresseeRef, relationshipKind,
  sourceRuleRef
}) {
  const matches = (kind) => forms.flatMap((form) => {
    const speakerSpecificity = speechRefSpecificity(form?.speaker_role_ref,
      targetKeys, true);
    const addresseeSpecificity = speechRefSpecificity(form?.addressee_role_ref,
      interlocutorKeys, false);
    if (speakerSpecificity === undefined || addresseeSpecificity === undefined) return [];
    if (!formSourceMatches(form, sourceRuleRef)) return [];
    if (form?.status !== 'approved'
        || form.channel !== 'oral'
        || form.relationship_kind !== kind
        || !filled(form.form_ru)
        || !russianSpeechText(form.form_ru)
        || filled(form.payload?.no_source)
        || !formRefMatches(form.speaker_ref, speakerRef)
        || !formRefMatches(form.addressee_ref, addresseeRef)) return [];
    return [{ form, specificity: [speakerSpecificity, addresseeSpecificity] }];
  });
  const hasRelationship = filled(relationshipKind);
  const candidates = hasRelationship ? matches(relationshipKind) : matches('unspecified');
  const best = candidates.filter((candidate, index) => !candidates.some((other, otherIndex) =>
    otherIndex !== index && dominates(other.specificity, candidate.specificity)));
  return best.length === 1 ? best[0].form.form_ru.trim() : undefined;
}

function speechRefSpecificity(constraint, actual, allowWildcard) {
  if (!filled(constraint)) return allowWildcard ? 0 : undefined;
  if (constraint === actual.occupation) return 2;
  if (constraint === actual.role) return 1;
  return undefined;
}

function dominates(left, right) {
  return left[0] >= right[0] && left[1] >= right[1]
    && (left[0] > right[0] || left[1] > right[1]);
}

function formSourceMatches(form, sourceRuleRef) {
  const suffix = onlyForRuleIds(form?.situation);
  if (suffix === null) return true;
  return Array.isArray(suffix) && filled(sourceRuleRef?.id)
    && positiveVersion(sourceRuleRef?.version) && suffix.includes(sourceRuleRef.id);
}

function onlyForRuleIds(situation) {
  if (typeof situation !== 'string') return null;
  const suffix = /; only for ([^;\s]+(?:;[^;\s]+)*)$/u.exec(situation);
  if (suffix) return suffix[1].split(';');
  return /; only for $/u.test(situation) ? [] : null;
}

function positiveVersion(value) {
  return (typeof value === 'string' || Number.isSafeInteger(value))
    && Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function formRefMatches(constraint, actual) {
  return constraint == null || sameRef(constraint, actual);
}

function russianSpeechText(value) {
  return typeof value === 'string'
    && /[А-Яа-яЁё]/u.test(value)
    && !/[A-Za-z]|\b\d{4,}\b/u.test(value);
}

function speechRegister(rows, actor) {
  const occupation = actor?.occupation_ref?.id;
  const role = actor?.role_ref?.id;
  const subjectKind = filled(occupation) ? 'occupation' : 'role';
  const subjectRef = filled(occupation) ? occupation : role;
  if (!filled(subjectRef)) return undefined;
  const matches = rows.filter((row) => row?.subject_kind === subjectKind
    && row.subject_ref === subjectRef
    && typeof REGISTER_RU[row.register] === 'string');
  return matches.length === 1 ? REGISTER_RU[matches[0].register] : undefined;
}
