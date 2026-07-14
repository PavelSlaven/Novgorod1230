import { MaterializationError } from './core.js';

export function resolveInstanceReferences(domain) {
  const slots = Object.freeze({
    nodes: slotIndex(domain.g5_nodes, 'g5_node'),
    anchors: slotIndex(domain.g5_anchors, 'g5_anchor'),
    npcs: slotIndex(domain.npcs, 'npc'),
    items: slotIndex(domain.items, 'item'),
    containers: slotIndex(domain.containers, 'container')
  });
  for (const instance of domain.g5_anchors) instance.attributes.g5_node_instance_id = resolveSlot(slots.nodes, instance, 'g5_node_slot_key');
  for (const instance of domain.g5_edges) {
    instance.attributes.from_instance_id = resolveSlot(slots.anchors, instance, 'from_anchor_slot_key');
    instance.attributes.to_instance_id = resolveSlot(slots.anchors, instance, 'to_anchor_slot_key');
  }
  for (const instance of domain.npcs) instance.attributes.anchor_instance_id = resolveSlot(slots.anchors, instance, 'anchor_slot_key');
  for (const instance of domain.containers) resolveContainerPlacement(instance, slots);
  for (const instance of domain.items) resolveItemPlacement(instance, slots);
  for (const instance of domain.schedules) {
    instance.attributes.npc_instance_id = resolveSlot(slots.npcs, instance, 'npc_slot_key');
    if (instance.attributes.g5_node_slot_key != null) instance.attributes.g5_node_instance_id = resolveSlot(slots.nodes, instance, 'g5_node_slot_key');
  }
  for (const instance of domain.relations) {
    instance.attributes.from_npc_instance_id = resolveSlot(slots.npcs, instance, 'from_npc_slot_key');
    instance.attributes.to_npc_instance_id = resolveSlot(slots.npcs, instance, 'to_npc_slot_key');
  }
  for (const instance of domain.ownership) resolveOwnership(instance, slots);
  return domain;
}

export function resolvePlayerStartPosition(domain, g4Id, startAnchorSlotKey) {
  if (typeof startAnchorSlotKey !== 'string' || !startAnchorSlotKey.trim()) throw referenceError(null, 'player_start_anchor_slot_key');
  const anchor = resolveRecord(slotIndex(domain.g5_anchors, 'g5_anchor'), startAnchorSlotKey, null, 'player_start_anchor_slot_key');
  return Object.freeze({ g4_id: g4Id, g5_node_id: anchor.attributes.g5_node_instance_id, g5_anchor_id: anchor.instance_id });
}

function resolveContainerPlacement(instance, slots) {
  const attributes = instance.attributes;
  const targets = ['anchor_slot_key', 'parent_container_slot_key', 'holder_npc_slot_key', 'holder_character_id'].filter((key) => attributes[key] != null);
  if (targets.length !== 1) throw referenceError(instance, 'container placement');
  if (attributes.anchor_slot_key != null) attributes.anchor_instance_id = resolveSlot(slots.anchors, instance, 'anchor_slot_key');
  if (attributes.parent_container_slot_key != null) attributes.parent_container_instance_id = resolveSlot(slots.containers, instance, 'parent_container_slot_key');
  if (attributes.holder_npc_slot_key != null) attributes.holder_npc_instance_id = resolveSlot(slots.npcs, instance, 'holder_npc_slot_key');
}

function resolveItemPlacement(instance, slots) {
  const placement = instance.attributes?.placement;
  if (!placement || typeof placement !== 'object' || Array.isArray(placement)) throw referenceError(instance, 'placement');
  const targets = ['anchor_slot_key', 'container_slot_key', 'holder_npc_slot_key', 'holder_character_id'].filter((key) => placement[key] != null);
  if (targets.length !== 1) throw referenceError(instance, 'placement target');
  if (placement.anchor_slot_key != null) placement.anchor_instance_id = resolveRecord(slots.anchors, placement.anchor_slot_key, instance, 'placement.anchor_slot_key').instance_id;
  if (placement.container_slot_key != null) placement.container_instance_id = resolveRecord(slots.containers, placement.container_slot_key, instance, 'placement.container_slot_key').instance_id;
  if (placement.holder_npc_slot_key != null) placement.holder_npc_instance_id = resolveRecord(slots.npcs, placement.holder_npc_slot_key, instance, 'placement.holder_npc_slot_key').instance_id;
}

function resolveOwnership(instance, slots) {
  const attributes = instance.attributes;
  const targets = ['item_slot_key', 'container_slot_key'].filter((key) => attributes[key] != null);
  const owners = ['owner_npc_slot_key', 'owner_character_id', 'owner_party'].filter((key) => key === 'owner_party' ? attributes[key] === true : attributes[key] != null);
  if (targets.length !== 1 || owners.length !== 1) throw referenceError(instance, 'ownership target and owner');
  if (attributes.item_slot_key != null) attributes.item_instance_id = resolveSlot(slots.items, instance, 'item_slot_key');
  if (attributes.container_slot_key != null) attributes.container_instance_id = resolveSlot(slots.containers, instance, 'container_slot_key');
  if (attributes.owner_npc_slot_key != null) attributes.owner_npc_instance_id = resolveSlot(slots.npcs, instance, 'owner_npc_slot_key');
  if (attributes.controller_npc_slot_key != null) attributes.controller_npc_instance_id = resolveSlot(slots.npcs, instance, 'controller_npc_slot_key');
}

function slotIndex(instances, domain) {
  const index = new Map();
  for (const instance of instances) {
    const values = index.get(instance.slot_key) ?? [];
    values.push(instance);
    index.set(instance.slot_key, values);
  }
  return index;
}

function resolveSlot(index, instance, key) { return resolveRecord(index, instance.attributes?.[key], instance, key).instance_id; }
function resolveRecord(index, slotKey, instance, key) {
  if (typeof slotKey !== 'string' || !slotKey.trim()) throw referenceError(instance, key);
  const records = index.get(slotKey);
  if (records?.length !== 1) throw new MaterializationError('MATERIALIZATION_SLOT_REFERENCE_AMBIGUOUS', `Approved ${instance?.domain ?? 'catalog'} reference ${key} resolved to ${records?.length ?? 0} instances.`, { instance_id: instance?.instance_id ?? null, candidate_id: instance?.candidate_id ?? null, key, slot_key: slotKey, count: records?.length ?? 0 });
  return records[0];
}
function referenceError(instance, key) {
  return new MaterializationError('MATERIALIZATION_SLOT_REFERENCE_INVALID', `Approved ${instance?.domain ?? 'catalog'} candidate requires an unambiguous ${key}.`, { instance_id: instance?.instance_id ?? null, candidate_id: instance?.candidate_id ?? null, key });
}
