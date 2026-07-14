import {
  buildStage20ReferenceIndex,
  buildStage20VisibilityFilter,
  buildVisibleContextCodePrecheck,
  STAGE20_OUTPUT_SCHEMA,
  STAGE20_PRECHECK_SCHEMA
} from './stage20-visible-context.js';
import { computeVisibleContextPackageDigest } from './visible-context-digest.js';

export const STAGE21_INPUT_SCHEMA = 'visible_context_audit_input';
export const STAGE21_OUTPUT_SCHEMA = 'visible_context_audit';
export const STAGE21_PRECHECK_SCHEMA = 'visible_context_audit_code_precheck';
export const STAGE21_ROUTE_SCHEMA = 'visible_context_audit_repair_route';
export const STAGE21_RESULT_SCHEMA = 'stage21_visible_context_audit_result';

export const DEFAULT_STAGE21_AUDIT_POLICY = Object.freeze({
  require_schema: true,
  require_position_match: true,
  require_clock_match: true,
  require_weather_match: true,
  require_light_match: true,
  require_all_refs_exist: true,
  require_hidden_state_filter: true,
  require_character_knowledge_boundary: true,
  require_narrator_scope: true,
  require_must_not_include: true,
  require_source_trace: true,
  require_nonempty_success_evidence: true,
  require_package_digest_match: true,
  reject_private_motive_leak: true,
  reject_private_knowledge_leak: true,
  reject_closed_container_contents_leak: true,
  reject_future_event_leak: true,
  reject_true_ownership_leak_if_unknown: true,
  reject_hidden_route_truth_leak: true,
  reject_unseen_items: true,
  reject_unseen_npcs: true,
  reject_rumor_as_fact: true,
  reject_uncertainty_as_fact: true,
  reject_action_labels_using_hidden_truth: true,
  reject_new_world_facts: true,
  reject_narrator_prose: true
});

export const STAGE21_REQUIRED_CHECKS = Object.freeze([
  'schema_and_structure',
  'position_consistency',
  'time_weather_light_consistency',
  'g5_anchor_consistency',
  'npc_consistency',
  'item_consistency',
  'container_consistency',
  'hidden_state_leak_check',
  'character_knowledge_boundary_check',
  'rumor_uncertainty_check',
  'available_actions_check',
  'narrator_scope_check',
  'source_trace_check',
  'package_digest_check',
  'commit_readiness'
]);

export const STAGE21_ALLOWED_SEVERITIES = Object.freeze([
  'warning', 'repairable', 'hard_block', 'upstream_block'
]);

export const STAGE21_ALLOWED_CONCERN_CODES = Object.freeze([
  'VISIBLE_CONTEXT_SCHEMA_MISMATCH',
  'VISIBLE_CONTEXT_REQUIRED_BLOCK_MISSING',
  'VISIBLE_CONTEXT_REQUEST_ID_MISMATCH',
  'VISIBLE_CONTEXT_PACKAGE_DIGEST_MISMATCH',
  'VISIBLE_CONTEXT_POSITION_CONFLICT',
  'VISIBLE_CONTEXT_CLOCK_CONFLICT',
  'VISIBLE_CONTEXT_SEASON_CONFLICT',
  'VISIBLE_CONTEXT_WEATHER_CONFLICT',
  'VISIBLE_CONTEXT_LIGHT_CONFLICT',
  'VISIBLE_CONTEXT_INVALID_ANCHOR_REF',
  'VISIBLE_CONTEXT_INVALID_EXIT_REF',
  'VISIBLE_CONTEXT_INVALID_NPC_REF',
  'VISIBLE_CONTEXT_INVALID_ITEM_REF',
  'VISIBLE_CONTEXT_INVALID_CONTAINER_REF',
  'VISIBLE_CONTEXT_UNSEEN_NPC',
  'VISIBLE_CONTEXT_UNSEEN_ITEM',
  'VISIBLE_CONTEXT_CLOSED_CONTAINER_CONTENTS_LEAK',
  'VISIBLE_CONTEXT_PRIVATE_MOTIVE_LEAK',
  'VISIBLE_CONTEXT_PRIVATE_KNOWLEDGE_LEAK',
  'VISIBLE_CONTEXT_FUTURE_EVENT_LEAK',
  'VISIBLE_CONTEXT_UNKNOWN_OWNERSHIP_LEAK',
  'VISIBLE_CONTEXT_HIDDEN_ROUTE_TRUTH_LEAK',
  'VISIBLE_CONTEXT_RUMOR_AS_FACT',
  'VISIBLE_CONTEXT_UNCERTAINTY_AS_FACT',
  'VISIBLE_CONTEXT_ACTION_HIDDEN_TRUTH_LEAK',
  'VISIBLE_CONTEXT_KNOWLEDGE_BOUNDARY_CONFLICT',
  'VISIBLE_CONTEXT_NEW_WORLD_FACT',
  'VISIBLE_CONTEXT_NEW_ENTITY',
  'VISIBLE_CONTEXT_NARRATOR_PROSE_PRESENT',
  'VISIBLE_CONTEXT_SOURCE_TRACE_MISSING',
  'VISIBLE_CONTEXT_AUDIT_EVIDENCE_MISSING',
  'VISIBLE_CONTEXT_MUST_NOT_INCLUDE_INCOMPLETE',
  'VISIBLE_CONTEXT_STAGE20_PRECHECK_MISMATCH',
  'VISIBLE_CONTEXT_G5_AUDIT_CONFLICT',
  'VISIBLE_CONTEXT_NPC_PLACEMENT_CONFLICT',
  'VISIBLE_CONTEXT_ITEM_PLACEMENT_CONFLICT',
  'VISIBLE_CONTEXT_TIME_LIGHT_UPSTREAM_CONFLICT',
  'VISIBLE_CONTEXT_CHARACTER_KNOWLEDGE_UPSTREAM_CONFLICT',
  'VISIBLE_CONTEXT_HIDDEN_STATE_UPSTREAM_CONFLICT'
]);

export const STAGE21_ALLOWED_RETURN_STAGES = Object.freeze([
  'stage20_visible_context',
  'stage19_hidden_state',
  'stage18_character_knowledge',
  'stage17_time_light',
  'stage16_item_placement',
  'stage15_npc_placement',
  'stage14_g5_audit',
  'stage13_g5_materialization'
]);

