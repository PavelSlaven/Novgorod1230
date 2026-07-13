export const STAGE13_INPUT_SCHEMA = 'g5_materialization_input';

export const STAGE13_OUTPUT_SCHEMA = 'g5_scene_graph_draft';

export const STAGE13_CODE_PRECHECK_SCHEMA = 'g5_scene_code_precheck';

export const STAGE13_MINILOCATION_LIMITS = Object.freeze({ min: 1, max: 3 });

export const STAGE13_ANCHOR_LIMITS = Object.freeze({ min: 3, max: 9 });

export const STAGE13_EDGE_LIMITS = Object.freeze({ min: 2, max: 12 });

export const STAGE14_INPUT_SCHEMA = 'g5_scene_audit_input';

export const STAGE14_OUTPUT_SCHEMA = 'g5_scene_audit';

export const STAGE14_CODE_PRECHECK_SCHEMA = 'g5_scene_code_precheck';

export const STAGE14_REQUIRED_CHECKS = Object.freeze([
  'schema_and_structure',
  'parent_g4_match',
  'minilocations',
  'anchors',
  'allowed_templates',
  'edges',
  'player_start_position',
  'visibility_model',
  'access_model',
  'closed_zones',
  'visible_objects',
  'risk_model',
  'clock_light_consistency',
  'npc_item_leak_check',
  'source_trace',
  'commit_readiness'
]);

export const STAGE14_CONCERN_CODE_ENUM = new Set([
  'G5_AUDIT_INVALID_JSON',
  'G5_AUDIT_SCHEMA_MISMATCH',
  'G5_AUDIT_REQUIRED_BLOCK_MISSING',
  'G5_AUDIT_SELECTED_G4_MISMATCH',
  'G5_AUDIT_CREATED_PARENT_LOCATION',
  'G5_AUDIT_MINILOC_ID_MISSING',
  'G5_AUDIT_MINILOC_OUTSIDE_G4',
  'G5_AUDIT_MINILOC_TYPE_NOT_ALLOWED',
  'G5_AUDIT_MINILOC_LIGHT_STATE_MISSING',
  'G5_AUDIT_ANCHOR_ID_MISSING',
  'G5_AUDIT_ANCHOR_OUTSIDE_MINILOCATION',
  'G5_AUDIT_ANCHOR_OUTSIDE_G4',
  'G5_AUDIT_TEMPLATE_NOT_ALLOWED',
  'G5_AUDIT_ANCHOR_TYPE_NOT_ALLOWED',
  'G5_AUDIT_ANCHOR_WITHOUT_TEMPLATE',
  'G5_AUDIT_TEMPLATE_STATUS_REJECTED',
  'G5_AUDIT_EDGE_ID_MISSING',
  'G5_AUDIT_EDGE_ANCHOR_MISSING',
  'G5_AUDIT_EDGE_OUTSIDE_G4',
  'G5_AUDIT_START_POSITION_MISSING',
  'G5_AUDIT_START_ANCHOR_MISSING',
  'G5_AUDIT_START_MINILOCATION_MISSING',
  'G5_AUDIT_VISIBILITY_MODEL_MISSING',
  'G5_AUDIT_ACCESS_MODEL_MISSING',
  'G5_AUDIT_VISIBILITY_ACCESS_MIXED',
  'G5_AUDIT_CLOSED_ZONE_MODEL_MISSING',
  'G5_AUDIT_RISK_MODEL_MISSING',
  'G5_AUDIT_CLOCK_LIGHT_CONTRADICTION',
  'G5_AUDIT_CREATED_NPC',
  'G5_AUDIT_CREATED_ITEM',
  'G5_AUDIT_CREATED_CONTAINER_CONTENTS',
  'G5_AUDIT_CREATED_VISIBLE_SCENE',
  'G5_AUDIT_CREATED_INTRO_PROSE',
  'G5_AUDIT_CREATED_HIDDEN_EVENT',
  'G5_AUDIT_SOURCE_TRACE_MISSING',
  'G5_AUDIT_SELF_CHECK_EVIDENCE_MISSING',
  'G5_AUDIT_OUTPUT_SCHEMA_MISMATCH',
  'G5_AUDIT_OUTPUT_VERSION_MISMATCH',
  'G5_AUDIT_OUTPUT_PASS_MISSING',
  'G5_AUDIT_OUTPUT_CHECKS_MISSING',
  'G5_AUDIT_OUTPUT_CHECK_MISSING',
  'G5_AUDIT_OUTPUT_EVIDENCE_EMPTY',
  'G5_AUDIT_OUTPUT_CONCERNS_MISSING',
  'G5_AUDIT_OUTPUT_REPAIR_ROUTE_MISSING',
  'G5_AUDIT_OUTPUT_REPAIR_ROUTE_UNEXPECTED',
  'G5_AUDIT_COMMIT_PERMISSION_MISMATCH',
  'G5_AUDIT_COMMIT_ALLOWED_LEGACY_FIELD',
  'G5_AUDIT_FORBIDDEN_OUTPUT_FIELD',
  'G5_AUDIT_CONCERN_CODE_UNKNOWN',
  'G5_AUDIT_CONCERN_SEVERITY_UNKNOWN',
  'G5_AUDIT_REPAIR_ROUTE_UNKNOWN',
  'G5_AUDIT_CODE_PRECHECK_FAILED',
  'G5_AUDIT_INPUT_SCHEMA_MISMATCH',
  'G5_AUDIT_INPUT_VERSION_MISMATCH',
  'G5_AUDIT_INPUT_REQUIRED_BLOCK_MISSING',
  'G5_AUDIT_ALLOWED_TEMPLATES_EMPTY',
  'G5_AUDIT_CHARACTER_SCHEMA_MISMATCH',
  'G5_AUDIT_PLAYER_CHARACTER_AUDIT_FAILED',
  'G5_AUDIT_START_PLACE_AUDIT_FAILED',
  'G5_AUDIT_MATERIALIZATION_STATUS_INVALID'
]);

