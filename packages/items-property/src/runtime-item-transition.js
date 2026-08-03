import { deepFreeze } from '@rus/kernel';
import { resolveInventoryLoad } from './inventory-load.js';
import {
  runtimeItemContentsAreOpen as contentsOpenAndAccessible,
  runtimeItemRecordIsConcealed as recordBlocked
} from './runtime-item-visibility.js';
export {
  admitAuthoredItemPlacementTransition,
  applyRuntimeContainerAccess,
  authoredItemPlacementSourceProof,
  planRuntimeContainerAccess
} from './runtime-container-access.js';

export function normalizeRuntimeItemPlacement({ placement, actor_id: actorId,
  current_location_ref: currentLocationRef, entity_ref: entityRef,
  visible_items: visibleItems, incoming_mechanics: incomingMechanics,
  resolve_mechanics: resolveMechanics } = {}) {
  if (!plain(placement) || !exactText(placement.relation)
      || !exactText(placement.target_ref)) {
    return failedPlacement('ITEM_RUNTIME_PLACEMENT_INVALID');
  }
  const targetRef = placement.target_ref;
  if (placement.relation === 'held_by' || placement.relation === 'worn_by') {
    if (targetRef !== actorId) {
      return failedPlacement('ITEM_RUNTIME_PLACEMENT_ACTOR_INVALID');
    }
    return placed({
      holder_character_id: actorId,
      physical_position: placement.relation === 'held_by' ? 'hands' : 'worn'
    });
  }
  if (placement.relation === 'located_at') {
    return targetRef === currentLocationRef
      ? placed({ location_ref: targetRef })
      : failedPlacement('ITEM_RUNTIME_LOCATION_NOT_CURRENT', {
          target_ref: targetRef, current_location_ref: currentLocationRef
        });
  }
  const items = Array.isArray(visibleItems) ? visibleItems : [];
  const byId = new Map(items.map((item) => [itemRef(item), item])
    .filter(([ref]) => ref));
  const target = byId.get(targetRef);
  if (targetRef === entityRef
      || placement.relation === 'attached_to'
        && chainReaches(targetRef, entityRef, byId)) {
    return failedPlacement('ITEM_RUNTIME_PLACEMENT_CYCLE', {
      entity_ref: entityRef, target_ref: targetRef
    });
  }
  if (!target || !isCurrentVisible(targetRef, byId, actorId,
    currentLocationRef, new Set())) {
    return failedPlacement('ITEM_RUNTIME_PLACEMENT_TARGET_NOT_VISIBLE', {
      target_ref: targetRef
    });
  }
  if (placement.relation === 'attached_to') {
    return placed({ attached_item_id: targetRef });
  }
  if (placement.relation !== 'inside') {
    return failedPlacement('ITEM_RUNTIME_PLACEMENT_INVALID');
  }
  if (!contentsOpenAndAccessible(target)) {
    return failedPlacement('ITEM_RUNTIME_CONTAINER_NOT_OPEN', {
      container_id: targetRef
    });
  }
  if (typeof resolveMechanics !== 'function') {
    return failedPlacement('ITEM_RUNTIME_TOPOLOGY_DATA_GAP');
  }
  const containerMechanics = resolveMechanics(targetRef);
  const incomingSlots = incomingMechanics?.packing_slot_cost;
  if (!Number.isSafeInteger(containerMechanics?.capacity)
      || containerMechanics.capacity < 0
      || !Number.isSafeInteger(containerMechanics?.used_slots)
      || containerMechanics.used_slots < 0
      || containerMechanics.used_slots > containerMechanics.capacity
      || !Number.isSafeInteger(incomingSlots) || incomingSlots < 0) {
    return failedPlacement('ITEM_RUNTIME_TOPOLOGY_DATA_GAP', {
      container_id: targetRef
    });
  }
  const currentPlacement = itemPlacement(byId.get(entityRef));
  const used = containerMechanics.used_slots
    - (currentPlacement?.container_id === targetRef ? incomingSlots : 0);
  if (used < 0) {
    return failedPlacement('ITEM_RUNTIME_TOPOLOGY_DATA_GAP', {
      container_id: targetRef
    });
  }
  if (used + incomingSlots > containerMechanics.capacity) {
    return failedPlacement('ITEM_RUNTIME_CONTAINER_CAPACITY_EXCEEDED', {
      container_id: targetRef,
      capacity: containerMechanics.capacity,
      used_slots: used,
      required_slots: incomingSlots
    });
  }
  return placed({ container_id: targetRef });
}