export const STAGE21_ALLOWED_REPAIR_KINDS = Object.freeze([
  'repair_visible_context_projection',
  'remove_hidden_leak',
  'repair_knowledge_boundary_projection',
  'repair_hidden_state',
  'repair_character_knowledge',
  'repair_time_light',
  'repair_item_placement',
  'repair_npc_placement',
  'repair_g5_audit',
  'repair_g5_graph'
]);

const FORMAT_CODES = new Set([
  'VISIBLE_CONTEXT_AUDIT_INVALID_JSON',
  'VISIBLE_CONTEXT_AUDIT_SCHEMA_MISMATCH',
  'VISIBLE_CONTEXT_AUDIT_REQUIRED_BLOCK_MISSING',
  'VISIBLE_CONTEXT_AUDIT_ARRAY_INVALID'
]);

const RETURN_STAGE_NUMBER = Object.freeze({
  stage20_visible_context: 20,
  stage19_hidden_state: 19,
  stage18_character_knowledge: 18,
  stage17_time_light: 17,
  stage16_item_placement: 16,
  stage15_npc_placement: 15,
  stage14_g5_audit: 14,
  stage13_g5_materialization: 13
});

const CODE_ROUTE_COMPATIBILITY = Object.freeze({
  VISIBLE_CONTEXT_G5_AUDIT_CONFLICT: ['stage14_g5_audit', 'stage13_g5_materialization'],
  VISIBLE_CONTEXT_INVALID_ANCHOR_REF: ['stage20_visible_context', 'stage14_g5_audit', 'stage13_g5_materialization'],
  VISIBLE_CONTEXT_INVALID_EXIT_REF: ['stage20_visible_context', 'stage14_g5_audit', 'stage13_g5_materialization'],
  VISIBLE_CONTEXT_NPC_PLACEMENT_CONFLICT: ['stage15_npc_placement'],
  VISIBLE_CONTEXT_INVALID_NPC_REF: ['stage20_visible_context', 'stage15_npc_placement'],
  VISIBLE_CONTEXT_UNSEEN_NPC: ['stage20_visible_context', 'stage15_npc_placement', 'stage17_time_light'],
  VISIBLE_CONTEXT_ITEM_PLACEMENT_CONFLICT: ['stage16_item_placement'],
  VISIBLE_CONTEXT_INVALID_ITEM_REF: ['stage20_visible_context', 'stage16_item_placement'],
  VISIBLE_CONTEXT_INVALID_CONTAINER_REF: ['stage20_visible_context', 'stage16_item_placement'],
  VISIBLE_CONTEXT_UNSEEN_ITEM: ['stage20_visible_context', 'stage16_item_placement', 'stage17_time_light'],
  VISIBLE_CONTEXT_TIME_LIGHT_UPSTREAM_CONFLICT: ['stage17_time_light'],
  VISIBLE_CONTEXT_CLOCK_CONFLICT: ['stage20_visible_context', 'stage17_time_light'],
  VISIBLE_CONTEXT_SEASON_CONFLICT: ['stage20_visible_context', 'stage17_time_light'],
  VISIBLE_CONTEXT_WEATHER_CONFLICT: ['stage20_visible_context', 'stage17_time_light'],
  VISIBLE_CONTEXT_LIGHT_CONFLICT: ['stage20_visible_context', 'stage17_time_light'],
  VISIBLE_CONTEXT_CHARACTER_KNOWLEDGE_UPSTREAM_CONFLICT: ['stage18_character_knowledge'],
  VISIBLE_CONTEXT_KNOWLEDGE_BOUNDARY_CONFLICT: ['stage20_visible_context', 'stage18_character_knowledge'],
  VISIBLE_CONTEXT_HIDDEN_STATE_UPSTREAM_CONFLICT: ['stage19_hidden_state'],
  VISIBLE_CONTEXT_PRIVATE_MOTIVE_LEAK: ['stage20_visible_context', 'stage19_hidden_state'],
  VISIBLE_CONTEXT_PRIVATE_KNOWLEDGE_LEAK: ['stage20_visible_context', 'stage19_hidden_state'],
  VISIBLE_CONTEXT_FUTURE_EVENT_LEAK: ['stage20_visible_context', 'stage19_hidden_state'],
  VISIBLE_CONTEXT_HIDDEN_ROUTE_TRUTH_LEAK: ['stage20_visible_context', 'stage19_hidden_state'],
  VISIBLE_CONTEXT_CLOSED_CONTAINER_CONTENTS_LEAK: ['stage20_visible_context', 'stage16_item_placement', 'stage19_hidden_state']
});

export function normalizeStage21AuditPolicy(policy = {}) {
  return Object.freeze({
    ...DEFAULT_STAGE21_AUDIT_POLICY,
    ...(isObject(policy) ? policy : {})
  });
}

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

export function buildStage21ReferenceIndex(input) {
  const refs = buildStage20ReferenceIndex(input);
  const filter = buildStage20VisibilityFilter(input, refs);
  return {
    refs,
    filter,
    summary: {
      anchor_ids: sorted(refs.anchorIds),
      g5_edge_ids: sorted(refs.g5EdgeIds),
      npc_instance_ids: sorted(refs.npcIds),
      item_instance_ids: sorted(refs.itemIds),
      container_instance_ids: sorted(refs.containerIds),
      knowledge_ids: sorted(refs.knowledgeIds),
      hidden_fact_ids: sorted(refs.hiddenFactIds),
      sensitive_hidden_fact_ids: sorted(refs.sensitiveHiddenFactIds),
      visible_anchor_ids: [...filter.visible_anchor_ids],
      audible_anchor_ids: [...filter.audible_anchor_ids],
      visible_npc_ids: [...filter.visible_npc_ids],
      audible_npc_ids: [...filter.audible_npc_ids],
      visible_item_ids: [...filter.visible_item_ids],
      visible_container_ids: [...filter.visible_container_ids],
      allowed_visible_hint_refs: [...filter.allowed_visible_hint_refs],
      forbidden_hidden_fact_ids: [...filter.forbidden_hidden_fact_ids]
    }
  };
}

