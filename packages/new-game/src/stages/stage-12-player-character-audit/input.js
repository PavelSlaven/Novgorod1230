import { STAGE11_DOSSIER_SCHEMA, STAGE12_CODE_PRECHECK_SCHEMA, STAGE12_INPUT_SCHEMA } from './constants.js';
import { buildStage12CodePrecheck } from './precheck.js';
import { concern, isPlainObject } from './shared.js';

export function buildStage12PlayerCharacterAuditInput(context, options = {}) {
  const input = {
    version: 1,
    schema: STAGE12_INPUT_SCHEMA,
    request_id: context.requestId,
    normalized_request: options.normalized_request ?? context.requireStageOutput(2, 'normalized request'),
    historical_frame: options.historical_frame ?? context.requireStageOutput(3, 'historical frame'),
    regional_context_package: options.regional_context_package ?? context.requireStageOutput(4, 'regional context package'),
    selected_start_node: options.selected_start_node ?? context.requireStageOutput(9, 'selected start node'),
    start_place_audit: options.start_place_audit ?? context.requireStageOutput(10, 'start place audit'),
    npc_candidate_set: options.npc_candidate_set ?? context.requireStageOutput(7, 'NPC candidate set'),
    item_profile_candidate_set: options.item_profile_candidate_set ?? context.requireStageOutput(8, 'item profile candidate set'),
    player_character_dossier: options.player_character_dossier ?? context.requireStageOutput(11, 'player character dossier'),
    audit_policy: normalizeStage12AuditPolicy(options.audit_policy ?? options.policy ?? {})
  };
  input.code_precheck = buildStage12CodePrecheck(input);
  return input;
}

export function normalizeStage12AuditPolicy(policy = {}) {
  return {
    require_historical_compatibility: policy.require_historical_compatibility ?? true,
    require_region_compatibility: policy.require_region_compatibility ?? true,
    require_start_place_compatibility: policy.require_start_place_compatibility ?? true,
    require_social_role_from_candidate_set: policy.require_social_role_from_candidate_set ?? true,
    require_occupation_from_candidate_set: policy.require_occupation_from_candidate_set ?? true,
    allow_null_occupation_if_explained: policy.allow_null_occupation_if_explained ?? true,
    require_inventory_from_item_profile_candidates: policy.require_inventory_from_item_profile_candidates ?? true,
    require_property_rules_for_inventory: policy.require_property_rules_for_inventory ?? true,
    require_weight_and_access_for_inventory: policy.require_weight_and_access_for_inventory ?? true,
    require_character_knowledge_limits: policy.require_character_knowledge_limits ?? true,
    require_reason_here: policy.require_reason_here ?? true,
    require_immediate_need: policy.require_immediate_need ?? true,
    require_attributes_balance: policy.require_attributes_balance ?? true,
    require_skill_basis: policy.require_skill_basis ?? true,
    require_sources: policy.require_sources ?? true,
    reject_downstream_entities: policy.reject_downstream_entities ?? true
  };
}

export function validateStage12PlayerCharacterAuditInput(input = {}) {
  const concerns = [];
  if (!isPlainObject(input)) {
    return [concern('PLAYER_AUDIT_SCHEMA_INVALID', 'Stage 12 input must be an object.', { field: 'root', severity: 'hard_block' })];
  }
  if (input.version !== 1) concerns.push(concern('PLAYER_AUDIT_SCHEMA_INVALID', 'Stage 12 input.version must be 1.', { field: 'version', severity: 'hard_block' }));
  if (input.schema !== STAGE12_INPUT_SCHEMA) concerns.push(concern('PLAYER_AUDIT_SCHEMA_INVALID', `Stage 12 input.schema must be ${STAGE12_INPUT_SCHEMA}.`, { field: 'schema', severity: 'hard_block' }));

  for (const field of [
    'normalized_request',
    'historical_frame',
    'regional_context_package',
    'selected_start_node',
    'start_place_audit',
    'npc_candidate_set',
    'item_profile_candidate_set',
    'player_character_dossier',
    'audit_policy',
    'code_precheck'
  ]) {
    if (!isPlainObject(input[field])) concerns.push(concern('PLAYER_AUDIT_MISSING_REQUIRED_FIELD', `Stage 12 input.${field} must be an object.`, { field, severity: 'hard_block' }));
  }

  if (input.start_place_audit?.pass !== true) {
    concerns.push(concern('PLAYER_AUDIT_START_PLACE_AUDIT_NOT_PASSED', 'Stage 12 requires start_place_audit.pass=true.', { field: 'start_place_audit.pass', severity: 'hard_block' }));
  }
  if (input.player_character_dossier?.schema !== STAGE11_DOSSIER_SCHEMA || input.player_character_dossier?.version !== 1) {
    concerns.push(concern('PLAYER_AUDIT_DOSSIER_SCHEMA_MISMATCH', 'Stage 12 requires player_character_dossier schema/version.', { field: 'player_character_dossier.schema', severity: 'hard_block' }));
  }
  if (input.code_precheck?.schema !== STAGE12_CODE_PRECHECK_SCHEMA) {
    concerns.push(concern('PLAYER_AUDIT_SCHEMA_INVALID', `code_precheck.schema must be ${STAGE12_CODE_PRECHECK_SCHEMA}.`, { field: 'code_precheck.schema', severity: 'hard_block' }));
  }

  const recomputed = buildStage12CodePrecheck(input);
  if (input.code_precheck?.pass !== recomputed.pass) {
    concerns.push(concern('PLAYER_AUDIT_CODE_PRECHECK_FAILED', 'code_precheck.pass does not match recomputed precheck.', { field: 'code_precheck.pass', severity: 'hard_block' }));
  }
  if (input.code_precheck?.pass === false) {
    concerns.push(...(input.code_precheck.concerns ?? [concern('PLAYER_AUDIT_CODE_PRECHECK_FAILED', 'code_precheck failed.', { field: 'code_precheck', severity: 'hard_block' })]));
  }
  return concerns;
}
