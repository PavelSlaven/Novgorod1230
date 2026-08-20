export function applyActionProductionProjection({ next, plan }) {
  if (plan == null) return;
  const updates = new Map(plan.source_updates.map((update) => [
    update.item_id, update.after_item
  ]));
  next.items = (next.items ?? []).map((item) => {
    const after = updates.get(item.item_id);
    return after == null ? item : {
      ...item,
      run_id: after.run_id,
      template_id: after.template_id,
      profile_id: after.profile_id,
      category_id: after.category_id,
      quantity: after.quantity,
      condition_state: after.condition_state,
      legal_status: after.legal_status,
      state: structuredClone(after.state),
      state_version: after.state_version,
      ...(after.state?.lifecycle_status === 'retired'
        ? { placement: null } : {}),
      runtime_instance_mechanics_snapshot: structuredClone(
        after.state?.runtime_instance_mechanics_snapshot ?? null)
    };
  });
  for (const result of plan.result_items) {
    if (next.items.some(({ item_id: itemId }) => itemId === result.item_id)) {
      continue;
    }
    next.items.push({
      item_id: result.item_id,
      name: result.item_row.state.ordinary_metadata.name,
      semantic_type: result.item_row.state.ordinary_metadata.semantic_type,
      ...structuredClone(result.item_row),
      placement: structuredClone(result.placement_row),
      ownership: structuredClone(result.ownership_row),
      runtime_instance_mechanics_snapshot:
        structuredClone(result.mechanics_snapshot)
    });
  }
}
