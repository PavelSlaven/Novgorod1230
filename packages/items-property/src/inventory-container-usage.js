import { deepFreeze } from '@rus/kernel';
import { resolveInventoryMechanicsProfile } from
  './runtime-instance-mechanics.js';

const CARRY_FORMS = new Set(['compact', 'regular', 'long', 'bulky']);

/**
 * Validates one container against an explicitly injected canonical packing
 * calculator. The domain package never reaches into the catalog layer itself.
 */
export function calculateContainerUsage(input = {}) {
  const container = list(input.containers).find((value) => value.container_id === input.container_id);
  if (!container) return result([error('INVENTORY_CONTAINER_NOT_FOUND', 'topology', { container_id: input.container_id })]);
  const containerResolution = resolveInventoryMechanicsProfile({
    instance: container,
    profiles: input.container_profiles
  });
  if (!containerResolution.pass
      && containerResolution.source !== 'authored_profile') {
    return result(containerResolution.errors);
  }
  const profile = containerResolution.profile;
  const errors = [];
  if (!Number.isInteger(profile?.capacity) || profile.capacity < 1) errors.push(error('CONTAINER_CAPACITY_EXCEEDED', 'data_gap', { container_id: container.container_id, reason: 'capacity_missing' }));
  const packingCalculator = input.packing_calculator;
  if (typeof packingCalculator !== 'function') errors.push(error('INVENTORY_PACKING_CALCULATOR_MISSING', 'data_gap', { container_id: container.container_id }));
  let used = 0;
  for (const item of list(input.items).filter((value) => findPlacement(input.item_placements, 'item_id', value.item_id)?.container_id === container.container_id)) {
    const itemResolution = resolveInventoryMechanicsProfile({
      instance: item,
      profiles: input.item_profiles
    });
    if (!itemResolution.pass
        && itemResolution.source !== 'authored_profile') {
      errors.push(...itemResolution.errors);
      continue;
    }
    const itemProfile = itemResolution.profile;
    validateContainedCarryForm(input, container, itemProfile, item.item_id, errors);
    if (errors.some((entry) => entry.details?.item_id === item.item_id) || typeof packingCalculator !== 'function') continue;
    const packing = packingCalculator({
      quantity: itemResolution.source === 'runtime_instance_snapshot'
        ? 1
        : item.quantity,
      packing_slot_cost: itemProfile?.packing_slot_cost,
      packing_bundle_size: itemProfile?.packing_bundle_size
    });
    if (!packing?.pass) errors.push(error('ITEM_CARRY_PROFILE_DATA_GAP', 'data_gap', { item_id: item.item_id, packing_errors: packing?.errors ?? [] }));
    else used += packing.required_slots;
  }
  for (const child of list(input.containers).filter((value) => findPlacement(input.container_placements, 'container_id', value.container_id)?.parent_container_id === container.container_id)) {
    const childResolution = resolveInventoryMechanicsProfile({
      instance: child,
      profiles: input.container_profiles
    });
    if (!childResolution.pass
        && childResolution.source !== 'authored_profile') {
      errors.push(...childResolution.errors);
      continue;
    }
    const childProfile = childResolution.profile;
    if (!Number.isInteger(childProfile?.packing_slot_cost) || childProfile.packing_slot_cost < 1) errors.push(error('ITEM_CARRY_PROFILE_DATA_GAP', 'data_gap', { container_id: child.container_id }));
    else used += childProfile.packing_slot_cost;
  }
  if (Number.isInteger(profile?.capacity) && used > profile.capacity) errors.push(error('CONTAINER_CAPACITY_EXCEEDED', 'capacity', { container_id: container.container_id, capacity: profile.capacity, used_slots: used }));
  return result(errors, used, profile?.capacity);
}

function validateContainedCarryForm(input, container, itemProfile, itemId, errors) {
  if (!CARRY_FORMS.has(itemProfile?.carry_form)) { errors.push(error('ITEM_CARRY_PROFILE_DATA_GAP', 'data_gap', { item_id: itemId })); return; }
  const compatible = list(input.container_compatibility).some((rule) => rule.container_template_id === container.template_id && rule.carry_form === itemProfile.carry_form && rule.compatibility === 'allowed');
  if ((itemProfile.carry_form === 'long' || itemProfile.carry_form === 'bulky') && !compatible) errors.push(error('INVENTORY_CARRY_FORM_INCOMPATIBLE', 'compatibility', { item_id: itemId, container_id: container.container_id, carry_form: itemProfile.carry_form }));
}
function result(errors, used = null, capacity = null) { return deepFreeze({ pass: errors.length === 0, used_slots: used, remaining_slots: Number.isInteger(capacity) ? Math.max(0, capacity - used) : null, errors }); }
function error(code, category, details = {}) { return deepFreeze({ code, category, retryable: false, message: code, details: deepFreeze(structuredClone(details)) }); }
function list(value) { return Array.isArray(value) ? value : []; }
function findPlacement(values, key, id) { return list(values).find((value) => value?.[key] === id) ?? null; }
