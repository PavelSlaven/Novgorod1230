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
  const batch = plan.schema === 'ordinary_container_contents_atomic_write_plan_v2';
  const materializationItemIds = batch
    ? plan.items.map(({item_id}) => item_id)
    : [plan.item?.item_id ?? plan.request_identity];
  const runtimeItemIds = batch ? materializationItemIds : [];
  return [
    `party_runtime.party_ordinary_materialization_aggregates:${scope}`,
    `party_runtime.party_ordinary_materialization_contexts:${scope}`,
    `party_runtime.party_ordinary_materialization_enablements:${scope}`,
    `party_runtime.party_ordinary_materialization_commits:${plan.party_id}:${plan.request_identity}`,
    `party_runtime.party_ordinary_materialization_basis_catalog:${scope}`,
    ...materializationItemIds.flatMap((itemId) => [
      `party_runtime.party_ordinary_materialization_items:${plan.party_id}:${itemId}`,
      `party_runtime.party_ordinary_materialization_item_basis_refs:${plan.party_id}:${itemId}`
    ]),
    ...runtimeItemIds.flatMap((itemId) => [
      `party_runtime.party_items:${itemId}`,
      `party_runtime.party_item_placements:${itemId}`
    ]),
    ...(batch
      ? [
        `party_runtime.party_ordinary_materialization_commit_items:${plan.party_id}:${plan.request_identity}`,
        `party_runtime.party_containers:${plan.scope_ref.entity_id}`
      ] : [])
  ];
}

export function applyOrdinaryMaterializationProjection({
  next, visibleContext, ordinaryPlan, disclose = true
}) {
  if (ordinaryPlan?.schema === 'ordinary_container_contents_atomic_write_plan_v2') {
    const patch = ordinaryPlan.container_transition.state_patch;
    next.containers = (next.containers ?? []).map((container) =>
      container.container_id !== ordinaryPlan.scope_ref.entity_id ? container : {
        ...container,...structuredClone(patch),closure_state:'open',
        state:{...(container.state ?? {}),...structuredClone(patch)} });
    next.items = (next.items ?? []).map((item) =>
      item.item_id !== ordinaryPlan.scope_ref.entity_id ? item : {
        ...item,...structuredClone(patch),closure_state:'open',
        state:{...(item.state ?? {}),...structuredClone(patch)} });
    for (const item of ordinaryPlan.items) {
      if ((next.items ?? []).some(({ item_id }) => item_id === item.item_id)) continue;
      next.items = [...(next.items ?? []), {
        item_id:item.item_id, template_id:null, profile_id:null,
        category_id:null, quantity:1, condition_state:item.condition_state,
        legal_status:'ordinary_container_content', visible:true,
        name:item.item_proposal.semantic_descriptor.name,
        placement:{container_id:item.container_id},
        runtime_instance_mechanics_snapshot:
          structuredClone(item.runtime_mechanics_snapshot),
        state:{ lifecycle_status:'active',
          runtime_instance_mechanics_snapshot:
            structuredClone(item.runtime_mechanics_snapshot),
          semantic_category:item.item_proposal.semantic_descriptor.semantic_type,
          property_state:{ property_basis_ref:item.property_basis_ref,
            property_placement_evidence:structuredClone(
              item.item_proposal.property_placement_evidence) } }
      }];
    }
    const known = new Set((visibleContext.visible_objects ?? [])
      .map((object) => object?.entity_ref?.entity_id));
    return { ...structuredClone(visibleContext), visible_objects:[
      ...(visibleContext.visible_objects ?? []),
      ...ordinaryPlan.items.filter(({item_id:id}) => !known.has(id))
        .map((item) => ({entity_ref:{entity_kind:'item',
          entity_id:item.item_id},display_label:
            item.item_proposal.semantic_descriptor.name,
        recognition:'recognized',visible_status:'замечен'}))] };
  }
  if (ordinaryPlan?.item == null) return visibleContext;
  const item = ordinaryPlan.item;
  if (!(next.items ?? []).some(({ item_id }) => item_id === item.item_id)) {
    next.items = [...(next.items ?? []), {
      item_id: item.item_id,
      template_id: null,
      name: item.item_proposal.semantic_descriptor.name,
      visible: disclose,
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
  return disclose ? { ...structuredClone(visibleContext), visible_objects: [
    ...(visibleContext.visible_objects ?? []), object
  ] } : structuredClone(visibleContext);
}
