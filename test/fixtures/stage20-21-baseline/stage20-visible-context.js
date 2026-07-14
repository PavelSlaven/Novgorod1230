import { computeVisibleContextPackageDigest } from './visible-context-digest.js';

export const STAGE20_INPUT_SCHEMA = 'visible_context_builder_input';
export const STAGE20_OUTPUT_SCHEMA = 'visible_context_package';
export const STAGE20_VISIBILITY_FILTER_SCHEMA = 'visible_context_visibility_filter';
export const STAGE20_PRECHECK_SCHEMA = 'visible_context_code_precheck';
export const STAGE20_RESULT_SCHEMA = 'stage20_visible_context_result';

export const DEFAULT_STAGE20_VISIBLE_CONTEXT_POLICY = Object.freeze({
  require_current_position_match: true,
  require_time_light_consistency: true,
  require_character_knowledge_boundary: true,
  require_hidden_state_filter: true,
  require_reveal_conditions: true,
  require_source_trace: true,
  allow_visible_hints_from_hidden_state: true,
  allow_reasonable_character_inference: true,
  reject_hidden_truth_leak: true,
  reject_private_motives: true,
  reject_closed_container_contents: true,
  reject_future_events: true,
  reject_unknown_exact_routes: true,
  reject_unseen_items: true,
  reject_raw_json_output_to_narrator: true,
  do_not_create_new_world_facts: true,
  do_not_change_clock: true,
  do_not_change_scene_state: true
});

const OUTPUT_ARRAYS = Object.freeze([
  'visible_scene_facts',
  'visible_anchors',
  'visible_exits',
  'visible_npcs',
  'visible_items',
  'visible_containers',
  'visible_risks',
  'audible_context',
  'smell_context',
  'touch_body_context',
  'weather_light_context',
  'known_context',
  'rumor_context',
  'uncertain_context',
  'available_actions_context',
  'hidden_filtered_out',
  'source_trace'
]);

const STATUS = new Set(['formed', 'empty_limited', 'blocked', 'requires_repair']);
const FILTER_REASONS = new Set([
  'not_visible', 'not_audible', 'not_known', 'private_motive', 'private_knowledge',
  'closed_container', 'future_event', 'unknown_ownership', 'hidden_route',
  'unmet_reveal_condition', 'system_only'
]);
const FORMAT_CODES = new Set([
  'VISIBLE_CONTEXT_INVALID_JSON',
  'VISIBLE_CONTEXT_SCHEMA_MISMATCH',
  'VISIBLE_CONTEXT_REQUIRED_BLOCK_MISSING',
  'VISIBLE_CONTEXT_ARRAY_INVALID'
]);

export function normalizeStage20VisibleContextPolicy(policy = {}) {
  return Object.freeze({
    ...DEFAULT_STAGE20_VISIBLE_CONTEXT_POLICY,
    ...(isObject(policy) ? policy : {})
  });
}

export function buildStage20VisibleContextInput(values = {}) {
  const input = isObject(values) ? values : {};
  return {
    version: 1,
    schema: STAGE20_INPUT_SCHEMA,
    request_id: input.request_id ?? null,
    historical_frame: input.historical_frame ?? null,
    weather_state: input.weather_state ?? null,
    selected_start_node: input.selected_start_node ?? null,
    player_character: input.player_character ?? null,
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
    visible_context_policy: normalizeStage20VisibleContextPolicy(input.visible_context_policy ?? input.policy ?? {})
  };
}

export function validateStage20Input(input) {
  const concerns = [];
  if (!isObject(input)) return [issue('VISIBLE_CONTEXT_INPUT_INVALID', 'Stage 20 input must be an object.', 'root')];
  if (input.version !== 1 || input.schema !== STAGE20_INPUT_SCHEMA) concerns.push(issue('VISIBLE_CONTEXT_INPUT_SCHEMA_MISMATCH', `Expected ${STAGE20_INPUT_SCHEMA} version 1.`, 'schema'));
  if (!text(input.request_id)) concerns.push(issue('VISIBLE_CONTEXT_INPUT_REQUEST_ID_MISSING', 'request_id is required.', 'request_id'));
  requireSchema(concerns, input.historical_frame, 'historical_frame', 'historical_frame', 'VISIBLE_CONTEXT_HISTORICAL_FRAME_INVALID');
  requireSchema(concerns, input.weather_state, 'weather_state', 'weather_state', 'VISIBLE_CONTEXT_WEATHER_STATE_INVALID');
  requireSchema(concerns, input.selected_start_node, 'selected_start_node', 'selected_start_node', 'VISIBLE_CONTEXT_SELECTED_START_NODE_INVALID');
  requireSchema(concerns, input.player_character, 'player_character_game_profile', 'player_character', 'VISIBLE_CONTEXT_PLAYER_CHARACTER_INVALID');
  requireSchema(concerns, input.g5_scene_graph, 'g5_scene_graph_draft', 'g5_scene_graph', 'VISIBLE_CONTEXT_G5_SCENE_INVALID');
  requireAudit(concerns, input.g5_scene_audit, 'g5_scene_audit', 'g5_scene_audit', 'VISIBLE_CONTEXT_G5_AUDIT_FAILED');
  requireSchema(concerns, input.initial_npc_placement, 'initial_npc_placement_draft', 'initial_npc_placement', 'VISIBLE_CONTEXT_NPC_PLACEMENT_INVALID');
  requireAudit(concerns, input.npc_placement_audit, 'initial_npc_placement_audit', 'npc_placement_audit', 'VISIBLE_CONTEXT_NPC_AUDIT_FAILED');
  requireSchema(concerns, input.initial_item_placement, 'initial_item_placement_draft', 'initial_item_placement', 'VISIBLE_CONTEXT_ITEM_PLACEMENT_INVALID');
  requireAudit(concerns, input.item_placement_audit, 'initial_item_placement_audit', 'item_placement_audit', 'VISIBLE_CONTEXT_ITEM_AUDIT_FAILED');
  requireAudit(concerns, input.time_light_consistency_audit, 'time_light_consistency_audit', 'time_light_consistency_audit', 'VISIBLE_CONTEXT_TIME_LIGHT_AUDIT_FAILED');
  requireSchema(concerns, input.character_knowledge_map, 'character_knowledge_map', 'character_knowledge_map', 'VISIBLE_CONTEXT_KNOWLEDGE_MAP_INVALID');
  requireAudit(concerns, input.character_knowledge_map_audit, 'character_knowledge_map_audit', 'character_knowledge_map_audit', 'VISIBLE_CONTEXT_KNOWLEDGE_AUDIT_FAILED');
  requireSchema(concerns, input.full_hidden_scene_state, 'full_hidden_scene_state', 'full_hidden_scene_state', 'VISIBLE_CONTEXT_HIDDEN_STATE_INVALID');
  requireAudit(concerns, input.full_hidden_state_audit, 'full_hidden_state_audit', 'full_hidden_state_audit', 'VISIBLE_CONTEXT_HIDDEN_AUDIT_FAILED');
  validateCurrentPosition(input, concerns);

  if (input.time_light_consistency_audit?.commit_permission?.can_continue_to_visible_context !== true) concerns.push(issue('VISIBLE_CONTEXT_TIME_LIGHT_AUDIT_FAILED', 'Stage 17 must allow continuation to visible context.', 'time_light_consistency_audit.commit_permission.can_continue_to_visible_context'));
  if (input.character_knowledge_map_audit?.commit_permission?.can_continue_to_hidden_state !== true) concerns.push(issue('VISIBLE_CONTEXT_KNOWLEDGE_AUDIT_FAILED', 'Stage 18 audit must be commit-ready.', 'character_knowledge_map_audit.commit_permission.can_continue_to_hidden_state'));
  for (const [key, expected] of Object.entries(DEFAULT_STAGE20_VISIBLE_CONTEXT_POLICY)) {
    if (input.visible_context_policy?.[key] !== expected) concerns.push(issue('VISIBLE_CONTEXT_POLICY_INCOMPLETE', `${key} must be ${expected}.`, `visible_context_policy.${key}`, expected, input.visible_context_policy?.[key]));
  }
  const authoritativeWeather = input.time_light_consistency_audit?.authoritative_frame?.weather_state;
  if (authoritativeWeather && !deepEqual(authoritativeWeather, input.weather_state)) concerns.push(issue('VISIBLE_CONTEXT_WEATHER_MISMATCH', 'weather_state differs from Stage 17 authoritative weather.', 'weather_state'));
  return dedupe(concerns);
}

