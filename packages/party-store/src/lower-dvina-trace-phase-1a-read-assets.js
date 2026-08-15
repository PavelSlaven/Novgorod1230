export function normalizedPartyAssets({ items, containers, obligations,
  clock }) {
  return {
    items: items.map((item) => ({
      item_id: item.item_id,
      run_id: item.run_id,
      template_id: item.template_id,
      profile_id: item.profile_id,
      category_id: item.category_id,
      quantity: item.quantity,
      condition_state: item.condition_state,
      legal_status: item.legal_status,
      state: item.state,
      placement: {
        anchor_id: item.anchor_id,
        container_id: item.placement_container_id,
        holder_npc_id: item.holder_npc_id,
        holder_character_id: item.holder_character_id,
        physical_position: item.physical_position,
        equipment_slot_category_id: item.equipment_slot_category_id
      },
      ownership: {
        ownership_id: item.ownership_id,
        container_id: item.ownership_container_id,
        owner_npc_id: item.owner_npc_id,
        owner_character_id: item.owner_character_id,
        owner_party: item.owner_party,
        owner_external_ref: item.owner_external_ref,
        controller_npc_id: item.controller_npc_id,
        controller_character_id: item.controller_character_id,
        claim_state: item.claim_state
      }
    })),
    containers: containers.map(normalizedContainer),
    obligations: obligations.map((obligation) => ({
      obligation_id: obligation.obligation_id,
      policy_ref: obligation.policy_ref,
      policy_version: obligation.policy_version,
      promisor_ref: obligation.promisor_ref,
      beneficiary_ref: obligation.beneficiary_ref,
      witness_refs: obligation.witness_refs,
      scope_snapshot: obligation.scope_snapshot,
      current_state: obligation.current_state,
      current_state_fact: obligation.current_state_fact,
      state_version: Number(obligation.state_version),
      created_change_set_id: obligation.created_change_set_id,
      last_change_set_id: obligation.last_change_set_id
    })),
    clock: {
      whole_minutes: clock.whole_minutes,
      subminute_numerator: clock.subminute_numerator,
      subminute_denominator: clock.subminute_denominator,
      clock_owner_kind: clock.clock_owner_kind,
      clock_owner_id: clock.clock_owner_id,
      state_version: Number(clock.state_version),
      updated_change_set_id: clock.updated_change_set_id
    }
  };
}

export function normalizedContainer(container) {
  return {
    container_id: container.container_id,
    run_id: container.run_id,
    template_id: container.template_id,
    anchor_id: container.anchor_id,
    parent_container_id: container.parent_container_id,
    holder_npc_id: container.holder_npc_id,
    holder_character_id: container.holder_character_id,
    physical_position: container.physical_position,
    equipment_slot_category_id: container.equipment_slot_category_id,
    condition_state: container.condition_state,
    closure_state: container.closure_state,
    state: container.state,
    state_version: Number(container.state_version),
    ownership: container.ownership_id == null ? null : {
      ownership_id: container.ownership_id,
      container_id: container.container_id,
      owner_npc_id: container.owner_npc_id,
      owner_character_id: container.owner_character_id,
      owner_party: container.owner_party,
      owner_external_ref: container.owner_external_ref,
      controller_npc_id: container.controller_npc_id,
      controller_character_id: container.controller_character_id,
      claim_state: container.claim_state
    }
  };
}
