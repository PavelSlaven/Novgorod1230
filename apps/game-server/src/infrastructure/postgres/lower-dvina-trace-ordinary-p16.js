import {
  createOrdinaryMaterializationAtomicWritePlan
} from './ordinary-materialization-phase-6-commit.js';
import { buildOrdinaryMaterializedRuntimeItem } from
  './ordinary-materialization-runtime-item.js';
import { ordinaryContainerRuntimeItemState } from
  './ordinary-materialization-container-batch-item.js';

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
  const batch = plan.schema === 'ordinary_container_contents_atomic_write_plan_v2';
  const materializationItemIds = batch
    ? plan.items.map(({item_id}) => item_id)
    : [plan.item?.item_id ?? plan.request_identity];
  const ledgerItemIds = materializationItemIds.length === 0
    ? [plan.request_identity] : materializationItemIds;
  return [
    `party_runtime.party_ordinary_materialization_aggregates:${scope}`,
    `party_runtime.party_ordinary_materialization_contexts:${scope}`,
    `party_runtime.party_ordinary_materialization_enablements:${scope}`,
    `party_runtime.party_ordinary_materialization_commits:${plan.party_id}:${plan.request_identity}`,
    `party_runtime.party_ordinary_materialization_basis_catalog:${scope}`,
    ...ledgerItemIds.flatMap((itemId) => [
      `party_runtime.party_ordinary_materialization_items:${plan.party_id}:${itemId}`,
      `party_runtime.party_ordinary_materialization_item_basis_refs:${plan.party_id}:${itemId}`
    ]),
    ...(batch ? [
      `party_runtime.party_containers:${plan.scope_ref.entity_id}`,
      ...materializationItemIds.flatMap((itemId) => [
        `party_runtime.party_items:${itemId}`,
        `party_runtime.party_item_placements:${itemId}`
      ])
    ] : []),
    ...(plan.item == null ? [] : [
      `party_runtime.party_positions:${plan.party_id}`,
      `party_runtime.party_items:${plan.item.item_id}`,
      `party_runtime.party_item_placements:${plan.item.item_id}`
    ])
  ];
}

export function applyOrdinaryMaterializationProjection({
  next, visibleContext, ordinaryPlan, changeSetId = null
}) {
  if (ordinaryPlan?.schema === 'ordinary_container_contents_atomic_write_plan_v2') {
    const patch = ordinaryPlan.container_transition.state_patch;
    const reveal = ordinaryPlan.container_transition.access_kind
      !== 'resolve_concealed';
    const revealed = new Set(ordinaryPlan.container_transition.revealed_refs);
    next.containers = (next.containers ?? []).map((container) =>
      container.container_id !== ordinaryPlan.scope_ref.entity_id ? container : {
        ...container,...structuredClone(patch),
        ...(reveal ? {closure_state:'open'} : {}),
        ...bumpedStateVersion(container),
        state:{...(container.state ?? {}),...structuredClone(patch)} });
    next.items = (next.items ?? []).map((item) =>
      item.item_id !== ordinaryPlan.scope_ref.entity_id ? item : {
        ...item,...structuredClone(patch),
        ...(reveal ? {closure_state:'open'} : {}),
        ...bumpedStateVersion(item),
        state:{...(item.state ?? {}),...structuredClone(patch)} });
    for (const item of ordinaryPlan.items) {
      if ((next.items ?? []).some(({ item_id }) => item_id === item.item_id)) continue;
      next.items = [...(next.items ?? []), {
        item_id:item.item_id, template_id:null, profile_id:null,
        category_id:null, quantity:1, condition_state:item.condition_state,
        legal_status:'ordinary_container_content',
        ...(revealed.has(item.item_id) ? {visible:true} : {}),
        semantic_type:item.item_proposal.semantic_descriptor.semantic_type,
        name:item.item_proposal.semantic_descriptor.name,
        placement:{container_id:item.container_id},
        runtime_instance_mechanics_snapshot:
          structuredClone(item.runtime_mechanics_snapshot),
        state:structuredClone(ordinaryContainerRuntimeItemState(
          item, changeSetId))
      }];
    }
    const known = new Set((visibleContext.visible_objects ?? [])
      .map((object) => object?.entity_ref?.entity_id));
    return { ...structuredClone(visibleContext), visible_objects:[
      ...(visibleContext.visible_objects ?? []),
      ...ordinaryPlan.items.filter(({item_id:id}) =>
        revealed.has(id) && !known.has(id))
        .map((item) => ({entity_ref:{entity_kind:'item',
          entity_id:item.item_id},display_label:
            item.item_proposal.semantic_descriptor.name,
        recognition:'recognized',visible_status:'замечен'}))] };
  }
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

function bumpedStateVersion(value) {
  return Number.isSafeInteger(value.state_version)
    ? {state_version:value.state_version + 1} : {};
}