export function buildStage20ReferenceIndex(input) {
  const refs = {
    anchorIds: new Set(),
    minilocationIds: new Set(),
    g5EdgeIds: new Set(),
    npcIds: new Set(),
    itemIds: new Set(),
    containerIds: new Set(),
    knowledgeIds: new Set(),
    knowledgeSourceIds: new Set(),
    hiddenFactIds: new Set(),
    sensitiveHiddenFactIds: new Set(),
    revealConditionIds: new Set(),
    discoveryRuleIds: new Set(),
    allowedVisibleHintRefs: new Set(),
    npcById: new Map(),
    itemById: new Map(),
    containerById: new Map(),
    anchorById: new Map(),
    edgeById: new Map()
  };
  for (const anchor of array(input?.g5_scene_graph?.g5_anchors ?? input?.g5_scene_graph?.anchors)) {
    const id = anchor?.g5_anchor_id ?? anchor?.anchor_id ?? anchor?.id;
    if (text(id)) { refs.anchorIds.add(id); refs.anchorById.set(id, anchor); }
  }
  for (const miniloc of array(input?.g5_scene_graph?.g5_minilocations ?? input?.g5_scene_graph?.minilocations)) addText(refs.minilocationIds, miniloc?.g5_minilocation_id ?? miniloc?.minilocation_id ?? miniloc?.id);
  for (const edge of array(input?.g5_scene_graph?.g5_edges ?? input?.g5_scene_graph?.edges)) {
    const id = edge?.g5_edge_id ?? edge?.edge_id ?? edge?.id;
    if (text(id)) { refs.g5EdgeIds.add(id); refs.edgeById.set(id, edge); }
  }
  for (const npc of array(input?.initial_npc_placement?.npc_instances ?? input?.initial_npc_placement?.placements)) {
    const id = npc?.npc_instance_id ?? npc?.npc_id ?? npc?.id;
    if (text(id)) { refs.npcIds.add(id); refs.npcById.set(id, npc); }
  }
  for (const item of array(input?.initial_item_placement?.item_instances ?? input?.initial_item_placement?.items)) {
    const id = item?.item_instance_id ?? item?.item_id ?? item?.id;
    if (text(id)) { refs.itemIds.add(id); refs.itemById.set(id, item); }
  }
  for (const container of array(input?.initial_item_placement?.container_instances ?? input?.initial_item_placement?.containers)) {
    const id = container?.container_instance_id ?? container?.container_id ?? container?.id;
    if (text(id)) { refs.containerIds.add(id); refs.containerById.set(id, container); }
  }
  for (const key of KNOWLEDGE_GROUPS) {
    for (const record of array(input?.character_knowledge_map?.[key])) {
      collectRecordIds(record, refs.knowledgeIds);
      collectByKeys(record?.source_trace, refs.knowledgeSourceIds, ['source_id', 'source_ref', 'source_record_id', 'fact_id', 'rule_id']);
    }
  }
  collectByKeys(input?.character_knowledge_map?.source_trace, refs.knowledgeSourceIds, ['source_id', 'source_ref', 'source_record_id', 'fact_id', 'rule_id']);
  indexHiddenFacts(input?.full_hidden_scene_state, refs);
  return refs;
}

const KNOWLEDGE_GROUPS = Object.freeze([
  'known_routes', 'known_nearby_paths', 'known_places', 'known_addresses', 'known_landmarks',
  'known_people', 'known_authorities', 'known_dangers', 'known_social_rules', 'known_resources',
  'rumors', 'mistaken_beliefs', 'uncertain_knowledge', 'forbidden_knowledge', 'knowledge_gaps'
]);

export function buildStage20VisibilityFilter(input, refs = buildStage20ReferenceIndex(input)) {
  const normalized = input?.time_light_consistency_audit?.normalized_visibility_constraints ?? {};
  const visibleAnchors = new Set(array(normalized.visible_without_action).filter((id) => refs.anchorIds.has(id)));
  const audibleAnchors = new Set(array(normalized.audible_but_not_visible).filter((id) => refs.anchorIds.has(id)));
  const inspectAnchors = new Set(array(normalized.visible_only_on_inspection).filter((id) => refs.anchorIds.has(id)));
  const hiddenUntilAction = new Set(array(normalized.hidden_until_action).filter((id) => refs.anchorIds.has(id)));
  if (refs.anchorIds.has(input?.current_position?.anchor_id)) visibleAnchors.add(input.current_position.anchor_id);

  const visibleNpcIds = new Set();
  const audibleNpcIds = new Set();
  const identifiedNpcIds = new Set();
  for (const [id, npc] of refs.npcById.entries()) {
    const state = npc?.visibility_state ?? {};
    if (state.visible_to_player === true || state.visible_to_player_now === true) visibleNpcIds.add(id);
    if (state.audible_to_player === true || state.audible_to_player_now === true || state.heard_by_player === true) audibleNpcIds.add(id);
    const nameStatus = npc?.identity?.name_status;
    if (['known_name', 'nickname', 'identified'].includes(nameStatus) || npc?.identity?.known_to_player === true) identifiedNpcIds.add(id);
  }

  const visibleItemIds = new Set();
  const inspectableItemIds = new Set();
  for (const [id, item] of refs.itemById.entries()) {
    const state = item?.visibility_state ?? {};
    if (state.visible_to_player_now === true || state.visible_to_player === true) visibleItemIds.add(id);
    if (state.visible_if_inspected === true || state.requires_inspection === true || ['visible_on_inspection', 'searchable', 'inspection_required'].includes(state.visibility)) inspectableItemIds.add(id);
  }
  const visibleContainerIds = new Set();
  for (const [id, container] of refs.containerById.entries()) {
    const state = container?.visibility_state ?? {};
    if (state.visible_to_player_now === true || state.visible_to_player === true) visibleContainerIds.add(id);
    if (state.visible_if_inspected === true || state.requires_inspection === true) hiddenUntilAction.add(id);
  }

  const knownButNotVisible = new Set();
  for (const id of refs.knowledgeIds) if (!visibleNpcIds.has(id) && !visibleItemIds.has(id) && !visibleContainerIds.has(id) && !visibleAnchors.has(id)) knownButNotVisible.add(id);
  for (const id of inspectAnchors) hiddenUntilAction.add(id);
  for (const id of inspectableItemIds) hiddenUntilAction.add(id);
  const forbiddenHiddenFactIds = new Set([...refs.hiddenFactIds].filter((id) => !refs.allowedVisibleHintRefs.has(id)));

  return {
    version: 1,
    schema: STAGE20_VISIBILITY_FILTER_SCHEMA,
    current_anchor_id: input?.current_position?.anchor_id ?? null,
    current_minilocation_id: input?.current_position?.minilocation_id ?? null,
    visible_anchor_ids: sorted(visibleAnchors),
    audible_anchor_ids: sorted(audibleAnchors),
    reachable_anchor_ids: buildReachableAnchors(input, refs),
    visible_npc_ids: sorted(visibleNpcIds),
    audible_npc_ids: sorted(audibleNpcIds),
    identified_npc_ids: sorted(identifiedNpcIds),
    visible_item_ids: sorted(visibleItemIds),
    inspectable_item_ids: sorted(inspectableItemIds),
    visible_container_ids: sorted(visibleContainerIds),
    known_but_not_visible_refs: sorted(knownButNotVisible),
    hidden_until_action_refs: sorted(hiddenUntilAction),
    allowed_visible_hint_refs: sorted(refs.allowedVisibleHintRefs),
    forbidden_hidden_fact_ids: sorted(forbiddenHiddenFactIds)
  };
}

