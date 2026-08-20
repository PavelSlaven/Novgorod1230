import {
  createOrdinaryMaterializationAtomicWritePlan
} from './ordinary-materialization-phase-6-commit.js';
import { buildOrdinaryMaterializedRuntimeItem } from
  './ordinary-materialization-runtime-item.js';

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
    `party_runtime.party_ordinary_materialization_item_basis_refs:${plan.party_id}:${plan.item?.item_id ?? plan.request_identity}`,
    ...(plan.item == null ? [] : [
      `party_runtime.party_positions:${plan.party_id}`,
      `party_runtime.party_items:${plan.item.item_id}`,
      `party_runtime.party_item_placements:${plan.item.item_id}`
    ])
  ];
}

export function applyOrdinaryMaterializationProjection({
  next, visibleContext, ordinaryPlan
}) {
  if (ordinaryPlan?.item == null) return visibleContext;
  const item = ordinaryPlan.item;
  const runtime = buildOrdinaryMaterializedRuntimeItem({
    partyId: ordinaryPlan.party_id, item
  });
  if (!(next.items ?? []).some(({ item_id }) => item_id === item.item_id)) {
    next.items = [...(next.items ?? []),
      structuredClone(runtime.snapshot_item)];
  }
  const object = { entity_ref: { entity_kind: 'item', entity_id: item.item_id },
    display_label: item.item_proposal.semantic_descriptor.name,
    recognition: 'recognized', visible_status: 'замечен' };
  return { ...structuredClone(visibleContext), visible_objects: [
    ...(visibleContext.visible_objects ?? []), object
  ] };
}
