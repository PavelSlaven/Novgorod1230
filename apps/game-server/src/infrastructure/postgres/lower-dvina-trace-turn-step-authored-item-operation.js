import { requireAuthoredSourceProof } from
  './lower-dvina-trace-turn-step-authored-writes.js';
import { fail } from './lower-dvina-trace-turn-step-persistence-support.js';
import {
  applyCommittedActorItemMove,
  planCommittedActorItemMove
} from '../../runtime/lower-dvina-trace-actor-item-transition.js';

export function applyAuthoredItemOperation({
  operation, authoredItems, authoredItemRefs, authoredContainers,
  authoredContainerRefs, authoredStateTouched,
  placements, ownerships, state, normalizePlacement
}) {
  const { operation_kind: kind, payload } = operation;
  const authoredRef = payload.entity_ref ?? payload.container_ref;
  const isContainer = authoredContainerRefs.has(authoredRef);
  if (!authoredItemRefs.has(authoredRef) && !isContainer) return false;
  const authored = (isContainer ? authoredContainers : authoredItems)
    .find((item) => (item.item_id ?? item.instance_id) === authoredRef);
  if (kind === 'move_entity') {
    requireAuthoredSourceProof(authored, payload.authored_source);
    const placement = normalizePlacement(payload.placement);
    if (payload.actor_transition != null) {
      const planned = planCommittedActorItemMove({
        state: transitionState(state, authoredItems, authoredContainers),
        item_id: authoredRef,
        destination_placement: placement
      });
      if (!planned.pass) {
        fail(planned.errors[0]?.code
          ?? 'APPROVED_ACTOR_ITEM_TRANSITION_REJECTED',
        planned.errors[0]?.details ?? {});
      }
      Object.assign(authored,
        applyCommittedActorItemMove(authored, planned.proposal));
      authoredStateTouched.add(authoredRef);
      ownerships.add(authoredRef);
    } else {
      authored.placement = placement;
    }
    placements.add(authoredRef);
    if (isContainer) authored.state_version += 1;
    return true;
  }
  if (kind === 'request_container_access') {
    authored.state = {
      ...(authored.state ?? {}),
      ...(payload.state_patch ?? {})
    };
    Object.assign(authored, payload.state_patch ?? {});
    authoredStateTouched.add(authoredRef);
    if (isContainer) authored.state_version += 1;
    return true;
  }
  fail('TRACE_TURN_STEP_MIXED_ITEM_SOURCE', { entity_ref: authoredRef });
}

function transitionState(state, authoredItems, authoredContainers) {
  const authoredById = new Map(authoredItems.map((item) => [
    item.item_id ?? item.instance_id, item
  ]));
  return {
    ...state,
    items: (state.items ?? []).map((item) =>
      authoredById.get(item.item_id ?? item.instance_id) ?? item),
    containers: authoredContainers.map(containerRecord),
    container_placements: authoredContainers.map((container) => ({
      party_id: state.party_id,
      container_id: container.item_id,
      anchor_id: container.placement.anchor_id ?? null,
      parent_container_id: container.placement.container_id ?? null,
      holder_npc_id: container.placement.holder_npc_id ?? null,
      holder_character_id: container.placement.holder_character_id ?? null,
      physical_position: container.placement.physical_position ?? null,
      equipment_slot_category_id:
        container.placement.equipment_slot_category_id ?? null
    }))
  };
}

function containerRecord(container) {
  return {
    ...structuredClone(container),
    container_id: container.item_id,
    anchor_id: container.placement.anchor_id ?? null,
    parent_container_id: container.placement.container_id ?? null,
    holder_npc_id: container.placement.holder_npc_id ?? null,
    holder_character_id: container.placement.holder_character_id ?? null,
    physical_position: container.placement.physical_position ?? null,
    equipment_slot_category_id:
      container.placement.equipment_slot_category_id ?? null
  };
}
