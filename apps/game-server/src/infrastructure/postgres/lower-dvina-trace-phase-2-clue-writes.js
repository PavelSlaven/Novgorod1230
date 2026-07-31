import { row } from './first-playable/plan-shared.js';

export function appendPhase2Clue({ inserts, state, clue, partyId }) {
  if (!clue || state.items.some(
    (item) => item.template_id === clue.template_id
  )) return;
  const exactPickup = Boolean(clue.pickup_transition);
  inserts.push(row('party_items', clue.instance_id, {
    party_id: partyId,
    item_id: clue.instance_id,
    run_id: state.materialization_trace.run_id,
    template_id: clue.template_id,
    profile_id: exactPickup ? clue.profile_id : clue.template_id,
    category_id: clue.semantic_category,
    quantity: exactPickup ? clue.quantity : 1,
    condition_state:
      exactPickup ? clue.condition_state : 'observed_in_place',
    legal_status:
      exactPickup ? clue.legal_status : 'evidence_not_transferred',
    state: exactPickup ? {
      semantic_category: clue.semantic_category,
      property_state: structuredClone(clue.property_state),
      causal_basis: clue.causal_basis,
      evidence_ref: 'trace_ld_v1_evidence_blue_wool',
      inventory_profile_snapshot:
        structuredClone(clue.inventory_profile),
      inventory_effect: structuredClone(clue.inventory_effect),
      pickup_transition: structuredClone(clue.pickup_transition)
    } : {
      semantic_category: clue.semantic_category,
      property_state: clue.property_state,
      causal_basis: clue.causal_basis,
      evidence_ref: 'trace_ld_v1_evidence_blue_wool',
      placement_contract: clue.placement
    }
  }));
  inserts.push(row('party_item_placements', clue.instance_id, {
    party_id: partyId,
    item_id: clue.instance_id,
    anchor_id: exactPickup ? null : clue.placement.anchor_id,
    container_id: null,
    holder_npc_id: null,
    holder_character_id:
      exactPickup ? clue.placement.holder_character_id : null,
    physical_position:
      exactPickup ? clue.placement.physical_position : null,
    equipment_slot_category_id: null
  }));
  if (!exactPickup) return;
  inserts.push(row('party_ownership',
    `ownership:${clue.instance_id}`, {
      party_id: partyId,
      ownership_id: `ownership:${clue.instance_id}`,
      item_id: clue.instance_id,
      container_id: null,
      owner_npc_id: null,
      owner_character_id: null,
      owner_party: false,
      owner_external_ref: {
        entity_kind: 'participant_slot',
        entity_id: clue.property_state.owner_ref
      },
      controller_npc_id: null,
      controller_character_id: clue.property_state.controller_ref,
      claim_state: 'owner_preserved_evidence_held'
    }
  ));
}
