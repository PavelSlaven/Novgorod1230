import { deepFreeze } from '@rus/kernel';
import { calculatePackingSlots } from './packing-slots.js';
import { calculateContainerUsage } from './inventory-container-usage.js';
import { calculateInventoryMass } from './inventory.js';
import { createRuntimeInstanceMechanicsSnapshot } from
  './runtime-instance-mechanics.js';

export function validateOrdinaryContainerContentsMechanics(input = {}) {
  const snapshot = snapshotJson(input);
  if (!snapshot) return failed('ITEM_ORDINARY_CONTAINER_MECHANICS_INPUT_INVALID');
  const inventory = snapshot.inventory_input;
  const items = snapshot.proposed_items;
  if (!plain(inventory) || !Array.isArray(items)
      || typeof snapshot.container_id !== 'string'
      || snapshot.container_id.length === 0) {
    return failed('ITEM_ORDINARY_CONTAINER_MECHANICS_INPUT_INVALID');
  }
  const existingIds = new Set((inventory.items ?? []).map(({ item_id: id }) => id));
  for (const item of items) {
    if (!plain(item) || !text(item.item_id) || existingIds.has(item.item_id)
        || item.template_id !== null || item.quantity !== 1
        || item.placement?.container_id !== snapshot.container_id) {
      return failed('ITEM_ORDINARY_CONTAINER_MECHANICS_INPUT_INVALID');
    }
    try {
      createRuntimeInstanceMechanicsSnapshot(
        item.runtime_mechanics_snapshot);
    } catch (cause) {
      return failed(cause?.code ?? 'ITEM_RUNTIME_MECHANICS_SNAPSHOT_INVALID');
    }
    existingIds.add(item.item_id);
  }
  const next = {
    ...inventory,
    items: [...(inventory.items ?? []), ...items.map((item) => ({
      item_id: item.item_id,
      template_id: null,
      quantity: 1,
      runtime_instance_mechanics_snapshot:
        item.runtime_mechanics_snapshot
    }))],
    item_placements: [
      ...(inventory.item_placements ?? []),
      ...items.map((item) => ({
        party_id: inventory.party_id,
        item_id: item.item_id,
        container_id: snapshot.container_id
      }))
    ]
  };
  const usage = calculateContainerUsage({
    ...next,
    container_id: snapshot.container_id,
    packing_calculator: calculatePackingSlots
  });
  const mass = calculateInventoryMass(next);
  const errors = [...usage.errors, ...mass.errors];
  return deepFreeze({
    pass: errors.length === 0,
    used_slots: usage.used_slots,
    remaining_slots: usage.remaining_slots,
    total_mass_grams: mass.total_mass_grams,
    errors: errors.map((entry) => structuredClone(entry))
  });
}

function failed(code) {
  return deepFreeze({ pass: false, used_slots: null, remaining_slots: null,
    total_mass_grams: null, errors: [{ code, category: 'data_gap',
      retryable: false, message: code, details: {} }] });
}
function snapshotJson(value) {
  const seen = new WeakSet();
  function visit(input) {
    if (input === null || typeof input === 'string'
        || typeof input === 'boolean') return input;
    if (typeof input === 'number') return Number.isFinite(input)
      ? input : invalid;
    if (!input || typeof input !== 'object' || seen.has(input)
        || Object.getOwnPropertySymbols(input).length > 0) return invalid;
    const array = Array.isArray(input);
    if (Object.getPrototypeOf(input)
        !== (array ? Array.prototype : Object.prototype)) return invalid;
    const names = Object.getOwnPropertyNames(input);
    if (array && (names.length !== input.length + 1
        || !names.includes('length'))) return invalid;
    seen.add(input);
    const output = array ? [] : {};
    for (const key of names) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
        return invalid;
      }
      if (array && key !== String(output.length)) return invalid;
      const child = visit(descriptor.value);
      if (child === invalid) return invalid;
      if (array) output.push(child); else output[key] = child;
    }
    return output;
  }
  const invalid = Object.freeze({});
  const result = visit(value);
  return result === invalid ? null : result;
}
function plain(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}
function text(value) {
  return typeof value === 'string' && value.length > 0
    && value.trim() === value;
}
