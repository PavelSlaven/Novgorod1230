import { deepFreeze } from '@rus/kernel';
import {
  calculateHandsState,
  calculateInventoryMass,
  resolveInventoryAccess,
  resolveInventoryLoad,
  validateInventoryTopology
} from './inventory.js';

export const ACTOR_ITEM_PHYSICAL_POSITIONS = Object.freeze([
  'hands', 'worn', 'worn_quick', 'equipped', 'external', 'external_load'
]);

const PHYSICAL_POSITIONS = new Set(ACTOR_ITEM_PHYSICAL_POSITIONS);

export function validateApprovedActorItemTransitionProfile(profile) {
  const requiredFacts = profile?.required_facts;
  const attemptAccess = profile?.attempt_access;
  const errors = [];
  if (profile?.schema !== 'rus.items_property.approved_actor_transition_profile.v1') {
    errors.push('profile schema is invalid');
  }
  if (profile?.status !== 'approved') errors.push('profile must be approved');
  if (profile?.owner !== '@rus/items-property') errors.push('profile owner is invalid');
  if (!Number.isSafeInteger(profile?.version) || profile.version < 1) {
    errors.push('profile version is invalid');
  }
  if (!text(profile?.transition_profile_id)) {
    errors.push('transition_profile_id is required');
  }
  if (!text(profile?.applicable_instance_class)) {
    errors.push('applicable_instance_class is required');
  }
  if (profile?.owner_change !== 'forbidden') {
    errors.push('owner_change must be forbidden');
  }
  if (!Array.isArray(requiredFacts)
      || requiredFacts.some((value) => !text(value))
      || new Set(requiredFacts).size !== requiredFacts.length) {
    errors.push('required_facts must be a unique string array');
  }
  if (!plain(attemptAccess)
      || attemptAccess.require_same_scope !== true
      || attemptAccess.require_perception !== true
      || !Array.isArray(attemptAccess.source_physical_positions)
      || attemptAccess.source_physical_positions.length === 0
      || new Set(attemptAccess.source_physical_positions).size
        !== attemptAccess.source_physical_positions.length
      || attemptAccess.source_physical_positions.some((value) =>
        !PHYSICAL_POSITIONS.has(value))) {
    errors.push('attempt_access must define exact physical admission');
  }
  return deepFreeze({ ok: errors.length === 0, errors });
}

export function projectApprovedActorItemAttemptAccess({
  perception_request: request,
  perception_result: result,
  item_id: itemId,
  actor_scope_ref: actorScopeRef
} = {}) {
  const actorId = text(result?.perceiver_ref?.entity_id);
  const sourceRef = request?.factual_signal?.source_ref;
  const sourceScopeRef = request?.factual_signal?.source_scope_ref;
  const pass = text(itemId)
    && text(actorScopeRef)
    && text(request?.perception_id) === text(result?.perception_id)
    && request?.perceiver_ref?.entity_kind === 'npc'
    && result?.perceiver_ref?.entity_kind === 'npc'
    && text(request.perceiver_ref.entity_id) === actorId
    && request?.event_ref?.entity_kind === result?.event_ref?.entity_kind
    && request?.event_ref?.entity_id === result?.event_ref?.entity_id
    && sourceRef?.entity_kind === 'item'
    && sourceRef.entity_id === itemId
    && text(sourceScopeRef?.entity_id)
    && ['recognized', 'perceived_partial'].includes(result?.result);
  return pass ? deepFreeze({ pass: true, projection: {
    schema: 'rus.items_property.actor_item_attempt_access.v1',
    perception_id: result.perception_id,
    actor_id: actorId,
    item_id: itemId,
    perception_result: result.result,
    actor_scope_ref: actorScopeRef,
    source_scope_ref: sourceScopeRef.entity_id
  }, errors: [] }) : deepFreeze({ pass: false, projection: null,
    errors: [{ code: 'APPROVED_TRANSITION_PERCEPTION_MISMATCH',
      category: 'access', retryable: false }] });
}

/**
 * Plans a transition which has already been admitted by the caller. This is a
 * pure, fail-closed bridge between an approved property transition and the
 * normalized inventory graph; it does not select actors, facts, or placement.
 */