export const STAGE14_SEVERITY_ENUM = new Set([
  'info',
  'warning',
  'soft_warning',
  'concern',
  'repairable',
  'hard_block',
  'blocking',
  'critical'
]);

export const STAGE14_REPAIR_ROUTE_ENUM = new Set([
  'stage_13',
  'g5_materialization',
  'g5_materialization_repair',
  'g5_scene_materialization_repair',
  'allowed_g5_template_retrieval',
  'format_repair',
  'manual_review'
]);

export const STAGE15_INPUT_SCHEMA = 'npc_placement_input';

export const STAGE15_DRAFT_SCHEMA = 'initial_npc_placement_draft';

export const STAGE15_AUDIT_SCHEMA = 'initial_npc_placement_audit';

export const STAGE15_PRECHECK_SCHEMA = 'initial_npc_placement_code_precheck';

export const STAGE15_PLACEMENT_STATUSES = Object.freeze([
  'placed',
  'empty_allowed',
  'blocked',
  'requires_repair'
]);

export const STAGE15_PROFILE_LEVELS = Object.freeze(['background', 'scene', 'key']);

export const STAGE16_INPUT_SCHEMA = 'item_placement_input';

export const STAGE16_DRAFT_SCHEMA = 'initial_item_placement_draft';

export const STAGE16_PRECHECK_SCHEMA = 'initial_item_placement_code_precheck';

export const STAGE16_AUDIT_SCHEMA = 'initial_item_placement_audit';

export const STAGE16_PLACEMENT_STATUSES = Object.freeze([
  'placed',
  'empty_allowed',
  'blocked',
  'requires_repair'
]);

export const STAGE16_CAUSAL_BASIS_TYPES = Object.freeze([
  'place_function',
  'anchor_function',
  'npc_holder',
  'npc_controller',
  'player_inventory_already_existing',
  'work_activity',
  'trade_activity',
  'access_obstacle',
  'property_risk',
  'visible_background',
  'searchable_detail',
  'seasonal_need',
  'body_state_need',
  'route_or_travel_need',
  'storage_function'
]);


