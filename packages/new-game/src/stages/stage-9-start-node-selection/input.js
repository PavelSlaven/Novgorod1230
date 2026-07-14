import { DEFAULT_STAGE9_SELECTION_POLICY, STAGE9_INPUT_SCHEMA } from './constants.js';
import { concern, nonEmpty, readPath } from './shared.js';

export function normalizeStage9SelectionPolicy(policy = {}) {
  return {
    ...DEFAULT_STAGE9_SELECTION_POLICY,
    ...(policy && typeof policy === 'object' ? policy : {}),
    do_not_create_world_entities: policy?.do_not_create_world_entities === false ? false : true,
    max_selector_attempts: Math.max(1, Number(policy?.max_selector_attempts ?? DEFAULT_STAGE9_SELECTION_POLICY.max_selector_attempts) || 3)
  };
}

export function buildStage9StartNodeSelectorInputFromPipeline(context, options = {}) {
  return {
    version: 1,
    schema: STAGE9_INPUT_SCHEMA,
    request_id: context.requestId,
    normalized_request: options.normalized_request ?? context.requireStageOutput?.(2, 'normalized request') ?? context.getStageOutput?.(2) ?? null,
    historical_frame: options.historical_frame ?? context.requireStageOutput?.(3, 'historical frame') ?? context.getStageOutput?.(3) ?? null,
    regional_context_package: options.regional_context_package ?? context.requireStageOutput?.(4, 'regional context package') ?? context.getStageOutput?.(4) ?? null,
    start_candidate_set: options.start_candidate_set ?? context.requireStageOutput?.(5, 'start candidate set') ?? context.getStageOutput?.(5) ?? null,
    candidate_place_template_set: options.candidate_place_template_set ?? context.requireStageOutput?.(6, 'candidate place template set') ?? context.getStageOutput?.(6) ?? null,
    npc_candidate_set: options.npc_candidate_set ?? context.requireStageOutput?.(7, 'npc candidate set') ?? context.getStageOutput?.(7) ?? null,
    item_profile_candidate_set: options.item_profile_candidate_set ?? context.requireStageOutput?.(8, 'item profile candidate set') ?? context.getStageOutput?.(8) ?? null,
    selection_policy: normalizeStage9SelectionPolicy(options.selection_policy ?? options.selectionPolicy ?? {})
  };
}

export function validateStage9StartNodeSelectorInput(input) {
  const concerns = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    concerns.push(concern('STAGE9_INPUT_NOT_OBJECT', 'Stage 9 input must be an object.'));
  }
  if (input?.version !== 1) concerns.push(concern('STAGE9_INPUT_VERSION_INVALID', 'Stage 9 input.version must be 1.', { field: 'version' }));
  if (input?.schema !== STAGE9_INPUT_SCHEMA) concerns.push(concern('STAGE9_INPUT_SCHEMA_MISMATCH', 'Stage 9 input.schema must be start_node_selector_input.', { field: 'schema' }));
  if (!nonEmpty(input?.request_id)) concerns.push(concern('STAGE9_INPUT_MISSING_REQUEST_ID', 'Stage 9 input.request_id is required.', { field: 'request_id' }));
  requireSchema(concerns, input?.normalized_request, 'new_game_normalized_request', 'normalized_request', 'STAGE9_INPUT_INVALID_NORMALIZED_REQUEST');
  requireHistoricalFrame(concerns, input?.historical_frame);
  requireSchema(concerns, input?.regional_context_package, 'regional_context_package', 'regional_context_package', 'STAGE9_INPUT_INVALID_REGIONAL_CONTEXT_PACKAGE');
  requireReadySet(concerns, input?.start_candidate_set, 'start_candidate_set', 'candidates', 'downstream_constraints.must_choose_from_candidate_ids', 'STAGE9_INPUT_INVALID_START_CANDIDATE_SET', 'STAGE9_INPUT_START_CANDIDATE_SET_NOT_READY');
  requireReadySet(concerns, input?.candidate_place_template_set, 'candidate_place_template_set', 'candidate_template_links', 'downstream_constraints.must_choose_candidate_template_link_id', 'STAGE9_INPUT_INVALID_CANDIDATE_PLACE_TEMPLATE_SET', 'STAGE9_INPUT_CANDIDATE_PLACE_TEMPLATE_SET_NOT_READY');
  requireReadySet(concerns, input?.npc_candidate_set, 'npc_candidate_set', 'npc_candidates', null, 'STAGE9_INPUT_INVALID_NPC_CANDIDATE_SET', 'STAGE9_INPUT_NPC_CANDIDATE_SET_NOT_READY');
  requireReadySet(concerns, input?.item_profile_candidate_set, 'item_profile_candidate_set', 'item_profile_candidates', null, 'STAGE9_INPUT_INVALID_ITEM_PROFILE_CANDIDATE_SET', 'STAGE9_INPUT_ITEM_PROFILE_CANDIDATE_SET_NOT_READY');
  validateSelectionPolicy(concerns, input?.selection_policy);
  return {
    pass: concerns.length === 0,
    concerns,
    evidence: [{ kind: 'stage9_input_contract', schema: STAGE9_INPUT_SCHEMA }]
  };
}

