import {
  fail,
  text
} from './lower-dvina-trace-turn-step-runtime-common.js';

export function hydrateAuthoredContainers(committedState, state) {
  const placementById = new Map(
    (committedState.container_placements ?? []).map((placement) => [
      placement.container_id, placement
    ]));
  for (const container of committedState.containers ?? []) {
    const containerId = text(container?.container_id ?? container?.instance_id);
    if (!containerId) fail('TRACE_TURN_STEP_COMMITTED_CONTAINER_INVALID');
    const placement = placementById.get(containerId) ?? container;
    const accessState = container.state?.access_state
      ?? container.access_state;
    const visibilityState = container.state?.visibility_state
      ?? container.visibility_state;
    const authored = {
      ...structuredClone(container), item_id: containerId,
      instance_id: containerId, instance_kind: 'container',
      ...(container.state?.ordinary_contents_context == null ? {} : {
        commit_state: 'committed',
        mechanics_profile_ref:
          container.state.ordinary_contents_context.mechanics_profile_ref,
        ordinary_contents_context: structuredClone(
          container.state.ordinary_contents_context),
        contents_state: container.state.contents_state
          ?? container.contents_state ?? 'contents_hidden',
        ...(accessState === undefined ? {} : { access_state: accessState }),
        ...(visibilityState === undefined ? {} : {
          visibility_state: visibilityState
        })
      }),
      placement: {
        holder_character_id: placement.holder_character_id
          ?? container.holder_character_id
          ?? container.state?.holder_character_id ?? null,
        holder_npc_id: placement.holder_npc_id ?? container.holder_npc_id
          ?? container.state?.holder_npc_id ?? null,
        physical_position: placement.physical_position
          ?? container.physical_position ?? null,
        equipment_slot_category_id: placement.equipment_slot_category_id
          ?? container.equipment_slot_category_id ?? null,
        anchor_id: placement.anchor_id ?? container.anchor_id
          ?? container.state?.anchor_id ?? null,
        container_id: placement.parent_container_id
          ?? container.parent_container_id ?? null,
        location_ref: placement.location_ref ?? container.location_ref
          ?? container.state?.location_ref ?? null,
        zone_ref: container.zone_ref ?? container.state?.zone_ref ?? null
      }
    };
    state.materializedItems.set(containerId, authored);
    state.authoredContainers.set(containerId, authored);
  }
}

export function projectCurrentCommittedContainers(state) {
  const containers = (state.committedState.containers ?? []).map((container) => {
    const containerId = container.container_id ?? container.instance_id;
    const current = state.authoredContainers.get(containerId);
    if (!current) return structuredClone(container);
    return {
      ...structuredClone(container),
      ...placementFields(current.placement, true),
      ownership: structuredClone(current.ownership ?? container.ownership),
      state: structuredClone(current.state ?? container.state ?? {})
    };
  });
  return {
    containers,
    container_placements: containers.map((container) => ({
      party_id: state.committedState.party_id,
      container_id: container.container_id,
      ...placementFields(container)
    }))
  };
}

function placementFields(value = {}, itemLike = false) {
  return {
    anchor_id: value.anchor_id ?? null,
    parent_container_id: itemLike ? value.container_id ?? null
      : value.parent_container_id ?? null,
    holder_npc_id: value.holder_npc_id ?? null,
    holder_character_id: value.holder_character_id ?? null,
    physical_position: value.physical_position ?? null,
    equipment_slot_category_id:
      value.equipment_slot_category_id ?? null
  };
}
