import { deepFreeze } from '@rus/kernel';
import { calculateContainerUsage } from './inventory-container-usage.js';
import { resolveInventoryLoad } from './inventory-load.js';
import { resolveInventoryMechanicsProfile } from './runtime-instance-mechanics.js';
import {
  calculateInventoryMassFromTopology,
  inventoryItemIsCarried
} from './inventory-mass.js';

const PHYSICAL_POSITIONS = new Set(['hands', 'worn', 'worn_quick', 'equipped', 'external', 'external_load']);

export { calculateContainerUsage } from './inventory-container-usage.js';
export { deriveInventoryZone } from './inventory-zone.js';
export { buildInventoryStackSignature } from './inventory-signature.js';
export { resolveInventoryLoad } from './inventory-load.js';

/** Pure path validation; SQL owns row-local FK/exactly-one rules. */
export function validateInventoryTopology(input = {}) {
  const errors = [];
  const items = list(input.items);
  const containers = list(input.containers);
  const itemPlacements = list(input.item_placements);
  const containerPlacements = list(input.container_placements);
  const itemIds = uniqueIds(items, 'item_id', errors, 'INVENTORY_ITEM_NOT_FOUND');
  const containerIds = uniqueIds(containers, 'container_id', errors, 'INVENTORY_CONTAINER_NOT_FOUND');
  const itemPlacementById = placementMap(itemPlacements, 'item_id', itemIds, errors);
  const containerPlacementById = placementMap(containerPlacements, 'container_id', containerIds, errors);
  for (const itemId of itemIds) if (!itemPlacementById.has(itemId)) errors.push(error('INVENTORY_PLACEMENT_NOT_FOUND', 'topology', { item_id: itemId }));
  for (const containerId of containerIds) if (!containerPlacementById.has(containerId)) errors.push(error('INVENTORY_PLACEMENT_NOT_FOUND', 'topology', { container_id: containerId }));

  for (const placement of itemPlacements) validateParty(placement, input.party_id, errors);
  for (const placement of containerPlacements) validateParty(placement, input.party_id, errors);
  for (const placement of [...itemPlacements, ...containerPlacements]) validateCharacterPhysicalPlacement(placement, errors);
  for (const placement of containerPlacements) {
    if (placement.parent_container_id && !containerIds.has(placement.parent_container_id)) errors.push(error('INVENTORY_CONTAINER_NOT_FOUND', 'topology', { container_id: placement.parent_container_id }));
    if (placement.parent_container_id === placement.container_id) errors.push(error('INVENTORY_CYCLE_DETECTED', 'topology', { container_id: placement.container_id }));
  }
  for (const placement of itemPlacements) {
    const targets = [
      placement.anchor_id,
      placement.location_ref,
      placement.container_id,
      placement.holder_npc_id,
      placement.holder_character_id,
      placement.attached_item_id
    ].filter((value) => value != null);
    if (targets.length !== 1) errors.push(error(
      'INVENTORY_PLACEMENT_EXACTLY_ONE_REQUIRED', 'topology', {
        item_id: placement.item_id
      }));
    if (placement.container_id && !containerIds.has(placement.container_id)) errors.push(error('INVENTORY_CONTAINER_NOT_FOUND', 'topology', { container_id: placement.container_id }));
    if (placement.attached_item_id && !itemIds.has(placement.attached_item_id)) errors.push(error('INVENTORY_ITEM_NOT_FOUND', 'topology', { item_id: placement.attached_item_id }));
    if (placement.attached_item_id === placement.item_id) errors.push(error('INVENTORY_CYCLE_DETECTED', 'topology', { item_id: placement.item_id, attached_item_id: placement.attached_item_id }));
  }

  for (const itemId of itemIds) {
    const trail = new Set([itemId]);
    let current = itemPlacementById.get(itemId)?.attached_item_id ?? null;
    while (current) {
      if (trail.has(current)) {
        errors.push(error('INVENTORY_CYCLE_DETECTED', 'topology', {
          item_id: itemId,
          attached_item_id: current
        }));
        break;
      }
      trail.add(current);
      current = itemPlacementById.get(current)?.attached_item_id ?? null;
    }
  }

  for (const [containerId] of containerPlacementById) {
    const trail = new Set([containerId]);
    let current = containerPlacementById.get(containerId)?.parent_container_id ?? null;
    let depth = 1;
    while (current) {
      if (trail.has(current)) {
        errors.push(error('INVENTORY_CYCLE_DETECTED', 'topology', { container_id: containerId, parent_container_id: current }));
        break;
      }
      trail.add(current);
      depth += 1;
      if (depth > 2) {
        errors.push(error('INVENTORY_NESTING_LIMIT_EXCEEDED', 'topology', { container_id: containerId, container_edges: depth }));
        break;
      }
      current = containerPlacementById.get(current)?.parent_container_id ?? null;
    }
  }

  const primary = containers.filter((container) => {
    const profile = profileFor(input.container_profiles, container.template_id);
    const placement = containerPlacementById.get(container.container_id);
    return profile?.inventory_role === 'primary_container' && placement?.holder_character_id === input.actor_id;
  });
  if (primary.length > 1) errors.push(error('INVENTORY_PRIMARY_CONTAINER_AMBIGUOUS', 'topology', { container_ids: primary.map((value) => value.container_id).sort() }));

  const slots = new Map();
  for (const placement of itemPlacements) {
    const slot = placement.equipment_slot_id ?? placement.equipment_slot_category_id;
    if (!slot || placement.holder_character_id !== input.actor_id || placement.physical_position !== 'equipped') continue;
    if (slots.has(slot)) errors.push(error('INVENTORY_EQUIPMENT_SLOT_OCCUPIED', 'topology', { equipment_slot_id: slot }));
    slots.set(slot, placement.item_id);
  }
  return result(errors, { item_placements: itemPlacementById, container_placements: containerPlacementById });
}