export function planApprovedActorItemTransition(input = {}) {
  if (input.expected_state_version !== input.state_version) return failed('STATE_VERSION_MISMATCH', 'concurrency', { expected: input.expected_state_version, actual: input.state_version });
  const itemId = text(input.item_id);
  const source = exactState(input.source);
  const destination = exactState(input.destination);
  const transition = input.approved_transition;
  if (!itemId || !source || !destination) return failed('APPROVED_TRANSITION_EXACT_STATE_REQUIRED', 'validation', { item_id: itemId || null });
  if (transition?.schema === 'rus.items_property.approved_actor_transition_profile.v1'
      && !validateApprovedActorItemTransitionProfile(transition).ok) {
    return failed('APPROVED_TRANSITION_METADATA_INVALID', 'validation', {
      item_id: itemId
    });
  }
  if (!transition || text(transition.transition_profile_id) === '' || transition.owner_change !== 'forbidden') return failed('APPROVED_TRANSITION_METADATA_INVALID', 'validation', { item_id: itemId });
  const requiredFacts = transition.required_facts
    ?? (transition.requires?.admission_fact
      ? [transition.requires.admission_fact]
      : []);
  if (!approvedFactsPresent(requiredFacts, input.approved_facts)) return failed('APPROVED_TRANSITION_FACT_MISSING', 'admission', { item_id: itemId });

  const normalizedInput = normalizeActorPlacements(input);
  const topology = validateInventoryTopology(normalizedInput);
  if (!topology.pass) return failedFrom(topology.errors[0]);
  const target = actorTarget(normalizedInput, itemId);
  const item = target?.instance;
  const placement = target?.placement;
  if (!item || !placement) return failed('INVENTORY_TARGET_NOT_FOUND', 'topology', { item_id: itemId });
  if (transition.schema === 'rus.items_property.approved_actor_transition_profile.v1'
      && item.instance_class !== transition.applicable_instance_class) {
    return failed('APPROVED_TRANSITION_INSTANCE_CLASS_MISMATCH',
      'admission', { item_id: itemId,
        expected: transition.applicable_instance_class,
        actual: item.instance_class ?? null });
  }
  if (transition.schema === 'rus.items_property.approved_actor_transition_profile.v1'
      && !approvedAttemptAccess(input, placement, transition, itemId)) {
    return failed('APPROVED_TRANSITION_ATTEMPT_ACCESS_DENIED',
      'access', { item_id: itemId,
        actor_id: text(input.attempt_access_source?.perception_result
          ?.perceiver_ref?.entity_id) || null });
  }
  const exactPolicy = validateExactPolicyState({
    transition, input, item, source, destination
  });
  if (exactPolicy) return failedFrom(exactPolicy);
  if (placement.holder_character_id !== source.actor_id
      || placement.physical_position !== source.physical_position
      || placementEquipmentSlot(placement)
        !== normalizeEquipmentSlot(source.equipment_slot_category_id,
          source.physical_position)) return failed('APPROVED_TRANSITION_SOURCE_PLACEMENT_MISMATCH', 'topology', { item_id: itemId });

  const ownership = list(input.ownership).find((value) =>
    value?.[target.key] === itemId);
  if (!ownership || controllerId(ownership) !== source.controller_actor_id) return failed('APPROVED_TRANSITION_SOURCE_OWNERSHIP_MISMATCH', 'property', { item_id: itemId });
  if (transition.requires?.owner_ref != null
      && ownerId(ownership) !== input.resolved_actor_refs?.[transition.requires.owner_ref]) {
    return failed('APPROVED_TRANSITION_SOURCE_OWNER_MISMATCH', 'property', { item_id: itemId });
  }
  const access = target.kind === 'item'
    ? resolveInventoryAccess({ ...normalizedInput,
        actor_id: source.actor_id, item_id: itemId })
    : containerAccess(placement, source.actor_id);
  if (!access.pass || access.access?.tier !== source.accessibility) return failed('APPROVED_TRANSITION_SOURCE_ACCESS_MISMATCH', 'access', { item_id: itemId, accessibility: source.accessibility });

  const nextPlacement = {
    party_id: input.party_id,
    [target.key]: itemId,
    ...(destination.actor_kind === 'npc'
      ? { holder_npc_id: destination.actor_id }
      : { holder_character_id: destination.actor_id }),
    physical_position: destination.physical_position,
    ...(destination.equipment_slot_category_id == null ? {} : { equipment_slot_category_id: destination.equipment_slot_category_id })
  };
  const normalizedNextPlacement = {
    party_id: input.party_id,
    [target.key]: itemId,
    holder_character_id: destination.actor_id,
    physical_position: destination.physical_position,
    ...(destination.equipment_slot_category_id == null ? {} : { equipment_slot_category_id: destination.equipment_slot_category_id })
  };
  const next = {
    ...normalizedInput,
    [target.placementField]: list(normalizedInput[target.placementField])
      .map((value) => value?.[target.key] === itemId
        ? normalizedNextPlacement : structuredClone(value))
  };
  const afterTopology = validateInventoryTopology(next);
  if (!afterTopology.pass) return failedFrom(afterTopology.errors[0]);
  const sourceInventory = validateActorInventory(next, source.actor_id);
  if (!sourceInventory.pass) return failedFrom(sourceInventory.error);
  const destinationInventory = validateActorInventory(next, destination.actor_id);
  if (!destinationInventory.pass) return failedFrom(destinationInventory.error);

  const ownershipProposal = withController(ownership, destination.controller_actor_id, destination.actor_kind);
  return deepFreeze({
    pass: true,
    proposal: deepFreeze({
      placement: deepFreeze({ instance_kind: target.kind, ...nextPlacement }),
      ownership: deepFreeze({ [target.key]: itemId, owner_change: 'forbidden', previous: deepFreeze(structuredClone(ownership)), next: deepFreeze(ownershipProposal) }),
      accessibility: deepFreeze({ [target.key]: itemId, actor_id: destination.actor_id, value: destination.accessibility }),
      item_state: deepFreeze({
        [target.key]: itemId,
        ...(destination.condition_state != null
          ? { condition_state: destination.condition_state }
          : {}),
        ...(destination.use_state != null
          ? { use_state: destination.use_state }
          : {})
      }),
      property_history: deepFreeze({ [target.key]: itemId,
        transition_profile_id: transition.transition_profile_id, approved_facts: deepFreeze([...list(input.approved_facts)]), source: deepFreeze(structuredClone(source)), destination: deepFreeze(structuredClone(destination)), owner_change: 'forbidden' })
    }),
    derived_after: deepFreeze({ source: sourceInventory.derived, destination: destinationInventory.derived }),
    errors: []
  });
}

