import { deepFreeze } from '@rus/kernel';
import { resolveInventoryMechanicsProfile } from
  './runtime-instance-mechanics.js';

export function calculateInventoryMassFromTopology(input, topology) {
  const errors = [...topology.errors];
  if (errors.length > 0) return result(errors, null);
  const counted = new Set();
  let total = 0;
  for (const item of list(input.items)) {
    if (!inventoryItemIsCarried(input, item.item_id)
        || counted.has(`item:${item.item_id}`)) continue;
    counted.add(`item:${item.item_id}`);
    const resolution = mechanics(item, input.item_profiles, errors);
    if (!resolution) continue;
    const profile = resolution.profile;
    if (resolution.source === 'runtime_instance_snapshot') {
      total = addMass(total, profile.mass_grams, errors, {
        item_id: item.item_id
      });
      continue;
    }
    const itemQuantity = quantity(item.quantity);
    if (!itemQuantity) errors.push(issue('INVENTORY_QUANTITY_INVALID', {
      item_id: item.item_id, quantity: item.quantity ?? null
    }));
    else if (profile?.quantity_dimension) {
      const expectedUnit = text(profile.quantity_unit_id);
      const actualUnit = text(item.quantity_unit_id);
      if (!expectedUnit || !actualUnit) errors.push(issue(
        'ITEM_QUANTITY_UNIT_REQUIRED', {
          item_id: item.item_id, template_id: item.template_id
        }));
      else if (expectedUnit !== actualUnit) errors.push(issue(
        'ITEM_QUANTITY_UNIT_MISMATCH', {
          item_id: item.item_id, template_id: item.template_id,
          expected_quantity_unit_id: expectedUnit,
          actual_quantity_unit_id: actualUnit
        }, 'validation'));
      else if (!Number.isFinite(profile.mass_grams_per_unit)
          || profile.mass_grams_per_unit <= 0) errors.push(issue(
        'ITEM_MASS_DATA_GAP', {
          item_id: item.item_id, template_id: item.template_id
        }));
      else total = addMassProduct(total, profile.mass_grams_per_unit,
        itemQuantity, errors, { item_id: item.item_id });
    } else if (!Number.isSafeInteger(profile?.mass_grams)
        || profile.mass_grams < 0) errors.push(issue('ITEM_MASS_DATA_GAP', {
      item_id: item.item_id, template_id: item.template_id
    }));
    else total = addMassProduct(total, profile.mass_grams, itemQuantity,
      errors, { item_id: item.item_id });
  }
  for (const container of list(input.containers)) {
    if (!inventoryContainerIsCarried(input, container.container_id)
        || counted.has(`container:${container.container_id}`)) continue;
    counted.add(`container:${container.container_id}`);
    const resolution = mechanics(container, input.container_profiles, errors);
    if (!resolution) continue;
    const mass = resolution.profile?.mass_grams;
    if (!Number.isSafeInteger(mass) || mass < 0) errors.push(issue(
      'ITEM_MASS_DATA_GAP', {
        container_id: container.container_id,
        template_id: container.template_id
      }));
    else total = addMass(total, mass, errors, {
      container_id: container.container_id
    });
  }
  return result(errors, errors.length ? null : total);
}

export function inventoryItemIsCarried(input, itemId, seen = new Set()) {
  if (seen.has(itemId)) return false;
  seen.add(itemId);
  const placement = findPlacement(input.item_placements, 'item_id', itemId);
  return placement?.holder_character_id === input.actor_id
    || Boolean(placement?.container_id
      && inventoryContainerIsCarried(input, placement.container_id))
    || Boolean(placement?.attached_item_id
      && inventoryItemIsCarried(input, placement.attached_item_id, seen));
}

export function inventoryContainerIsCarried(input, containerId,
  seen = new Set()) {
  if (seen.has(containerId)) return false;
  seen.add(containerId);
  const placement = findPlacement(
    input.container_placements, 'container_id', containerId);
  return placement?.holder_character_id === input.actor_id
    || Boolean(placement?.parent_container_id
      && inventoryContainerIsCarried(
        input, placement.parent_container_id, seen));
}

function addMass(total, mass, errors, details) {
  const next = total + mass;
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(mass)
      || mass < 0 || !Number.isSafeInteger(next)) {
    errors.push(issue('ITEM_MASS_SAFE_INTEGER_EXCEEDED', details));
    return total;
  }
  return next;
}

function addMassProduct(total, mass, quantityValue, errors, details) {
  if (!Number.isFinite(mass) || mass < 0
      || !Number.isSafeInteger(quantityValue)) {
    errors.push(issue('ITEM_MASS_SAFE_INTEGER_EXCEEDED', details));
    return total;
  }
  const product = mass * quantityValue;
  if (!Number.isSafeInteger(product)) {
    errors.push(issue('ITEM_MASS_SAFE_INTEGER_EXCEEDED', details));
    return total;
  }
  return addMass(total, product, errors, details);
}

function mechanics(instance, profiles, errors) {
  const resolved = resolveInventoryMechanicsProfile({ instance, profiles });
  if (!resolved.pass && resolved.source !== 'authored_profile') {
    errors.push(...resolved.errors);
    return null;
  }
  return resolved;
}

function result(errors, total) {
  return deepFreeze({
    pass: errors.length === 0,
    total_mass_grams: total,
    errors
  });
}

function issue(code, details, category = 'data_gap') {
  return deepFreeze({
    code, category, retryable: false, message: code,
    details: structuredClone(details)
  });
}

function quantity(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
function findPlacement(values, key, id) {
  return list(values).find((value) => value?.[key] === id) ?? null;
}
function list(value) { return Array.isArray(value) ? value : []; }
function text(value) { return String(value ?? '').trim(); }