export function validateVisibleContextPackage(output, input, refs = buildStage20ReferenceIndex(input), filter = buildStage20VisibilityFilter(input, refs)) {
  const concerns = [];
  if (!isObject(output)) return [issue('VISIBLE_CONTEXT_INVALID_JSON', 'visible_context_package must be a JSON object.', 'root')];
  if (output.version !== 1 || output.schema !== STAGE20_OUTPUT_SCHEMA) concerns.push(issue('VISIBLE_CONTEXT_SCHEMA_MISMATCH', `Expected ${STAGE20_OUTPUT_SCHEMA} version 1.`, 'schema'));
  if (output.request_id !== input?.request_id) concerns.push(issue('VISIBLE_CONTEXT_SCHEMA_MISMATCH', 'request_id must match Stage 20 input.', 'request_id', input?.request_id, output.request_id));
  if (!STATUS.has(output.visible_context_status)) concerns.push(issue('VISIBLE_CONTEXT_SCHEMA_MISMATCH', 'visible_context_status is outside the allowed enum.', 'visible_context_status'));
  for (const key of OUTPUT_ARRAYS) if (!Array.isArray(output[key])) concerns.push(issue('VISIBLE_CONTEXT_ARRAY_INVALID', `${key} must be an array.`, key));
  for (const key of ['frame', 'position', 'narrator_scope', 'visible_scene_dossier', 'audit_self_check']) if (!isObject(output[key])) concerns.push(issue('VISIBLE_CONTEXT_REQUIRED_BLOCK_MISSING', `${key} must be an object.`, key));

  validateFrame(output, input, concerns);
  validatePosition(output, input, concerns);
  validateVisibleRefs(output, refs, filter, concerns);
  validateHiddenBoundary(output, input, refs, filter, concerns);
  validateKnowledgeBoundary(output, refs, filter, concerns);
  validateWorldFactSources(output, refs, filter, concerns);
  validateOutputContracts(output, input, concerns);
  return dedupe(concerns);
}

export function buildVisibleContextCodePrecheck(output, input, refs = buildStage20ReferenceIndex(input), filter = buildStage20VisibilityFilter(input, refs)) {
  const concerns = validateVisibleContextPackage(output, input, refs, filter);
  const codes = new Set(concerns.map((item) => item.code));
  const none = (...items) => items.every((code) => !codes.has(code));
  return {
    version: 1,
    schema: STAGE20_PRECHECK_SCHEMA,
    request_id: input?.request_id ?? null,
    pass: concerns.length === 0,
    checks: {
      schema_valid: none('VISIBLE_CONTEXT_INVALID_JSON', 'VISIBLE_CONTEXT_SCHEMA_MISMATCH', 'VISIBLE_CONTEXT_REQUIRED_BLOCK_MISSING', 'VISIBLE_CONTEXT_ARRAY_INVALID'),
      current_position_matches: none('VISIBLE_CONTEXT_POSITION_MISMATCH'),
      clock_matches: none('VISIBLE_CONTEXT_CLOCK_MISMATCH'),
      season_matches: none('VISIBLE_CONTEXT_SEASON_MISMATCH'),
      weather_matches: none('VISIBLE_CONTEXT_WEATHER_MISMATCH'),
      light_profile_matches: none('VISIBLE_CONTEXT_LIGHT_MISMATCH'),
      all_visible_anchor_refs_exist: none('VISIBLE_CONTEXT_ANCHOR_REF_NOT_FOUND'),
      all_visible_exit_refs_exist: none('VISIBLE_CONTEXT_EXIT_REF_NOT_FOUND'),
      all_visible_npc_refs_exist: none('VISIBLE_CONTEXT_NPC_REF_NOT_FOUND'),
      all_visible_item_refs_exist: none('VISIBLE_CONTEXT_ITEM_REF_NOT_FOUND'),
      all_visible_container_refs_exist: none('VISIBLE_CONTEXT_CONTAINER_REF_NOT_FOUND'),
      all_refs_within_visibility_filter: none('VISIBLE_CONTEXT_NOT_VISIBLE', 'VISIBLE_CONTEXT_NOT_AUDIBLE'),
      known_context_has_knowledge_basis: none('VISIBLE_CONTEXT_KNOWLEDGE_BASIS_MISSING'),
      no_hidden_fact_ids_in_visible_output: none('VISIBLE_CONTEXT_HIDDEN_FACT_LEAK'),
      no_private_motives_revealed: none('VISIBLE_CONTEXT_PRIVATE_MOTIVE_LEAK'),
      no_private_knowledge_revealed: none('VISIBLE_CONTEXT_PRIVATE_KNOWLEDGE_LEAK'),
      no_closed_container_contents_revealed: none('VISIBLE_CONTEXT_CLOSED_CONTAINER_CONTENTS_LEAK'),
      no_future_events_revealed: none('VISIBLE_CONTEXT_FUTURE_EVENT_LEAK'),
      no_unknown_true_ownership_revealed: none('VISIBLE_CONTEXT_TRUE_OWNERSHIP_LEAK'),
      no_hidden_route_truth_revealed: none('VISIBLE_CONTEXT_HIDDEN_ROUTE_TRUTH_LEAK'),
      no_unseen_items_revealed: none('VISIBLE_CONTEXT_HIDDEN_ITEM_LEAK'),
      rumors_remain_rumors: none('VISIBLE_CONTEXT_RUMOR_TREATED_AS_FACT'),
      uncertainty_remains_uncertain: none('VISIBLE_CONTEXT_UNCERTAIN_TREATED_AS_FACT'),
      no_new_world_entities_created: none('VISIBLE_CONTEXT_CREATED_NPC', 'VISIBLE_CONTEXT_CREATED_ITEM', 'VISIBLE_CONTEXT_CREATED_CONTAINER', 'VISIBLE_CONTEXT_CREATED_ANCHOR', 'VISIBLE_CONTEXT_CREATED_ROUTE', 'VISIBLE_CONTEXT_CREATED_WORLD_FACT'),
      available_actions_safe: none('VISIBLE_CONTEXT_ACTION_LABEL_USES_HIDDEN_TRUTH'),
      no_raw_json_for_narrator: none('VISIBLE_CONTEXT_RAW_JSON_TO_NARRATOR'),
      no_audit_debug_text: none('VISIBLE_CONTEXT_AUDIT_TEXT_LEAK'),
      no_narrator_prose_created: none('VISIBLE_CONTEXT_CREATED_NARRATOR_PROSE'),
      narrator_scope_present: none('VISIBLE_CONTEXT_NARRATOR_SCOPE_INVALID'),
      must_not_include_covers_sensitive_hidden_facts: none('VISIBLE_CONTEXT_MUST_NOT_INCLUDE_MISSING'),
      source_trace_present: none('VISIBLE_CONTEXT_SOURCE_MISSING'),
      audit_self_check_valid: none('VISIBLE_CONTEXT_EMPTY_AUDIT_EVIDENCE')
    },
    concerns,
    evidence: [{
      kind: 'stage20_code_precheck',
      visible_anchor_count: array(output?.visible_anchors).length,
      visible_npc_count: array(output?.visible_npcs).length,
      visible_item_count: array(output?.visible_items).length,
      visible_container_count: array(output?.visible_containers).length
    }]
  };
}

export function validateStage20CommitPermission(output, precheck) {
  const reasons = [];
  if (output?.version !== 1 || output?.schema !== STAGE20_OUTPUT_SCHEMA) reasons.push('invalid_visible_context_schema');
  if (!['formed', 'empty_limited'].includes(output?.visible_context_status)) reasons.push('visible_context_not_audit_ready');
  if (precheck?.version !== 1 || precheck?.schema !== STAGE20_PRECHECK_SCHEMA || precheck?.pass !== true) reasons.push('code_precheck_failed');
  return {
    can_continue_to_visible_context_audit: reasons.length === 0,
    can_send_to_narrator: false,
    can_write_visible_context_snapshot: false,
    can_generate_player_facing_prose: false,
    reasons
  };
}

