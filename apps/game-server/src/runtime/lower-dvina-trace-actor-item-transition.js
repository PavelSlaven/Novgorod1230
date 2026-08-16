import { planApprovedActorItemTransition } from '@rus/items-property';
import { buildCommittedInventoryInput } from
  './lower-dvina-trace-committed-inventory.js';

const TURN_STEP_ACTOR_ITEM_TRANSITION = Object.freeze({
  transition_profile_id: 'turn_step_actor_item_move_v1',
  owner_change: 'forbidden',
  required_facts: Object.freeze(['turn_step_move_entity_admitted'])
});

export function committedActorStrengths(state) {
  const strength = state?.player_profile?.attributes?.strength?.value;
  return Number.isFinite(strength) && typeof state?.actor_id === 'string'
    ? Object.freeze({ [state.actor_id]: strength })
    : Object.freeze({});
}

/** Adapts a committed actor-held item move to the common item owner. */
export function planCommittedActorItemMove({
  state, item_id: itemId, destination_placement: destinationPlacement
} = {}) {
  const item = state?.items?.find((entry) =>
    (entry.item_id ?? entry.instance_id) === itemId)
    ?? state?.containers?.find((entry) =>
      (entry.container_id ?? entry.instance_id) === itemId);
  const source = exactActorItemState(item?.placement ?? item,
    item?.ownership);
  const destination = exactActorItemState(destinationPlacement, null, {
    controllerFromHolder: true
  });
  if (!item || !source || !destination) {
    return Object.freeze({
      pass: false,
      errors: [inventoryIssue(
        'APPROVED_TRANSITION_EXACT_STATE_REQUIRED', 'validation',
        { item_id: itemId ?? null })]
    });
  }
  const inventory = buildCommittedInventoryInput(state, {
    actorStrength: null
  });
  return planApprovedActorItemTransition({
    ...inventory,
    strength: null,
    actor_strengths: committedActorStrengths(state),
    item_id: itemId,
    ownership: [...(state.items ?? []), ...(state.containers ?? [])]
      .map((entry) => ({
      ...structuredClone(entry.ownership),
      ...(entry.container_id == null
        ? { item_id: entry.item_id ?? entry.instance_id }
        : { container_id: entry.container_id ?? entry.instance_id })
    })),
    source,
    destination,
    approved_transition: TURN_STEP_ACTOR_ITEM_TRANSITION,
    approved_facts: [...TURN_STEP_ACTOR_ITEM_TRANSITION.required_facts]
  });
}

export function applyCommittedActorItemMove(item, proposal) {
  const next = structuredClone(item);
  next.placement = stripPlannedPlacement(proposal.placement);
  next.ownership = structuredClone(proposal.ownership.next);
  const propertyState = structuredClone(next.state?.property_state ?? {});
  next.state = {
    ...structuredClone(next.state ?? {}),
    property_state: {
      ...propertyState,
      approved_transition_history: [
        ...(propertyState.approved_transition_history ?? []),
        structuredClone(proposal.property_history)
      ]
    }
  };
  return next;
}

function exactActorItemState(placement, ownership, {
  controllerFromHolder = false
} = {}) {
  const npcId = placement?.holder_npc_id;
  const characterId = placement?.holder_character_id;
  const actorId = npcId ?? characterId;
  const actorKind = npcId ? 'npc' : characterId ? 'character' : null;
  const controller = controllerFromHolder ? actorId
    : ownership?.controller_npc_id ?? ownership?.controller_character_id;
  const physicalPosition = placement?.physical_position;
  if (!actorId || !actorKind || !controller || !physicalPosition) return null;
  return {
    actor_id: actorId,
    actor_kind: actorKind,
    controller_actor_id: controller,
    physical_position: physicalPosition,
    ...(placement.equipment_slot_category_id == null ? {} : {
      equipment_slot_category_id: placement.equipment_slot_category_id
    }),
    accessibility: physicalPosition === 'hands' ? 'immediate' : 'quick'
  };
}

function stripPlannedPlacement(value) {
  return {
    ...(value.holder_npc_id == null
      ? {} : { holder_npc_id: value.holder_npc_id }),
    ...(value.holder_character_id == null
      ? {} : { holder_character_id: value.holder_character_id }),
    physical_position: value.physical_position,
    ...(value.equipment_slot_category_id == null ? {} : {
      equipment_slot_category_id: value.equipment_slot_category_id
    })
  };
}

function inventoryIssue(code, category, details) {
  return Object.freeze({
    code,
    category,
    retryable: false,
    message: code,
    details: Object.freeze(structuredClone(details))
  });
}
