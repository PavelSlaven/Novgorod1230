import { deepFreeze, sha256 } from '@rus/kernel';
import { calculatePackingSlots } from '@rus/world-catalog-workflow';

const ZONES = new Set(['hands', 'worn_quick', 'equipped', 'quick_container', 'primary_container', 'external_load', 'not_carried']);
const CARRY_FORMS = new Set(['compact', 'regular', 'long', 'bulky']);

/**
 * Validates the normalized party-runtime placement graph. It is deliberately
 * pure: SQL protects row-local FK/exactly-one rules; this gate protects paths.
 */
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

  for (const placement of itemPlacements) validateParty(placement, input.party_id, errors);
  for (const placement of containerPlacements) validateParty(placement, input.party_id, errors);
  for (const placement of containerPlacements) {
    if (placement.parent_container_id && !containerIds.has(placement.parent_container_id)) errors.push(error('INVENTORY_CONTAINER_NOT_FOUND', 'topology', { container_id: placement.parent_container_id }));
    if (placement.parent_container_id === placement.container_id) errors.push(error('INVENTORY_CYCLE_DETECTED', 'topology', { container_id: placement.container_id }));
  }
  for (const placement of itemPlacements) if (placement.container_id && !containerIds.has(placement.container_id)) errors.push(error('INVENTORY_CONTAINER_NOT_FOUND', 'topology', { container_id: placement.container_id }));

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
    if (!placement.equipment_slot_id || placement.holder_character_id !== input.actor_id || placement.physical_position !== 'equipped') continue;
    if (slots.has(placement.equipment_slot_id)) errors.push(error('INVENTORY_EQUIPMENT_SLOT_OCCUPIED', 'topology', { equipment_slot_id: placement.equipment_slot_id }));
    slots.set(placement.equipment_slot_id, placement.item_id);
  }
  return result(errors, { item_placements: itemPlacementById, container_placements: containerPlacementById });
}

export function calculateInventoryMass(input = {}) {
  const topology = validateInventoryTopology(input);
  const errors = [...topology.errors];
  if (errors.length > 0) return massResult(errors, null);
  const counted = new Set();
  let total = 0;
  for (const item of list(input.items)) {
    if (!isCarriedItem(input, item.item_id) || counted.has(`item:${item.item_id}`)) continue;
    counted.add(`item:${item.item_id}`);
    const profile = profileFor(input.item_profiles, item.template_id);
    const mass = profile?.mass_grams;
    const itemQuantity = quantity(item.quantity);
    if (!itemQuantity) errors.push(error('INVENTORY_QUANTITY_INVALID', 'data_gap', { item_id: item.item_id, quantity: item.quantity ?? null }));
    else if (!Number.isInteger(mass) || mass < 0) errors.push(error('ITEM_MASS_DATA_GAP', 'data_gap', { item_id: item.item_id, template_id: item.template_id }));
    else total += mass * itemQuantity;
  }
  for (const container of list(input.containers)) {
    if (!isCarriedContainer(input, container.container_id) || counted.has(`container:${container.container_id}`)) continue;
    counted.add(`container:${container.container_id}`);
    const profile = profileFor(input.container_profiles, container.template_id);
    const mass = profile?.mass_grams;
    if (!Number.isInteger(mass) || mass < 0) errors.push(error('ITEM_MASS_DATA_GAP', 'data_gap', { container_id: container.container_id, template_id: container.template_id }));
    else total += mass;
  }
  return massResult(errors, errors.length ? null : total);
}

export function resolveInventoryLoad({ total_mass_grams: totalMass, strength } = {}) {
  const errors = [];
  if (!Number.isInteger(totalMass) || totalMass < 0 || !Number.isInteger(strength) || strength < 0) errors.push(error('ITEM_MASS_DATA_GAP', 'validation', { total_mass_grams: totalMass, strength }));
  if (errors.length) return deepFreeze({ pass: false, load_category: null, at_limit: false, errors });
  const light = strength * 2;
  const moderate = strength * 4;
  const limit = strength * 6;
  const loadCategory = totalMass <= light ? 'light' : totalMass <= moderate ? 'moderate' : totalMass <= limit ? 'heavy' : 'overloaded';
  return deepFreeze({ pass: true, load_category: loadCategory, at_limit: totalMass === limit, errors: [] });
}