export function calculateInventoryMass(input = {}) {
  return calculateInventoryMassFromTopology(
    input, validateInventoryTopology(input));
}

export function calculateHandsState(input = {}) {
  const topology = validateInventoryTopology(input);
  const errors = [...topology.errors];
  let used = 0;
  for (const item of list(input.items)) {
    const placement = findPlacement(input.item_placements, 'item_id', item.item_id);
    if (placement?.holder_character_id !== input.actor_id || !['hands', 'external', 'external_load'].includes(placement.physical_position)) continue;
    const resolution = mechanics(item, input.item_profiles, errors);
    if (!resolution) continue;
    const profile = resolution.profile;
    if (![0, 1, 2].includes(profile?.external_hand_cost)) errors.push(error('ITEM_CARRY_PROFILE_DATA_GAP', 'data_gap', { item_id: item.item_id }));
    else used += profile.external_hand_cost;
  }
  for (const container of list(input.containers)) {
    const placement = findPlacement(input.container_placements, 'container_id', container.container_id);
    if (placement?.holder_character_id !== input.actor_id || !['hands', 'external', 'external_load'].includes(placement.physical_position)) continue;
    const resolution = mechanics(container, input.container_profiles, errors);
    if (!resolution) continue;
    const profile = resolution.profile;
    if (![0, 1, 2].includes(profile?.external_hand_cost)) errors.push(error('ITEM_CARRY_PROFILE_DATA_GAP', 'data_gap', { container_id: container.container_id }));
    else used += profile.external_hand_cost;
  }
  if (used > 2) errors.push(error('INVENTORY_HANDS_EXCEEDED', 'topology', { hands_used: used, hands_total: 2 }));
  return deepFreeze({ pass: errors.length === 0, hands_total: 2, hands_used: used, hands_free: Math.max(0, 2 - used), errors });
}