export async function runStage20VisibleContextBlock({ input, build, formatRepair, semanticRepair, seniorRepair, repairRequest = null } = {}) {
  const inputConcerns = validateStage20Input(input);
  if (inputConcerns.length > 0) throw stage20Error('Stage 20 input gate failed.', inputConcerns, { failedGate: 'stage20_input_gate', input_snapshot: safeClone(input), terminal: true });
  const callbacks = repairRequest
    ? { formatRepair, semanticRepair, seniorRepair }
    : { build, formatRepair, semanticRepair, seniorRepair };
  for (const [name, callback] of Object.entries(callbacks)) if (typeof callback !== 'function') throw new Error(`Stage 20 requires ${name} callback.`);
  const refs = buildStage20ReferenceIndex(input);
  const visibilityFilter = buildStage20VisibilityFilter(input, refs);
  const repairHistory = [];
  let candidate;
  let firstSemanticAttempt = 0;
  if (repairRequest) {
    const semanticAudit = repairRequest.semantic_audit ?? repairRequest.stage21_visible_context_audit;
    const repairRoute = repairRequest.repair_route ?? repairRequest.stage21_repair_route;
    const repaired = await callRole(semanticRepair, {
      version: 1,
      schema: repairRequest.stage21_visible_context_audit ? 'visible_context_stage21_semantic_repair_input' : 'visible_context_targeted_semantic_repair_input',
      request_id: input.request_id,
      target: STAGE20_OUTPUT_SCHEMA,
      original_input: structuredClone(input),
      visibility_filter: structuredClone(visibilityFilter),
      reference_index_summary: referenceSummary(refs),
      failed_visible_context_package: safeClone(repairRequest.failed_visible_context_package),
      visible_context_code_precheck: safeClone(repairRequest.visible_context_code_precheck),
      semantic_audit: safeClone(semanticAudit),
      repair_route: safeClone(repairRoute),
      stage21_visible_context_audit: safeClone(repairRequest.stage21_visible_context_audit ?? null),
      stage21_repair_route: safeClone(repairRequest.stage21_repair_route ?? null),
      previous_repair_history: safeClone(repairRequest.previous_repair_history ?? []),
      allowed_mutable_paths: array(repairRoute?.allowed_mutable_paths),
      forbidden_mutable_paths: array(repairRoute?.forbidden_mutable_paths),
      constraints: {
        targeted_repair_only: true,
        preserve_uncontested_fields: true,
        do_not_modify_upstream_state: true,
        do_not_create_world_facts: true,
        requires_stage21_reaudit: true
      }
    }, 'VisibleContextSemanticRepairer');
    repairHistory.push({
      attempt_index: 1,
      kind: repairRequest.stage21_visible_context_audit ? 'stage21_targeted_semantic' : 'targeted_semantic_repair',
      role: 'VisibleContextSemanticRepairer',
      issue_codes: array(semanticAudit?.concerns).map((item) => item?.code).filter(Boolean)
    });
    candidate = await normalizeOutputFormat(repaired, input, refs, visibilityFilter, formatRepair, repairHistory, 'VisibleContextSemanticRepairer');
    firstSemanticAttempt = 1;
  } else {
    candidate = await callRole(build, buildVisibleContextBuilderRoleInput(input, refs, visibilityFilter), 'VisibleContextBuilder');
    candidate = await normalizeOutputFormat(candidate, input, refs, visibilityFilter, formatRepair, repairHistory, 'VisibleContextBuilder');
  }
  let lastPrecheck = null;

  for (let semanticAttempt = firstSemanticAttempt; semanticAttempt <= 2; semanticAttempt += 1) {
    lastPrecheck = buildVisibleContextCodePrecheck(candidate.value, input, refs, visibilityFilter);
    if (lastPrecheck.pass === true) {
      const permission = validateStage20CommitPermission(candidate.value, lastPrecheck);
      if (!permission.can_continue_to_visible_context_audit) throw stage20Error('Stage 20 commit gate denied continuation.', permission.reasons.map((reason) => issue('VISIBLE_CONTEXT_COMMIT_DENIED', reason, 'commit_permission')), { failedGate: 'stage20_commit_gate', terminal: true });
      return {
        version: 1,
        schema: STAGE20_RESULT_SCHEMA,
        request_id: input.request_id,
        pass: true,
        input_snapshot: structuredClone(input),
        visibility_filter: structuredClone(visibilityFilter),
        visible_context_package: structuredClone(candidate.value),
        visible_context_package_digest: computeVisibleContextPackageDigest(candidate.value),
        visible_context_code_precheck: structuredClone(lastPrecheck),
        repair_history: structuredClone(repairHistory),
        diagnostics: {
          visibility_filter_counts: {
            visible_anchors: visibilityFilter.visible_anchor_ids.length,
            audible_anchors: visibilityFilter.audible_anchor_ids.length,
            visible_npcs: visibilityFilter.visible_npc_ids.length,
            audible_npcs: visibilityFilter.audible_npc_ids.length,
            visible_items: visibilityFilter.visible_item_ids.length,
            visible_containers: visibilityFilter.visible_container_ids.length,
            forbidden_hidden_facts: visibilityFilter.forbidden_hidden_fact_ids.length
          },
          reference_index_summary: referenceSummary(refs)
        },
        commit_permission: permission
      };
    }
    const issues = array(lastPrecheck.concerns);
    if (semanticAttempt >= 2) throw stage20Error('Stage 20 semantic repair escalation exhausted.', issues, { failedGate: 'visible_context_code_precheck', visible_context_package: safeClone(candidate.value), visible_context_code_precheck: safeClone(lastPrecheck), repair_history: safeClone(repairHistory), terminal: true });
    const role = semanticAttempt === 0 ? 'VisibleContextSemanticRepairer' : 'SeniorVisibleContextSemanticRepairer';
    const repair = semanticAttempt === 0 ? semanticRepair : seniorRepair;
    const repaired = await callRole(repair, {
      version: 1,
      schema: 'visible_context_semantic_repair_input',
      request_id: input.request_id,
      target: STAGE20_OUTPUT_SCHEMA,
      original_input: structuredClone(input),
      visibility_filter: structuredClone(visibilityFilter),
      reference_index_summary: referenceSummary(refs),
      failed_visible_context_package: safeClone(candidate.value),
      visible_context_code_precheck: safeClone(lastPrecheck),
      validationErrors: safeClone(issues),
      repair_history: safeClone(repairHistory),
      allowed_mutable_paths: OUTPUT_ARRAYS.concat(['visible_context_status', 'narrator_scope', 'visible_scene_dossier', 'audit_self_check']),
      forbidden_mutable_paths: ['historical_frame', 'weather_state', 'current_position', 'g5_scene_graph', 'initial_npc_placement', 'initial_item_placement', 'character_knowledge_map', 'full_hidden_scene_state']
    }, role);
    repairHistory.push({ attempt_index: repairHistory.length + 1, kind: semanticAttempt === 0 ? 'semantic' : 'senior_semantic', role, issue_codes: issues.map((item) => item?.code).filter(Boolean) });
    candidate = await normalizeOutputFormat(repaired, input, refs, visibilityFilter, formatRepair, repairHistory, role);
  }
  throw stage20Error('Stage 20 failed unexpectedly.', [issue('VISIBLE_CONTEXT_UNKNOWN_FAILURE', 'Unknown Stage 20 failure.', 'root')], { terminal: true });
}


export function validateProvidedStage20Result() {
  throw new Error('Provided Stage 20 output is forbidden in production, development and tests. Stub the Stage 20 role executor instead.');
}

export function buildVisibleContextBuilderRoleInput(input, refs, visibilityFilter) {
  return {
    ...structuredClone(input),
    visibility_filter: structuredClone(visibilityFilter),
    reference_index_summary: referenceSummary(refs),
    constraints: {
      output_only_schema: STAGE20_OUTPUT_SCHEMA,
      hidden_filtered_out_must_contain_ids_and_reasons_only: true,
      inference_requires_player_safe_basis_refs: true,
      inference_must_be_uncertain: true,
      inference_confidence_maximum: 'medium',
      visible_hints_require_allowed_visible_hint_ref: true,
      narrator_permission_is_stage21_only: true
    }
  };
}

async function normalizeOutputFormat(result, input, refs, filter, formatRepair, repairHistory, sourceRole) {
  const parsed = parseRoleResult(result);
  const validation = parsed.parseError ? [issue('VISIBLE_CONTEXT_INVALID_JSON', parsed.parseError, 'root')] : formatOnlyValidation(parsed.value);
  if (validation.length === 0) return parsed;
  const repaired = await callRole(formatRepair, {
    version: 1,
    schema: 'visible_context_format_repair_input',
    request_id: input.request_id,
    target: STAGE20_OUTPUT_SCHEMA,
    raw_output: parsed.raw,
    parsed_output: safeClone(parsed.value),
    validation_errors: validation,
    original_input: structuredClone(input),
    visibility_filter: structuredClone(filter),
    reference_index_summary: referenceSummary(refs),
    constraints: { change_format_only: true, do_not_add_facts: true, do_not_remove_facts: true, do_not_change_refs: true, do_not_create_entities: true }
  }, 'VisibleContextFormatRepairer');
  repairHistory.push({ attempt_index: repairHistory.length + 1, kind: 'format', role: 'VisibleContextFormatRepairer', source: sourceRole, issue_codes: validation.map((item) => item.code) });
  return parseRoleResult(repaired);
}