export function requireSchema(concerns, value, schema, field, code) {
  if (!value || typeof value !== 'object' || value.schema !== schema) {
    concerns.push(concern(code, `${field}.schema must be ${schema}.`, { field }));
  }
}

export function requireHistoricalFrame(concerns, frame) {
  requireSchema(concerns, frame, 'historical_frame', 'historical_frame', 'STAGE9_INPUT_INVALID_HISTORICAL_FRAME');
  if (!frame) return;
  if (!nonEmpty(frame.region?.region_id)) concerns.push(concern('STAGE9_INPUT_HISTORICAL_FRAME_REGION_MISSING', 'historical_frame.region.region_id is required.'));
  if (!Number.isFinite(Number(frame.year?.value))) concerns.push(concern('STAGE9_INPUT_HISTORICAL_FRAME_YEAR_MISSING', 'historical_frame.year.value is required.'));
  if (!nonEmpty(frame.calendar?.season)) concerns.push(concern('STAGE9_INPUT_HISTORICAL_FRAME_SEASON_MISSING', 'historical_frame.calendar.season is required.'));
  for (const field of ['day', 'hour', 'minute', 'time_of_day', 'light_profile']) {
    if (frame.clock?.[field] === undefined || frame.clock?.[field] === null || frame.clock?.[field] === '') concerns.push(concern('STAGE9_INPUT_HISTORICAL_FRAME_CLOCK_MISSING', `historical_frame.clock.${field} is required.`, { field: `historical_frame.clock.${field}` }));
  }
}

export function requireReadySet(concerns, value, schema, arrayField, downstreamPath, invalidCode, notReadyCode) {
  if (!value || typeof value !== 'object' || value.schema !== schema) {
    concerns.push(concern(invalidCode, `Expected ${schema}.`, { field: schema }));
    return;
  }
  if (value.selection_status !== 'ready') concerns.push(concern(notReadyCode, `${schema}.selection_status must be ready.`, { field: `${schema}.selection_status` }));
  if (!Array.isArray(value[arrayField])) concerns.push(concern(invalidCode, `${schema}.${arrayField} must be an array.`, { field: `${schema}.${arrayField}` }));
  if (downstreamPath) {
    const downstreamIds = readPath(value, downstreamPath) ?? readPath(value, downstreamPath.replace('must_choose_candidate_template_link_id', 'must_choose_from_candidate_template_link_ids'));
    if (!Array.isArray(downstreamIds) || downstreamIds.length === 0) concerns.push(concern(invalidCode, `${schema}.${downstreamPath} must be a non-empty array.`, { field: `${schema}.${downstreamPath}` }));
  }
}

export function validateSelectionPolicy(concerns, policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    concerns.push(concern('STAGE9_INPUT_INVALID_SELECTION_POLICY', 'selection_policy must be an object.'));
    return;
  }
  for (const key of [
    'prefer_g4', 'allow_g3_fallback', 'allow_g2_fallback', 'allow_g1_fallback',
    'require_candidate_place_template_link', 'require_npc_candidate_support', 'require_item_profile_support',
    'prefer_player_request_match', 'prefer_low_contradiction_risk', 'prefer_g5_ready',
    'prefer_full_parent_chain', 'require_sources', 'do_not_create_world_entities'
  ]) {
    if (typeof policy[key] !== 'boolean') concerns.push(concern('STAGE9_INPUT_INVALID_SELECTION_POLICY', `selection_policy.${key} must be boolean.`, { field: `selection_policy.${key}` }));
  }
  if (policy.do_not_create_world_entities !== true) concerns.push(concern('STAGE9_INPUT_WORLD_ENTITY_CREATION_NOT_FORBIDDEN', 'selection_policy.do_not_create_world_entities must be true.'));
}
