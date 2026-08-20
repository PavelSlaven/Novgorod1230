export function actionProducedPhysicalKeysForSealed(sealed) {
  return [
    `party_runtime.party_action_production_authorities:${sealed.party_id}:${sealed.actor_ref}:${sealed.context_pin.context_ref}`,
    ...(sealed.output_destination_pin == null ? [] : [
      `party_runtime.party_g5_anchors:${sealed.party_id}:${sealed.output_destination_pin.anchor_id}`,
      `party_runtime.party_positions:${sealed.party_id}`,
      ...sealed.output_destination_pin.used_item_ids.map((itemId) =>
        `party_runtime.party_item_placements:${itemId}`)
    ]),
    ...sealed.source_pins.flatMap((pin) => [
      `party_runtime.party_items:${pin.item_id}`,
      `party_runtime.party_item_placements:${pin.item_id}`,
      ...(pin.prepared_ordinary == null ? [
        `party_runtime.party_ownership:${pin.ownership.ownership_id}`
      ] : []),
      ...(pin.finite_resource_row == null ? [] : [
        `party_runtime.party_resource_nodes:${sealed.party_id}:${pin.finite_resource_row.resource_node_id}`
      ])
    ]),
    ...sealed.tool_pins.flatMap((pin) => [
      `party_runtime.party_items:${pin.item_id}`,
      `party_runtime.party_item_placements:${pin.item_id}`,
      ...(pin.prepared_ordinary == null ? [
        `party_runtime.party_ownership:${pin.ownership.ownership_id}`
      ] : [])
    ]),
    ...sealed.result_items.flatMap((result) => [
      `party_runtime.party_items:${result.item_id}`,
      `party_runtime.party_item_placements:${result.item_id}`,
      `party_runtime.party_ownership:${result.ownership_row.ownership_id}`
    ])
  ];
}