function formatOnlyValidation(output) {
  const concerns = [];
  if (!isObject(output)) return [issue('VISIBLE_CONTEXT_INVALID_JSON', 'Output must be a JSON object.', 'root')];
  if (output.version !== 1 || output.schema !== STAGE20_OUTPUT_SCHEMA) concerns.push(issue('VISIBLE_CONTEXT_SCHEMA_MISMATCH', `Expected ${STAGE20_OUTPUT_SCHEMA} version 1.`, 'schema'));
  for (const key of OUTPUT_ARRAYS) if (!Array.isArray(output[key])) concerns.push(issue('VISIBLE_CONTEXT_ARRAY_INVALID', `${key} must be an array.`, key));
  for (const key of ['frame', 'position', 'narrator_scope', 'visible_scene_dossier', 'audit_self_check']) if (!isObject(output[key])) concerns.push(issue('VISIBLE_CONTEXT_REQUIRED_BLOCK_MISSING', `${key} must be an object.`, key));
  return concerns;
}

function validateCurrentPosition(input, concerns) {
  const position = input?.current_position;
  if (!isObject(position)) { concerns.push(issue('VISIBLE_CONTEXT_POSITION_MISMATCH', 'current_position is required.', 'current_position')); return; }
  for (const key of ['region_id', 'place_id', 'location_id', 'minilocation_id', 'anchor_id']) if (!text(position[key])) concerns.push(issue('VISIBLE_CONTEXT_POSITION_MISMATCH', `current_position.${key} is required.`, `current_position.${key}`));
  if (position.last_route_id != null) concerns.push(issue('VISIBLE_CONTEXT_CREATED_ROUTE', 'last_route_id must be null before initial commit.', 'current_position.last_route_id'));
  const start = input?.g5_scene_graph?.player_start_position ?? {};
  const parent = input?.g5_scene_graph?.parent_location ?? {};
  const expected = {
    region_id: start.region_id ?? parent.region_id ?? null,
    place_id: start.place_id ?? parent.place_id ?? null,
    location_id: start.location_id ?? start.g4_node_id ?? parent.location_id ?? parent.g4_node_id ?? null,
    minilocation_id: start.minilocation_id ?? start.g5_minilocation_id ?? null,
    anchor_id: start.anchor_id ?? start.g5_anchor_id ?? null
  };
  for (const [key, value] of Object.entries(expected)) {
    if (!text(value)) concerns.push(issue('VISIBLE_CONTEXT_POSITION_MISMATCH', `Stage 13 player_start_position/parent_location must define ${key}.`, `g5_scene_graph.player_start_position.${key}`));
    else if (position[key] !== value) concerns.push(issue('VISIBLE_CONTEXT_POSITION_MISMATCH', `current_position.${key} must come only from audited Stage 13 G5 state.`, `current_position.${key}`, value, position[key]));
  }
  if (position.region_id !== input?.historical_frame?.region?.region_id) concerns.push(issue('VISIBLE_CONTEXT_POSITION_MISMATCH', 'current_position.region_id must match historical_frame.region.region_id.', 'current_position.region_id'));
  const anchors = new Map(array(input?.g5_scene_graph?.g5_anchors ?? input?.g5_scene_graph?.anchors).map((item) => [item?.g5_anchor_id ?? item?.anchor_id ?? item?.id, item]));
  const minilocIds = new Set(array(input?.g5_scene_graph?.g5_minilocations ?? input?.g5_scene_graph?.minilocations).map((item) => item?.g5_minilocation_id ?? item?.minilocation_id ?? item?.id).filter(text));
  if (!anchors.has(position.anchor_id)) concerns.push(issue('VISIBLE_CONTEXT_POSITION_MISMATCH', 'current_position.anchor_id must exist in G5 anchors.', 'current_position.anchor_id'));
  if (!minilocIds.has(position.minilocation_id)) concerns.push(issue('VISIBLE_CONTEXT_POSITION_MISMATCH', 'current_position.minilocation_id must exist in G5 minilocations.', 'current_position.minilocation_id'));
  const anchor = anchors.get(position.anchor_id);
  const anchorParent = anchor?.parent_minilocation_id ?? anchor?.minilocation_id ?? anchor?.g5_minilocation_id;
  if (text(anchorParent) && anchorParent !== position.minilocation_id) concerns.push(issue('VISIBLE_CONTEXT_POSITION_MISMATCH', 'current_position anchor must belong to current minilocation.', 'current_position.anchor_id'));
}

function validateFrame(output, input, concerns) {
  const frame = output?.frame ?? {};
  const historical = input?.historical_frame ?? {};
  if (frame.region_id !== historical?.region?.region_id) concerns.push(issue('VISIBLE_CONTEXT_SCHEMA_MISMATCH', 'frame.region_id must match historical_frame.', 'frame.region_id'));
  if (frame.year !== historical?.year?.value) concerns.push(issue('VISIBLE_CONTEXT_SCHEMA_MISMATCH', 'frame.year must match historical_frame.', 'frame.year'));
  if (frame.season !== historical?.calendar?.season) concerns.push(issue('VISIBLE_CONTEXT_SEASON_MISMATCH', 'frame.season must match historical_frame.', 'frame.season'));
  if (!deepEqual(frame.clock, historical?.clock)) concerns.push(issue('VISIBLE_CONTEXT_CLOCK_MISMATCH', 'frame.clock must match historical_frame.clock.', 'frame.clock'));
  if (!deepEqual(frame.weather_state, input?.weather_state)) concerns.push(issue('VISIBLE_CONTEXT_WEATHER_MISMATCH', 'frame.weather_state must match input weather_state.', 'frame.weather_state'));
  const expectedLight = input?.time_light_consistency_audit?.normalized_visibility_constraints?.light_profile ?? historical?.clock?.light_profile;
  if (frame.light_profile !== expectedLight) concerns.push(issue('VISIBLE_CONTEXT_LIGHT_MISMATCH', 'frame.light_profile must match approved light profile.', 'frame.light_profile', expectedLight, frame.light_profile));
}

function validatePosition(output, input, concerns) {
  const expected = input?.current_position ?? {};
  const actual = output?.position ?? {};
  for (const key of ['region_id', 'place_id', 'location_id', 'minilocation_id', 'anchor_id']) if (actual[key] !== expected[key]) concerns.push(issue('VISIBLE_CONTEXT_POSITION_MISMATCH', `position.${key} must match current_position.`, `position.${key}`, expected[key], actual[key]));
}