export function applyApprovedActorItemTransitionProposal(input = {},
  result = {}) {
  const expected = planApprovedActorItemTransition(input);
  if (!expected.pass || result?.pass !== true
      || JSON.stringify(result.proposal) !== JSON.stringify(expected.proposal)) {
    return failed('APPROVED_TRANSITION_PROPOSAL_MISMATCH', 'validation', {
      item_id: text(input.item_id) || null
    });
  }
  const placement = expected.proposal.placement;
  const ownership = expected.proposal.ownership.next;
  const placementField = placement.instance_kind === 'container'
    ? 'container_placements' : 'item_placements';
  const key = placement.instance_kind === 'container'
    ? 'container_id' : 'item_id';
  const next = {
    ...structuredClone(input),
    [placementField]: list(input[placementField]).map((value) =>
      value?.[key] === placement[key] ? structuredClone(placement)
        : structuredClone(value)),
    ownership: list(input.ownership).map((value) =>
      value?.[key] === placement[key] ? structuredClone(ownership)
        : structuredClone(value))
  };
  delete next.approved_transition;
  delete next.approved_facts;
  delete next.source;
  delete next.destination;
  delete next.attempt_access_source;
  return deepFreeze({ pass: true, state: next, errors: [] });
}

function validateExactPolicyState({
  transition, input, item, source, destination
}) {
  if (transition.requires == null && transition.writes == null) return null;
  const refs = input.resolved_actor_refs;
  const required = transition.requires;
  const writes = transition.writes;
  if (!required || !writes || refs == null
      || item.template_id !== transition.subject_ref
      || source.actor_id !== refs[required.holder_ref]
      || source.controller_actor_id !== refs[required.controller_ref]
      || (required.physical_position != null
        && source.physical_position !== required.physical_position)
      || (required.equipment_slot_category_id != null
        && normalizeEquipmentSlot(source.equipment_slot_category_id,
          source.physical_position) !== normalizeEquipmentSlot(
            required.equipment_slot_category_id, required.physical_position))
      || (required.accessibility != null
        && source.accessibility !== required.accessibility)
      || (required.condition_state != null
        && (source.condition_state !== required.condition_state
          || item.condition_state !== required.condition_state))
      || (required.use_state != null
        && (source.use_state !== required.use_state
          || item.state?.use_state !== required.use_state))
      || destination.actor_id !== refs[writes.holder_ref]
      || destination.controller_actor_id !== refs[writes.controller_ref]
      || (writes.physical_position != null
        && destination.physical_position !== writes.physical_position)
      || (writes.equipment_slot_category_id != null
        && normalizeEquipmentSlot(destination.equipment_slot_category_id,
          destination.physical_position) !== normalizeEquipmentSlot(
            writes.equipment_slot_category_id, writes.physical_position))
      || (writes.accessibility != null
        && destination.accessibility !== writes.accessibility)
      || (writes.condition_state != null
        && destination.condition_state !== writes.condition_state)
      || (writes.use_state != null
        && destination.use_state !== writes.use_state)) {
    return issue(
      'APPROVED_TRANSITION_POLICY_STATE_MISMATCH',
      'validation',
      { item_id: item.item_id }
    );
  }
  return null;
}