export function buildStage21AuditCodePrecheck(input, referenceIndex = buildStage21ReferenceIndex(input)) {
  const concerns = [];
  const inputConcerns = validateStage21Input(input);
  concerns.push(...inputConcerns);
  const recomputed = buildVisibleContextCodePrecheck(
    input?.visible_context_package,
    input,
    referenceIndex.refs,
    referenceIndex.filter
  );
  if (recomputed.pass !== true) concerns.push(...array(recomputed.concerns).map((item) => normalizeStage20Concern(item)));
  if (!deepEqual(recomputed.checks, input?.visible_context_code_precheck?.checks)) concerns.push(issue('VISIBLE_CONTEXT_STAGE20_PRECHECK_MISMATCH', 'Stage 21 recomputed precheck differs from Stage 20 precheck.', 'visible_context_code_precheck.checks'));
  const actualDigest = isObject(input?.visible_context_package) ? computeVisibleContextPackageDigest(input.visible_context_package) : null;
  if (actualDigest !== input?.visible_context_package_digest) concerns.push(issue('VISIBLE_CONTEXT_PACKAGE_DIGEST_MISMATCH', 'Package digest mismatch.', 'visible_context_package_digest', actualDigest, input?.visible_context_package_digest));
  const codes = new Set(concerns.map((item) => item.code));
  const none = (...items) => items.every((code) => !codes.has(code));
  return {
    version: 1,
    schema: STAGE21_PRECHECK_SCHEMA,
    request_id: input?.request_id ?? null,
    visible_context_package_digest: actualDigest,
    pass: concerns.length === 0,
    checks: {
      input_integrity: inputConcerns.length === 0,
      stage20_precheck_integrity: none('VISIBLE_CONTEXT_STAGE20_PRECHECK_MISMATCH', 'VISIBLE_CONTEXT_AUDIT_STAGE20_PRECHECK_INVALID'),
      package_schema: none('VISIBLE_CONTEXT_SCHEMA_MISMATCH', 'VISIBLE_CONTEXT_AUDIT_PACKAGE_INVALID'),
      request_id_match: none('VISIBLE_CONTEXT_REQUEST_ID_MISMATCH', 'VISIBLE_CONTEXT_AUDIT_REQUEST_ID_MISMATCH'),
      package_digest_match: none('VISIBLE_CONTEXT_PACKAGE_DIGEST_MISMATCH', 'VISIBLE_CONTEXT_AUDIT_PACKAGE_DIGEST_MISMATCH'),
      position_match: none('VISIBLE_CONTEXT_POSITION_CONFLICT'),
      clock_match: none('VISIBLE_CONTEXT_CLOCK_CONFLICT'),
      season_match: none('VISIBLE_CONTEXT_SEASON_CONFLICT'),
      weather_match: none('VISIBLE_CONTEXT_WEATHER_CONFLICT'),
      light_match: none('VISIBLE_CONTEXT_LIGHT_CONFLICT'),
      anchor_refs_exist: none('VISIBLE_CONTEXT_INVALID_ANCHOR_REF'),
      exit_refs_exist: none('VISIBLE_CONTEXT_INVALID_EXIT_REF'),
      npc_refs_exist: none('VISIBLE_CONTEXT_INVALID_NPC_REF'),
      item_refs_exist: none('VISIBLE_CONTEXT_INVALID_ITEM_REF'),
      container_refs_exist: none('VISIBLE_CONTEXT_INVALID_CONTAINER_REF'),
      action_target_refs_exist: none('VISIBLE_CONTEXT_ACTION_HIDDEN_TRUTH_LEAK'),
      source_trace_present: none('VISIBLE_CONTEXT_SOURCE_TRACE_MISSING'),
      narrator_scope_present: none('VISIBLE_CONTEXT_REQUIRED_BLOCK_MISSING'),
      must_not_include_present: none('VISIBLE_CONTEXT_MUST_NOT_INCLUDE_INCOMPLETE'),
      no_new_entity_ids: none('VISIBLE_CONTEXT_NEW_ENTITY', 'VISIBLE_CONTEXT_NEW_WORLD_FACT'),
      no_forbidden_hidden_ids: none('VISIBLE_CONTEXT_PRIVATE_MOTIVE_LEAK', 'VISIBLE_CONTEXT_PRIVATE_KNOWLEDGE_LEAK', 'VISIBLE_CONTEXT_FUTURE_EVENT_LEAK', 'VISIBLE_CONTEXT_HIDDEN_ROUTE_TRUTH_LEAK'),
      no_raw_hidden_fields: none('VISIBLE_CONTEXT_PRIVATE_MOTIVE_LEAK', 'VISIBLE_CONTEXT_PRIVATE_KNOWLEDGE_LEAK', 'VISIBLE_CONTEXT_FUTURE_EVENT_LEAK'),
      no_audit_debug_fields: none('VISIBLE_CONTEXT_NARRATOR_PROSE_PRESENT')
    },
    concerns: dedupe(concerns),
    evidence: [
      { kind: 'stage21_independent_code_precheck', result: concerns.length === 0 ? 'passed' : 'failed' },
      { kind: 'visible_context_package_digest', digest: actualDigest },
      { kind: 'reference_counts', anchors: referenceIndex.refs.anchorIds.size, npcs: referenceIndex.refs.npcIds.size, items: referenceIndex.refs.itemIds.size, containers: referenceIndex.refs.containerIds.size }
    ]
  };
}

