import { deepFreeze } from '@rus/kernel';

export function planApprovedPropertyTransition(input = {}) {
  if (input.expected_state_version !== input.state_version) {
    return failed('STATE_VERSION_MISMATCH');
  }
  const transition = input.approved_transition;
  const subject = input.subject;
  if (!plain(transition) || transition.owner !== '@rus/items-property'
      || !text(transition.transition_profile_id)
      || transition.owner_change !== 'forbidden'
      || !plain(subject) || subject.template_id !== transition.subject_ref
      || !plain(input.resolved_actor_refs)) {
    return failed('APPROVED_PROPERTY_TRANSITION_INVALID');
  }
  if (Array.isArray(transition.admission_variants)) {
    return planContainer(input);
  }
  if (transition.writes?.closure_state === 'open') {
    return planContainerAccess(input);
  }
  if (transition.requires?.physical_parent_ref != null) {
    return planContainedItem(input);
  }
  return failed('APPROVED_PROPERTY_TRANSITION_UNSUPPORTED');
}

function planContainerAccess(input) {
  const { subject, approved_transition: transition, resolved_actor_refs: refs } =
    input;
  const actor = resolve(refs, input.actor_ref);
  if (!text(subject.container_id) || !text(actor)
      || transition.requires?.closure_state !== subject.closure_state
      || holder(subject) !== actor || controller(subject) !== actor
      || transition.requires.holder_ref_rule
        !== 'bound_actor_is_committed_holder'
      || transition.requires.controller_ref_rule
        !== 'bound_actor_is_committed_controller'
      || transition.writes.content_access_state
        !== 'physically_accessible_to_bound_controller'
      || transition.owner_change !== 'forbidden'
      || transition.holder_change !== 'forbidden'
      || transition.controller_change !== 'forbidden') {
    return failed('APPROVED_CONTAINER_ACCESS_STATE_MISMATCH');
  }
  const next = structuredClone(subject);
  next.closure_state = 'open';
  next.contents_state = 'visible_if_materialized';
  next.access_state = transition.writes.content_access_state;
  next.state = { ...next.state, closure_state: next.closure_state,
    contents_state: next.contents_state, access_state: next.access_state };
  return success('container', subject.container_id, next, transition, {
    actor_ref: actor,
    committed_fact_ids: [...(input.committed_fact_ids ?? [])].sort()
  });
}

function planContainer(input) {
  const { subject, approved_transition: transition, resolved_actor_refs: refs } =
    input;
  if (!text(subject.container_id)
      || transition.variant_selection_policy
        !== 'select_exactly_one_variant_from_committed_facts_and_source_state'
      || transition.requires_common?.location_ref
        !== subject.state?.location_ref
      || resolve(refs, transition.requires_common?.owner_ref)
        !== owner(subject)
      || transition.writes?.position_transition
        !== 'preserve_committed_location_and_zone') {
    return failed('APPROVED_CONTAINER_PROPERTY_STATE_MISMATCH');
  }
  const facts = new Set(input.committed_fact_ids ?? []);
  const variants = transition.admission_variants.filter((variant) =>
    facts.has(variant.requires_committed_fact)
      && resolve(refs, variant.source_holder_ref) === holder(subject)
      && resolve(refs, variant.source_controller_ref) === controller(subject));
  if (variants.length !== 1) {
    return failed(variants.length === 0
      ? 'APPROVED_PROPERTY_TRANSITION_FACT_MISSING'
      : 'APPROVED_PROPERTY_TRANSITION_AMBIGUOUS');
  }
  const next = structuredClone(subject);
  delete next.holder_npc_id;
  delete next.controller_npc_id;
  next.holder_character_id = resolve(refs, transition.writes.holder_ref);
  next.controller_character_id = resolve(refs,
    transition.writes.controller_ref);
  if (!text(next.holder_character_id) || !text(next.controller_character_id)) {
    return failed('APPROVED_PROPERTY_ACTOR_REF_MISSING');
  }
  next.physical_position = 'hands';
  next.state = { ...next.state,
    controller_character_id: next.controller_character_id };
  delete next.state.controller_npc_id;
  return success('container', subject.container_id, next, transition, {
    admission_variant_id: variants[0].variant_id,
    committed_fact_ids: [...facts].sort()
  });
}