function exactState(value) {
  const actorId = text(value?.actor_id);
  const actorKind = text(value?.actor_kind);
  const controllerActorId = text(value?.controller_actor_id);
  const position = text(value?.physical_position);
  const accessibility = text(value?.accessibility);
  const equipmentSlotCategoryId = normalizeEquipmentSlot(value?.equipment_slot_category_id ?? value?.equipment_slot_id, position);
  if (!actorId || !['character', 'npc'].includes(actorKind) || !controllerActorId
    || !PHYSICAL_POSITIONS.has(position) || !accessibility
    || (position === 'equipped' && !equipmentSlotCategoryId)
    || (position !== 'equipped' && equipmentSlotCategoryId !== null)) return null;
  const exact = {
    actor_id: actorId,
    actor_kind: actorKind,
    controller_actor_id: controllerActorId,
    physical_position: position,
    ...(equipmentSlotCategoryId == null
      ? {}
      : { equipment_slot_category_id: equipmentSlotCategoryId }),
    accessibility
  };
  if (value?.condition_state != null) {
    const conditionState = text(value.condition_state);
    if (!conditionState) return null;
    exact.condition_state = conditionState;
  }
  if (value?.use_state != null) {
    const useState = text(value.use_state);
    if (!useState) return null;
    exact.use_state = useState;
  }
  return exact;
}
function approvedFactsPresent(required, actual) {
  const facts = new Set(list(actual).map(text).filter(Boolean));
  return list(required).every((fact) => facts.has(text(fact)));
}
function approvedAttemptAccess(input, placement, transition, itemId) {
  const access = projectApprovedActorItemAttemptAccess({
    ...input.attempt_access_source, item_id: itemId
  });
  const actorId = access.projection?.actor_id;
  return access.pass
    && [input.source?.actor_id, input.destination?.actor_id].includes(actorId)
    && (!transition.attempt_access.require_same_scope
      || access.projection.actor_scope_ref
        === access.projection.source_scope_ref)
    && (!transition.attempt_access.require_perception || access.pass)
    && transition.attempt_access.source_physical_positions.includes(
      placement.physical_position);
}
function validateActorInventory(input, actorId) {
  const scoped = { ...input, actor_id: actorId };
  const mass = calculateInventoryMass(scoped);
  const hands = calculateHandsState(scoped);
  if (!mass.pass || !hands.pass) return { pass: false, error: mass.errors[0] ?? hands.errors[0] };
  const strength = input.actor_strengths != null
    ? input.actor_strengths[actorId]
    : actorId === input.actor_id ? input.strength : null;
  if (strength == null) {
    return {
      pass: true,
      derived: deepFreeze({
        total_mass_grams: mass.total_mass_grams,
        hands_used: hands.hands_used,
        hands_free: hands.hands_free,
        load_category: null
      })
    };
  }
  const load = resolveInventoryLoad({
    total_mass_grams: mass.total_mass_grams,
    strength
  });
  if (!load.pass) return { pass: false, error: load.errors[0] };
  if (load.load_category === 'overloaded') return { pass: false, error: issue('INVENTORY_LOAD_EXCEEDED', 'capacity', { actor_id: actorId, total_mass_grams: mass.total_mass_grams }) };
  return { pass: true, derived: deepFreeze({ total_mass_grams: mass.total_mass_grams, hands_used: hands.hands_used, hands_free: hands.hands_free, load_category: load.load_category }) };
}
function controllerId(value) { return text(value?.controller_actor_id ?? value?.controller_character_id ?? value?.controller_npc_id); }
function ownerId(value) { return text(value?.owner_actor_id ?? value?.owner_character_id ?? value?.owner_npc_id); }
function withController(ownership, actorId, actorKind) {
  const next = structuredClone(ownership);
  delete next.controller_actor_id;
  next.controller_npc_id = actorKind === 'npc' ? actorId : null;
  next.controller_character_id = actorKind === 'character' ? actorId : null;
  return next;
}
function placementEquipmentSlot(value) { return normalizeEquipmentSlot(value?.equipment_slot_category_id ?? value?.equipment_slot_id, value?.physical_position); }
function normalizeEquipmentSlot(value, physicalPosition) {
  const slot = text(value);
  return physicalPosition === 'equipped' ? slot || null : slot ? slot : null;
}
function findPlacement(values, itemId) { return list(values).find((value) => value?.item_id === itemId) ?? null; }
function normalizeActorPlacements(input) {
  const transitionActors = new Set([
    input.source?.actor_id,
    input.destination?.actor_id
  ].filter(Boolean));
  const normalize = (value) => {
    const placement = structuredClone(value);
    if (transitionActors.has(placement?.holder_npc_id)
        && placement.physical_position != null) {
      placement.holder_character_id = placement.holder_npc_id;
      delete placement.holder_npc_id;
    }
    return placement;
  };
  return {
    ...input,
    item_placements: list(input.item_placements).map(normalize),
    container_placements: list(input.container_placements).map(
      normalize)
  };
}
function actorTarget(input, instanceId) {
  const item = list(input.items).find((value) => value?.item_id === instanceId);
  if (item) return { kind: 'item', key: 'item_id',
    placementField: 'item_placements', instance: item,
    placement: findPlacement(input.item_placements, instanceId) };
  const container = list(input.containers).find((value) =>
    value?.container_id === instanceId);
  return container ? { kind: 'container', key: 'container_id',
    placementField: 'container_placements', instance: container,
    placement: list(input.container_placements).find((value) =>
      value?.container_id === instanceId) ?? null } : null;
}
function containerAccess(placement, actorId) {
  if (placement?.holder_character_id !== actorId) {
    return deepFreeze({ pass: true, access: { tier: 'unavailable' },
      errors: [] });
  }
  return deepFreeze({ pass: true, access: {
    tier: placement.physical_position === 'hands' ? 'immediate' : 'quick'
  }, errors: [] });
}
function failed(code, category, details) { return failedFrom(issue(code, category, details)); }
function failedFrom(error) { return deepFreeze({ pass: false, errors: [error] }); }
function issue(code, category, details = {}) { return deepFreeze({ code, category, retryable: false, message: code, details: deepFreeze(structuredClone(details)) }); }
function list(value) { return Array.isArray(value) ? value : []; }
function text(value) { return String(value ?? '').trim(); }
function plain(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