export function validateStage13To14HandoffContract({ draft, code_precheck: precheck } = {}) {
  const concerns = [];
  if (draft?.version !== 1 || draft?.schema !== STAGE13_OUTPUT_SCHEMA || draft?.materialization_status !== 'materialized') concerns.push(boundaryConcern('STAGE13_TO_14_DRAFT_INVALID', 'Stage 13 draft must be materialized g5_scene_graph_draft.', 'draft'));
  if (precheck?.version !== 1 || precheck?.schema !== STAGE13_CODE_PRECHECK_SCHEMA || precheck?.pass !== true) concerns.push(boundaryConcern('STAGE13_TO_14_PRECHECK_INVALID', 'Stage 13 code precheck must pass.', 'code_precheck'));
  return concerns;
}
export function validateStage14To15HandoffContract({ audit } = {}) {
  const concerns = [];
  if (audit?.version !== 1 || audit?.schema !== STAGE14_OUTPUT_SCHEMA || audit?.pass !== true) concerns.push(boundaryConcern('STAGE14_TO_15_AUDIT_INVALID', 'Stage 14 audit must pass.', 'audit'));
  if (audit?.commit_permission?.can_continue_to_npc_placement !== true) concerns.push(boundaryConcern('STAGE14_TO_15_PERMISSION_DENIED', 'Stage 14 must permit NPC placement.', 'audit.commit_permission.can_continue_to_npc_placement'));
  return concerns;
}
export function validateStage15To16HandoffContract({ draft, precheck, audit } = {}) {
  const concerns = [];
  if (draft?.version !== 1 || draft?.schema !== STAGE15_DRAFT_SCHEMA || !['placed', 'empty_allowed'].includes(draft?.placement_status)) concerns.push(boundaryConcern('STAGE15_TO_16_DRAFT_INVALID', 'Stage 15 draft must be placed or empty_allowed.', 'draft'));
  if (precheck?.version !== 1 || precheck?.schema !== STAGE15_PRECHECK_SCHEMA || precheck?.pass !== true) concerns.push(boundaryConcern('STAGE15_TO_16_PRECHECK_INVALID', 'Stage 15 code precheck must pass.', 'precheck'));
  if (audit?.version !== 1 || audit?.schema !== STAGE15_AUDIT_SCHEMA || audit?.pass !== true || audit?.commit_permission?.can_continue_to_item_placement !== true) concerns.push(boundaryConcern('STAGE15_TO_16_AUDIT_INVALID', 'Stage 15 audit must pass and permit item placement.', 'audit'));
  return concerns;
}
export function validateStage16To17HandoffContract({ draft, precheck, audit } = {}) {
  const concerns = [];
  if (draft?.version !== 1 || draft?.schema !== STAGE16_DRAFT_SCHEMA || !['placed', 'empty_allowed'].includes(draft?.placement_status)) concerns.push(boundaryConcern('STAGE16_TO_17_DRAFT_INVALID', 'Stage 16 draft must be placed or empty_allowed.', 'draft'));
  if (precheck?.version !== 1 || precheck?.schema !== STAGE16_PRECHECK_SCHEMA || precheck?.pass !== true) concerns.push(boundaryConcern('STAGE16_TO_17_PRECHECK_INVALID', 'Stage 16 code precheck must pass.', 'precheck'));
  if (audit?.version !== 1 || audit?.schema !== STAGE16_AUDIT_SCHEMA || audit?.pass !== true || audit?.commit_permission?.can_continue_to_time_light_gate !== true) concerns.push(boundaryConcern('STAGE16_TO_17_AUDIT_INVALID', 'Stage 16 audit must pass and permit time/light gate.', 'audit'));
  return concerns;
}
function boundaryConcern(code, message, field) { return { code, severity: 'hard_block', message, field }; }
