import {
  createOrdinaryMaterializationAtomicWritePlan
} from './ordinary-materialization-phase-6-commit.js';

export function ordinaryPlanFromWritePlan(writePlan, partyId) {
  const raw = writePlan?.ordinary_materialization_atomic_write_plan;
  if (raw == null) return null;
  const plan = createOrdinaryMaterializationAtomicWritePlan(raw);
  if (plan.party_id !== partyId) throw new Error('ordinary party mismatch');
  return plan;
}

export function ordinaryPhysicalKeys(plan) {
  if (plan == null) return [];
  const scope = `${plan.party_id}:${plan.scope_ref.entity_kind}:${plan.scope_ref.entity_id}`;
  return [
    `party_runtime.party_ordinary_materialization_aggregates:${scope}`,
    `party_runtime.party_ordinary_materialization_contexts:${scope}`,
    `party_runtime.party_ordinary_materialization_enablements:${scope}`,
    `party_runtime.party_ordinary_materialization_commits:${plan.party_id}:${plan.request_identity}`,
    `party_runtime.party_ordinary_materialization_basis_catalog:${scope}`,
    `party_runtime.party_ordinary_materialization_items:${plan.party_id}:${plan.item?.item_id ?? plan.request_identity}`,
    `party_runtime.party_ordinary_materialization_item_basis_refs:${plan.party_id}:${plan.item?.item_id ?? plan.request_identity}`
  ];
}

export function applyOrdinaryMaterializationProjection({
  next, visibleContext, ordinaryPlan
}) {
  if (ordinaryPlan?.item == null) return visibleContext;
  const item = ordinaryPlan.item;
  if (!(next.items ?? []).some(({ item_id }) => item_id === item.item_id)) {
    next.items = [...(next.items ?? []), {
      item_id: item.item_id,
      template_id: null,
      name: item.item_proposal.semantic_descriptor.name,
      visible: true,
      placement: { location_ref: item.item_proposal.scope_ref.entity_id },
      state: {
        semantic_category: item.item_proposal.semantic_descriptor.semantic_type,
        condition_state: item.condition_state,
        property_state: { property_basis_ref: item.property_basis_ref,
          property_placement_evidence: structuredClone(
            item.item_proposal.property_placement_evidence) },
        causal_basis: item.supporting_basis_ref,
        mechanics_snapshot: structuredClone(item.mechanics_snapshot)
      }
    }];
  }
  const object = { entity_ref: { entity_kind: 'item', entity_id: item.item_id },
    display_label: item.item_proposal.semantic_descriptor.name,
    recognition: 'recognized', visible_status: 'замечен' };
  return { ...structuredClone(visibleContext), visible_objects: [
    ...(visibleContext.visible_objects ?? []), object
  ] };
}