function planContainedItem(input) {
  const { subject, parent_container: parent,
    approved_transition: transition, resolved_actor_refs: refs } = input;
  const required = transition.requires;
  const writes = transition.writes;
  if (!text(subject.item_id) || !plain(parent)
      || parent.template_id !== required.physical_parent_ref
      || subject.placement?.container_id !== parent.container_id
      || parent.closure_state !== required.parent_closure_state
      || holder(parent) !== resolve(refs, required.parent_holder_ref)
      || controller(parent) !== resolve(refs, required.parent_controller_ref)
      || subject.state?.seal_state !== required.seal_state
      || (required.document_condition != null
        && subject.state?.document_condition !== required.document_condition)
      || (required.evidence_availability != null
        && subject.state?.evidence_availability
          !== required.evidence_availability)
      || writes.physical_parent_ref !== null
      || writes.position_derivation
        !== 'held_by_player_at_committed_bag_zone'
      || !['preserve_committed', 'preserve_destroyed']
        .includes(writes.seal_state)
      || transition.container_relation_change
        !== 'exact_remove_from_road_bag_only') {
    return failed('APPROVED_CONTAINED_ITEM_PROPERTY_STATE_MISMATCH');
  }
  const holderId = resolve(refs, writes.holder_ref);
  const controllerId = resolve(refs, writes.controller_ref);
  if (!text(holderId) || !text(controllerId)) {
    return failed('APPROVED_PROPERTY_ACTOR_REF_MISSING');
  }
  const next = structuredClone(subject);
  next.placement = { ...next.placement, container_id: null,
    holder_character_id: holderId, physical_position: 'hands' };
  delete next.placement.holder_npc_id;
  next.ownership = { ...next.ownership,
    controller_character_id: controllerId };
  delete next.ownership.controller_npc_id;
  if (writes.document_condition === 'preserve_destroyed_unreadable') {
    next.state.document_condition = subject.state.document_condition;
  }
  if (writes.evidence_availability === 'preserve_destroyed') {
    next.state.evidence_availability = subject.state.evidence_availability;
  }
  return success('item', subject.item_id, next, transition, {
    committed_fact_ids: [...(input.committed_fact_ids ?? [])].sort()
  });
}

function success(subjectKind, subjectId, next, transition, causalBasis) {
  return deepFreeze({ pass: true, errors: [], proposal: {
    subject_kind: subjectKind,
    subject_id: subjectId,
    next,
    property_history: {
      transition_profile_id: transition.transition_profile_id,
      owner_change: 'forbidden',
      causal_basis: structuredClone(causalBasis)
    }
  } });
}
function failed(code) {
  return deepFreeze({ pass: false, proposal: null, errors: [{ code,
    category: code.includes('MISMATCH') ? 'state' : 'validation',
    retryable: false }] });
}
function holder(value) {
  return text(value?.holder_character_id ?? value?.holder_npc_id
    ?? value?.placement?.holder_character_id
    ?? value?.placement?.holder_npc_id);
}
function controller(value) {
  return text(value?.controller_character_id ?? value?.controller_npc_id
    ?? value?.state?.controller_character_id ?? value?.state?.controller_npc_id
    ?? value?.ownership?.controller_character_id
    ?? value?.ownership?.controller_npc_id);
}
function owner(value) {
  return text(value?.owner_external_ref ?? value?.state?.owner_external_ref
    ?? value?.ownership?.owner_external_ref);
}
function resolve(refs, ref) {
  if (ref == null) return '';
  return text(refs[ref] ?? ref);
}
function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function plain(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