export function calculateHandsState(input = {}) {
  const topology = validateInventoryTopology(input);
  const errors = [...topology.errors];
  let used = 0;
  for (const item of list(input.items)) {
    const placement = findPlacement(input.item_placements, 'item_id', item.item_id);
    if (placement?.holder_character_id !== input.actor_id || !['hands', 'external', 'external_load'].includes(placement.physical_position)) continue;
    const profile = profileFor(input.item_profiles, item.template_id);
    if (![0, 1, 2].includes(profile?.external_hand_cost)) errors.push(error('ITEM_CARRY_PROFILE_DATA_GAP', 'data_gap', { item_id: item.item_id }));
    else used += profile.external_hand_cost;
  }
  for (const container of list(input.containers)) {
    const placement = findPlacement(input.container_placements, 'container_id', container.container_id);
    if (placement?.holder_character_id !== input.actor_id || !['hands', 'external', 'external_load'].includes(placement.physical_position)) continue;
    const profile = profileFor(input.container_profiles, container.template_id);
    if (![0, 1, 2].includes(profile?.external_hand_cost)) errors.push(error('ITEM_CARRY_PROFILE_DATA_GAP', 'data_gap', { container_id: container.container_id }));
    else used += profile.external_hand_cost;
  }
  if (used > 2) errors.push(error('INVENTORY_HANDS_EXCEEDED', 'topology', { hands_used: used, hands_total: 2 }));
  return deepFreeze({ pass: errors.length === 0, hands_total: 2, hands_used: used, hands_free: Math.max(0, 2 - used), errors });
}

export function deriveInventoryZone(input = {}) {
  const id = input.instance_id;
  const item = list(input.items).find((value) => value.item_id === id);
  const container = list(input.containers).find((value) => value.container_id === id);
  if (!item && !container) return deepFreeze({ pass: false, zone: null, errors: [error('INVENTORY_ITEM_NOT_FOUND', 'topology', { instance_id: id })] });
  const placement = item ? findPlacement(input.item_placements, 'item_id', id) : findPlacement(input.container_placements, 'container_id', id);
  let zone = 'not_carried';
  if (placement?.holder_character_id === input.actor_id) {
    if (container) {
      const role = profileFor(input.container_profiles, container.template_id)?.inventory_role;
      zone = role === 'primary_container' ? 'primary_container' : role === 'quick_container' ? 'quick_container' : positionZone(placement.physical_position);
    } else zone = positionZone(placement.physical_position);
  }
  return deepFreeze({ pass: ZONES.has(zone), zone, errors: [] });
}

