import { computeVisibleContextPackageDigest, STAGE20_OUTPUT_SCHEMA, STAGE20_PRECHECK_SCHEMA } from '@rus/contracts';
import { DEFAULT_STAGE21_AUDIT_POLICY, STAGE21_INPUT_SCHEMA, normalizeStage21AuditPolicy } from '../policy/constants.js';
import { dedupe, isObject, issue, requireAudit, requireSchema, text } from '../../../visible-context/shared.js';

export function buildStage21VisibleContextAuditInput(values = {}) {
  const input = isObject(values) ? values : {};
  return {
    version: 1,
    schema: STAGE21_INPUT_SCHEMA,
    request_id: input.request_id ?? null,
    historical_frame: input.historical_frame ?? null,
    weather_state: input.weather_state ?? null,
    current_position: input.current_position ?? null,
    g5_scene_graph: input.g5_scene_graph ?? null,
    g5_scene_audit: input.g5_scene_audit ?? null,
    initial_npc_placement: input.initial_npc_placement ?? null,
    npc_placement_audit: input.npc_placement_audit ?? null,
    initial_item_placement: input.initial_item_placement ?? null,
    item_placement_audit: input.item_placement_audit ?? null,
    time_light_consistency_audit: input.time_light_consistency_audit ?? null,
    character_knowledge_map: input.character_knowledge_map ?? null,
    character_knowledge_map_audit: input.character_knowledge_map_audit ?? null,
    full_hidden_scene_state: input.full_hidden_scene_state ?? null,
    full_hidden_state_audit: input.full_hidden_state_audit ?? null,
    visible_context_package: input.visible_context_package ?? null,
    visible_context_package_digest: input.visible_context_package_digest ?? null,
    visible_context_code_precheck: input.visible_context_code_precheck ?? null,
    visible_context_audit_policy: normalizeStage21AuditPolicy(input.visible_context_audit_policy ?? input.policy ?? {})
  };
}