export function resolveInventoryAccess(input = {}) {
  const topology = validateInventoryTopology(input);
  if (!topology.pass) return deepFreeze({ pass: false, access: null, errors: topology.errors });
  const item = list(input.items).find((value) => value.item_id === input.item_id);
  if (!item || !inventoryItemIsCarried(input, item.item_id)) return accessResult('unavailable', []);
  const placement = findPlacement(input.item_placements, 'item_id', item.item_id);
  if (placement?.holder_character_id === input.actor_id) return accessResult(placement.physical_position === 'hands' ? 'immediate' : 'quick', ['retrieve_item']);
  const chain = containerChain(input, placement?.container_id);
  if (!chain.pass) return deepFreeze({ pass: false, access: null, errors: chain.errors });
  const steps = [];
  const rootFirst = [...chain.containers].reverse();
  rootFirst.forEach((container, index) => steps.push(index === 0 && profileFor(input.container_profiles, container.template_id)?.inventory_role === 'primary_container' ? 'open_primary_container' : 'open_inner_container'));
  steps.push('retrieve_item');
  const closed = rootFirst.some((container) => ['closed', 'locked', 'unavailable'].includes(profileFor(input.container_profiles, container.template_id)?.closure_state));
  const rootRole = profileFor(input.container_profiles, rootFirst[0]?.template_id)?.inventory_role;
  return accessResult(closed ? 'closed' : rootRole === 'quick_container' && rootFirst.length === 1 ? 'quick' : rootFirst.length === 1 ? 'short_action' : 'delayed', steps);
}

export function planInventoryTransfer(input = {}) {
  if (input.expected_state_version !== input.state_version) return planFailure(error('STATE_VERSION_MISMATCH', 'concurrency', { expected: input.expected_state_version, actual: input.state_version }));
  const topology = validateInventoryTopology(input);
  if (!topology.pass) return planFailure(topology.errors[0]);
  const operation = text(input.operation);
  const targetId = input.item_or_container_id;
  if (operation === 'drop_primary_container') return planDropPrimary(input, targetId);
  if (operation === 'recover_primary_container') return planRecoverPrimary(input, targetId);
  if (['pick_up', 'put_down', 'move_to_container', 'take_from_container', 'equip', 'unequip', 'move_to_quick_container', 'move_to_primary_container'].includes(operation)) return planGenericTransfer(input, operation, targetId);
  return planFailure(error('INVENTORY_ACCESS_DENIED', 'command_catalog', { operation, reason: 'TURN_INVENTORY_COMMAND_CATALOG_GAP' }));
}

