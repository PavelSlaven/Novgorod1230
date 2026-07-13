export const STAGE17_INPUT_SCHEMA = 'time_light_consistency_input';
export const STAGE17_PRECHECK_SCHEMA = 'time_light_code_precheck';
export const STAGE17_AUDIT_SCHEMA = 'time_light_consistency_audit';
export const STAGE17_ROUTE_SCHEMA = 'time_light_audit_route';
export const STAGE17_TIME_OF_DAY = Object.freeze(['dawn','morning','day','afternoon','evening','dusk','night','deep_night']);
export const STAGE17_LIGHT_PROFILES = Object.freeze(['dark','dim','daylight','twilight','indoor_lit','firelit','moonlit','obscured']);
export const STAGE17_SEASONS = Object.freeze(['spring','summer','autumn','winter']);
export const STAGE17_ALLOWED_ROUTES = Object.freeze(['visible_context_format_repair','visible_context_semantic_repair','item_placement_semantic_repair','npc_placement_semantic_repair','g5_scene_semantic_repair','weather_state_retriever','historical_frame_selector','player_character_semantic_repair','blocked']);

export const STAGE18_INPUT_SCHEMA = 'character_knowledge_map_input';
export const STAGE18_OUTPUT_SCHEMA = 'character_knowledge_map';
export const STAGE18_PRECHECK_SCHEMA = 'character_knowledge_map_code_precheck';
export const STAGE18_AUDIT_SCHEMA = 'character_knowledge_map_audit';
export const STAGE18_WRITE_PLAN_SCHEMA = 'character_knowledge_write_projection';
export const STAGE18_RESULT_SCHEMA = 'stage18_character_knowledge_result';
export const STAGE18_KNOWLEDGE_STATUSES = Object.freeze(['formed', 'empty_limited', 'blocked', 'requires_repair']);
export const STAGE18_ALLOWED_KNOWLEDGE_BASES = Object.freeze(['origin','occupation','social_role','visible_now','audible_now','personal_travel','personal_relation','common_knowledge','npc_told','rumor','order','work_duty','family_memory','authority_instruction','previous_party_event']);

export const STAGE19_INPUT_SCHEMA = 'hidden_state_builder_input';
export const STAGE19_OUTPUT_SCHEMA = 'full_hidden_scene_state';
export const STAGE19_PRECHECK_SCHEMA = 'full_hidden_state_code_precheck';
export const STAGE19_AUDIT_SCHEMA = 'full_hidden_state_audit';
export const STAGE19_RESULT_SCHEMA = 'stage19_hidden_state_result';
export const STAGE19_HIDDEN_STATE_STATUSES = Object.freeze(['formed', 'empty_limited', 'blocked', 'requires_repair']);
export const STAGE19_HIDDEN_BLOCKS = Object.freeze(['hidden_npc_state','hidden_access_state','hidden_property_state','hidden_container_state','hidden_item_state','hidden_risk_state','hidden_event_state','hidden_social_state','hidden_route_state','hidden_environment_state','discovery_rules','reveal_conditions','consequence_hooks','forbidden_output_rules','source_trace']);

export function validateStage17To18HandoffContract(value) {
  return validateApprovedHandoff(value, { schema: STAGE17_AUDIT_SCHEMA, permission: 'can_continue_to_visible_context' });
}
export function validateStage18To19HandoffContract(value) {
  return validateApprovedHandoff(value, { schema: STAGE18_AUDIT_SCHEMA, permission: 'can_continue_to_hidden_state' });
}
export function validateStage19To20HandoffContract(value) {
  return validateApprovedHandoff(value, { schema: STAGE19_AUDIT_SCHEMA, permission: 'can_continue_to_visible_context' });
}
function validateApprovedHandoff(value, { schema, permission }) {
  const concerns = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) concerns.push({ code: 'HANDOFF_INVALID', field: 'root', message: 'Handoff must be an object.' });
  if (value?.version !== 1 || value?.schema !== schema) concerns.push({ code: 'HANDOFF_SCHEMA_MISMATCH', field: 'schema', message: `Expected ${schema} version 1.` });
  if (value?.pass !== true) concerns.push({ code: 'HANDOFF_AUDIT_NOT_PASSED', field: 'pass', message: 'Upstream audit must pass.' });
  if (value?.commit_permission?.[permission] !== true) concerns.push({ code: 'HANDOFF_PERMISSION_DENIED', field: `commit_permission.${permission}`, message: `${permission} must be true.` });
  return concerns;
}
