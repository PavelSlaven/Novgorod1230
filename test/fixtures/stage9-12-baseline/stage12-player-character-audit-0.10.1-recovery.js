import { concern } from '../llm-stage.js';

export const STAGE12_INPUT_SCHEMA = 'player_character_audit_input';
export const STAGE12_OUTPUT_SCHEMA = 'player_character_audit';
export const STAGE12_CODE_PRECHECK_SCHEMA = 'player_character_code_precheck';
export const STAGE11_DOSSIER_SCHEMA = 'player_character_dossier';

export const PLAYER_AUDIT_REQUIRED_CHECKS = Object.freeze([
  'schema_and_structure',
  'historical_compatibility',
  'region_compatibility',
  'start_place_compatibility',
  'social_status',
  'occupation',
  'origin',
  'body_state',
  'attributes',
  'skills',
  'inventory',
  'property_and_access',
  'knowledge',
  'relations',
  'goals',
  'source_trace',
  'downstream_entity_leak_check'
]);

export const PLAYER_AUDIT_ALLOWED_CONCERN_CODES = Object.freeze(new Set([
  'PLAYER_AUDIT_SCHEMA_INVALID',
  'PLAYER_AUDIT_MISSING_REQUIRED_FIELD',
  'PLAYER_AUDIT_START_PLACE_AUDIT_NOT_PASSED',
  'PLAYER_AUDIT_DOSSIER_SCHEMA_MISMATCH',
  'PLAYER_AUDIT_SOCIAL_ROLE_NOT_ALLOWED',
  'PLAYER_AUDIT_OCCUPATION_NOT_ALLOWED',
  'PLAYER_AUDIT_OCCUPATION_NULL_REASON_MISSING',
  'PLAYER_AUDIT_ITEM_PROFILE_NOT_ALLOWED',
  'PLAYER_AUDIT_PROPERTY_RULE_NOT_ALLOWED',
  'PLAYER_AUDIT_NPC_REF_NOT_ALLOWED',
  'PLAYER_AUDIT_STATE_RANGE_INVALID',
  'PLAYER_AUDIT_ATTRIBUTE_RANGE_INVALID',
  'PLAYER_AUDIT_ATTRIBUTE_BALANCE_INVALID',
  'PLAYER_AUDIT_SKILL_RANGE_INVALID',
  'PLAYER_AUDIT_SKILL_BASIS_MISSING',
  'PLAYER_AUDIT_COMBAT_SKILL_BASIS_MISSING',
  'PLAYER_AUDIT_SOURCE_TRACE_MISSING',
  'PLAYER_AUDIT_SOURCE_TRACE_INVALID',
  'PLAYER_AUDIT_DOWNSTREAM_ENTITY_LEAK',
  'PLAYER_AUDIT_HISTORICAL_ANACHRONISM',
  'PLAYER_AUDIT_REGION_MISMATCH',
  'PLAYER_AUDIT_START_PLACE_MISMATCH',
  'PLAYER_AUDIT_NO_REASON_HERE',
  'PLAYER_AUDIT_NO_IMMEDIATE_NEED',
  'PLAYER_AUDIT_SOCIAL_STATUS_IMPOSSIBLE',
  'PLAYER_AUDIT_ORIGIN_INCOMPATIBLE',
  'PLAYER_AUDIT_BODY_STATE_INVALID',
  'PLAYER_AUDIT_INVENTORY_NOT_ALLOWED',
  'PLAYER_AUDIT_INVENTORY_ACCESS_INVALID',
  'PLAYER_AUDIT_PROPERTY_ACCESS_INVALID',
  'PLAYER_AUDIT_KNOWLEDGE_LEAK',
  'PLAYER_AUDIT_RELATION_REF_INVALID',
  'PLAYER_AUDIT_GOAL_CONFLICT',
  'PLAYER_AUDIT_AUDIT_OUTPUT_INVALID',
  'PLAYER_AUDIT_COMMIT_PERMISSION_MISMATCH',
  'PLAYER_AUDIT_REPAIR_ROUTE_INVALID',
  'PLAYER_AUDIT_EVIDENCE_MISSING',
  'PLAYER_AUDIT_CONCERN_ENUM_INVALID',
  'PLAYER_AUDIT_SEVERITY_ENUM_INVALID',
  'PLAYER_AUDIT_MODIFIED_CHARACTER',
  'PLAYER_AUDIT_NEW_INVENTORY',
  'PLAYER_AUDIT_NEW_BIOGRAPHY',
  'PLAYER_AUDIT_CREATED_VISIBLE_SCENE',
  'PLAYER_AUDIT_CREATED_INTRO_PROSE',
  'PLAYER_AUDIT_CREATED_G5',
  'PLAYER_AUDIT_CREATED_NPC',
  'PLAYER_AUDIT_CODE_PRECHECK_FAILED'
]));

