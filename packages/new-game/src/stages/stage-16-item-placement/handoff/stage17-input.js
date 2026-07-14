export function buildStage17TimeLightConsistencyInput(context, options = {}) {
  const draft = options.initial_item_placement ?? context?.getStageOutput?.(16) ?? null;
  const precheck = options.initial_item_placement_code_precheck ?? context?.getStageOutput?.(1601) ?? null;
  const audit = options.item_placement_audit ?? context?.getStageOutput?.(1602) ?? null;
  return {
    version: 1,
    schema: 'time_light_consistency_input',
    request_id: options.request_id ?? context?.requestId ?? null,
    historical_frame: options.historical_frame ?? context?.getStageOutput?.(3) ?? null,
    selected_start_node: options.selected_start_node ?? context?.getStageOutput?.(9) ?? null,
    player_character: options.player_character ?? context?.getStageOutput?.(1101) ?? context?.getStageOutput?.(11) ?? null,
    g5_scene_graph: options.g5_scene_graph ?? context?.getStageOutput?.(13) ?? null,
    initial_npc_placement: options.initial_npc_placement ?? context?.getStageOutput?.(15) ?? null,
    initial_item_placement: draft,
    initial_item_placement_code_precheck: precheck,
    item_placement_audit: audit,
    constraints: {
      preserve_item_instance_ids: true,
      preserve_container_instance_ids: true,
      preserve_item_anchor_bindings: true,
      preserve_container_anchor_bindings: true,
      preserve_property_bindings: true,
      preserve_item_visibility_state: true,
      preserve_item_access_state: true,
      preserve_item_risk_state: true,
      do_not_reveal_hidden_items_without_check: true,
      do_not_generate_container_contents_without_causal_basis: true,
      ...(options.constraints ?? {})
    }
  };
}
