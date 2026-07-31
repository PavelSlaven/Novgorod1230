import { planInventoryTransfer } from '@rus/items-property';
import { serverError } from '../errors.js';
import {
  buildCommittedInventoryInput,
  getCommittedInventoryLoad
} from './lower-dvina-trace-committed-inventory.js';

export function materializeBlueWoolPickup({
  retrievedState: state,
  contracts,
  consequenceRef
}) {
  const clue = contracts.blueWoolClue;
  const transition = contracts.blueWoolPickupTransition;
  const profile = contracts.blueWoolInventoryProfile;
  if (!transition || !profile
      || consequenceRef
        !== transition.trigger.required_successful_consequence_ref) {
    throw serverError(
      'TRACE_PHASE_2_BLUE_WOOL_PICKUP_NOT_ADMITTED',
      'The approved blue-wool pickup transition is unavailable.',
      { status: 409 }
    );
  }
  const pickedUpItem = {
    item_id: clue.instance_id,
    template_id: clue.template_id,
    quantity: 1,
    placement: { anchor_id: transition.source_placement_ref },
    inventory_profile: profile
  };
  const before = getCommittedInventoryLoad(state);
  const inventory = buildCommittedInventoryInput(state, {
    additionalItems: [pickedUpItem]
  });
  const planned = planInventoryTransfer({
    ...inventory,
    operation: 'pick_up',
    item_or_container_id: clue.instance_id,
  });
  const placement = planned.change_set?.placement_changes?.[0];
  const after = getCommittedInventoryLoad(state, {
    additionalItems: [pickedUpItem],
    itemPlacementChanges: planned.change_set?.placement_changes ?? []
  });
  if (!planned.pass
      || !before.mass.pass || !before.hands.pass || !before.load.pass
      || !after.mass.pass || !after.hands.pass || !after.load.pass
      || planned.change_set.placement_changes.length !== 1
      || placement.item_id !== clue.instance_id
      || placement.holder_character_id !== state.actor_id
      || placement.physical_position
        !== transition.destination_state.physical_position
      || planned.derived_after.total_mass_grams
        !== after.mass.total_mass_grams
      || planned.derived_after.hands_used !== after.hands.hands_used
      || after.mass.total_mass_grams - before.mass.total_mass_grams
        !== profile.mass_grams
      || after.hands.hands_used - before.hands.hands_used
        !== profile.external_hand_cost) {
    throw serverError(
      'TRACE_PHASE_2_BLUE_WOOL_PICKUP_REJECTED',
      'The item-property owner rejected the approved pickup transition.',
      { status: 409, details: planned.errors }
    );
  }
  return {
    ...structuredClone(clue),
    profile_id: profile.inventory_profile_id,
    quantity: 1,
    condition_state: 'held_evidence_fragment',
    legal_status: 'owner_preserved_evidence_held',
    property_state: {
      owner_ref: transition.owner_preservation,
      holder_ref: state.actor_id,
      controller_ref: state.actor_id
    },
    placement: {
      holder_character_id: state.actor_id,
      physical_position: transition.destination_state.physical_position
    },
    inventory_profile: structuredClone(profile),
    inventory_effect: {
      mass_delta_grams:
        after.mass.total_mass_grams - before.mass.total_mass_grams,
      hands_used_delta:
        after.hands.hands_used - before.hands.hands_used
    },
    pickup_transition: {
      transition_template_ref: transition.transition_template_id,
      source_placement_ref: transition.source_placement_ref,
      activity_ref: transition.trigger.activity_ref,
      consequence_ref:
        transition.trigger.required_successful_consequence_ref,
      evidence_ref:
        transition.trigger.required_committed_evidence_ref,
      owner_change: transition.owner_change,
      clock_write: transition.clock_write,
      atomic_with_parent_activity_commit:
        transition.atomic_with_parent_activity_commit,
      plan_change_set: structuredClone(planned.change_set),
      plan_trace: structuredClone(planned.trace),
      inventory_before: inventoryProof(before),
      inventory_after: inventoryProof(after)
    }
  };
}

function inventoryProof({ mass, hands, load }) {
  return {
    total_mass_grams: mass.total_mass_grams,
    hands_used: hands.hands_used,
    hands_free: hands.hands_free,
    load_category: load.load_category
  };
}