export function validateStage21Input(input) {
  const concerns = [];
  if (!isObject(input)) return [issue('VISIBLE_CONTEXT_AUDIT_INPUT_INVALID', 'Stage 21 input must be an object.', 'root')];
  if (input.version !== 1 || input.schema !== STAGE21_INPUT_SCHEMA) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_INPUT_SCHEMA_MISMATCH', `Expected ${STAGE21_INPUT_SCHEMA} version 1.`, 'schema'));
  if (!text(input.request_id)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_INPUT_REQUEST_ID_MISSING', 'request_id is required.', 'request_id'));
  requireSchema(concerns, input.historical_frame, 'historical_frame', 'historical_frame', 'VISIBLE_CONTEXT_AUDIT_HISTORICAL_FRAME_INVALID');
  requireSchema(concerns, input.weather_state, 'weather_state', 'weather_state', 'VISIBLE_CONTEXT_AUDIT_WEATHER_STATE_INVALID');
  validateCurrentPosition(input.current_position, concerns);
  requireSchema(concerns, input.g5_scene_graph, 'g5_scene_graph_draft', 'g5_scene_graph', 'VISIBLE_CONTEXT_AUDIT_G5_SCENE_INVALID');
  requireAudit(concerns, input.g5_scene_audit, 'g5_scene_audit', 'g5_scene_audit', 'VISIBLE_CONTEXT_AUDIT_G5_AUDIT_FAILED');
  requireSchema(concerns, input.initial_npc_placement, 'initial_npc_placement_draft', 'initial_npc_placement', 'VISIBLE_CONTEXT_AUDIT_NPC_PLACEMENT_INVALID');
  requireAudit(concerns, input.npc_placement_audit, 'initial_npc_placement_audit', 'npc_placement_audit', 'VISIBLE_CONTEXT_AUDIT_NPC_AUDIT_FAILED');
  requireSchema(concerns, input.initial_item_placement, 'initial_item_placement_draft', 'initial_item_placement', 'VISIBLE_CONTEXT_AUDIT_ITEM_PLACEMENT_INVALID');
  requireAudit(concerns, input.item_placement_audit, 'initial_item_placement_audit', 'item_placement_audit', 'VISIBLE_CONTEXT_AUDIT_ITEM_AUDIT_FAILED');
  requireAudit(concerns, input.time_light_consistency_audit, 'time_light_consistency_audit', 'time_light_consistency_audit', 'VISIBLE_CONTEXT_AUDIT_TIME_LIGHT_FAILED');
  requireSchema(concerns, input.character_knowledge_map, 'character_knowledge_map', 'character_knowledge_map', 'VISIBLE_CONTEXT_AUDIT_KNOWLEDGE_MAP_INVALID');
  requireAudit(concerns, input.character_knowledge_map_audit, 'character_knowledge_map_audit', 'character_knowledge_map_audit', 'VISIBLE_CONTEXT_AUDIT_KNOWLEDGE_AUDIT_FAILED');
  requireSchema(concerns, input.full_hidden_scene_state, 'full_hidden_scene_state', 'full_hidden_scene_state', 'VISIBLE_CONTEXT_AUDIT_HIDDEN_STATE_INVALID');
  requireAudit(concerns, input.full_hidden_state_audit, 'full_hidden_state_audit', 'full_hidden_state_audit', 'VISIBLE_CONTEXT_AUDIT_HIDDEN_AUDIT_FAILED');
  if (input.time_light_consistency_audit?.commit_permission?.can_continue_to_visible_context !== true) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_TIME_LIGHT_FAILED', 'Stage 17 must allow continuation to visible context.', 'time_light_consistency_audit.commit_permission.can_continue_to_visible_context'));
  if (input.character_knowledge_map_audit?.commit_permission?.can_continue_to_hidden_state !== true) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_KNOWLEDGE_AUDIT_FAILED', 'Stage 18 must allow continuation to hidden state.', 'character_knowledge_map_audit.commit_permission.can_continue_to_hidden_state'));
  if (input.full_hidden_state_audit?.commit_permission && input.full_hidden_state_audit.commit_permission.can_continue_to_visible_context !== true) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_HIDDEN_AUDIT_FAILED', 'Stage 19 must allow continuation to visible context.', 'full_hidden_state_audit.commit_permission.can_continue_to_visible_context'));
  requireSchema(concerns, input.visible_context_package, STAGE20_OUTPUT_SCHEMA, 'visible_context_package', 'VISIBLE_CONTEXT_AUDIT_PACKAGE_INVALID');
  requireSchema(concerns, input.visible_context_code_precheck, STAGE20_PRECHECK_SCHEMA, 'visible_context_code_precheck', 'VISIBLE_CONTEXT_AUDIT_STAGE20_PRECHECK_INVALID');
  if (input.visible_context_code_precheck?.pass !== true) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_STAGE20_PRECHECK_INVALID', 'Stage 20 precheck must pass.', 'visible_context_code_precheck.pass'));
  if (input.visible_context_code_precheck?.request_id !== input.request_id) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_REQUEST_ID_MISMATCH', 'Stage 20 precheck request_id must match Stage 21 input.', 'visible_context_code_precheck.request_id'));
  if (input.visible_context_package?.request_id !== input.request_id) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_REQUEST_ID_MISMATCH', 'visible_context_package request_id must match Stage 21 input.', 'visible_context_package.request_id'));
  if (!text(input.visible_context_package_digest)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_PACKAGE_DIGEST_MISSING', 'visible_context_package_digest is required.', 'visible_context_package_digest'));
  const actualDigest = isObject(input.visible_context_package) ? computeVisibleContextPackageDigest(input.visible_context_package) : null;
  if (text(input.visible_context_package_digest) && actualDigest !== input.visible_context_package_digest) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_PACKAGE_DIGEST_MISMATCH', 'visible_context_package_digest does not match package.', 'visible_context_package_digest', actualDigest, input.visible_context_package_digest));
  if (input.current_position?.region_id !== input.historical_frame?.region?.region_id) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_POSITION_INVALID', 'current_position.region_id must match historical frame.', 'current_position.region_id'));
  for (const [key, expected] of Object.entries(DEFAULT_STAGE21_AUDIT_POLICY)) {
    if (input.visible_context_audit_policy?.[key] !== expected) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_POLICY_INCOMPLETE', `${key} must be ${expected}.`, `visible_context_audit_policy.${key}`, expected, input.visible_context_audit_policy?.[key]));
  }
  return dedupe(concerns);
}

export function validateCurrentPosition(position, concerns) {
  if (!isObject(position)) { concerns.push(issue('VISIBLE_CONTEXT_AUDIT_POSITION_INVALID', 'current_position is required.', 'current_position')); return; }
  for (const key of ['region_id', 'place_id', 'location_id', 'minilocation_id', 'anchor_id']) if (!text(position[key])) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_POSITION_INVALID', `current_position.${key} is required.`, `current_position.${key}`));
  if (position.last_route_id != null) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_POSITION_INVALID', 'last_route_id must be null before initial commit.', 'current_position.last_route_id'));
}
