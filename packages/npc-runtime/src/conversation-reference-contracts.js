import { refKey } from './internal.js';

function refsBelongTo(values, allowedKeys) {
  return values.every((reference) => allowedKeys.has(refKey(reference)));
}

export function validateNpcContributionReferences(value, allowed) {
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