function validateVisibleRefs(output, refs, filter, concerns) {
  const visibleAnchors = new Set(filter.visible_anchor_ids);
  const audibleAnchors = new Set(filter.audible_anchor_ids);
  const visibleNpcs = new Set(filter.visible_npc_ids);
  const audibleNpcs = new Set(filter.audible_npc_ids);
  const visibleItems = new Set(filter.visible_item_ids);
  const inspectableItems = new Set(filter.inspectable_item_ids);
  const visibleContainers = new Set(filter.visible_container_ids);

  for (const [index, record] of array(output?.visible_anchors).entries()) {
    const id = record?.anchor_id ?? record?.g5_anchor_id;
    if (!refs.anchorIds.has(id)) concerns.push(issue('VISIBLE_CONTEXT_ANCHOR_REF_NOT_FOUND', 'Visible anchor does not exist.', `visible_anchors[${index}].anchor_id`));
    else if (!visibleAnchors.has(id)) concerns.push(issue('VISIBLE_CONTEXT_NOT_VISIBLE', 'Anchor is outside visibility_filter.', `visible_anchors[${index}].anchor_id`));
  }
  for (const [index, record] of array(output?.visible_exits).entries()) {
    const anchorId = record?.anchor_id ?? record?.target_anchor_id;
    const edgeId = record?.g5_edge_id ?? record?.edge_id;
    if (text(anchorId) && !refs.anchorIds.has(anchorId)) concerns.push(issue('VISIBLE_CONTEXT_EXIT_REF_NOT_FOUND', 'Exit anchor does not exist.', `visible_exits[${index}].anchor_id`));
    if (text(edgeId) && !refs.g5EdgeIds.has(edgeId)) concerns.push(issue('VISIBLE_CONTEXT_EXIT_REF_NOT_FOUND', 'Exit edge does not exist.', `visible_exits[${index}].g5_edge_id`));
    if (!text(anchorId) && !text(edgeId)) concerns.push(issue('VISIBLE_CONTEXT_EXIT_REF_NOT_FOUND', 'Visible exit requires anchor_id or g5_edge_id.', `visible_exits[${index}]`));
  }
  for (const [index, record] of array(output?.visible_npcs).entries()) {
    const id = record?.npc_instance_id ?? record?.npc_id;
    if (!refs.npcIds.has(id)) concerns.push(issue('VISIBLE_CONTEXT_NPC_REF_NOT_FOUND', 'Visible NPC does not exist.', `visible_npcs[${index}].npc_instance_id`));
    else if (!visibleNpcs.has(id)) concerns.push(issue('VISIBLE_CONTEXT_NOT_VISIBLE', 'NPC is outside visible_npc_ids.', `visible_npcs[${index}].npc_instance_id`));
  }
  for (const [index, record] of array(output?.visible_items).entries()) {
    const id = record?.item_instance_id ?? record?.item_id;
    if (!refs.itemIds.has(id)) concerns.push(issue('VISIBLE_CONTEXT_ITEM_REF_NOT_FOUND', 'Visible item does not exist.', `visible_items[${index}].item_instance_id`));
    else if (!visibleItems.has(id) && !(inspectableItems.has(id) && record?.can_inspect_now === true)) concerns.push(issue('VISIBLE_CONTEXT_HIDDEN_ITEM_LEAK', 'Item is neither visible nor safely inspectable.', `visible_items[${index}].item_instance_id`));
  }
  for (const [index, record] of array(output?.visible_containers).entries()) {
    const id = record?.container_instance_id ?? record?.container_id;
    if (!refs.containerIds.has(id)) concerns.push(issue('VISIBLE_CONTEXT_CONTAINER_REF_NOT_FOUND', 'Visible container does not exist.', `visible_containers[${index}].container_instance_id`));
    else if (!visibleContainers.has(id)) concerns.push(issue('VISIBLE_CONTEXT_NOT_VISIBLE', 'Container is outside visible_container_ids.', `visible_containers[${index}].container_instance_id`));
  }
  for (const [index, record] of array(output?.audible_context).entries()) {
    const anchorId = record?.source_ref?.anchor_id;
    const npcId = record?.source_ref?.npc_instance_id;
    if (text(anchorId) && !refs.anchorIds.has(anchorId)) concerns.push(issue('VISIBLE_CONTEXT_ANCHOR_REF_NOT_FOUND', 'Audible anchor does not exist.', `audible_context[${index}].source_ref.anchor_id`));
    if (text(anchorId) && !audibleAnchors.has(anchorId) && !visibleAnchors.has(anchorId)) concerns.push(issue('VISIBLE_CONTEXT_NOT_AUDIBLE', 'Anchor is outside audible/visible filter.', `audible_context[${index}].source_ref.anchor_id`));
    if (text(npcId) && !refs.npcIds.has(npcId)) concerns.push(issue('VISIBLE_CONTEXT_NPC_REF_NOT_FOUND', 'Audible NPC does not exist.', `audible_context[${index}].source_ref.npc_instance_id`));
    if (text(npcId) && !audibleNpcs.has(npcId) && !visibleNpcs.has(npcId)) concerns.push(issue('VISIBLE_CONTEXT_NOT_AUDIBLE', 'NPC is outside audible/visible filter.', `audible_context[${index}].source_ref.npc_instance_id`));
  }
}

function validateHiddenBoundary(output, input, refs, filter, concerns) {
  const forbidden = new Set(filter.forbidden_hidden_fact_ids);
  const allowedHints = new Set(filter.allowed_visible_hint_refs);
  for (const [index, record] of array(output?.audible_context).entries()) {
    const hiddenId = record?.source_ref?.hidden_fact_id;
    if (text(hiddenId) && forbidden.has(hiddenId)) concerns.push(issue('VISIBLE_CONTEXT_HIDDEN_FACT_LEAK', 'Audible context references a forbidden hidden fact.', `audible_context[${index}].source_ref.hidden_fact_id`));
    if (text(hiddenId) && !allowedHints.has(hiddenId)) concerns.push(issue('VISIBLE_CONTEXT_HIDDEN_FACT_LEAK', 'Hidden fact may surface only through an approved visible hint.', `audible_context[${index}].source_ref.hidden_fact_id`));
  }
  for (const [index, record] of array(output?.hidden_filtered_out).entries()) {
    if (!text(record?.hidden_fact_id) || !refs.hiddenFactIds.has(record.hidden_fact_id)) concerns.push(issue('VISIBLE_CONTEXT_HIDDEN_FACT_LEAK', 'hidden_filtered_out must reference an existing hidden fact.', `hidden_filtered_out[${index}].hidden_fact_id`));
    if (!FILTER_REASONS.has(record?.filter_reason)) concerns.push(issue('VISIBLE_CONTEXT_SCHEMA_MISMATCH', 'hidden_filtered_out.filter_reason is invalid.', `hidden_filtered_out[${index}].filter_reason`));
    const allowedKeys = new Set(['hidden_fact_id', 'filter_reason']);
    for (const key of Object.keys(record ?? {})) if (!allowedKeys.has(key)) concerns.push(issue('VISIBLE_CONTEXT_HIDDEN_FACT_LEAK', 'hidden_filtered_out may contain only hidden_fact_id and filter_reason.', `hidden_filtered_out[${index}].${key}`));
  }
  for (const [index, record] of array(output?.visible_containers).entries()) {
    const id = record?.container_instance_id ?? record?.container_id;
    const source = refs.containerById.get(id) ?? {};
    const closed = isClosedContainer(source);
    if (closed && (record?.content_visible === true || record?.content_summary != null)) concerns.push(issue('VISIBLE_CONTEXT_CLOSED_CONTAINER_CONTENTS_LEAK', 'Closed container contents must remain hidden.', `visible_containers[${index}]`));
  }
  const forbiddenKeys = new Map([
    ['private_motive', 'VISIBLE_CONTEXT_PRIVATE_MOTIVE_LEAK'],
    ['private_knowledge', 'VISIBLE_CONTEXT_PRIVATE_KNOWLEDGE_LEAK'],
    ['future_event', 'VISIBLE_CONTEXT_FUTURE_EVENT_LEAK'],
    ['event_timer', 'VISIBLE_CONTEXT_FUTURE_EVENT_LEAK'],
    ['true_owner', 'VISIBLE_CONTEXT_TRUE_OWNERSHIP_LEAK'],
    ['hidden_route', 'VISIBLE_CONTEXT_HIDDEN_ROUTE_TRUTH_LEAK'],
    ['container_contents', 'VISIBLE_CONTEXT_CLOSED_CONTAINER_CONTENTS_LEAK'],
    ['hidden_value', 'VISIBLE_CONTEXT_HIDDEN_ITEM_LEAK'],
    ['hidden_markings', 'VISIBLE_CONTEXT_HIDDEN_ITEM_LEAK']
  ]);
  for (const surface of VISIBLE_SURFACES) {
    walk(output?.[surface], (key, value, path) => {
      const code = forbiddenKeys.get(key);
      if (code && meaningful(value)) concerns.push(issue(code, `${key} is forbidden in visible context.`, `${surface}.${path}`));
      if ((key === 'hidden_fact_id' || key === 'hidden_fact_ref') && text(value) && forbidden.has(value)) concerns.push(issue('VISIBLE_CONTEXT_HIDDEN_FACT_LEAK', 'Forbidden hidden_fact_id leaked into visible output.', `${surface}.${path}`));
      if (key === 'route_id' && meaningful(value)) concerns.push(issue('VISIBLE_CONTEXT_CREATED_ROUTE', 'route_id is forbidden before initial commit.', `${surface}.${path}`));
    });
  }
}