export function validateVisibleContextAuditOutput(output, input, precheck) {
  const concerns = [];
  if (!isObject(output)) return [issue('VISIBLE_CONTEXT_AUDIT_INVALID_JSON', 'Audit output must be a JSON object.', 'root')];
  if (output.version !== 1 || output.schema !== STAGE21_OUTPUT_SCHEMA) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_SCHEMA_MISMATCH', `Expected ${STAGE21_OUTPUT_SCHEMA} version 1.`, 'schema'));
  if (output.request_id !== input?.request_id) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_REQUEST_ID_MISMATCH', 'Audit request_id must match input.', 'request_id', input?.request_id, output.request_id));
  if (output.visible_context_package_digest !== input?.visible_context_package_digest) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_PACKAGE_DIGEST_MISMATCH', 'Audit package digest must match audited package.', 'visible_context_package_digest', input?.visible_context_package_digest, output.visible_context_package_digest));
  if (typeof output.pass !== 'boolean') concerns.push(issue('VISIBLE_CONTEXT_AUDIT_PASS_MISSING', 'pass must be boolean.', 'pass'));
  if (!isObject(output.checks)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_REQUIRED_BLOCK_MISSING', 'checks must be an object.', 'checks'));
  for (const key of STAGE21_REQUIRED_CHECKS) {
    if (!isObject(output?.checks?.[key])) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_REQUIRED_BLOCK_MISSING', `checks.${key} is required.`, `checks.${key}`));
    else if (typeof output.checks[key].pass !== 'boolean') concerns.push(issue('VISIBLE_CONTEXT_AUDIT_CHECK_INVALID', `checks.${key}.pass must be boolean.`, `checks.${key}.pass`));
  }
  if (!Array.isArray(output.concerns)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_ARRAY_INVALID', 'concerns must be an array.', 'concerns'));
  if (!Array.isArray(output.evidence)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_ARRAY_INVALID', 'evidence must be an array.', 'evidence'));
  for (const [index, item] of array(output.concerns).entries()) validateAuditConcern(item, index, concerns);
  for (const [index, item] of array(output.evidence).entries()) if (!meaningful(item)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_EVIDENCE_INVALID', 'Evidence entries must be non-empty.', `evidence[${index}]`));
  if (precheck?.schema !== STAGE21_PRECHECK_SCHEMA || precheck?.pass !== true) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_PRECHECK_FAILED', 'Audit cannot be accepted when Stage 21 precheck failed.', 'pass'));
  if (hasOwnRecursive(output, 'visible_context_package')) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_MUTATED_PACKAGE', 'Audit output must not contain or rewrite visible_context_package.', 'root'));
  if (hasNarratorProse(output)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_NARRATOR_PROSE_PRESENT', 'Audit output must not contain narrator prose.', 'root'));
  if (hasOwnRecursive(output, 'full_hidden_scene_state')) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_HIDDEN_STATE_PRESENT', 'Audit output must not contain full hidden state.', 'root'));

  const permissions = output.commit_permission;
  if (!isObject(permissions)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_REQUIRED_BLOCK_MISSING', 'commit_permission is required.', 'commit_permission'));
  if (output.pass === true) {
    for (const key of STAGE21_REQUIRED_CHECKS) if (output?.checks?.[key]?.pass !== true) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_CHECK_FAILED_ON_PASS', `checks.${key}.pass must be true when audit passes.`, `checks.${key}.pass`));
    if (array(output.concerns).length !== 0) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_SUCCESS_CONCERNS_PRESENT', 'Successful audit must have no concerns.', 'concerns'));
    if (array(output.evidence).length === 0) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_EVIDENCE_MISSING', 'Successful audit requires non-empty evidence.', 'evidence'));
    if (output.repair_route !== null) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_SUCCESS_ROUTE_PRESENT', 'Successful audit must have repair_route=null.', 'repair_route'));
    for (const key of ['can_send_to_narrator', 'can_write_visible_context_snapshot', 'can_generate_player_facing_prose']) if (permissions?.[key] !== true) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_PERMISSION_INVALID', `${key} must be true when audit passes.`, `commit_permission.${key}`));
  }
  if (output.pass === false) {
    if (!STAGE21_REQUIRED_CHECKS.some((key) => output?.checks?.[key]?.pass === false)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_NO_FAILED_CHECK', 'Failed audit requires at least one failed check.', 'checks'));
    if (array(output.concerns).length === 0) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_CONCERNS_MISSING', 'Failed audit requires concerns.', 'concerns'));
    if (array(output.evidence).length === 0) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_EVIDENCE_MISSING', 'Failed audit requires evidence.', 'evidence'));
    if (!isObject(output.repair_route)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_REPAIR_ROUTE_MISSING', 'Failed audit requires a proposed repair_route.', 'repair_route'));
    for (const key of ['can_send_to_narrator', 'can_write_visible_context_snapshot', 'can_generate_player_facing_prose']) if (permissions?.[key] !== false) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_PERMISSION_INVALID', `${key} must be false when audit fails.`, `commit_permission.${key}`));
    if (isObject(output.repair_route)) {
      if (!STAGE21_ALLOWED_RETURN_STAGES.includes(output.repair_route.return_to_stage)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_REPAIR_ROUTE_INVALID', 'Proposed repair_route.return_to_stage is invalid.', 'repair_route.return_to_stage'));
      if (!STAGE21_ALLOWED_REPAIR_KINDS.includes(output.repair_route.repair_kind)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_REPAIR_ROUTE_INVALID', 'Proposed repair_route.repair_kind is invalid.', 'repair_route.repair_kind'));
    }
  }
  return dedupe(concerns);
}

export function validateStage21RepairRoute(route, audit) {
  const concerns = [];
  if (!isObject(route) || route.version !== 1 || route.schema !== STAGE21_ROUTE_SCHEMA) return [issue('VISIBLE_CONTEXT_AUDIT_ROUTE_SCHEMA_MISMATCH', `Expected ${STAGE21_ROUTE_SCHEMA} version 1.`, 'route.schema')];
  if (route.request_id !== audit?.request_id) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_ROUTE_REQUEST_ID_MISMATCH', 'Route request_id must match audit.', 'route.request_id'));
  if (route.visible_context_package_digest !== audit?.visible_context_package_digest) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_ROUTE_DIGEST_MISMATCH', 'Route digest must match audit.', 'route.visible_context_package_digest'));
  if (!STAGE21_ALLOWED_RETURN_STAGES.includes(route.return_to_stage)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_ROUTE_TARGET_INVALID', 'return_to_stage is invalid.', 'route.return_to_stage'));
  if (!STAGE21_ALLOWED_REPAIR_KINDS.includes(route.repair_kind)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_ROUTE_KIND_INVALID', 'repair_kind is invalid.', 'route.repair_kind'));
  if (!Array.isArray(route.concern_codes) || route.concern_codes.length === 0) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_ROUTE_CONCERNS_MISSING', 'concern_codes must be non-empty.', 'route.concern_codes'));
  if (!Array.isArray(route.evidence_refs) || route.evidence_refs.length === 0) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_ROUTE_EVIDENCE_MISSING', 'evidence_refs must be non-empty.', 'route.evidence_refs'));
  if (!Array.isArray(route.allowed_mutable_paths) || !Array.isArray(route.forbidden_mutable_paths)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_ROUTE_SCOPE_INVALID', 'Mutable path arrays are required.', 'route'));
  if (route.requires_reaudit_from_stage !== 21) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_ROUTE_REAUDIT_INVALID', 'requires_reaudit_from_stage must be 21.', 'route.requires_reaudit_from_stage'));
  const auditCodes = new Set(array(audit?.concerns).map((item) => item?.code));
  for (const [index, code] of array(route.concern_codes).entries()) {
    if (!auditCodes.has(code)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_ROUTE_CONCERN_UNKNOWN', 'Route concern code is absent from audit.', `route.concern_codes[${index}]`));
    const allowedTargets = CODE_ROUTE_COMPATIBILITY[code];
    if (allowedTargets && !allowedTargets.includes(route.return_to_stage)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_ROUTE_TARGET_INCOMPATIBLE', `${code} is incompatible with ${route.return_to_stage}.`, 'route.return_to_stage'));
  }
  const auditEvidenceCount = array(audit?.evidence).length;
  for (const [index, ref] of array(route.evidence_refs).entries()) {
    const numeric = typeof ref === 'number' ? ref : ref?.evidence_index;
    if (!Number.isInteger(numeric) || numeric < 0 || numeric >= auditEvidenceCount) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_ROUTE_EVIDENCE_INVALID', 'evidence_ref must point to audit evidence.', `route.evidence_refs[${index}]`));
  }
  return dedupe(concerns);
}

export async function runStage21VisibleContextAuditBlock({ input, auditor, formatRepairer, seniorAuditor, auditRouter } = {}) {
  const inputConcerns = validateStage21Input(input);
  if (inputConcerns.length > 0) throw stage21Error('Stage 21 input gate failed.', inputConcerns, { failed_gate: 'stage21_input_gate', input_snapshot: safeClone(input), terminal: true });
  for (const [name, callback] of Object.entries({ auditor, formatRepairer, seniorAuditor, auditRouter })) if (typeof callback !== 'function') throw new Error(`Stage 21 requires ${name} callback.`);
  const referenceIndex = buildStage21ReferenceIndex(input);
  const precheck = buildStage21AuditCodePrecheck(input, referenceIndex);
  if (precheck.pass !== true) throw stage21Error('Stage 21 independent code precheck failed.', precheck.concerns, { failed_gate: 'stage21_code_precheck', audit_code_precheck: precheck, terminal: true });

  const auditHistory = [];
  const diagnostics = { auditor_attempts: 0, format_repair_attempts: 0, senior_auditor_attempts: 0, router_attempts: 0, last_error_codes: [] };
  let candidate = await callRole(auditor, buildAuditorRoleInput(input, precheck, referenceIndex.summary), 'VisibleContextSemanticAuditor');
  diagnostics.auditor_attempts += 1;
  let seniorAlreadyUsed = false;
  try {
    candidate = await normalizeAuditFormat(candidate, input, precheck, referenceIndex.summary, formatRepairer, auditHistory, diagnostics);
  } catch (formatError) {
    auditHistory.push({ attempt_index: auditHistory.length + 1, kind: 'auditor_retry_after_format_failure', role: 'VisibleContextSemanticAuditor', issue_codes: array(formatError?.lifecycle?.concerns).map((item) => item?.code).filter(Boolean) });
    const retry = await callRole(auditor, {
      ...buildAuditorRoleInput(input, precheck, referenceIndex.summary),
      previous_format_failure: safeClone(formatError?.lifecycle?.concerns ?? []),
      constraints: { audit_only: true, output_strict_json: true, do_not_modify_visible_context_package: true }
    }, 'VisibleContextSemanticAuditor');
    diagnostics.auditor_attempts += 1;
    try {
      candidate = await normalizeAuditFormat(retry, input, precheck, referenceIndex.summary, formatRepairer, auditHistory, diagnostics);
    } catch (secondFormatError) {
      const senior = await callRole(seniorAuditor, {
        ...buildAuditorRoleInput(input, precheck, referenceIndex.summary),
        schema: 'visible_context_senior_semantic_audit_request',
        failed_audit_output: safeClone(retry),
        audit_validation_errors: safeClone(secondFormatError?.lifecycle?.concerns ?? []),
        constraints: { audit_only: true, output_strict_json: true, do_not_modify_visible_context_package: true, do_not_write_narrator_prose: true }
      }, 'SeniorVisibleContextSemanticAuditor');
      diagnostics.senior_auditor_attempts += 1;
      seniorAlreadyUsed = true;
      auditHistory.push({ attempt_index: auditHistory.length + 1, kind: 'senior_audit_after_format_failure', role: 'SeniorVisibleContextSemanticAuditor', issue_codes: array(secondFormatError?.lifecycle?.concerns).map((item) => item?.code).filter(Boolean) });
      candidate = await normalizeAuditFormat(senior, input, precheck, referenceIndex.summary, formatRepairer, auditHistory, diagnostics);
    }
  }
  let auditConcerns = validateVisibleContextAuditOutput(candidate.value, input, precheck);

  if (auditConcerns.length > 0 && !seniorAlreadyUsed && !auditConcerns.every((item) => FORMAT_CODES.has(item.code))) {
    const senior = await callRole(seniorAuditor, {
      ...buildAuditorRoleInput(input, precheck, referenceIndex.summary),
      schema: 'visible_context_senior_semantic_audit_request',
      failed_audit_output: safeClone(candidate.value),
      audit_validation_errors: safeClone(auditConcerns),
      constraints: { audit_only: true, do_not_modify_visible_context_package: true, do_not_write_narrator_prose: true }
    }, 'SeniorVisibleContextSemanticAuditor');
    diagnostics.senior_auditor_attempts += 1;
    seniorAlreadyUsed = true;
    auditHistory.push({ attempt_index: auditHistory.length + 1, kind: 'senior_audit', role: 'SeniorVisibleContextSemanticAuditor', issue_codes: auditConcerns.map((item) => item.code) });
    candidate = await normalizeAuditFormat(senior, input, precheck, referenceIndex.summary, formatRepairer, auditHistory, diagnostics);
    auditConcerns = validateVisibleContextAuditOutput(candidate.value, input, precheck);
  }

  if (auditConcerns.length > 0) {
    diagnostics.last_error_codes = auditConcerns.map((item) => item.code);
    throw stage21Error('Stage 21 audit output validation failed.', auditConcerns, { failed_gate: 'stage21_audit_output_validation', audit_code_precheck: precheck, failed_audit_output: safeClone(candidate.value), audit_history: auditHistory, terminal: true });
  }

  const audit = candidate.value;
  let route = null;
  if (audit.pass === false) {
    const routed = await callRole(auditRouter, buildRouterRoleInput(audit, input, precheck), 'VisibleContextAuditRouter');
    diagnostics.router_attempts += 1;
    const parsedRoute = parseRoleResult(routed);
    if (parsedRoute.parseError) throw stage21Error('Stage 21 router returned invalid JSON.', [issue('VISIBLE_CONTEXT_AUDIT_ROUTE_INVALID_JSON', parsedRoute.parseError, 'route')], { failed_gate: 'stage21_router_format', audit, terminal: true });
    const routeConcerns = validateStage21RepairRoute(parsedRoute.value, audit);
    if (routeConcerns.length > 0) throw stage21Error('Stage 21 router output validation failed.', routeConcerns, { failed_gate: 'stage21_router_validation', audit, route: safeClone(parsedRoute.value), terminal: true });
    route = parsedRoute.value;
    auditHistory.push({ attempt_index: auditHistory.length + 1, kind: 'audit_route', role: 'VisibleContextAuditRouter', concern_codes: route.concern_codes, return_to_stage: route.return_to_stage });
  }

  const pass = audit.pass === true && route === null;
  const permission = pass
    ? { can_send_to_narrator: true, can_write_visible_context_snapshot: true, can_generate_player_facing_prose: true }
    : { can_send_to_narrator: false, can_write_visible_context_snapshot: false, can_generate_player_facing_prose: false };
  return {
    version: 1,
    schema: STAGE21_RESULT_SCHEMA,
    request_id: input.request_id,
    pass,
    visible_context_package_digest: input.visible_context_package_digest,
    input_snapshot_digest: computeInputSnapshotDigest(input),
    audit_code_precheck: structuredClone(precheck),
    visible_context_audit: structuredClone(audit),
    repair_route: route ? structuredClone(route) : null,
    audit_history: structuredClone(auditHistory),
    diagnostics,
    commit_permission: permission
  };
}

export function validateProvidedStage21Result() {
  throw new Error('Provided Stage 21 output is forbidden in production, development and tests. Stub the Stage 21 role executors instead.');
}

export function returnStageNumber(route) {
  return RETURN_STAGE_NUMBER[route?.return_to_stage] ?? null;
}

function buildAuditorRoleInput(input, precheck, referenceSummary) {
  return {
    version: 1,
    schema: 'visible_context_semantic_audit_request',
    request_id: input.request_id,
    visible_context_audit_input: structuredClone(input),
    audit_code_precheck: structuredClone(precheck),
    reference_index_summary: structuredClone(referenceSummary),
    allowed_concern_codes: [...STAGE21_ALLOWED_CONCERN_CODES],
    allowed_concern_severities: [...STAGE21_ALLOWED_SEVERITIES],
    allowed_repair_routes: [...STAGE21_ALLOWED_RETURN_STAGES],
    allowed_repair_kinds: [...STAGE21_ALLOWED_REPAIR_KINDS],
    constraints: {
      output_only_schema: STAGE21_OUTPUT_SCHEMA,
      audit_only: true,
      do_not_modify_visible_context_package: true,
      do_not_reveal_hidden_state_beyond_minimal_evidence: true,
      require_nonempty_evidence_even_on_success: true,
      do_not_write_narrator_prose: true
    }
  };
}

function buildRouterRoleInput(audit, input, precheck) {
  return {
    version: 1,
    schema: 'visible_context_audit_router_input',
    request_id: input.request_id,
    visible_context_package_digest: input.visible_context_package_digest,
    visible_context_audit: structuredClone(audit),
    audit_code_precheck: structuredClone(precheck),
    permitted_return_stages: [...STAGE21_ALLOWED_RETURN_STAGES],
    permitted_repair_kinds: [...STAGE21_ALLOWED_REPAIR_KINDS],
    route_compatibility: structuredClone(CODE_ROUTE_COMPATIBILITY),
    constraints: {
      choose_one_route_only: true,
      cite_audit_evidence_by_index: true,
      do_not_modify_audit: true,
      do_not_modify_visible_context_package: true,
      requires_reaudit_from_stage: 21
    }
  };
}

async function normalizeAuditFormat(result, input, precheck, referenceSummary, formatRepairer, auditHistory, diagnostics) {
  const parsed = parseRoleResult(result);
  const formatConcerns = parsed.parseError
    ? [issue('VISIBLE_CONTEXT_AUDIT_INVALID_JSON', parsed.parseError, 'root')]
    : validateAuditFormatOnly(parsed.value);
  if (formatConcerns.length === 0) return parsed;
  const repaired = await callRole(formatRepairer, {
    version: 1,
    schema: 'visible_context_audit_format_repair_input',
    request_id: input.request_id,
    target: STAGE21_OUTPUT_SCHEMA,
    raw_audit_response: parsed.raw,
    parsed_audit_response: safeClone(parsed.value),
    parse_errors: formatConcerns,
    visible_context_package_digest: input.visible_context_package_digest,
    required_checks: [...STAGE21_REQUIRED_CHECKS],
    required_schema: STAGE21_OUTPUT_SCHEMA,
    reference_index_summary: structuredClone(referenceSummary),
    audit_code_precheck: structuredClone(precheck),
    constraints: { change_format_only: true, do_not_change_pass: true, do_not_add_semantic_evidence: true, do_not_choose_repair_route: true, do_not_modify_world_refs: true }
  }, 'VisibleContextAuditFormatRepairer');
  diagnostics.format_repair_attempts += 1;
  auditHistory.push({ attempt_index: auditHistory.length + 1, kind: 'format_repair', role: 'VisibleContextAuditFormatRepairer', issue_codes: formatConcerns.map((item) => item.code) });
  const repairedParsed = parseRoleResult(repaired);
  const repairedConcerns = repairedParsed.parseError ? [issue('VISIBLE_CONTEXT_AUDIT_INVALID_JSON', repairedParsed.parseError, 'root')] : validateAuditFormatOnly(repairedParsed.value);
  if (repairedConcerns.length > 0) throw stage21Error('Stage 21 format repair failed.', repairedConcerns, { failed_gate: 'stage21_format_repair', terminal: false });
  return repairedParsed;
}

function validateAuditFormatOnly(output) {
  const concerns = [];
  if (!isObject(output)) return [issue('VISIBLE_CONTEXT_AUDIT_INVALID_JSON', 'Audit output must be an object.', 'root')];
  if (output.version !== 1 || output.schema !== STAGE21_OUTPUT_SCHEMA) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_SCHEMA_MISMATCH', `Expected ${STAGE21_OUTPUT_SCHEMA} version 1.`, 'schema'));
  if (!isObject(output.checks) || !isObject(output.commit_permission)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_REQUIRED_BLOCK_MISSING', 'checks and commit_permission are required objects.', 'root'));
  if (!Array.isArray(output.concerns) || !Array.isArray(output.evidence)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_ARRAY_INVALID', 'concerns and evidence must be arrays.', 'root'));
  return concerns;
}

function validateAuditConcern(item, index, concerns) {
  if (!isObject(item)) { concerns.push(issue('VISIBLE_CONTEXT_AUDIT_CONCERN_INVALID', 'Concern must be an object.', `concerns[${index}]`)); return; }
  if (!STAGE21_ALLOWED_CONCERN_CODES.includes(item.code)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_CONCERN_CODE_INVALID', 'Concern code is outside the allowed enum.', `concerns[${index}].code`));
  if (!STAGE21_ALLOWED_SEVERITIES.includes(item.severity)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_CONCERN_SEVERITY_INVALID', 'Concern severity is outside the allowed enum.', `concerns[${index}].severity`));
  if (!text(item.message)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_CONCERN_MESSAGE_MISSING', 'Concern message is required.', `concerns[${index}].message`));
}

function normalizeStage20Concern(item) {
  const mapping = {
    VISIBLE_CONTEXT_SCHEMA_MISMATCH: 'VISIBLE_CONTEXT_SCHEMA_MISMATCH',
    VISIBLE_CONTEXT_REQUIRED_BLOCK_MISSING: 'VISIBLE_CONTEXT_REQUIRED_BLOCK_MISSING',
    VISIBLE_CONTEXT_POSITION_MISMATCH: 'VISIBLE_CONTEXT_POSITION_CONFLICT',
    VISIBLE_CONTEXT_CLOCK_MISMATCH: 'VISIBLE_CONTEXT_CLOCK_CONFLICT',
    VISIBLE_CONTEXT_SEASON_MISMATCH: 'VISIBLE_CONTEXT_SEASON_CONFLICT',
    VISIBLE_CONTEXT_WEATHER_MISMATCH: 'VISIBLE_CONTEXT_WEATHER_CONFLICT',
    VISIBLE_CONTEXT_LIGHT_MISMATCH: 'VISIBLE_CONTEXT_LIGHT_CONFLICT',
    VISIBLE_CONTEXT_ANCHOR_REF_NOT_FOUND: 'VISIBLE_CONTEXT_INVALID_ANCHOR_REF',
    VISIBLE_CONTEXT_EXIT_REF_NOT_FOUND: 'VISIBLE_CONTEXT_INVALID_EXIT_REF',
    VISIBLE_CONTEXT_NPC_REF_NOT_FOUND: 'VISIBLE_CONTEXT_INVALID_NPC_REF',
    VISIBLE_CONTEXT_ITEM_REF_NOT_FOUND: 'VISIBLE_CONTEXT_INVALID_ITEM_REF',
    VISIBLE_CONTEXT_CONTAINER_REF_NOT_FOUND: 'VISIBLE_CONTEXT_INVALID_CONTAINER_REF',
    VISIBLE_CONTEXT_NOT_VISIBLE: 'VISIBLE_CONTEXT_UNSEEN_NPC',
    VISIBLE_CONTEXT_HIDDEN_ITEM_LEAK: 'VISIBLE_CONTEXT_UNSEEN_ITEM',
    VISIBLE_CONTEXT_CLOSED_CONTAINER_CONTENTS_LEAK: 'VISIBLE_CONTEXT_CLOSED_CONTAINER_CONTENTS_LEAK',
    VISIBLE_CONTEXT_PRIVATE_MOTIVE_LEAK: 'VISIBLE_CONTEXT_PRIVATE_MOTIVE_LEAK',
    VISIBLE_CONTEXT_PRIVATE_KNOWLEDGE_LEAK: 'VISIBLE_CONTEXT_PRIVATE_KNOWLEDGE_LEAK',
    VISIBLE_CONTEXT_FUTURE_EVENT_LEAK: 'VISIBLE_CONTEXT_FUTURE_EVENT_LEAK',
    VISIBLE_CONTEXT_TRUE_OWNERSHIP_LEAK: 'VISIBLE_CONTEXT_UNKNOWN_OWNERSHIP_LEAK',
    VISIBLE_CONTEXT_HIDDEN_ROUTE_TRUTH_LEAK: 'VISIBLE_CONTEXT_HIDDEN_ROUTE_TRUTH_LEAK',
    VISIBLE_CONTEXT_RUMOR_TREATED_AS_FACT: 'VISIBLE_CONTEXT_RUMOR_AS_FACT',
    VISIBLE_CONTEXT_UNCERTAIN_TREATED_AS_FACT: 'VISIBLE_CONTEXT_UNCERTAINTY_AS_FACT',
    VISIBLE_CONTEXT_ACTION_LABEL_USES_HIDDEN_TRUTH: 'VISIBLE_CONTEXT_ACTION_HIDDEN_TRUTH_LEAK',
    VISIBLE_CONTEXT_KNOWLEDGE_BASIS_MISSING: 'VISIBLE_CONTEXT_KNOWLEDGE_BOUNDARY_CONFLICT',
    VISIBLE_CONTEXT_CREATED_WORLD_FACT: 'VISIBLE_CONTEXT_NEW_WORLD_FACT',
    VISIBLE_CONTEXT_CREATED_NPC: 'VISIBLE_CONTEXT_NEW_ENTITY',
    VISIBLE_CONTEXT_CREATED_ITEM: 'VISIBLE_CONTEXT_NEW_ENTITY',
    VISIBLE_CONTEXT_CREATED_CONTAINER: 'VISIBLE_CONTEXT_NEW_ENTITY',
    VISIBLE_CONTEXT_CREATED_ANCHOR: 'VISIBLE_CONTEXT_NEW_ENTITY',
    VISIBLE_CONTEXT_CREATED_ROUTE: 'VISIBLE_CONTEXT_NEW_ENTITY',
    VISIBLE_CONTEXT_CREATED_NARRATOR_PROSE: 'VISIBLE_CONTEXT_NARRATOR_PROSE_PRESENT',
    VISIBLE_CONTEXT_SOURCE_MISSING: 'VISIBLE_CONTEXT_SOURCE_TRACE_MISSING',
    VISIBLE_CONTEXT_MUST_NOT_INCLUDE_MISSING: 'VISIBLE_CONTEXT_MUST_NOT_INCLUDE_INCOMPLETE'
  };
  return {
    ...item,
    code: mapping[item?.code] ?? item?.code ?? 'VISIBLE_CONTEXT_REQUIRED_BLOCK_MISSING',
    severity: 'hard_block'
  };
}

function computeInputSnapshotDigest(input) {
  const technical = {
    request_id: input?.request_id,
    visible_context_package_digest: input?.visible_context_package_digest,
    historical_frame: input?.historical_frame,
    weather_state: input?.weather_state,
    current_position: input?.current_position,
    g5_scene_audit: input?.g5_scene_audit,
    npc_placement_audit: input?.npc_placement_audit,
    item_placement_audit: input?.item_placement_audit,
    time_light_consistency_audit: input?.time_light_consistency_audit,
    character_knowledge_map_audit: input?.character_knowledge_map_audit,
    full_hidden_state_audit: input?.full_hidden_state_audit
  };
  return computeVisibleContextPackageDigest(technical);
}

async function callRole(callback, input, role) {
  const result = await callback(structuredClone(input));
  if (result == null) throw new Error(`${role} returned no result.`);
  return result;
}

function parseRoleResult(result) {
  if (isObject(result) && 'output' in result) return parseRoleResult(result.output);
  if (isObject(result) && 'content' in result && typeof result.content === 'string') return parseRoleResult(result.content);
  if (typeof result === 'string') {
    try { return { value: JSON.parse(stripJsonFence(result)), raw: result, parseError: null }; }
    catch (error) { return { value: null, raw: result, parseError: error?.message ?? String(error) }; }
  }
  if (isObject(result)) return { value: structuredClone(result), raw: structuredClone(result), parseError: null };
  return { value: null, raw: result, parseError: 'Unsupported role result type.' };
}

function stripJsonFence(value) {
  return String(value).trim().replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '');
}

function stage21Error(message, concerns = [], details = {}) {
  const error = new Error(message);
  error.name = 'Stage21VisibleContextAuditError';
  error.lifecycle = {
    stage_id: 21,
    stage_slug: 'visible_context_audit',
    stage_type: 'isolated_llm_audit_block',
    concerns: safeClone(concerns),
    ...safeClone(details)
  };
  return error;
}

function validateCurrentPosition(position, concerns) {
  if (!isObject(position)) { concerns.push(issue('VISIBLE_CONTEXT_AUDIT_POSITION_INVALID', 'current_position is required.', 'current_position')); return; }
  for (const key of ['region_id', 'place_id', 'location_id', 'minilocation_id', 'anchor_id']) if (!text(position[key])) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_POSITION_INVALID', `current_position.${key} is required.`, `current_position.${key}`));
  if (position.last_route_id != null) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_POSITION_INVALID', 'last_route_id must be null before initial commit.', 'current_position.last_route_id'));
}

function hasNarratorProse(value) {
  let found = false;
  walk(value, (key, child) => {
    if (['prose', 'narrator_prose', 'intro_prose', 'player_facing_prose'].includes(key) && meaningful(child)) found = true;
  });
  return found;
}

function requireSchema(concerns, value, schema, field, code) {
  if (!isObject(value) || value.version !== 1 || value.schema !== schema) concerns.push(issue(code, `${field} must be ${schema} version 1.`, field));
}

function requireAudit(concerns, value, schema, field, code) {
  requireSchema(concerns, value, schema, field, code);
  if (value?.pass !== true) concerns.push(issue(code, `${field}.pass must be true.`, `${field}.pass`, true, value?.pass));
}

function issue(code, message, field, expected = undefined, actual = undefined) {
  return { code, severity: 'hard_block', message, field, ...(expected !== undefined ? { expected } : {}), ...(actual !== undefined ? { actual } : {}) };
}
function array(value) { return Array.isArray(value) ? value : []; }
function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function meaningful(value) { return value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0) && !(isObject(value) && Object.keys(value).length === 0); }
function safeClone(value) { try { return structuredClone(value); } catch { return null; } }
function deepEqual(a, b) { try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; } }
function sorted(set) { return [...set].sort(); }
function dedupe(concerns) { const seen = new Set(); return concerns.filter((item) => { const key = `${item.code}|${item.field}|${item.message}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function hasOwnRecursive(value, target) { let found = false; walk(value, (key) => { if (key === target) found = true; }); return found; }
function walk(value, visitor, path = 'root') { if (value == null || typeof value !== 'object') return; if (Array.isArray(value)) { value.forEach((child, index) => walk(child, visitor, `${path}[${index}]`)); return; } for (const [key, child] of Object.entries(value)) { visitor(key, child, `${path}.${key}`); walk(child, visitor, `${path}.${key}`); } }