function planGenericTransfer(input, operation, instanceId) {
  const target = inventoryTarget(input, instanceId);
  if (!target) return planFailure(error('INVENTORY_TARGET_NOT_FOUND', 'topology', { instance_id: instanceId ?? null }));
  const current = target.placement;
  if (!current) return planFailure(error('INVENTORY_PLACEMENT_NOT_FOUND', 'topology', { instance_id: instanceId }));
  let nextPlacement;
  if (operation === 'put_down') {
    if (!text(input.current_g5_anchor_id)) return planFailure(error('INVENTORY_DROP_ANCHOR_MISSING', 'topology', { instance_id: instanceId }));
    nextPlacement = { party_id: input.party_id, [target.key]: instanceId, anchor_id: input.current_g5_anchor_id };
  } else if (operation === 'pick_up' || operation === 'take_from_container') {
    if (operation === 'take_from_container' && !current.container_id && !current.parent_container_id) return planFailure(error('INVENTORY_ACCESS_DENIED', 'topology', { instance_id: instanceId }));
    if (target.kind === 'item' && current.container_id) {
      const access = resolveInventoryAccess({ ...input, item_id: instanceId });
      if (!access.pass || access.access?.tier === 'closed' || access.access?.tier === 'unavailable') return planFailure(access.errors?.[0] ?? error('INVENTORY_ACCESS_DENIED', 'topology', { instance_id: instanceId }));
    }
    nextPlacement = { party_id: input.party_id, [target.key]: instanceId, holder_character_id: input.actor_id, physical_position: 'hands' };
  } else if (operation === 'move_to_container' || operation === 'move_to_quick_container' || operation === 'move_to_primary_container') {
    const containerId = operation === 'move_to_container' ? text(input.target_container_id) : carriedContainerId(input, operation === 'move_to_quick_container' ? 'quick_container' : 'primary_container');
    const destination = list(input.containers).find((value) => value.container_id === containerId);
    if (!destination || destination.container_id === instanceId) return planFailure(error('INVENTORY_CONTAINER_NOT_FOUND', 'topology', { container_id: containerId || null }));
    nextPlacement = target.kind === 'item'
      ? { party_id: input.party_id, item_id: instanceId, container_id: containerId }
      : { party_id: input.party_id, container_id: instanceId, parent_container_id: containerId };
  } else if (operation === 'equip') {
    if (target.kind !== 'item') return planFailure(error('INVENTORY_ACCESS_DENIED', 'topology', { instance_id: instanceId, reason: 'container_cannot_equip' }));
    const slot = text(input.equipment_slot_id);
    if (!slot) return planFailure(error('INVENTORY_EQUIPMENT_SLOT_REQUIRED', 'topology', { item_id: instanceId }));
    nextPlacement = { party_id: input.party_id, item_id: instanceId, holder_character_id: input.actor_id, physical_position: 'equipped', equipment_slot_id: slot };
  } else {
    if (target.kind !== 'item' || current.holder_character_id !== input.actor_id || current.physical_position !== 'equipped') return planFailure(error('INVENTORY_ACCESS_DENIED', 'topology', { instance_id: instanceId }));
    const physicalPosition = ['hands', 'worn_quick', 'external_load'].includes(input.target_physical_position) ? input.target_physical_position : null;
    if (!physicalPosition) return planFailure(error('INVENTORY_ACCESS_DENIED', 'topology', { instance_id: instanceId, reason: 'target_position_required' }));
    nextPlacement = { party_id: input.party_id, item_id: instanceId, holder_character_id: input.actor_id, physical_position: physicalPosition };
  }
  const next = replacePlacement(input, target, nextPlacement);
  const validation = validatePlanAfter(next, target.kind === 'item' && nextPlacement.container_id ? nextPlacement.container_id : target.kind === 'container' && nextPlacement.parent_container_id ? nextPlacement.parent_container_id : null);
  if (!validation.pass) return planFailure(validation.error);
  return planSuccess({ placement_changes: [deepFreeze({ instance_kind: target.kind, ...nextPlacement })], quantity_changes: [], container_state_changes: [], ownership_changes: [] }, input, validation.mass, validation.hands, validation.load, { operation, previous_placement: structuredClone(current), next_placement: structuredClone(nextPlacement) });
}

function planDropPrimary(input, containerId) {
  const container = list(input.containers).find((value) => value.container_id === containerId);
  const placement = findPlacement(input.container_placements, 'container_id', containerId);
  const profile = profileFor(input.container_profiles, container?.template_id);
  if (!container || profile?.inventory_role !== 'primary_container' || placement?.holder_character_id !== input.actor_id) return planFailure(error('INVENTORY_CONTAINER_NOT_FOUND', 'topology', { container_id: containerId }));
  if (!text(input.current_g5_anchor_id)) return planFailure(error('INVENTORY_DROP_ANCHOR_MISSING', 'topology', { container_id: containerId }));
  const next = { ...input, container_placements: list(input.container_placements).map((entry) => entry.container_id === containerId ? { party_id: input.party_id, container_id: containerId, anchor_id: input.current_g5_anchor_id } : structuredClone(entry)) };
  const validation = validatePlanAfter(next);
  if (!validation.pass) return planFailure(validation.error);
  return planSuccess({ placement_changes: [deepFreeze({ instance_kind: 'container', container_id: containerId, anchor_id: input.current_g5_anchor_id })], quantity_changes: [], container_state_changes: [], ownership_changes: [] }, input, validation.mass, validation.hands, validation.load, { operation: 'drop_primary_container', previous_placement: structuredClone(placement), next_anchor_id: input.current_g5_anchor_id });
}