const VISIBLE_SURFACES = Object.freeze([
  'visible_scene_facts', 'visible_anchors', 'visible_exits', 'visible_npcs', 'visible_items',
  'visible_containers', 'visible_risks', 'audible_context', 'smell_context', 'touch_body_context',
  'weather_light_context', 'known_context', 'rumor_context', 'uncertain_context', 'available_actions_context',
  'visible_scene_dossier'
]);

function validateKnowledgeBoundary(output, refs, filter, concerns) {
  for (const [index, record] of array(output?.known_context).entries()) {
    const basisRefs = array(record?.basis_refs ?? record?.knowledge_ref_ids ?? record?.source_trace);
    if (basisRefs.length === 0) concerns.push(issue('VISIBLE_CONTEXT_KNOWLEDGE_BASIS_MISSING', 'known_context requires basis refs.', `known_context[${index}]`));
    for (const [basisIndex, basis] of basisRefs.entries()) {
      const id = isObject(basis) ? basis.knowledge_ref_id ?? basis.source_id ?? basis.source_ref ?? basis.id : basis;
      if (text(id) && !refs.knowledgeIds.has(id) && !refs.knowledgeSourceIds.has(id)) concerns.push(issue('VISIBLE_CONTEXT_KNOWLEDGE_BASIS_MISSING', 'known_context basis ref is absent from character_knowledge_map.', `known_context[${index}].basis_refs[${basisIndex}]`));
    }
  }
  for (const [index, record] of array(output?.rumor_context).entries()) if (record?.is_rumor !== true && record?.knowledge_type !== 'rumor') concerns.push(issue('VISIBLE_CONTEXT_RUMOR_TREATED_AS_FACT', 'rumor_context must be explicitly marked as rumor.', `rumor_context[${index}]`));
  for (const [index, record] of array(output?.uncertain_context).entries()) {
    if (record?.uncertainty_marker !== true) concerns.push(issue('VISIBLE_CONTEXT_UNCERTAIN_TREATED_AS_FACT', 'uncertain_context requires uncertainty_marker=true.', `uncertain_context[${index}].uncertainty_marker`));
    if (!['low', 'medium'].includes(record?.confidence)) concerns.push(issue('VISIBLE_CONTEXT_UNCERTAIN_TREATED_AS_FACT', 'uncertain confidence may be only low or medium.', `uncertain_context[${index}].confidence`));
    const inferenceRefs = array(record?.inference_basis_refs);
    if (inferenceRefs.length === 0) concerns.push(issue('VISIBLE_CONTEXT_KNOWLEDGE_BASIS_MISSING', 'uncertain inference requires player-safe basis refs.', `uncertain_context[${index}].inference_basis_refs`));
    const playerSafeRefs = new Set([
      ...filter.visible_anchor_ids, ...filter.audible_anchor_ids, ...filter.visible_npc_ids, ...filter.audible_npc_ids,
      ...filter.visible_item_ids, ...filter.inspectable_item_ids, ...filter.visible_container_ids,
      ...filter.allowed_visible_hint_refs, ...refs.knowledgeIds, ...refs.knowledgeSourceIds
    ]);
    for (const [basisIndex, basis] of inferenceRefs.entries()) {
      const id = isObject(basis) ? basis.ref_id ?? basis.source_id ?? basis.knowledge_ref_id ?? basis.id : basis;
      if (!text(id) || !playerSafeRefs.has(id)) concerns.push(issue('VISIBLE_CONTEXT_KNOWLEDGE_BASIS_MISSING', 'uncertain inference basis must be player-safe.', `uncertain_context[${index}].inference_basis_refs[${basisIndex}]`));
    }
  }
}

function validateWorldFactSources(output, refs, filter, concerns) {
  const approved = new Set([
    ...refs.anchorIds, ...refs.g5EdgeIds, ...refs.npcIds, ...refs.itemIds, ...refs.containerIds,
    ...refs.knowledgeIds, ...refs.knowledgeSourceIds, ...filter.allowed_visible_hint_refs
  ]);
  for (const [index, fact] of array(output?.visible_scene_facts).entries()) {
    const sourceRefs = array(fact?.source_refs ?? fact?.basis_refs ?? fact?.source_trace);
    if (sourceRefs.length === 0) {
      concerns.push(issue('VISIBLE_CONTEXT_CREATED_WORLD_FACT', 'Every visible scene fact requires approved source refs.', `visible_scene_facts[${index}].source_refs`));
      continue;
    }
    for (const [sourceIndex, source] of sourceRefs.entries()) {
      const id = isObject(source) ? source.source_id ?? source.source_ref ?? source.ref_id ?? source.id : source;
      if (!text(id) || !approved.has(id)) concerns.push(issue('VISIBLE_CONTEXT_CREATED_WORLD_FACT', 'Visible scene fact source ref is not approved.', `visible_scene_facts[${index}].source_refs[${sourceIndex}]`));
    }
  }
}

function validateOutputContracts(output, input, concerns) {
  if (!Array.isArray(output?.narrator_scope?.allowed_surfaces) || !Array.isArray(output?.narrator_scope?.forbidden_surfaces) || !Array.isArray(output?.narrator_scope?.style_constraints) || !isObject(output?.narrator_scope?.knowledge_boundary)) concerns.push(issue('VISIBLE_CONTEXT_NARRATOR_SCOPE_INVALID', 'narrator_scope contract is incomplete.', 'narrator_scope'));
  const hiddenSensitive = countSensitiveHiddenFacts(input?.full_hidden_scene_state) > 0;
  if (hiddenSensitive && array(output?.visible_scene_dossier?.must_not_include).length === 0) concerns.push(issue('VISIBLE_CONTEXT_MUST_NOT_INCLUDE_MISSING', 'must_not_include is required when sensitive hidden facts exist.', 'visible_scene_dossier.must_not_include'));
  if (input?.visible_context_policy?.require_source_trace === true && array(output?.source_trace).length === 0) concerns.push(issue('VISIBLE_CONTEXT_SOURCE_MISSING', 'source_trace must not be empty.', 'source_trace'));
  if (array(output?.audit_self_check?.evidence).length === 0) concerns.push(issue('VISIBLE_CONTEXT_EMPTY_AUDIT_EVIDENCE', 'audit_self_check.evidence must not be empty.', 'audit_self_check.evidence'));
  if (output?.audit_self_check?.pass === false && array(output?.audit_self_check?.concerns).length === 0) concerns.push(issue('VISIBLE_CONTEXT_EMPTY_AUDIT_EVIDENCE', 'Failed audit_self_check requires concerns.', 'audit_self_check.concerns'));
  if (hasOwnRecursive(output, 'prose') || hasOwnRecursive(output, 'intro_prose') || hasOwnRecursive(output, 'narrator_prose')) concerns.push(issue('VISIBLE_CONTEXT_CREATED_NARRATOR_PROSE', 'Stage 20 must not create narrator prose.', 'root'));
  if (hasOwnRecursive(output, 'audit_report') || hasOwnRecursive(output, 'repair_history') || hasOwnRecursive(output, 'debug')) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_TEXT_LEAK', 'Audit/repair/debug data is forbidden in visible_context_package.', 'root'));
  if (hasOwnRecursive(output, 'raw_json') || hasOwnRecursive(output, 'raw_output') || hasOwnRecursive(output, 'system_prompt') || hasOwnRecursive(output, 'prompt')) concerns.push(issue('VISIBLE_CONTEXT_RAW_JSON_TO_NARRATOR', 'Raw JSON/prompt/system material is forbidden in visible_context_package.', 'root'));
  for (const [index, action] of array(output?.available_actions_context).entries()) {
    if (action?.must_not_reveal_hidden_truth !== true) concerns.push(issue('VISIBLE_CONTEXT_ACTION_LABEL_USES_HIDDEN_TRUTH', 'Available action must explicitly prohibit hidden truth.', `available_actions_context[${index}].must_not_reveal_hidden_truth`));
    const target = action?.target_ref ?? {};
    if (text(target.anchor_id) && !buildIds(output?.visible_anchors, ['anchor_id', 'g5_anchor_id']).has(target.anchor_id)) concerns.push(issue('VISIBLE_CONTEXT_ANCHOR_REF_NOT_FOUND', 'Action anchor target is not visible.', `available_actions_context[${index}].target_ref.anchor_id`));
    if (text(target.npc_instance_id) && !buildIds(output?.visible_npcs, ['npc_instance_id', 'npc_id']).has(target.npc_instance_id)) concerns.push(issue('VISIBLE_CONTEXT_NPC_REF_NOT_FOUND', 'Action NPC target is not visible.', `available_actions_context[${index}].target_ref.npc_instance_id`));
    if (text(target.item_instance_id) && !buildIds(output?.visible_items, ['item_instance_id', 'item_id']).has(target.item_instance_id)) concerns.push(issue('VISIBLE_CONTEXT_ITEM_REF_NOT_FOUND', 'Action item target is not visible.', `available_actions_context[${index}].target_ref.item_instance_id`));
    if (text(target.container_instance_id) && !buildIds(output?.visible_containers, ['container_instance_id', 'container_id']).has(target.container_instance_id)) concerns.push(issue('VISIBLE_CONTEXT_CONTAINER_REF_NOT_FOUND', 'Action container target is not visible.', `available_actions_context[${index}].target_ref.container_instance_id`));
  }
}

