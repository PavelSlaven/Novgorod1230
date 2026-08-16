import { sealedCheck } from './first-playable/plan-shared.js';

export function buildActorInstanceRechecks(state, writes) {
  const itemIds = updatedIds(writes, 'party_item_placements');
  const containerIds = updatedIds(writes, 'party_containers');
  return [
    ...(state.items ?? []).filter(({ item_id: itemId }) => itemIds.has(itemId))
      .map((item) => actorInstanceCheck('item', item.item_id, item,
        item.placement))
      .filter(Boolean),
    ...(state.containers ?? []).filter(({ container_id: containerId }) =>
      containerIds.has(containerId))
      .map((container) => actorInstanceCheck('container',
        container.container_id, container, container))
      .filter(Boolean)
  ];
}

function updatedIds(writes, targetTable) {
  return new Set((writes?.updates ?? [])
    .filter(({ target_table: table }) => table === targetTable)
    .map(({ id }) => id));
}

function actorInstanceCheck(kind, instanceId, instance, placement) {
  const ownership = instance?.ownership;
  const holderIds = [placement?.holder_npc_id,
    placement?.holder_character_id].filter(nonEmpty);
  const controllerIds = [ownership?.controller_npc_id,
    ownership?.controller_character_id].filter(nonEmpty);
  if (!nonEmpty(instanceId) || holderIds.length !== 1
      || controllerIds.length !== 1
      || !nonEmpty(placement?.physical_position)) return null;
  return sealedCheck(kind, {
    [`${kind}_id`]: instanceId,
    expected_holder_npc_id: placement.holder_npc_id ?? null,
    expected_holder_character_id: placement.holder_character_id ?? null,
    expected_controller_npc_id: ownership.controller_npc_id ?? null,
    expected_controller_character_id:
      ownership.controller_character_id ?? null,
    expected_condition_state: instance.condition_state ?? null,
    ...(kind === 'container' ? {
      expected_closure_state: instance.closure_state ?? null
    } : {}),
    expected_physical_position: placement.physical_position,
    expected_equipment_slot_category_id:
      placement.equipment_slot_category_id ?? null,
    expected_ownership: ownershipState(ownership)
  });
}

function ownershipState(value) {
  return {
    owner_npc_id: value?.owner_npc_id ?? null,
    owner_character_id: value?.owner_character_id ?? null,
    owner_party: value?.owner_party === true,
    owner_external_ref: structuredClone(value?.owner_external_ref ?? null),
    controller_npc_id: value?.controller_npc_id ?? null,
    controller_character_id: value?.controller_character_id ?? null,
    claim_state: value?.claim_state ?? null
  };
}

function nonEmpty(value) {
  return typeof value === 'string' && value.length > 0;
}
