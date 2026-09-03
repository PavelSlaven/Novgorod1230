import { projectNpcSafeResourceSnapshots } from '@rus/npc-runtime';
import { runtimeItemContentsAreOpen } from '@rus/items-property';
import { initializeRuntimeState } from './lower-dvina-trace-turn-step-item-support.js';
import { getCommittedActorInventoryLoad } from
  './lower-dvina-trace-committed-inventory.js';

export function npcItemWorkingProjection({ workingProjection, state, npc,
  itemRefs, placementTargetRefs = [], runtimeState = initializeRuntimeState(state) }) {
  const npcRef = npc.instance_id;
  const current = structuredClone(workingProjection ?? {});
  if (current.actor_id === npcRef && Array.isArray(current.items)) return {
    ...current, items: npcProjectionItems(current.items, [], itemRefs,
      placementTargetRefs, npcRef, runtimeState, true) };
  const inventory = npcInventory(state, npc);
  if (inventory == null) throw Object.assign(
    new Error('TRACE_PHASE_7_NPC_INVENTORY_DATA_GAP'), {
      code: 'TRACE_PHASE_7_NPC_INVENTORY_DATA_GAP' });
  const position = npcPosition(npc) ?? current.position;
  return { ...current, actor_id: npcRef,
    ...(position == null ? {} : { position }),
    inventory: structuredClone(inventory),
    items: npcProjectionItems(Array.isArray(current.items) ? current.items : [],
      state.items, itemRefs, placementTargetRefs, npcRef, runtimeState) };
}

function npcProjectionItems(items, stateItems, itemRefs, placementTargetRefs,
  npcRef, runtimeState, preserveCurrent = false) {
  const selected = new Map(items.filter((item) => preserveCurrent || itemRefs.includes(
    item.item_id ?? item.instance_id)).map((item) => [item.item_id ?? item.instance_id, item]));
  for (const item of stateItems ?? []) {
    const ref = item.item_id ?? item.instance_id;
    if (itemRefs.includes(ref) && !selected.has(ref)) selected.set(ref, item);
  }
  for (const ref of placementTargetRefs) {
    const target = runtimeState.materializedItems.get(ref);
    if (target != null && !selected.has(ref)) selected.set(ref, target);
  }
  for (const item of [...selected.values()]) for (let ref = item.placement?.container_id;
    ref && !selected.has(ref);) {
    const host = runtimeState.materializedItems.get(ref);
    if (host == null) break;
    selected.set(ref, host);
    ref = host.placement?.container_id;
  }
  return [...selected.values()].map((item) => npcProjectionItem(item, npcRef));
}

function npcProjectionItem(item, npcRef) {
  const placement = item.placement ?? { holder_npc_id: item.holder_npc_id ?? null,
    holder_character_id: item.holder_character_id ?? null,
    container_id: item.container_id ?? null,
    physical_position: item.physical_position ?? null };
  return { ...structuredClone(item), placement: {
    ...structuredClone(placement),
    ...(placement.holder_npc_id === npcRef ? {
      holder_character_id: npcRef, holder_npc_id: null } : {})
  } };
}

function npcInventory(state, npc) {
  try {
    const load = getCommittedActorInventoryLoad(state, npc.instance_id);
    return { total_weight: { grams: load.total_mass_grams },
      occupied_hands: load.hands_used,
      items: (state.items ?? []).filter((item) =>
        item?.holder_npc_id === npc.instance_id
          || item?.placement?.holder_npc_id === npc.instance_id)
        .map(({ item_id, instance_id }) => item_id ?? instance_id),
      load_category: load.load_category };
  } catch { return null; }
}

export function npcPosition(npc) {
  const machine = npc?.machine_state;
  const g6Key = typeof machine?.g6_id === 'string' ? 'g6_id'
    : typeof machine?.g6_ref === 'string' ? 'g6_ref' : null;
  const anchor = npc?.anchor_id ?? machine?.g5_anchor_id ?? machine?.anchor_id;
  if (g6Key == null || typeof machine?.location_ref !== 'string'
      || typeof machine?.spatial_zone_ref !== 'string' || typeof anchor !== 'string') {
    return null;
  }
  return { location_ref: machine.location_ref, zone_ref: machine.spatial_zone_ref,
    g5_anchor_id: anchor, [g6Key]: machine[g6Key] };
}

export function npcSafeItemRefs(state, npc) {
  const items = state?.items ?? [];
  const bound = new Set((state?.local_fire_runtime ?? []).flatMap(
    ({ input_pins = [] }) => input_pins.map(({ item_id }) => item_id)));
  const safe = projectNpcSafeResourceSnapshots({ npc_snapshot: npc,
    resource_snapshots: [...items, ...(state?.containers ?? [])],
    perception_snapshot: npc.perception_snapshot,
    knowledge_snapshot: npc.knowledge_snapshot });
  const itemRefs = new Set(items.map(({ item_id, instance_id }) => item_id ?? instance_id));
  return safe.map(({ resource_ref }) => resource_ref).filter((ref) =>
    itemRefs.has(ref) && !bound.has(ref));
}

export function npcSafeOpenContainerRefs(state, npc) {
  const containers = state?.containers ?? [];
  const safe = new Set(projectNpcSafeResourceSnapshots({ npc_snapshot: npc,
    resource_snapshots: containers, perception_snapshot: npc.perception_snapshot,
    knowledge_snapshot: npc.knowledge_snapshot }).map(({ resource_ref }) => resource_ref));
  return containers.flatMap((container) => {
    const ref = container.container_id ?? container.item_id ?? container.instance_id;
    return safe.has(ref) && runtimeItemContentsAreOpen(container) ? [ref] : [];
  });
}
