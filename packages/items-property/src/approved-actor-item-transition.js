import { deepFreeze } from '@rus/kernel';
import {
  calculateHandsState,
  calculateInventoryMass,
  resolveInventoryAccess,
  resolveInventoryLoad,
  validateInventoryTopology
} from './inventory.js';

const PHYSICAL_POSITIONS = new Set(['hands', 'worn', 'worn_quick', 'equipped', 'external', 'external_load']);

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
  if (!transition || text(transition.transition_profile_id) === '' || transition.owner_change !== 'forbidden') return failed('APPROVED_TRANSITION_METADATA_INVALID', 'validation', { item_id: itemId });
  const requiredFacts = transition.required_facts
    ?? (transition.requires?.admission_fact
      ? [transition.requires.admission_fact]
      : []);
  if (!approvedFactsPresent(requiredFacts, input.approved_facts)) return failed('APPROVED_TRANSITION_FACT_MISSING', 'admission', { item_id: itemId });

  const normalizedInput = normalizeActorPlacements(input);
  const topology = validateInventoryTopology(normalizedInput);
  if (!topology.pass) return failedFrom(topology.errors[0]);
  const item = list(input.items).find((value) => value?.item_id === itemId);
  const placement = findPlacement(normalizedInput.item_placements, itemId);
  if (!item || !placement) return failed('INVENTORY_TARGET_NOT_FOUND', 'topology', { item_id: itemId });
  const exactPolicy = validateExactPolicyState({
    transition, input, item, source, destination
  });
  if (exactPolicy) return failedFrom(exactPolicy);
  if (placement.holder_character_id !== source.actor_id || placement.physical_position !== source.physical_position) return failed('APPROVED_TRANSITION_SOURCE_PLACEMENT_MISMATCH', 'topology', { item_id: itemId });

  const ownership = list(input.ownership).find((value) => value?.item_id === itemId);
  if (!ownership || controllerId(ownership) !== source.controller_actor_id) return failed('APPROVED_TRANSITION_SOURCE_OWNERSHIP_MISMATCH', 'property', { item_id: itemId });
  const access = resolveInventoryAccess({ ...normalizedInput, actor_id: source.actor_id, item_id: itemId });
  if (!access.pass || access.access?.tier !== source.accessibility) return failed('APPROVED_TRANSITION_SOURCE_ACCESS_MISMATCH', 'access', { item_id: itemId, accessibility: source.accessibility });

  const nextPlacement = {
    party_id: input.party_id,
    item_id: itemId,
    ...(destination.actor_kind === 'npc'
      ? { holder_npc_id: destination.actor_id }
      : { holder_character_id: destination.actor_id }),
    physical_position: destination.physical_position
  };
  const normalizedNextPlacement = {
    party_id: input.party_id,
    item_id: itemId,
    holder_character_id: destination.actor_id,
    physical_position: destination.physical_position
  };
  const next = {
    ...normalizedInput,
    item_placements: list(normalizedInput.item_placements).map((value) => value?.item_id === itemId ? normalizedNextPlacement : structuredClone(value))
  };
  const afterTopology = validateInventoryTopology(next);
  if (!afterTopology.pass) return failedFrom(afterTopology.errors[0]);
  const sourceInventory = validateActorInventory(next, source.actor_id);
  if (!sourceInventory.pass) return failedFrom(sourceInventory.error);
  const destinationInventory = validateActorInventory(next, destination.actor_id);
  if (!destinationInventory.pass) return failedFrom(destinationInventory.error);

  const ownershipProposal = withController(ownership, destination.controller_actor_id);
  return deepFreeze({
    pass: true,
    proposal: deepFreeze({
      placement: deepFreeze({ instance_kind: 'item', ...nextPlacement }),
      ownership: deepFreeze({ item_id: itemId, owner_change: 'forbidden', previous: deepFreeze(structuredClone(ownership)), next: deepFreeze(ownershipProposal) }),
      accessibility: deepFreeze({ item_id: itemId, actor_id: destination.actor_id, value: destination.accessibility }),
      property_history: deepFreeze({ item_id: itemId, transition_profile_id: transition.transition_profile_id, approved_facts: deepFreeze([...list(input.approved_facts)]), source: deepFreeze(structuredClone(source)), destination: deepFreeze(structuredClone(destination)), owner_change: 'forbidden' })
    }),
    derived_after: deepFreeze({ source: sourceInventory.derived, destination: destinationInventory.derived }),
    errors: []
  });
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
      || source.physical_position !== required.physical_position
      || source.accessibility !== required.accessibility
      || destination.actor_id !== refs[writes.holder_ref]
      || destination.controller_actor_id !== refs[writes.controller_ref]
      || destination.physical_position !== writes.physical_position
      || destination.accessibility !== writes.accessibility) {
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
  if (!actorId || !['character', 'npc'].includes(actorKind) || !controllerActorId
    || !PHYSICAL_POSITIONS.has(position) || !accessibility) return null;
  return {
    actor_id: actorId,
    actor_kind: actorKind,
    controller_actor_id: controllerActorId,
    physical_position: position,
    accessibility
  };
}
function approvedFactsPresent(required, actual) {
  const facts = new Set(list(actual).map(text).filter(Boolean));
  return list(required).every((fact) => facts.has(text(fact)));
}
function validateActorInventory(input, actorId) {
  const scoped = { ...input, actor_id: actorId };
  const mass = calculateInventoryMass(scoped);
  const hands = calculateHandsState(scoped);
  if (!mass.pass || !hands.pass) return { pass: false, error: mass.errors[0] ?? hands.errors[0] };
  const strength = input.actor_strengths?.[actorId] ?? input.strength;
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
function withController(ownership, actorId) {
  const next = structuredClone(ownership);
  const field = next.controller_npc_id != null ? 'controller_npc_id' : next.controller_character_id != null ? 'controller_character_id' : 'controller_actor_id';
  next[field] = actorId;
  return next;
}
function findPlacement(values, itemId) { return list(values).find((value) => value?.item_id === itemId) ?? null; }
function normalizeActorPlacements(input) {
  const normalize = (value) => {
    const placement = structuredClone(value);
    if (placement?.holder_npc_id != null) {
      placement.holder_character_id = placement.holder_npc_id;
      delete placement.holder_npc_id;
    }
    return placement;
  };
  return {
    ...input,
    item_placements: list(input.item_placements).map(normalize),
    container_placements: list(input.container_placements).map(normalize)
  };
}
function failed(code, category, details) { return failedFrom(issue(code, category, details)); }
function failedFrom(error) { return deepFreeze({ pass: false, errors: [error] }); }
function issue(code, category, details = {}) { return deepFreeze({ code, category, retryable: false, message: code, details: deepFreeze(structuredClone(details)) }); }
function list(value) { return Array.isArray(value) ? value : []; }
function text(value) { return String(value ?? '').trim(); }
