export { STAGE14_INPUT_SCHEMA, STAGE14_OUTPUT_SCHEMA, STAGE14_CODE_PRECHECK_SCHEMA, STAGE14_REQUIRED_CHECKS, STAGE14_CONCERN_CODE_ENUM, STAGE14_SEVERITY_ENUM, STAGE14_REPAIR_ROUTE_ENUM } from '@rus/contracts';
export function normalizeStage14AuditPolicy(policy = {}) {
  return {
    require_selected_g4_match: policy.require_selected_g4_match ?? true,
    require_allowed_g5_template_ids: policy.require_allowed_g5_template_ids ?? true,
    require_anchor_type_match: policy.require_anchor_type_match ?? true,
    require_minilocation_parent_match: policy.require_minilocation_parent_match ?? true,
    require_edges_between_existing_anchors: policy.require_edges_between_existing_anchors ?? true,
    require_player_start_anchor: policy.require_player_start_anchor ?? true,
    require_visibility_model: policy.require_visibility_model ?? true,
    require_access_model: policy.require_access_model ?? true,
    require_closed_zone_model: policy.require_closed_zone_model ?? true,
    require_risk_model: policy.require_risk_model ?? true,
    require_clock_light_consistency: policy.require_clock_light_consistency ?? true,
    require_source_trace: policy.require_source_trace ?? true,
    reject_created_npcs: policy.reject_created_npcs ?? true,
    reject_created_items: policy.reject_created_items ?? true,
    reject_container_contents: policy.reject_container_contents ?? true,
    reject_intro_prose: policy.reject_intro_prose ?? true,
    reject_visible_scene: policy.reject_visible_scene ?? true,
    reject_hidden_event: policy.reject_hidden_event ?? true
  };
}
