import { sealedCheck } from './first-playable/plan-shared.js';

export function buildLowerDvinaTracePhase2CommitRechecks({
  partyId,
  state,
  factual,
  contracts,
  inputDigest
}) {
  const placement = contracts.cluePlacementContract;
  const anchor = placement.g5_anchor_binding;
  const existingItemCount = state.items.filter(
    ({ template_id: templateId }) =>
      templateId === placement.item_template_ref
  ).length;
  const exactPickup = contracts.blueWoolPickupTransition != null;
  return [
    sealedCheck('physical', {
      party_id: partyId,
      position_ref: state.position.location_ref
    }),
    sealedCheck('state', {
      party_id: partyId,
      expected_party_state_version: state.party_state.state_version
    }),
    sealedCheck('pin', { activity_pin: contracts.activityPin }),
    sealedCheck('endpoint', { destination_ref: null }),
    sealedCheck('route', { route_binding_ref: null }),
    sealedCheck('capacity', exactPickup ? {
      party_id: partyId
    } : {
      capacity_model: placement.placement_model,
      anchor_id: state.position.g5_anchor_id,
      anchor_template_id: anchor.template_id,
      anchor_slot_key: anchor.slot_key,
      expected_anchor_item_capacity: anchor.expected_item_capacity,
      capacity_contract_ref: anchor.capacity_contract_ref,
      zone_ref: anchor.zone_ref,
      location_ref: placement.location_ref,
      placement_slot_id: placement.placement_slot_ref,
      local_anchor_semantics: placement.local_anchor_semantics,
      item_template_id: placement.item_template_ref,
      item_capacity_class: placement.item_capacity_class,
      placement_slot_capacity: placement.placement_slot_capacity,
      expected_existing_item_count: existingItemCount,
      placement_write_required:
        factual.consequence.clue_materialization != null
    }),
    sealedCheck('time', {
      expected_clock_state_version:
        state.party_state.clock_state_version
    }),
    sealedCheck('change_set', {
      canonical_input_digest: inputDigest
    })
  ];
}
