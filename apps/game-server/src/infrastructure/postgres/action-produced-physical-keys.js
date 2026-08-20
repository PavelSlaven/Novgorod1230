export function actionProducedPhysicalKeysForPlan(plan) {
  return [
    ...(plan.output_destination_pin == null ? [] : [
      `party_runtime.party_g5_anchors:${plan.party_id}:${plan.output_destination_pin.anchor_id}`,
      `party_runtime.party_positions:${plan.party_id}`,
      ...plan.output_destination_pin.used_item_ids.map((itemId) =>
        `party_runtime.party_item_placements:${itemId}`)
    ]),
    ...plan.source_pins.flatMap((pin) => [
      `party_runtime.party_items:${pin.item_id}`,
      `party_runtime.party_item_placements:${pin.item_id}`,
      ...(pin.prepared_ordinary == null ? [
        `party_runtime.party_ownership:${pin.ownership.ownership_id}`
      ] : []),
      ...(pin.finite_resource_row == null ? [] : [
        `party_runtime.party_resource_nodes:${plan.party_id}:${pin.finite_resource_row.resource_node_id}`
      ]),
      ...accessContainerKeys(pin)
    ]),
    ...plan.tool_pins.flatMap((pin) => [
      `party_runtime.party_items:${pin.item_id}`,
      `party_runtime.party_item_placements:${pin.item_id}`,
      ...(pin.prepared_ordinary == null ? [
        `party_runtime.party_ownership:${pin.ownership.ownership_id}`
      ] : []),
      ...accessContainerKeys(pin)
    ]),
    ...plan.result_items.flatMap((result) => [
      `party_runtime.party_items:${result.item_id}`,
      `party_runtime.party_item_placements:${result.item_id}`,
      `party_runtime.party_ownership:${result.ownership_row.ownership_id}`
    ])
  ];
}

function accessContainerKeys(pin) {
  const container = pin.access_container;
  return container == null ? [] : [
    `party_runtime.party_containers:${container.container_id}`,
    `party_runtime.party_ownership:${container.ownership.ownership_id}`
  ];
}
