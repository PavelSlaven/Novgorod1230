export { STAGE13_INPUT_SCHEMA, STAGE13_OUTPUT_SCHEMA, STAGE13_CODE_PRECHECK_SCHEMA, STAGE13_MINILOCATION_LIMITS, STAGE13_ANCHOR_LIMITS, STAGE13_EDGE_LIMITS } from '@rus/contracts';
export function normalizeStage13MaterializationPolicy(policy = {}) {
  return {
    materialize_only_selected_g4: policy.materialize_only_selected_g4 ?? true,
    require_g5_template_match: policy.require_g5_template_match ?? true,
    require_start_anchor: policy.require_start_anchor ?? true,
    require_minilocation: policy.require_minilocation ?? true,
    require_edges_between_reachable_anchors: policy.require_edges_between_reachable_anchors ?? true,
    require_visibility_model: policy.require_visibility_model ?? true,
    require_access_model: policy.require_access_model ?? true,
    require_clock_light_consistency: policy.require_clock_light_consistency ?? true,
    require_weather_consistency: policy.require_weather_consistency ?? true,
    require_source_trace: policy.require_source_trace ?? true,
    do_not_place_final_npcs_yet: policy.do_not_place_final_npcs_yet ?? true,
    do_not_place_final_items_yet: policy.do_not_place_final_items_yet ?? true,
    do_not_write_intro_prose: policy.do_not_write_intro_prose ?? true,
    do_not_create_hidden_event: policy.do_not_create_hidden_event ?? true,
    do_not_change_weather_state: policy.do_not_change_weather_state ?? true,
    preserve_player_identity: policy.preserve_player_identity ?? true,
    preserve_social_status: policy.preserve_social_status ?? true,
    preserve_inventory: policy.preserve_inventory ?? true,
    preserve_character_knowledge_limits: policy.preserve_character_knowledge_limits ?? true,
    do_not_change_player_character_without_repair: policy.do_not_change_player_character_without_repair ?? true
  };
}