/**
 * Applies only the exact runtime-instance overlay to an existing canonical
 * inventory read model. Authored inventory remains owned by the normal graph.
 */
export function applyRuntimeInventoryTransition({ inventory, actor_id: actorId,
  strength, item_ref: itemRefValue, before_placement: beforePlacement,
  after_placement: afterPlacement, before_mechanics: beforeMechanics,
  after_mechanics: afterMechanics, runtime_items: runtimeItems } = {}) {
  const grams = inventory?.total_weight?.grams;
  const hands = inventory?.occupied_hands;
  if (!Number.isSafeInteger(grams) || grams < 0
      || !Number.isSafeInteger(hands) || hands < 0 || hands > 2
      || !Number.isSafeInteger(strength) || strength < 0
      || !exactText(itemRefValue) || !Array.isArray(runtimeItems)) {
    return failedTransition('ITEM_RUNTIME_INVENTORY_CONTEXT_DATA_GAP');
  }
  const records = runtimeItems.map((record) => ({
    item_ref: exactText(record?.item_ref),
    placement: plain(record?.placement) ? structuredClone(record.placement) : {},
    mechanics: record?.mechanics
  }));
  if (records.some((record) => !record.item_ref)
      || new Set(records.map((record) => record.item_ref)).size
        !== records.length) {
    return failedTransition('ITEM_RUNTIME_INVENTORY_CONTEXT_DATA_GAP');
  }
  const index = records.findIndex((record) => record.item_ref === itemRefValue);
  if (index < 0) return failedTransition('ITEM_RUNTIME_INVENTORY_ITEM_MISSING');
  const currentMechanics = records[index].mechanics;
  const beforeRecords = records.map((record, recordIndex) =>
    recordIndex === index ? {
      ...record,
      placement: plain(beforePlacement)
        ? structuredClone(beforePlacement) : {},
      mechanics: beforeMechanics ?? currentMechanics ?? afterMechanics
    } : record);
  const afterRecords = records.map((record, recordIndex) =>
    recordIndex === index ? {
      ...record,
      placement: plain(afterPlacement)
        ? structuredClone(afterPlacement) : {},
      mechanics: afterMechanics ?? currentMechanics ?? beforeMechanics
    } : record);
  const before = totals(beforeRecords, actorId);
  const after = totals(afterRecords, actorId);
  if (!before.pass || !after.pass) {
    return failedTransition(before.code ?? after.code
      ?? 'ITEM_RUNTIME_INVENTORY_CONTEXT_DATA_GAP');
  }
  const nextGrams = grams - before.mass + after.mass;
  const nextHands = hands - before.hands + after.hands;
  if (!Number.isSafeInteger(nextGrams) || nextGrams < 0
      || !Number.isSafeInteger(nextHands) || nextHands < 0 || nextHands > 2) {
    return failedTransition('ITEM_RUNTIME_INVENTORY_CAPACITY_INVALID');
  }
  const load = resolveInventoryLoad({
    total_mass_grams: nextGrams,
    strength
  });
  if (!load.pass || load.load_category === 'overloaded') {
    return failedTransition('ITEM_RUNTIME_INVENTORY_LOAD_INVALID', {
      total_mass_grams: nextGrams, strength
    });
  }
  const inventoryRefs = new Set(Array.isArray(inventory.items)
    ? inventory.items : []);
  if (after.carried.has(itemRefValue)) inventoryRefs.add(itemRefValue);
  else inventoryRefs.delete(itemRefValue);
  return deepFreeze({
    pass: true,
    inventory: {
      ...structuredClone(inventory),
      items: [...inventoryRefs],
      total_weight: { grams: nextGrams },
      occupied_hands: nextHands,
      load_category: load.load_category
    },
    errors: []
  });
}

export function projectRuntimeInventoryInstance(item = {}) {
  const output = {
    item_id: item.item_id,
    ...(item.template_id == null ? {} : { template_id: item.template_id }),
    ...(item.quantity == null ? {} : { quantity: item.quantity })
  };
  if (item.runtime_instance_mechanics_snapshot != null) {
    output.runtime_instance_mechanics_snapshot = structuredClone(
      item.runtime_instance_mechanics_snapshot);
  }
  return deepFreeze(output);
}

