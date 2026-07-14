import { DEFAULT_STAGE10_AUDIT_POLICY, STAGE10_INPUT_SCHEMA } from './constants.js';
import { block, frameFrom, isNonEmptyString, requireReady, requireSchema } from './shared.js';

export function normalizeStage10AuditPolicy(policy = {}) {
  return {
    ...DEFAULT_STAGE10_AUDIT_POLICY,
    ...(policy ?? {}),
    require_world_base_node: policy?.require_world_base_node ?? DEFAULT_STAGE10_AUDIT_POLICY.require_world_base_node,
    require_candidate_set_membership: policy?.require_candidate_set_membership ?? DEFAULT_STAGE10_AUDIT_POLICY.require_candidate_set_membership,
    require_place_template_link: policy?.require_place_template_link ?? DEFAULT_STAGE10_AUDIT_POLICY.require_place_template_link,
    require_full_parent_chain_for_g4: policy?.require_full_parent_chain_for_g4 ?? DEFAULT_STAGE10_AUDIT_POLICY.require_full_parent_chain_for_g4,
    require_access_edge: policy?.require_access_edge ?? DEFAULT_STAGE10_AUDIT_POLICY.require_access_edge,
    require_sources: policy?.require_sources ?? DEFAULT_STAGE10_AUDIT_POLICY.require_sources,
    reject_rejected_or_conflict_records: policy?.reject_rejected_or_conflict_records ?? DEFAULT_STAGE10_AUDIT_POLICY.reject_rejected_or_conflict_records
  };
}

export function buildStage10StartPlaceAuditInputFromPipeline(context, options = {}) {
  return {
    version: 1,
    schema: STAGE10_INPUT_SCHEMA,
    request_id: context.requestId,
    normalized_request: options.normalized_request ?? options.normalizedRequest ?? context.requireStageOutput(2, 'normalized request'),
    historical_frame: options.historical_frame ?? options.historicalFrame ?? context.requireStageOutput(3, 'historical frame'),
    regional_context_package: options.regional_context_package ?? options.regionalContextPackage ?? context.requireStageOutput(4, 'regional context package'),
    start_candidate_set: options.start_candidate_set ?? options.startCandidateSet ?? context.requireStageOutput(5, 'start candidate set'),
    candidate_place_template_set: options.candidate_place_template_set ?? options.candidatePlaceTemplateSet ?? context.requireStageOutput(6, 'candidate place template set'),
    npc_candidate_set: options.npc_candidate_set ?? options.npcCandidateSet ?? context.requireStageOutput(7, 'NPC candidate set'),
    item_profile_candidate_set: options.item_profile_candidate_set ?? options.itemProfileCandidateSet ?? context.requireStageOutput(8, 'item profile candidate set'),
    selected_start_node: options.selected_start_node ?? options.selectedStartNode ?? context.requireStageOutput(9, 'selected start node'),
    audit_policy: normalizeStage10AuditPolicy(options.audit_policy ?? options.auditPolicy ?? options.policy ?? {})
  };
}

export function validateStage10StartPlaceAuditInput(input = {}) {
  const concerns = [];
  if (input?.version !== 1) concerns.push(block('STAGE10_INPUT_VERSION_INVALID', 'Stage 10 input.version must be 1.'));
  if (input?.schema !== STAGE10_INPUT_SCHEMA) concerns.push(block('STAGE10_INPUT_SCHEMA_MISMATCH', `Stage 10 input.schema must be ${STAGE10_INPUT_SCHEMA}.`));
  if (!isNonEmptyString(input?.request_id)) concerns.push(block('STAGE10_INPUT_MISSING_REQUEST_ID', 'Stage 10 request_id is required.'));
  requireSchema(concerns, input?.normalized_request, 'new_game_normalized_request', 'STAGE10_INPUT_INVALID_NORMALIZED_REQUEST');
  requireSchema(concerns, input?.historical_frame, 'historical_frame', 'STAGE10_INPUT_INVALID_HISTORICAL_FRAME');
  requireSchema(concerns, input?.regional_context_package, 'regional_context_package', 'STAGE10_INPUT_INVALID_REGIONAL_CONTEXT_PACKAGE');
  requireSchema(concerns, input?.start_candidate_set, 'start_candidate_set', 'STAGE10_INPUT_INVALID_START_CANDIDATE_SET');
  requireSchema(concerns, input?.candidate_place_template_set, 'candidate_place_template_set', 'STAGE10_INPUT_INVALID_CANDIDATE_PLACE_TEMPLATE_SET');
  requireSchema(concerns, input?.npc_candidate_set, 'npc_candidate_set', 'STAGE10_INPUT_INVALID_NPC_CANDIDATE_SET');
  requireSchema(concerns, input?.item_profile_candidate_set, 'item_profile_candidate_set', 'STAGE10_INPUT_INVALID_ITEM_PROFILE_CANDIDATE_SET');
  requireSchema(concerns, input?.selected_start_node, 'selected_start_node', 'STAGE10_INPUT_INVALID_SELECTED_START_NODE');

  requireReady(concerns, input?.start_candidate_set, 'STAGE10_INPUT_START_CANDIDATE_SET_NOT_READY');
  requireReady(concerns, input?.candidate_place_template_set, 'STAGE10_INPUT_CANDIDATE_PLACE_TEMPLATE_SET_NOT_READY');
  requireReady(concerns, input?.npc_candidate_set, 'STAGE10_INPUT_NPC_CANDIDATE_SET_NOT_READY');
  requireReady(concerns, input?.item_profile_candidate_set, 'STAGE10_INPUT_ITEM_PROFILE_CANDIDATE_SET_NOT_READY');

  if (input?.selected_start_node?.selection_status !== 'selected') {
    concerns.push(block('STAGE10_INPUT_SELECTED_START_NODE_NOT_SELECTED', 'Stage 10 requires selected_start_node.selection_status=selected.'));
  }
  if (input?.selected_start_node?.audit?.pass !== true) {
    concerns.push(block('STAGE10_INPUT_SELECTED_START_NODE_AUDIT_NOT_PASSED', 'Stage 10 requires selected_start_node.audit.pass=true.'));
  }
  const selected = input?.selected_start_node?.selected;
  if (!selected || typeof selected !== 'object') concerns.push(block('STAGE10_INPUT_SELECTED_BLOCK_MISSING', 'selected_start_node.selected is required.'));
  const frame = frameFrom(input?.historical_frame);
  if (!frame.region_id) concerns.push(block('STAGE10_INPUT_REGION_MISSING', 'historical_frame.region.region_id is required.'));
  if (!Number.isFinite(Number(frame.year))) concerns.push(block('STAGE10_INPUT_YEAR_MISSING', 'historical_frame.year.value is required.'));
  if (!frame.season) concerns.push(block('STAGE10_INPUT_SEASON_MISSING', 'historical_frame.calendar.season is required.'));
  if (!input?.historical_frame?.clock) concerns.push(block('STAGE10_INPUT_CLOCK_MISSING', 'historical_frame.clock is required.'));
  if (!input?.audit_policy || typeof input.audit_policy !== 'object') concerns.push(block('STAGE10_INPUT_AUDIT_POLICY_MISSING', 'audit_policy is required.'));
  return {
    pass: concerns.length === 0,
    concerns,
    evidence: [{ kind: 'stage10_input_contract', pass: concerns.length === 0 }]
  };
}