export const PLAYER_AUDIT_ALLOWED_SEVERITIES = Object.freeze(new Set([
  'info',
  'warning',
  'soft_warning',
  'repairable',
  'hard_block',
  'blocker',
  'critical'
]));

export const PLAYER_AUDIT_ALLOWED_REPAIR_ROUTES = Object.freeze(new Set([
  'player_character_format_repair',
  'player_character_semantic_repair',
  'player_character_audit_format_repair',
  'player_character_audit_router',
  'item_profile_retriever',
  'npc_candidate_retriever',
  'start_place_audit',
  'start_node_selector',
  'regional_context_loader',
  'historical_frame_selector',
  'normalized_request_recheck',
  'stage11',
  'player_character',
  '11',
  'blocked',
  'manual_review',
  'needs_manual_review'
]));

const FORBIDDEN_AUDIT_KEYS = Object.freeze(new Set([
  'player_character_dossier',
  'modified_character',
  'replacement_character',
  'changed_character',
  'character_patch',
  'new_inventory',
  'inventory_patch',
  'new_biography',
  'biography_patch',
  'visible_scene',
  'intro_prose',
  'g5_scene',
  'g5_scene_graph',
  'g5_scene_graph_draft',
  'g5_anchor',
  'g5_anchors',
  'minilocation',
  'minilocations',
  'new_npc',
  'new_npcs',
  'materialized_npc',
  'materialized_npcs',
  'npc_entity',
  'npc_entities'
]));

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

