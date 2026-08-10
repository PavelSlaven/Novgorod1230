export function mergePhase2Items(items, clue) {
  const next = structuredClone(items);
  if (clue && !next.some((item) => item.template_id === clue.template_id)) {
    const exactPickup = Boolean(clue.pickup_transition);
    next.push({ item_id: clue.instance_id, template_id: clue.template_id,
      ...(exactPickup ? { profile_id: clue.profile_id,
        quantity: clue.quantity } : {}),
      placement: structuredClone(clue.placement), state: exactPickup ? {
        semantic_category: clue.semantic_category,
        property_state: structuredClone(clue.property_state),
        causal_basis: clue.causal_basis,
        evidence_ref: 'trace_ld_v1_evidence_blue_wool',
        inventory_profile_snapshot: structuredClone(clue.inventory_profile),
        inventory_effect: structuredClone(clue.inventory_effect),
        pickup_transition: structuredClone(clue.pickup_transition)
      } : { semantic_category: clue.semantic_category,
        property_state: clue.property_state, causal_basis: clue.causal_basis,
        evidence_ref: 'trace_ld_v1_evidence_blue_wool',
        placement_contract: clue.placement } });
  }
  return next;
}
