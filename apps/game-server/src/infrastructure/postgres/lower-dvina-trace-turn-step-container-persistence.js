export function authoredTurnStepContainers(containers = []) {
  return containers.map((container) => {
    const placement = container.placement ?? {
      anchor_id: container.anchor_id ?? null,
      container_id: container.parent_container_id ?? null,
      holder_npc_id: container.holder_npc_id ?? null,
      holder_character_id: container.holder_character_id ?? null,
      physical_position: container.physical_position ?? null,
      equipment_slot_category_id:
        container.equipment_slot_category_id ?? null,
      location_ref: container.location_ref
        ?? container.state?.location_ref ?? null,
      zone_ref: container.zone_ref ?? container.state?.zone_ref ?? null
    };
    return {
      ...structuredClone(container), item_id: container.container_id,
      instance_id: container.container_id, instance_kind: 'container',
      placement: structuredClone(placement),
      state_version: Number(container.state_version)
    };
  });
}

export function projectPersistedTurnStepContainers(next, authoredContainers) {
  next.containers = authoredContainers.map(persistedContainer)
    .sort((left, right) => left.container_id.localeCompare(
      right.container_id));
  next.container_placements = next.containers.map((container) => ({
    party_id: next.party_id,
    container_id: container.container_id,
    anchor_id: container.anchor_id ?? null,
    parent_container_id: container.parent_container_id ?? null,
    holder_npc_id: container.holder_npc_id ?? null,
    holder_character_id: container.holder_character_id ?? null,
    physical_position: container.physical_position ?? null,
    equipment_slot_category_id:
      container.equipment_slot_category_id ?? null
  }));
}

function persistedContainer(container) {
  const next = structuredClone(container);
  delete next.item_id;
  delete next.instance_id;
  delete next.instance_kind;
  delete next.placement;
  return {
    ...next, container_id: container.item_id,
    anchor_id: container.placement.anchor_id ?? null,
    parent_container_id: container.placement.container_id ?? null,
    holder_npc_id: container.placement.holder_npc_id ?? null,
    holder_character_id: container.placement.holder_character_id ?? null,
    physical_position: container.placement.physical_position ?? null,
    equipment_slot_category_id:
      container.placement.equipment_slot_category_id ?? null
  };
}