export function buildStage12CodePrecheck(input = {}) {
  const checks = {
    schema_valid: true,
    required_fields_present: true,
    start_place_audit_passed: true,
    social_role_id_allowed: true,
    occupation_id_allowed: true,
    item_profile_ids_allowed: true,
    property_rule_ids_allowed: true,
    npc_candidate_refs_allowed: true,
    state_ranges_valid: true,
    attributes_valid: true,
    skills_valid: true,
    source_trace_present: true,
    no_downstream_entities: true
  };
  const concerns = [];
  const dossier = input.player_character_dossier;

  if (!isPlainObject(dossier) || dossier.schema !== STAGE11_DOSSIER_SCHEMA || dossier.version !== 1) {
    checks.schema_valid = false;
    concerns.push(concern('PLAYER_AUDIT_DOSSIER_SCHEMA_MISMATCH', 'player_character_dossier must have schema=player_character_dossier and version=1.', { field: 'player_character_dossier.schema', severity: 'hard_block' }));
  }

  const requiredDossierFields = [
    'identity',
    'social_status',
    'origin',
    'body',
    'attributes',
    'skills',
    'knowledge',
    'goals',
    'inventory',
    'property_and_access',
    'relations',
    'start_place_connection',
    'selected_candidate_refs',
    'source_trace',
    'audit_self_check'
  ];
  for (const field of requiredDossierFields) {
    if (dossier?.[field] === undefined) {
      checks.required_fields_present = false;
      concerns.push(concern('PLAYER_AUDIT_MISSING_REQUIRED_FIELD', `player_character_dossier.${field} is required.`, { field: `player_character_dossier.${field}`, severity: 'hard_block' }));
    }
  }

  if (input.start_place_audit?.pass !== true) {
    checks.start_place_audit_passed = false;
    concerns.push(concern('PLAYER_AUDIT_START_PLACE_AUDIT_NOT_PASSED', 'Stage 12 requires start_place_audit.pass=true.', { field: 'start_place_audit.pass', severity: 'hard_block' }));
  }

  const socialRoleId = firstText(dossier?.selected_candidate_refs?.social_role_id, dossier?.social_status?.social_role_id, dossier?.social_status?.role_id, dossier?.social_role_id);
  const socialRoleIds = collectSocialRoleIds(input.regional_context_package?.social_context ?? input.regional_context_package);
  if (!text(socialRoleId) || (socialRoleIds.size > 0 && !socialRoleIds.has(socialRoleId))) {
    checks.social_role_id_allowed = false;
    concerns.push(concern('PLAYER_AUDIT_SOCIAL_ROLE_NOT_ALLOWED', 'social_role_id must exist in regional social roles.', { field: 'player_character_dossier.selected_candidate_refs.social_role_id', severity: 'hard_block' }));
  }

  const occupationId = firstText(dossier?.selected_candidate_refs?.occupation_id, dossier?.social_status?.occupation_id, dossier?.occupation?.occupation_id, dossier?.occupation_id);
  const occupationIds = collectOccupationIds(input.regional_context_package?.occupation_context ?? input.regional_context_package);
  const explicitNullOccupation = dossier?.selected_candidate_refs?.occupation_id === null || dossier?.social_status?.occupation_id === null;
  if (text(occupationId)) {
    if (occupationIds.size > 0 && !occupationIds.has(occupationId)) {
      checks.occupation_id_allowed = false;
      concerns.push(concern('PLAYER_AUDIT_OCCUPATION_NOT_ALLOWED', 'occupation_id must exist in regional occupations.', { field: 'player_character_dossier.selected_candidate_refs.occupation_id', severity: 'hard_block' }));
    }
  } else if (explicitNullOccupation) {
    if (!hasNullOccupationReason(dossier)) {
      checks.occupation_id_allowed = false;
      concerns.push(concern('PLAYER_AUDIT_OCCUPATION_NULL_REASON_MISSING', 'occupation_id may be null only with explicit reason.', { field: 'player_character_dossier.selected_candidate_refs.occupation_id', severity: 'hard_block' }));
    }
  } else {
    checks.occupation_id_allowed = false;
    concerns.push(concern('PLAYER_AUDIT_OCCUPATION_NOT_ALLOWED', 'occupation_id is required unless explicitly null with reason.', { field: 'player_character_dossier.selected_candidate_refs.occupation_id', severity: 'hard_block' }));
  }

  const itemProfileIds = collectItemProfileIds(input.item_profile_candidate_set);
  for (const item of collectInventoryItems(dossier?.inventory)) {
    const itemProfileId = firstText(item.item_profile_candidate_id, item.item_profile_id, item.profile_id);
    if (!itemProfileId || (itemProfileIds.size > 0 && !itemProfileIds.has(itemProfileId))) {
      checks.item_profile_ids_allowed = false;
      concerns.push(concern('PLAYER_AUDIT_ITEM_PROFILE_NOT_ALLOWED', 'Inventory item must reference item_profile_candidate_set.', { field: `${item.__path}.item_profile_candidate_id`, severity: 'hard_block' }));
    }
    if (!hasAny(item, ['owner', 'owner_id', 'owner_type']) || !hasAny(item, ['holder', 'holder_id', 'holder_type']) || !hasAny(item, ['access', 'access_status']) || !hasAny(item, ['weight', 'weight_kg']) || !hasAny(item, ['condition', 'state']) || !hasAny(item, ['risk', 'loss_risk', 'social_risk'])) {
      checks.property_rule_ids_allowed = false;
      concerns.push(concern('PLAYER_AUDIT_PROPERTY_ACCESS_INVALID', 'Inventory item must include owner/holder/access/weight/condition/risk.', { field: item.__path, severity: 'hard_block' }));
    }
  }

  const propertyRuleIds = collectPropertyRuleIds(input.item_profile_candidate_set);
  for (const ref of collectRefs(dossier?.property_and_access, ['property_rule_candidate_id', 'property_rule_id'])) {
    if (propertyRuleIds.size > 0 && !propertyRuleIds.has(ref.value)) {
      checks.property_rule_ids_allowed = false;
      concerns.push(concern('PLAYER_AUDIT_PROPERTY_RULE_NOT_ALLOWED', 'property_rule_id must come from item_profile_candidate_set/property candidates.', { field: ref.path, severity: 'hard_block' }));
    }
  }

  const npcCandidateIds = collectNpcCandidateIds(input.npc_candidate_set);
  for (const relation of collectRelationObjects(dossier?.relations)) {
    const mode = relation.relation_mode ?? relation.relation_type;
    const npcId = firstText(relation.npc_candidate_id, relation.npc_id);
    const isAbstract = mode === 'abstract_background_relation' || relation.is_materialized_npc === false;
    if (npcId && npcCandidateIds.size > 0 && !npcCandidateIds.has(npcId)) {
      checks.npc_candidate_refs_allowed = false;
      concerns.push(concern('PLAYER_AUDIT_NPC_REF_NOT_ALLOWED', 'npc_candidate_id must exist in npc_candidate_set.', { field: `${relation.__path}.npc_candidate_id`, severity: 'hard_block' }));
    } else if (!npcId && !isAbstract) {
      checks.npc_candidate_refs_allowed = false;
      concerns.push(concern('PLAYER_AUDIT_NPC_REF_NOT_ALLOWED', 'Relation must reference npc_candidate_id or be explicit abstract_background_relation.', { field: relation.__path, severity: 'hard_block' }));
    }
  }

  for (const value of extractNumericNamedValues(dossier?.body, ['health', 'satiety', 'vigor'])) {
    if (!inRange(value.value, 0, 100)) {
      checks.state_ranges_valid = false;
      concerns.push(concern('PLAYER_AUDIT_STATE_RANGE_INVALID', 'health/satiety/vigor must be 0..100.', { field: value.path, severity: 'hard_block' }));
    }
  }

  for (const value of extractNumericNamedValues(dossier?.attributes, [])) {
    if (!inRange(value.value, 3, 18)) {
      checks.attributes_valid = false;
      concerns.push(concern('PLAYER_AUDIT_ATTRIBUTE_RANGE_INVALID', 'attributes must be 3..18.', { field: value.path, severity: 'hard_block' }));
    }
  }

  for (const skill of collectSkillObjects(dossier?.skills)) {
    if (!inRange(skill.bonus, 0, 4)) {
      checks.skills_valid = false;
      concerns.push(concern('PLAYER_AUDIT_SKILL_RANGE_INVALID', 'skills must be 0..4.', { field: skill.path, severity: 'hard_block' }));
    }
    if (Number(skill.bonus) >= 3 && !text(skill.basis)) {
      checks.skills_valid = false;
      concerns.push(concern('PLAYER_AUDIT_SKILL_BASIS_MISSING', 'High skills require basis.', { field: skill.path, severity: 'hard_block' }));
    }
  }

  if (!nonEmptyArray(dossier?.source_trace)) {
    checks.source_trace_present = false;
    concerns.push(concern('PLAYER_AUDIT_SOURCE_TRACE_MISSING', 'player_character_dossier.source_trace must not be empty.', { field: 'player_character_dossier.source_trace', severity: 'hard_block' }));
  }

  const leaks = findForbiddenDossierFields(dossier);
  if (leaks.length > 0) {
    checks.no_downstream_entities = false;
    for (const leak of leaks) {
      concerns.push(concern('PLAYER_AUDIT_DOWNSTREAM_ENTITY_LEAK', `player_character_dossier must not contain downstream field ${leak.key}.`, { field: leak.path, severity: 'hard_block' }));
    }
  }

  return {
    version: 1,
    schema: STAGE12_CODE_PRECHECK_SCHEMA,
    request_id: input.request_id ?? null,
    pass: concerns.length === 0,
    checks,
    concerns,
    evidence: concerns.length === 0
      ? ['code_precheck passed: schema, candidate refs, numeric ranges, source_trace and downstream field checks']
      : concerns.map((item) => `${item.code}:${item.field ?? 'root'}`)
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

export function validateStage12PlayerCharacterAuditOutput(output = {}, input = {}) {
  const concerns = [];
  concerns.push(...validateStage12PlayerCharacterAuditInput(input));

  if (!isPlainObject(output)) {
    return concerns.concat(concern('PLAYER_AUDIT_AUDIT_OUTPUT_INVALID', 'player_character_audit must be a JSON object.', { field: 'root', severity: 'hard_block' }));
  }
  if (output.schema !== STAGE12_OUTPUT_SCHEMA) concerns.push(concern('PLAYER_AUDIT_AUDIT_OUTPUT_INVALID', `Audit schema must be ${STAGE12_OUTPUT_SCHEMA}.`, { field: 'schema', severity: 'hard_block' }));
  if (output.version !== 1) concerns.push(concern('PLAYER_AUDIT_AUDIT_OUTPUT_INVALID', 'Audit version must be 1.', { field: 'version', severity: 'hard_block' }));
  if (typeof output.pass !== 'boolean') concerns.push(concern('PLAYER_AUDIT_AUDIT_OUTPUT_INVALID', 'Audit pass must be boolean.', { field: 'pass', severity: 'hard_block' }));
  if (!isPlainObject(output.checks)) concerns.push(concern('PLAYER_AUDIT_MISSING_REQUIRED_FIELD', 'Audit checks must be an object.', { field: 'checks', severity: 'hard_block' }));
  for (const check of PLAYER_AUDIT_REQUIRED_CHECKS) {
    if (output.checks?.[check] === undefined) concerns.push(concern('PLAYER_AUDIT_MISSING_REQUIRED_FIELD', `Audit checks.${check} is required.`, { field: `checks.${check}`, severity: 'hard_block' }));
  }

  if (output.pass === true && !nonEmptyArray(output.evidence)) {
    concerns.push(concern('PLAYER_AUDIT_EVIDENCE_MISSING', 'Passing audit must include non-empty evidence.', { field: 'evidence', severity: 'hard_block' }));
  }
  if (output.pass === false && !nonEmptyArray(output.concerns)) {
    concerns.push(concern('PLAYER_AUDIT_AUDIT_OUTPUT_INVALID', 'Failed audit must include concerns.', { field: 'concerns', severity: 'hard_block' }));
  }
  if (output.pass === false && !isPlainObject(output.repair_route)) {
    concerns.push(concern('PLAYER_AUDIT_REPAIR_ROUTE_INVALID', 'Failed audit must include repair_route.', { field: 'repair_route', severity: 'hard_block' }));
  }

  concerns.push(...validateCommitPermission(output));
  concerns.push(...validateAuditConcernEnums(output));
  concerns.push(...validateRepairRoute(output));
  concerns.push(...validateAuditDoesNotMutateCharacter(output));

  if (input.code_precheck?.pass === false && output.pass === true) {
    concerns.push(concern('PLAYER_AUDIT_CODE_PRECHECK_FAILED', 'Audit cannot pass when code_precheck.pass=false.', { field: 'pass', severity: 'hard_block' }));
  }

  return concerns;
}

export function buildStage12FailedAuditFromPrecheck(input = {}) {
  const precheck = input.code_precheck ?? buildStage12CodePrecheck(input);
  return {
    version: 1,
    schema: STAGE12_OUTPUT_SCHEMA,
    request_id: input.request_id ?? null,
    pass: false,
    checks: buildFailedChecksFromPrecheck(precheck),
    concerns: precheck.concerns?.length ? precheck.concerns : [concern('PLAYER_AUDIT_CODE_PRECHECK_FAILED', 'Stage 12 code_precheck failed.', { severity: 'hard_block' })],
    evidence: precheck.evidence?.length ? precheck.evidence : ['code_precheck.pass=false'],
    repair_route: {
      return_to_stage: 'player_character_semantic_repair',
      repair_kind: 'fix_player_character_dossier_from_code_precheck'
    },
    commit_permission: {
      can_shape_game_profile: false,
      can_continue_to_g5_materialization: false,
      can_write_player_character_after_commit_gate: false
    }
  };
}

function buildFailedChecksFromPrecheck(precheck = {}) {
  return Object.fromEntries(PLAYER_AUDIT_REQUIRED_CHECKS.map((key) => [key, { pass: precheck.pass === true }]));
}

function validateCommitPermission(output) {
  const concerns = [];
  const permission = output.commit_permission;
  if (!isPlainObject(permission)) {
    concerns.push(concern('PLAYER_AUDIT_COMMIT_PERMISSION_MISMATCH', 'commit_permission is required.', { field: 'commit_permission', severity: 'hard_block' }));
    return concerns;
  }
  const expected = output.pass === true;
  for (const field of ['can_shape_game_profile', 'can_continue_to_g5_materialization', 'can_write_player_character_after_commit_gate']) {
    if (permission[field] !== expected) {
      concerns.push(concern('PLAYER_AUDIT_COMMIT_PERMISSION_MISMATCH', `${field} must be ${expected} when pass=${output.pass}.`, { field: `commit_permission.${field}`, severity: 'hard_block' }));
    }
  }
  return concerns;
}

function validateAuditConcernEnums(output) {
  const concerns = [];
  for (const item of output.concerns ?? []) {
    if (!PLAYER_AUDIT_ALLOWED_CONCERN_CODES.has(String(item?.code ?? ''))) {
      concerns.push(concern('PLAYER_AUDIT_CONCERN_ENUM_INVALID', `Concern code is not allowed: ${String(item?.code ?? 'missing')}.`, { field: 'concerns.code', severity: 'hard_block' }));
    }
    if (item?.severity !== undefined && !PLAYER_AUDIT_ALLOWED_SEVERITIES.has(String(item.severity))) {
      concerns.push(concern('PLAYER_AUDIT_SEVERITY_ENUM_INVALID', `Severity is not allowed: ${String(item.severity)}.`, { field: 'concerns.severity', severity: 'hard_block' }));
    }
  }
  return concerns;
}

function validateRepairRoute(output) {
  const concerns = [];
  if (output.pass === true) {
    if (output.repair_route !== null && output.repair_route !== undefined) {
      concerns.push(concern('PLAYER_AUDIT_REPAIR_ROUTE_INVALID', 'Passing audit must not include repair_route.', { field: 'repair_route', severity: 'hard_block' }));
    }
    return concerns;
  }
  const route = output.repair_route ?? {};
  const target = String(route.return_to_stage ?? route.repair_target_stage ?? '');
  if (!PLAYER_AUDIT_ALLOWED_REPAIR_ROUTES.has(target)) {
    concerns.push(concern('PLAYER_AUDIT_REPAIR_ROUTE_INVALID', `repair_route.return_to_stage is not allowed: ${target || 'missing'}.`, { field: 'repair_route.return_to_stage', severity: 'hard_block' }));
  }
  return concerns;
}

function validateAuditDoesNotMutateCharacter(output) {
  const concerns = [];
  const leaks = [];
  walk(output, (value, path) => {
    const key = lastPathKey(path);
    if (FORBIDDEN_AUDIT_KEYS.has(key)) leaks.push({ key, path });
  });
  for (const leak of leaks) {
    let code = 'PLAYER_AUDIT_MODIFIED_CHARACTER';
    if (/inventory/u.test(leak.key)) code = 'PLAYER_AUDIT_NEW_INVENTORY';
    if (/biography/u.test(leak.key)) code = 'PLAYER_AUDIT_NEW_BIOGRAPHY';
    if (/visible_scene/u.test(leak.key)) code = 'PLAYER_AUDIT_CREATED_VISIBLE_SCENE';
    if (/intro_prose/u.test(leak.key)) code = 'PLAYER_AUDIT_CREATED_INTRO_PROSE';
    if (/g5|minilocation/u.test(leak.key)) code = 'PLAYER_AUDIT_CREATED_G5';
    if (/npc/u.test(leak.key)) code = 'PLAYER_AUDIT_CREATED_NPC';
    concerns.push(concern(code, `Audit must not contain downstream or modified character field ${leak.key}.`, { field: leak.path, severity: 'hard_block' }));
  }
  return concerns;
}

function findForbiddenDossierFields(dossier) {
  const leaks = [];
  const forbidden = new Set(['visible_scene', 'intro_prose', 'g5_scene', 'g5_scene_graph', 'g5_anchor', 'g5_anchors', 'minilocation', 'minilocations', 'current_g5_anchor', 'scene_anchor']);
  walk(dossier, (_value, path) => {
    const key = lastPathKey(path);
    if (forbidden.has(key)) leaks.push({ key, path });
  });
  return leaks;
}

function collectSocialRoleIds(root) {
  return collectCandidateIdsDeep(root, ['social_role_id', 'role_id', 'id', 'candidate_id'], (path) => /social|role|roles/u.test(path));
}

function collectOccupationIds(root) {
  return collectCandidateIdsDeep(root, ['occupation_id', 'id', 'candidate_id'], (path) => /occupation|occupations|заняти/u.test(path));
}

function collectItemProfileIds(root) {
  const direct = collectCandidateIdSet(root?.item_profile_candidates ?? []);
  if (direct.size > 0) return direct;
  return collectCandidateIdsDeep(root, ['item_profile_candidate_id', 'item_profile_id', 'profile_id', 'id', 'candidate_id'], (path) => /item_profile|item_profiles|item/u.test(path));
}

function collectPropertyRuleIds(root) {
  const direct = collectCandidateIdSet(root?.property_rule_candidates ?? root?.property_rules ?? []);
  if (direct.size > 0) return direct;
  return collectCandidateIdsDeep(root, ['property_rule_candidate_id', 'property_rule_id', 'rule_id', 'id', 'candidate_id'], (path) => /property|access|ownership|rule/u.test(path));
}

function collectNpcCandidateIds(root) {
  const direct = collectCandidateIdSet(root?.npc_candidates ?? []);
  if (direct.size > 0) return direct;
  return collectCandidateIdsDeep(root, ['npc_candidate_id', 'npc_id', 'id', 'candidate_id'], (path) => /npc|candidate/u.test(path));
}

function collectCandidateIdSet(value) {
  const ids = new Set();
  for (const item of collectArrayLike(value)) {
    const id = firstText(item?.id, item?.candidate_id, item?.item_profile_candidate_id, item?.container_profile_candidate_id, item?.property_rule_candidate_id, item?.npc_candidate_id, item?.social_role_id, item?.occupation_id, item?.profile_id, item?.rule_id);
    if (id) ids.add(id);
  }
  return ids;
}

function collectCandidateIdsDeep(root, idKeys, pathPredicate = () => true) {
  const ids = new Set();
  walk(root, (value, path) => {
    if (!isPlainObject(value) || !pathPredicate(path)) return;
    for (const key of idKeys) {
      if (text(value[key])) ids.add(value[key]);
    }
  });
  return ids;
}

function collectInventoryItems(inventory) {
  const items = [];
  walk(inventory, (value, path) => {
    if (!isPlainObject(value)) return;
    const meaningful = hasAny(value, ['item_profile_candidate_id', 'item_profile_id', 'profile_id', 'item_id', 'name', 'title', 'label'])
      && !/summary|total|load|occupied_hands|policy/u.test(path);
    if (meaningful) items.push({ ...value, __path: path });
  });
  return dedupeObjects(items);
}

function collectRelationObjects(relations) {
  const relationObjects = [];
  walk(relations, (value, path) => {
    if (!isPlainObject(value)) return;
    const looksLikeRelation = hasAny(value, ['relation_mode', 'npc_candidate_id', 'npc_id', 'person_label', 'relationship', 'relation_type'])
      && !/summary|policy/u.test(path);
    if (looksLikeRelation) relationObjects.push({ ...value, __path: path });
  });
  return dedupeObjects(relationObjects);
}

function collectSkillObjects(skills) {
  const out = [];
  walk(skills, (value, path) => {
    if (isPlainObject(value)) {
      const bonus = value.bonus ?? value.skill_bonus ?? value.value;
      if (bonus !== undefined && path !== 'root') {
        out.push({
          name: value.name ?? value.skill_id ?? path.split('.').at(-1),
          bonus,
          basis: value.basis ?? value.reason ?? value.biographical_basis ?? value.why,
          category: value.category ?? value.skill_group ?? '',
          path
        });
      }
    } else if (typeof value === 'number' && path !== 'root') {
      out.push({ name: path.split('.').at(-1), bonus: value, basis: null, category: '', path });
    }
  });
  return out;
}

function collectRefs(root, keys) {
  const refs = [];
  walk(root, (value, path) => {
    const key = lastPathKey(path);
    if (keys.includes(key) && text(value)) refs.push({ path, value });
  });
  return refs;
}

function extractNumericNamedValues(root, names = []) {
  const out = [];
  walk(root, (value, path) => {
    if (typeof value !== 'number') return;
    const lower = path.toLowerCase();
    if (names.length === 0 || names.some((name) => lower.endsWith(`.${name}`) || lower.includes(`.${name}.`) || lower.endsWith(String(name).toLowerCase()))) {
      out.push({ path, value });
    }
  });
  if (out.length === 0 && isPlainObject(root)) {
    for (const [key, value] of Object.entries(root)) {
      if (typeof value === 'number') out.push({ path: `attributes.${key}`, value });
      if (isPlainObject(value) && typeof value.value === 'number') out.push({ path: `attributes.${key}.value`, value: value.value });
    }
  }
  return out;
}

function hasNullOccupationReason(output) {
  return hasAnyText(output, ['occupation_null_reason', 'why_occupation_is_null', 'occupation_reason'])
    || hasAnyText(output.social_status, ['occupation_null_reason', 'why_occupation_is_null'])
    || hasAnyText(output.selected_candidate_refs, ['occupation_null_reason', 'why_occupation_is_null']);
}

function walk(value, visitor, path = 'root', seen = new Set()) {
  if (value && typeof value === 'object') {
    if (seen.has(value)) return;
    seen.add(value);
  }
  visitor(value, path);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visitor, `${path}[${index}]`, seen));
  } else if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (key === '__path') continue;
      walk(child, visitor, `${path}.${key}`, seen);
    }
  }
}

function lastPathKey(path) {
  return String(path).split('.').at(-1)?.replace(/\[\d+\]$/u, '') ?? '';
}

function collectArrayLike(value) {
  if (Array.isArray(value)) return value;
  if (isPlainObject(value)) return Object.values(value).filter((item) => isPlainObject(item));
  return [];
}

function dedupeObjects(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.__path ?? JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hasAny(object, keys) {
  if (!isPlainObject(object)) return false;
  return keys.some((key) => object[key] !== undefined && object[key] !== null && object[key] !== '');
}

function hasAnyText(object, keys) {
  if (!isPlainObject(object)) return false;
  return keys.some((key) => text(object[key]) || (Array.isArray(object[key]) && object[key].some(text)));
}

function firstText(...values) {
  for (const value of values) {
    if (text(value)) return String(value).trim();
  }
  return null;
}

function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function nonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function inRange(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max;
}