function indexHiddenFacts(state, refs) {
  const groups = [
    ['hidden_npc_state', 'hidden_npc_state_id', true],
    ['hidden_access_state', 'hidden_access_state_id', false],
    ['hidden_property_state', 'hidden_property_state_id', true],
    ['hidden_container_state', 'hidden_container_state_id', true],
    ['hidden_item_state', 'hidden_item_state_id', false],
    ['hidden_risk_state', 'hidden_risk_state_id', true],
    ['hidden_event_state', 'hidden_event_state_id', true],
    ['hidden_social_state', 'hidden_social_state_id', false],
    ['hidden_route_state', 'hidden_route_state_id', true],
    ['hidden_environment_state', 'hidden_environment_state_id', false]
  ];
  for (const [group, idField, sensitive] of groups) {
    for (const record of array(state?.[group])) {
      const id = record?.[idField] ?? record?.hidden_fact_id ?? record?.id;
      if (!text(id)) continue;
      refs.hiddenFactIds.add(id);
      if (sensitive) refs.sensitiveHiddenFactIds.add(id);
      if (hasApprovedVisibleHint(record)) refs.allowedVisibleHintRefs.add(id);
    }
  }
  for (const condition of array(state?.reveal_conditions)) {
    const id = condition?.reveal_condition_id ?? condition?.id;
    addText(refs.revealConditionIds, id);
    if (condition?.triggered === true || ['triggered', 'revealed', 'satisfied'].includes(condition?.status)) for (const factId of array(condition?.hidden_fact_ids ?? condition?.target_hidden_fact_ids)) if (refs.hiddenFactIds.has(factId)) refs.allowedVisibleHintRefs.add(factId);
  }
  for (const rule of array(state?.discovery_rules)) addText(refs.discoveryRuleIds, rule?.discovery_rule_id ?? rule?.id);
}

function hasApprovedVisibleHint(record) {
  return meaningful(record?.visible_hint_now) || meaningful(record?.visible_hint) || meaningful(record?.allowed_substitute) || meaningful(record?.observable_consequence);
}

function countSensitiveHiddenFacts(state) {
  return ['hidden_npc_state', 'hidden_property_state', 'hidden_container_state', 'hidden_risk_state', 'hidden_event_state', 'hidden_route_state'].reduce((sum, key) => sum + array(state?.[key]).length, 0);
}

function buildReachableAnchors(input, refs) {
  const start = input?.current_position?.anchor_id;
  if (!refs.anchorIds.has(start)) return [];
  const reachable = new Set([start]);
  for (const edge of refs.edgeById.values()) {
    const from = edge?.from_anchor_id ?? edge?.from;
    const to = edge?.to_anchor_id ?? edge?.to;
    if (from === start && refs.anchorIds.has(to)) reachable.add(to);
    if (to === start && refs.anchorIds.has(from) && edge?.one_way !== true) reachable.add(from);
  }
  return sorted(reachable);
}

function isClosedContainer(container) {
  const physical = container?.physical_state?.condition;
  const access = container?.access_state?.access;
  return ['closed', 'locked', 'sealed', 'hidden', 'inaccessible'].includes(physical) || ['closed', 'locked', 'sealed', 'hidden', 'inaccessible'].includes(access);
}

function referenceSummary(refs) {
  return {
    anchor_count: refs.anchorIds.size,
    g5_edge_count: refs.g5EdgeIds.size,
    npc_count: refs.npcIds.size,
    item_count: refs.itemIds.size,
    container_count: refs.containerIds.size,
    knowledge_ref_count: refs.knowledgeIds.size,
    hidden_fact_count: refs.hiddenFactIds.size,
    allowed_visible_hint_count: refs.allowedVisibleHintRefs.size
  };
}

async function callRole(callback, input, role) {
  try { return await callback(structuredClone(input)); }
  catch (error) { throw stage20Error(`${role} failed: ${error?.message ?? String(error)}`, [issue('VISIBLE_CONTEXT_ROLE_CALL_FAILED', error?.message ?? String(error), role)], { failedGate: role, cause: error }); }
}

function parseRoleResult(result) {
  const raw = result?.output ?? result?.content ?? result;
  if (isObject(raw)) return { value: structuredClone(raw), raw: structuredClone(raw), parseError: null };
  if (typeof raw !== 'string') return { value: null, raw, parseError: 'Role output is neither object nor JSON string.' };
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return { value: JSON.parse(cleaned), raw, parseError: null }; } catch (error) { return { value: null, raw, parseError: error.message }; }
}

function stage20Error(message, concerns = [], details = {}) {
  const error = new Error(message);
  error.name = 'Stage20VisibleContextError';
  error.code = concerns[0]?.code ?? 'VISIBLE_CONTEXT_STAGE_FAILED';
  error.concerns = safeClone(concerns);
  Object.assign(error, details);
  return error;
}

function issue(code, message, field, expected = undefined, actual = undefined) { return { code, severity: 'hard_block', message, field, ...(expected !== undefined ? { expected } : {}), ...(actual !== undefined ? { actual } : {}) }; }
function requireSchema(concerns, value, schema, field, code) { if (!isObject(value) || value.version !== 1 || value.schema !== schema) concerns.push(issue(code, `${field} must be ${schema} version 1.`, field)); }
function requireAudit(concerns, value, schema, field, code) { requireSchema(concerns, value, schema, field, code); if (value?.pass !== true) concerns.push(issue(code, `${field}.pass must be true.`, `${field}.pass`, true, value?.pass)); }
function buildIds(records, keys) { const set = new Set(); for (const record of array(records)) for (const key of keys) if (text(record?.[key])) set.add(record[key]); return set; }
function collectRecordIds(value, set) { collectByKeys(value, set, ['knowledge_id', 'known_route_id', 'known_path_id', 'known_place_id', 'known_address_id', 'known_landmark_id', 'known_person_id', 'known_authority_id', 'known_danger_id', 'known_social_rule_id', 'known_resource_id', 'rumor_id', 'mistaken_belief_id', 'uncertain_knowledge_id', 'forbidden_knowledge_id', 'knowledge_gap_id', 'npc_instance_id', 'item_instance_id', 'container_instance_id', 'anchor_id', 'g5_edge_id', 'graph_edge_id']); }
function collectByKeys(value, set, keys) { walk(value, (key, child) => { if (keys.includes(key)) addText(set, child); }); }
function addText(set, value) { if (text(value)) set.add(String(value)); }
function array(value) { return Array.isArray(value) ? value : []; }
function sorted(set) { return [...set].sort(); }
function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function meaningful(value) { return value !== null && value !== undefined && value !== '' && !(Array.isArray(value) && value.length === 0) && !(isObject(value) && Object.keys(value).length === 0); }
function safeClone(value) { try { return structuredClone(value); } catch { return null; } }
function deepEqual(a, b) { try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; } }
function dedupe(concerns) { const seen = new Set(); return concerns.filter((item) => { const key = `${item.code}|${item.field}|${item.message}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function hasOwnRecursive(value, target) { let found = false; walk(value, (key) => { if (key === target) found = true; }); return found; }
function walk(value, visitor, path = 'root') { if (value == null || typeof value !== 'object') return; if (Array.isArray(value)) { value.forEach((child, index) => walk(child, visitor, `${path}[${index}]`)); return; } for (const [key, child] of Object.entries(value)) { visitor(key, child, `${path}.${key}`); walk(child, visitor, `${path}.${key}`); } }
