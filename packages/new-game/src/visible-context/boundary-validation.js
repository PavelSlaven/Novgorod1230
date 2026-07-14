import { STAGE20_OUTPUT_SCHEMA, STAGE20_PRECHECK_SCHEMA } from '@rus/contracts';
import { buildVisibleContextReferenceIndex, buildVisibleContextVisibilityFilter, countSensitiveHiddenFacts, isClosedContainer } from './reference-index.js';
import { array, buildIds, dedupe, deepEqual, hasOwnRecursive, isObject, issue, meaningful, text, walk } from './shared.js';

const OUTPUT_ARRAYS = Object.freeze([
  'visible_scene_facts', 'visible_anchors', 'visible_exits', 'visible_npcs', 'visible_items',
  'visible_containers', 'visible_risks', 'audible_context', 'smell_context', 'touch_body_context',
  'weather_light_context', 'known_context', 'rumor_context', 'uncertain_context',
  'available_actions_context', 'hidden_filtered_out', 'source_trace'
]);
const STATUS = new Set(['formed', 'empty_limited', 'blocked', 'requires_repair']);
const FILTER_REASONS = new Set([
  'not_visible', 'not_audible', 'not_known', 'private_motive', 'private_knowledge',
  'closed_container', 'future_event', 'unknown_ownership', 'hidden_route',
  'unmet_reveal_condition', 'system_only'
]);
const VISIBLE_SURFACES = Object.freeze([
  'visible_scene_facts', 'visible_anchors', 'visible_exits', 'visible_npcs', 'visible_items',
  'visible_containers', 'visible_risks', 'audible_context', 'smell_context', 'touch_body_context',
  'weather_light_context', 'known_context', 'rumor_context', 'uncertain_context', 'available_actions_context',
  'visible_scene_dossier'
]);
export function validateVisibleContextPackageBoundary(output, input, refs = buildVisibleContextReferenceIndex(input), filter = buildVisibleContextVisibilityFilter(input, refs)) {
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

export function buildVisibleContextCodePrecheckBoundary(output, input, refs = buildVisibleContextReferenceIndex(input), filter = buildVisibleContextVisibilityFilter(input, refs)) {
  const concerns = validateVisibleContextPackageBoundary(output, input, refs, filter);
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
