import {
  exactKeys,
  refKey,
  stableId
} from './internal.js';

function uniqueEntityRefs(values) {
  return Array.isArray(values)
    && values.every((value) => exactKeys(value, ['entity_kind', 'entity_id'])
      && stableId(value.entity_kind)
      && stableId(value.entity_id))
    && new Set(values.map(refKey)).size === values.length;
}

function canonicalRefs(values) {
  return Array.isArray(values) && values.every((reference, index) =>
    index === 0 || refKey(values[index - 1]) < refKey(reference));
}

export function validateAllowedContributionReferences(value) {
  return exactKeys(value, [
    'actor_refs',
    'entity_refs',
    'knowledge_refs',
    'combat_target_refs'
  ])
    && uniqueEntityRefs(value.actor_refs)
    && value.actor_refs.every(({ entity_kind: entityKind }) =>
      ['npc', 'player_character'].includes(entityKind))
    && uniqueEntityRefs(value.entity_refs)
    && uniqueEntityRefs(value.knowledge_refs)
    && uniqueEntityRefs(value.combat_target_refs)
    && canonicalRefs(value.actor_refs)
    && canonicalRefs(value.entity_refs)
    && canonicalRefs(value.knowledge_refs)
    && canonicalRefs(value.combat_target_refs)
    && value.combat_target_refs.every((reference) =>
      value.actor_refs.some((actorRef) =>
        refKey(actorRef) === refKey(reference)));
}

function refsBelongTo(values, allowedKeys) {
  return values.every((reference) => allowedKeys.has(refKey(reference)));
}

export function validateContributionReferences(value, allowed) {
  const actorKeys = new Set(allowed.actor_refs.map(refKey));
  const entityKeys = new Set([
    ...allowed.entity_refs.map(refKey),
    ...allowed.actor_refs.map(refKey)
  ]);
  const knowledgeKeys = new Set(allowed.knowledge_refs.map(refKey));
  const combatKeys = new Set(allowed.combat_target_refs.map(refKey));
  const actorRefs = [
    ...(value.primary_addressee_ref === null
      ? [] : [value.primary_addressee_ref]),
    ...value.intended_addressee_refs,
    ...value.affected_actor_refs,
    ...(value.speech?.response_expectation?.target_refs ?? [])
  ];
  if (!refsBelongTo(actorRefs, actorKeys)) return false;
  for (const claim of value.speech?.claims ?? []) {
    if (!refsBelongTo(claim.source_knowledge_refs, knowledgeKeys)
        || !refsBelongTo(claim.mentioned_entity_refs, entityKeys)) {
      return false;
    }
  }
  return value.contribution_kind !== 'combat_handoff'
    || refsBelongTo(value.handoff.target_actor_refs, combatKeys);
}