export function resolveInventoryAccess(input = {}) {
  const item = list(input.items).find((value) => value.item_id === input.item_id);
  if (!item || !isCarriedItem(input, item.item_id)) return accessResult('unavailable', []);
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

export function calculateContainerUsage(input = {}) {
  const container = list(input.containers).find((value) => value.container_id === input.container_id);
  if (!container) return deepFreeze({ pass: false, used_slots: null, remaining_slots: null, errors: [error('INVENTORY_CONTAINER_NOT_FOUND', 'topology', { container_id: input.container_id })] });
  const profile = profileFor(input.container_profiles, container.template_id);
  const errors = [];
  if (!Number.isInteger(profile?.capacity) || profile.capacity < 1) errors.push(error('CONTAINER_CAPACITY_EXCEEDED', 'data_gap', { container_id: container.container_id, reason: 'capacity_missing' }));
  let used = 0;
  for (const item of list(input.items).filter((value) => findPlacement(input.item_placements, 'item_id', value.item_id)?.container_id === container.container_id)) {
    const itemProfile = profileFor(input.item_profiles, item.template_id);
    validateContainedCarryForm(input, container, itemProfile, item.item_id, errors);
    if (errors.some((entry) => entry.details?.item_id === item.item_id)) continue;
    const packing = calculatePackingSlots({ quantity: item.quantity, packing_slot_cost: itemProfile?.packing_slot_cost, packing_bundle_size: itemProfile?.packing_bundle_size });
    if (!packing.pass) errors.push(error('ITEM_CARRY_PROFILE_DATA_GAP', 'data_gap', { item_id: item.item_id, packing_errors: packing.errors }));
    else used += packing.required_slots;
  }
  for (const child of list(input.containers).filter((value) => findPlacement(input.container_placements, 'container_id', value.container_id)?.parent_container_id === container.container_id)) {
    const childProfile = profileFor(input.container_profiles, child.template_id);
    if (!Number.isInteger(childProfile?.packing_slot_cost) || childProfile.packing_slot_cost < 1) errors.push(error('ITEM_CARRY_PROFILE_DATA_GAP', 'data_gap', { container_id: child.container_id }));
    else used += childProfile.packing_slot_cost;
  }
  if (Number.isInteger(profile?.capacity) && used > profile.capacity) errors.push(error('CONTAINER_CAPACITY_EXCEEDED', 'capacity', { container_id: container.container_id, capacity: profile.capacity, used_slots: used }));
  return deepFreeze({ pass: errors.length === 0, used_slots: used, remaining_slots: Number.isInteger(profile?.capacity) ? Math.max(0, profile.capacity - used) : null, errors });
}

export function buildInventoryStackSignature(value = {}) {
  const normalized = {
    item_template_id: text(value.item_template_id), condition: text(value.condition), owner_relation: text(value.owner_relation),
    holder_relation: text(value.holder_relation), placement: text(value.placement), legal_status: text(value.legal_status),
    access_state: text(value.access_state), visibility_state: text(value.visibility_state), marks: list(value.marks).map(text).sort(),
    quality: text(value.quality), modifiers: list(value.modifiers).map((entry) => structuredClone(entry)).sort(compareJson)
  };
  return sha256(normalized);
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
function validateContainedCarryForm(input, container, itemProfile, itemId, errors) {
  if (!CARRY_FORMS.has(itemProfile?.carry_form)) { errors.push(error('ITEM_CARRY_PROFILE_DATA_GAP', 'data_gap', { item_id: itemId })); return; }
  const compatible = list(input.container_compatibility).some((rule) => rule.container_template_id === container.template_id && rule.carry_form === itemProfile.carry_form && rule.compatibility === 'allowed');
  if ((itemProfile.carry_form === 'long' || itemProfile.carry_form === 'bulky') && !compatible) errors.push(error('INVENTORY_CARRY_FORM_INCOMPATIBLE', 'compatibility', { item_id: itemId, container_id: container.container_id, carry_form: itemProfile.carry_form }));
}
function isCarriedItem(input, itemId) {
  const placement = findPlacement(input.item_placements, 'item_id', itemId);
  return placement?.holder_character_id === input.actor_id || Boolean(placement?.container_id && isCarriedContainer(input, placement.container_id));
}
function isCarriedContainer(input, containerId, seen = new Set()) {
  if (seen.has(containerId)) return false;
  seen.add(containerId);
  const placement = findPlacement(input.container_placements, 'container_id', containerId);
  return placement?.holder_character_id === input.actor_id || Boolean(placement?.parent_container_id && isCarriedContainer(input, placement.parent_container_id, seen));
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
function massResult(errors, total) { return deepFreeze({ pass: errors.length === 0, total_mass_grams: total, errors }); }
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
function profileFor(collection, templateId) { return Array.isArray(collection) ? collection.find((value) => value?.template_id === templateId) ?? null : collection?.[templateId] ?? null; }
function findPlacement(values, key, id) { return list(values).find((value) => value?.[key] === id) ?? null; }
function positionZone(position) { return position === 'hands' ? 'hands' : position === 'worn_quick' ? 'worn_quick' : position === 'equipped' ? 'equipped' : position === 'external' || position === 'external_load' ? 'external_load' : 'not_carried'; }
function quantity(value) { return Number.isInteger(value) && value > 0 ? value : null; }
function list(value) { return Array.isArray(value) ? value : []; }
function text(value) { return String(value ?? '').trim(); }
function compareJson(left, right) { return JSON.stringify(left).localeCompare(JSON.stringify(right)); }