function planRecoverPrimary(input, containerId) {
  const container = list(input.containers).find((value) => value.container_id === containerId);
  const placement = findPlacement(input.container_placements, 'container_id', containerId);
  const profile = profileFor(input.container_profiles, container?.template_id);
  if (!container || profile?.inventory_role !== 'primary_container' || placement?.anchor_id !== input.current_g5_anchor_id) return planFailure(error('INVENTORY_ACCESS_DENIED', 'topology', { container_id: containerId }));
  const next = { ...input, container_placements: list(input.container_placements).map((entry) => entry.container_id === containerId ? { party_id: input.party_id, container_id: containerId, holder_character_id: input.actor_id, physical_position: 'worn' } : structuredClone(entry)) };
  const validation = validatePlanAfter(next);
  if (!validation.pass) return planFailure(validation.error);
  return planSuccess({ placement_changes: [deepFreeze({ instance_kind: 'container', container_id: containerId, holder_character_id: input.actor_id, physical_position: 'worn' })], quantity_changes: [], container_state_changes: [], ownership_changes: [] }, input, validation.mass, validation.hands, validation.load, { operation: 'recover_primary_container' });
}

function planSuccess(changeSet, input, mass, hands, load, trace) {
  return deepFreeze({ pass: true, change_set: deepFreeze(structuredClone(changeSet)), derived_after: deepFreeze({ total_mass_grams: mass.total_mass_grams, load_category: load.load_category, hands_used: hands.hands_used, hands_free: hands.hands_free }), trace: deepFreeze(structuredClone(trace)), errors: [] });
}
function planFailure(first) { return deepFreeze({ pass: false, errors: [first] }); }
function inventoryTarget(input, instanceId) {
  const item = list(input.items).find((value) => value.item_id === instanceId);
  if (item) return { kind: 'item', key: 'item_id', placement: findPlacement(input.item_placements, 'item_id', instanceId) };
  const container = list(input.containers).find((value) => value.container_id === instanceId);
  return container ? { kind: 'container', key: 'container_id', placement: findPlacement(input.container_placements, 'container_id', instanceId) } : null;
}
function replacePlacement(input, target, nextPlacement) {
  const field = target.kind === 'item' ? 'item_placements' : 'container_placements';
  const key = target.key;
  return { ...input, [field]: list(input[field]).map((entry) => entry?.[key] === nextPlacement[key] ? nextPlacement : structuredClone(entry)) };
}
function carriedContainerId(input, role) {
  const matches = list(input.containers).filter((container) => profileFor(input.container_profiles, container.template_id)?.inventory_role === role && findPlacement(input.container_placements, 'container_id', container.container_id)?.holder_character_id === input.actor_id);
  return matches.length === 1 ? matches[0].container_id : null;
}
function validatePlanAfter(next, affectedContainerId = null) {
  const topology = validateInventoryTopology(next);
  if (!topology.pass) return { pass: false, error: topology.errors[0] };
  if (affectedContainerId) {
    const usage = calculateContainerUsage({ ...next, container_id: affectedContainerId });
    if (!usage.pass) return { pass: false, error: usage.errors[0] };
  }
  const mass = calculateInventoryMass(next);
  const hands = calculateHandsState(next);
  if (!mass.pass || !hands.pass) return { pass: false, error: mass.errors[0] ?? hands.errors[0] };
  const load = resolveInventoryLoad({ total_mass_grams: mass.total_mass_grams, strength: next.strength });
  if (!load.pass) return { pass: false, error: load.errors[0] };
  if (load.load_category === 'overloaded') return { pass: false, error: error('INVENTORY_LOAD_EXCEEDED', 'capacity', { total_mass_grams: mass.total_mass_grams, strength: next.strength }) };
  return { pass: true, mass, hands, load };
}
function containerChain(input, containerId) {
  const containers = [];
  const seen = new Set();
  let current = containerId;
  while (current) {
    if (seen.has(current)) return { pass: false, containers: [], errors: [error('INVENTORY_CYCLE_DETECTED', 'topology', { container_id: current })] };
    seen.add(current);
    const container = list(input.containers).find((value) => value.container_id === current);
    const placement = findPlacement(input.container_placements, 'container_id', current);
    if (!container || !placement) return { pass: false, containers: [], errors: [error('INVENTORY_CONTAINER_NOT_FOUND', 'topology', { container_id: current })] };
    containers.push(container);
    current = placement.parent_container_id ?? null;
  }
  return { pass: true, containers, errors: [] };
}
function accessResult(tier, steps) { return deepFreeze({ pass: true, access: deepFreeze({ tier, steps: deepFreeze([...steps]) }), errors: [] }); }
function result(errors, topology) { return deepFreeze({ pass: errors.length === 0, errors, topology: deepFreeze(topology) }); }
function error(code, category, details = {}) { return deepFreeze({ code, category, retryable: false, message: code, details: deepFreeze(structuredClone(details)) }); }
function placementMap(values, key, knownIds, errors) {
  const map = new Map();
  for (const placement of values) {
    const id = placement?.[key];
    if (!knownIds.has(id)) errors.push(error('INVENTORY_PLACEMENT_NOT_FOUND', 'topology', { [key]: id ?? null }));
    if (map.has(id)) errors.push(error('INVENTORY_PLACEMENT_AMBIGUOUS', 'topology', { [key]: id }));
    else map.set(id, placement);
  }
  return map;
}
function uniqueIds(values, key, errors, code) {
  const ids = new Set();
  for (const value of values) {
    const id = value?.[key];
    if (!text(id) || ids.has(id)) errors.push(error(code, 'topology', { [key]: id ?? null }));
    else ids.add(id);
  }
  return ids;
}
function validateParty(value, partyId, errors) { if (value?.party_id && partyId && value.party_id !== partyId) errors.push(error('INVENTORY_PLACEMENT_NOT_FOUND', 'topology', { party_id: value.party_id })); }
function validateCharacterPhysicalPlacement(placement, errors) {
  const position = placement?.physical_position;
  const slot = placement?.equipment_slot_id ?? placement?.equipment_slot_category_id;
  if (placement?.holder_character_id || placement?.holder_npc_id) {
    if (!PHYSICAL_POSITIONS.has(position)) errors.push(error('INVENTORY_PHYSICAL_POSITION_REQUIRED', 'topology', { physical_position: position ?? null }));
    if (position === 'equipped' && !text(slot)) errors.push(error('INVENTORY_EQUIPMENT_SLOT_REQUIRED', 'topology', {}));
    if (text(slot) && position !== 'equipped') errors.push(error('INVENTORY_EQUIPMENT_SLOT_INVALID', 'topology', { physical_position: position ?? null }));
  } else if (position != null || text(slot)) errors.push(error('INVENTORY_PHYSICAL_POSITION_INVALID', 'topology', { physical_position: position ?? null }));
}
function mechanics(instance, profiles, errors) {
  const resolved = resolveInventoryMechanicsProfile({ instance, profiles });
  if (!resolved.pass && resolved.source !== 'authored_profile') {
    errors.push(...resolved.errors);
    return null;
  }
  return resolved;
}
function profileFor(collection, templateId) { return Array.isArray(collection) ? collection.find((value) => value?.template_id === templateId) ?? null : collection?.[templateId] ?? null; }
function findPlacement(values, key, id) { return list(values).find((value) => value?.[key] === id) ?? null; }
function list(value) { return Array.isArray(value) ? value : []; }
function text(value) { return String(value ?? '').trim(); }
