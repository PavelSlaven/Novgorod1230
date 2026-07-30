export function assertBlueWoolPickupContract({
  item,
  placement,
  pickupTransition: transition,
  inventoryProfile: profile,
  activity,
  check,
  fail
}) {
  const trigger = transition.trigger;
  const source = transition.source_item_state;
  const destination = transition.destination_state;
  if (item.physically_removable !== true
      || item.placement_slot_ref !== placement.placement_slot_id
      || item.inventory_profile_ref !== profile.inventory_profile_id
      || profile.item_template_ref !== item.item_template_id
      || profile.mass_grams !== 10
      || profile.carry_form !== 'compact'
      || profile.external_hand_cost !== 0
      || source.owner_ref !== 'ratsha_storehouse_helper'
      || source.holder_ref !== null
      || source.controller_ref !== null
      || source.physically_removable !== true
      || transition.source_placement_ref !== placement.placement_slot_id
      || trigger.activity_ref !== activity.profile_id
      || trigger.required_successful_consequence_ref
        !== check.outcome_refs.success
      || trigger.required_committed_evidence_ref
        !== 'trace_ld_v1_evidence_blue_wool'
      || trigger.evidence_discovery_state !== 'committed'
      || destination.holder_ref !== 'player_clerk'
      || destination.controller_ref !== 'player_clerk'
      || destination.physical_position !== 'hands'
      || transition.owner_change !== 'forbidden'
      || transition.owner_preservation !== source.owner_ref
      || transition.inventory_profile_ref !== profile.inventory_profile_id
      || transition.clock_write !== 'forbidden'
      || transition.atomic_with_parent_activity_commit !== true
      || transition.idempotency_policy
        !== 'inherit_parent_turn_exact_replay'
      || transition.failure_pickup !== 'forbidden'
      || transition.repeat_application !== 'forbidden') {
    throw fail('TRACE_PHASE_2_BLUE_WOOL_PICKUP_CONTRACT_GAP');
  }
}