function totals(records, actorId) {
  const byId = new Map(records.map((record) => [record.item_ref, record]));
  const carried = new Set();
  let mass = 0;
  let hands = 0;
  for (const record of records) {
    const status = carriedBy(record.item_ref, byId, actorId, new Set());
    if (status == null) {
      return { pass: false, code: 'ITEM_RUNTIME_PLACEMENT_CYCLE' };
    }
    if (!status) continue;
    if (record.mechanics == null) continue;
    const itemMass = record.mechanics.mass_grams;
    if (!Number.isSafeInteger(itemMass) || itemMass < 0) {
      return { pass: false, code: 'ITEM_RUNTIME_INVENTORY_CONTEXT_DATA_GAP' };
    }
    carried.add(record.item_ref);
    mass += itemMass;
    if (!Number.isSafeInteger(mass)) {
      return { pass: false, code: 'ITEM_RUNTIME_INVENTORY_CONTEXT_DATA_GAP' };
    }
    if (record.placement?.holder_character_id === actorId
        && ['hands', 'external', 'external_load']
          .includes(record.placement.physical_position)) {
      const handCost = record.mechanics?.external_hand_cost;
      if (![0, 1, 2].includes(handCost)) {
        return { pass: false, code: 'ITEM_RUNTIME_INVENTORY_CONTEXT_DATA_GAP' };
      }
      hands += handCost;
      if (!Number.isSafeInteger(hands)) {
        return { pass: false, code: 'ITEM_RUNTIME_INVENTORY_CONTEXT_DATA_GAP' };
      }
    }
  }
  return { pass: true, mass, hands, carried };
}

function carriedBy(ref, byId, actorId, trail) {
  if (trail.has(ref)) return null;
  trail.add(ref);
  const placement = byId.get(ref)?.placement;
  if (!plain(placement)) return false;
  if (placement.holder_character_id === actorId) return true;
  const hostRef = placement.container_id ?? placement.attached_item_id;
  if (!hostRef) return false;
  if (!byId.has(hostRef)) return false;
  return carriedBy(hostRef, byId, actorId, trail);
}

function isCurrentVisible(ref, byId, actorId, currentLocationRef, trail) {
  if (trail.has(ref)) return false;
  trail.add(ref);
  const item = byId.get(ref);
  if (!item || recordBlocked(item)) return false;
  const placement = itemPlacement(item);
  const hostRef = placement?.container_id ?? placement?.attached_item_id;
  if (hostRef) {
    const host = byId.get(hostRef);
    if (!host || placement.container_id && !contentsOpenAndAccessible(host)) {
      return false;
    }
    return isCurrentVisible(hostRef, byId, actorId, currentLocationRef, trail);
  }
  if (placement?.holder_character_id != null) {
    return placement.holder_character_id === actorId;
  }
  if (placement?.location_ref != null) {
    return placement.location_ref === currentLocationRef;
  }
  return item.visible === true || item.is_visible === true;
}

function chainReaches(startRef, entityRef, byId) {
  const seen = new Set();
  let current = startRef;
  while (current) {
    if (current === entityRef || seen.has(current)) return true;
    seen.add(current);
    current = itemPlacement(byId.get(current))?.attached_item_id ?? null;
  }
  return false;
}

function itemPlacement(item) {
  return plain(item?.placement) ? item.placement : item;
}

function itemRef(item) {
  return exactText(item?.item_id ?? item?.instance_id);
}

function placed(placement) {
  return deepFreeze({ pass: true, placement, errors: [] });
}

function failedPlacement(code, details = {}) {
  return deepFreeze({ pass: false, placement: null, errors: [issue(code, details)] });
}

function failedTransition(code, details = {}) {
  return deepFreeze({ pass: false, inventory: null, errors: [issue(code, details)] });
}

function issue(code, details = {}) {
  const category = code.includes('DATA_GAP') ? 'data_gap'
    : code.includes('CAPACITY') || code.includes('LOAD') ? 'capacity'
      : 'topology';
  return deepFreeze({
    code, category, retryable: false, message: code,
    details: structuredClone(details)
  });
}

function exactText(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value
    ? value
    : '';
}

function plain(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
