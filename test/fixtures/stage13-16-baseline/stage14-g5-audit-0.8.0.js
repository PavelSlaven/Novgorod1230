import { concern } from '../llm-stage.js';
import {
  STAGE13_CODE_PRECHECK_SCHEMA,
  STAGE13_OUTPUT_SCHEMA,
  buildStage13G5CodePrecheck,
  validateStage13G5SceneGraphDraft
} from './stage13-g5-materialization.js';

export const STAGE14_INPUT_SCHEMA = 'g5_scene_audit_input';
export const STAGE14_OUTPUT_SCHEMA = 'g5_scene_audit';
export const STAGE14_CODE_PRECHECK_SCHEMA = STAGE13_CODE_PRECHECK_SCHEMA;

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

export function normalizeStage14AuditPolicy(policy = {}) {
  return {
    require_selected_g4_match: policy.require_selected_g4_match ?? true,
    require_allowed_g5_template_ids: policy.require_allowed_g5_template_ids ?? true,
    require_anchor_type_match: policy.require_anchor_type_match ?? true,
    require_minilocation_parent_match: policy.require_minilocation_parent_match ?? true,
    require_edges_between_existing_anchors: policy.require_edges_between_existing_anchors ?? true,
    require_player_start_anchor: policy.require_player_start_anchor ?? true,
    require_visibility_model: policy.require_visibility_model ?? true,
    require_access_model: policy.require_access_model ?? true,
    require_closed_zone_model: policy.require_closed_zone_model ?? true,
    require_risk_model: policy.require_risk_model ?? true,
    require_clock_light_consistency: policy.require_clock_light_consistency ?? true,
    require_source_trace: policy.require_source_trace ?? true,
    reject_created_npcs: policy.reject_created_npcs ?? true,
    reject_created_items: policy.reject_created_items ?? true,
    reject_container_contents: policy.reject_container_contents ?? true,
    reject_intro_prose: policy.reject_intro_prose ?? true,
    reject_visible_scene: policy.reject_visible_scene ?? true,
    reject_hidden_event: policy.reject_hidden_event ?? true
  };
}

export function buildStage14G5AuditInput(context, options = {}) {
  return {
    version: 1,
    schema: STAGE14_INPUT_SCHEMA,
    request_id: context.requestId,
    historical_frame: options.historical_frame ?? options.historicalFrame ?? context.requireStageOutput?.(3, 'historical frame'),
    selected_start_node: options.selected_start_node ?? options.selectedStartNode ?? context.requireStageOutput?.(9, 'selected start node'),
    start_place_audit: options.start_place_audit ?? options.startPlaceAudit ?? context.requireStageOutput?.(10, 'start place audit'),
    player_character: options.player_character ?? options.playerCharacter ?? context.getStageOutput?.(1101) ?? context.requireStageOutput?.(11, 'player character'),
    player_character_audit: options.player_character_audit ?? options.playerCharacterAudit ?? context.requireStageOutput?.(12, 'player character audit'),
    allowed_g5_template_set: normalizeAllowedG5TemplateSet(options.allowed_g5_template_set ?? options.allowedG5TemplateSet ?? context.getStageOutput?.(1300) ?? {}),
    g5_scene_graph_draft: options.g5_scene_graph_draft ?? options.g5SceneGraphDraft ?? context.requireStageOutput?.(13, 'G5 scene graph draft'),
    g5_scene_code_precheck: options.g5_scene_code_precheck ?? options.g5SceneCodePrecheck ?? context.getStageOutput?.(1301) ?? null,
    npc_candidate_set: options.npc_candidate_set ?? options.npcCandidateSet ?? context.requireStageOutput?.(7, 'NPC candidate set'),
    item_profile_candidate_set: options.item_profile_candidate_set ?? options.itemProfileCandidateSet ?? context.requireStageOutput?.(8, 'item profile candidate set'),
    audit_policy: normalizeStage14AuditPolicy(options.audit_policy ?? options.policy ?? {})
  };
}

export function validateStage14G5AuditInput(input = {}) {
  const concerns = [];
  if (!isPlainObject(input)) {
    return [concern('G5_AUDIT_INPUT_SCHEMA_MISMATCH', 'Stage 14 input must be an object.', { field: 'root', severity: 'hard_block' })];
  }
  if (input.version !== 1) {
    concerns.push(concern('G5_AUDIT_INPUT_VERSION_MISMATCH', 'Stage 14 input.version must be 1.', { field: 'version', severity: 'hard_block' }));
  }
  if (input.schema !== STAGE14_INPUT_SCHEMA) {
    concerns.push(concern('G5_AUDIT_INPUT_SCHEMA_MISMATCH', `Stage 14 input.schema must be ${STAGE14_INPUT_SCHEMA}.`, { field: 'schema', severity: 'hard_block' }));
  }
  for (const field of [
    'historical_frame',
    'selected_start_node',
    'start_place_audit',
    'player_character',
    'player_character_audit',
    'allowed_g5_template_set',
    'g5_scene_graph_draft',
    'npc_candidate_set',
    'item_profile_candidate_set',
    'audit_policy'
  ]) {
    if (!isPlainObject(input[field])) {
      concerns.push(concern('G5_AUDIT_INPUT_REQUIRED_BLOCK_MISSING', `Stage 14 input.${field} is required.`, { field, severity: 'hard_block' }));
    }
  }
  if (input.start_place_audit?.pass !== true) {
    concerns.push(concern('G5_AUDIT_START_PLACE_AUDIT_FAILED', 'Stage 14 requires start_place_audit.pass=true.', { field: 'start_place_audit.pass', severity: 'hard_block' }));
  }
  if (input.player_character_audit?.pass !== true) {
    concerns.push(concern('G5_AUDIT_PLAYER_CHARACTER_AUDIT_FAILED', 'Stage 14 requires player_character_audit.pass=true.', { field: 'player_character_audit.pass', severity: 'hard_block' }));
  }
  if (input.player_character?.schema !== 'player_character_game_profile') {
    concerns.push(concern('G5_AUDIT_CHARACTER_SCHEMA_MISMATCH', 'Stage 14 requires player_character.schema=player_character_game_profile.', { field: 'player_character.schema', severity: 'hard_block' }));
  }
  if (input.g5_scene_graph_draft?.schema !== STAGE13_OUTPUT_SCHEMA) {
    concerns.push(concern('G5_AUDIT_SCHEMA_MISMATCH', `Stage 14 requires g5_scene_graph_draft.schema=${STAGE13_OUTPUT_SCHEMA}.`, { field: 'g5_scene_graph_draft.schema', severity: 'hard_block' }));
  }
  if (input.g5_scene_graph_draft?.materialization_status !== 'materialized') {
    concerns.push(concern('G5_AUDIT_MATERIALIZATION_STATUS_INVALID', 'Stage 14 requires g5_scene_graph_draft.materialization_status=materialized.', { field: 'g5_scene_graph_draft.materialization_status', severity: 'hard_block' }));
  }
  if (input.g5_scene_code_precheck && input.g5_scene_code_precheck.schema !== STAGE14_CODE_PRECHECK_SCHEMA) {
    concerns.push(concern('G5_AUDIT_SCHEMA_MISMATCH', `Stage 14 g5_scene_code_precheck.schema must be ${STAGE14_CODE_PRECHECK_SCHEMA}.`, { field: 'g5_scene_code_precheck.schema', severity: 'hard_block' }));
  }
  if (!Array.isArray(input.allowed_g5_template_set?.allowed_g5_templates) || input.allowed_g5_template_set.allowed_g5_templates.length === 0) {
    concerns.push(concern('G5_AUDIT_ALLOWED_TEMPLATES_EMPTY', 'Stage 14 requires non-empty allowed_g5_template_set.allowed_g5_templates.', { field: 'allowed_g5_template_set.allowed_g5_templates', severity: 'hard_block' }));
  }
  return dedupeConcerns(concerns);
}

export function validateStage14G5SceneDraftForAudit(draft = {}, input = {}) {
  return validateStage13G5SceneGraphDraft(draft, {
    selected_start_node: input.selected_start_node,
    historical_frame: input.historical_frame,
    allowed_g5_template_set: input.allowed_g5_template_set
  }).map((item) => ({
    ...item,
    code: mapDraftConcernCode(item.code),
    message: item.message ?? item.code
  }));
}

export function buildStage14G5SceneCodePrecheck(input = {}) {
  const inputConcerns = validateStage14G5AuditInput(input);
  const draftConcerns = validateStage14G5SceneDraftForAudit(input.g5_scene_graph_draft, input);
  const inheritedConcerns = input.g5_scene_code_precheck?.pass === false
    ? normalizeArray(input.g5_scene_code_precheck.concerns).map((item) => ({
        ...item,
        code: mapDraftConcernCode(item.code),
        message: item.message ?? item.code,
        severity: item.severity ?? 'hard_block'
      }))
    : [];
  const concerns = dedupeConcerns([...inputConcerns, ...draftConcerns, ...inheritedConcerns]);
  return {
    version: 1,
    schema: STAGE14_CODE_PRECHECK_SCHEMA,
    pass: concerns.length === 0,
    checks: {
      schema_valid: !hasConcern(concerns, ['G5_AUDIT_INPUT_SCHEMA_MISMATCH', 'G5_AUDIT_SCHEMA_MISMATCH', 'G5_AUDIT_INPUT_VERSION_MISMATCH']),
      selected_g4_valid: !hasConcern(concerns, ['G5_AUDIT_SELECTED_G4_MISMATCH', 'G5_AUDIT_CREATED_PARENT_LOCATION']),
      all_minilocations_inside_selected_g4: !hasConcern(concerns, ['G5_AUDIT_MINILOC_OUTSIDE_G4']),
      all_anchors_have_allowed_templates: !hasConcern(concerns, ['G5_AUDIT_TEMPLATE_NOT_ALLOWED', 'G5_AUDIT_ANCHOR_WITHOUT_TEMPLATE']),
      player_start_anchor_exists: !hasConcern(concerns, ['G5_AUDIT_START_ANCHOR_MISSING', 'G5_AUDIT_START_POSITION_MISSING']),
      player_start_minilocation_exists: !hasConcern(concerns, ['G5_AUDIT_START_MINILOCATION_MISSING', 'G5_AUDIT_START_POSITION_MISSING']),
      all_edges_reference_existing_anchors: !hasConcern(concerns, ['G5_AUDIT_EDGE_ANCHOR_MISSING']),
      clock_light_consistency: !hasConcern(concerns, ['G5_AUDIT_CLOCK_LIGHT_CONTRADICTION']),
      no_npcs_materialized: !hasConcern(concerns, ['G5_AUDIT_CREATED_NPC']),
      no_items_materialized: !hasConcern(concerns, ['G5_AUDIT_CREATED_ITEM', 'G5_AUDIT_CREATED_CONTAINER_CONTENTS']),
      no_intro_prose: !hasConcern(concerns, ['G5_AUDIT_CREATED_INTRO_PROSE', 'G5_AUDIT_CREATED_VISIBLE_SCENE']),
      source_trace_present: !hasConcern(concerns, ['G5_AUDIT_SOURCE_TRACE_MISSING', 'G5_AUDIT_SELF_CHECK_EVIDENCE_MISSING'])
    },
    concerns,
    evidence: concerns.length === 0
      ? [{ kind: 'stage14_code_precheck', result: 'passed' }]
      : concerns.map((item) => ({ kind: 'stage14_code_precheck_concern', code: item.code, field: item.field ?? null }))
  };
}

export function buildStage14FailedAuditFromPrecheck(input = {}, precheck = {}) {
  const concerns = normalizeArray(precheck.concerns).length > 0
    ? normalizeArray(precheck.concerns)
    : [concern('G5_AUDIT_CODE_PRECHECK_FAILED', 'Stage 14 code precheck failed.', { severity: 'hard_block' })];
  return {
    version: 1,
    schema: STAGE14_OUTPUT_SCHEMA,
    request_id: input.request_id ?? null,
    pass: false,
    checks: buildFailedChecks(precheck),
    concerns,
    evidence: normalizeArray(precheck.evidence).length > 0
      ? precheck.evidence
      : concerns.map((item) => ({ kind: 'stage14_precheck_failure', code: item.code, field: item.field ?? null })),
    repair_route: {
      return_to_stage: 'g5_materialization_repair',
      repair_kind: 'fix_g5_scene_graph_draft',
      reason_code: concerns[0]?.code ?? 'G5_AUDIT_CODE_PRECHECK_FAILED'
    },
    commit_permission: buildCommitPermission(false)
  };
}

export function validateStage14G5SceneAuditOutput(output = {}, input = {}) {
  const concerns = [];
  if (!isPlainObject(output)) {
    return [concern('G5_AUDIT_OUTPUT_SCHEMA_MISMATCH', 'Stage 14 audit output must be an object.', { field: 'root', severity: 'hard_block' })];
  }
  if (output.version !== 1) {
    concerns.push(concern('G5_AUDIT_OUTPUT_VERSION_MISMATCH', 'g5_scene_audit.version must be 1.', { field: 'version', severity: 'hard_block' }));
  }
  if (output.schema !== STAGE14_OUTPUT_SCHEMA) {
    concerns.push(concern('G5_AUDIT_OUTPUT_SCHEMA_MISMATCH', `g5_scene_audit.schema must be ${STAGE14_OUTPUT_SCHEMA}.`, { field: 'schema', severity: 'hard_block' }));
  }
  if (typeof output.pass !== 'boolean') {
    concerns.push(concern('G5_AUDIT_OUTPUT_PASS_MISSING', 'g5_scene_audit.pass must be boolean.', { field: 'pass', severity: 'hard_block' }));
  }
  if (!isPlainObject(output.checks)) {
    concerns.push(concern('G5_AUDIT_OUTPUT_CHECKS_MISSING', 'g5_scene_audit.checks is required.', { field: 'checks', severity: 'hard_block' }));
  } else {
    for (const checkName of STAGE14_REQUIRED_CHECKS) {
      if (!isPlainObject(output.checks[checkName])) {
        concerns.push(concern('G5_AUDIT_OUTPUT_CHECK_MISSING', `g5_scene_audit.checks.${checkName} is required.`, { field: `checks.${checkName}`, severity: 'hard_block' }));
      }
    }
  }
  if (!Array.isArray(output.evidence) || output.evidence.length === 0) {
    concerns.push(concern('G5_AUDIT_OUTPUT_EVIDENCE_EMPTY', 'g5_scene_audit.evidence must not be empty.', { field: 'evidence', severity: 'hard_block' }));
  }
  if (output.pass === false && (!Array.isArray(output.concerns) || output.concerns.length === 0)) {
    concerns.push(concern('G5_AUDIT_OUTPUT_CONCERNS_MISSING', 'Failed g5_scene_audit must include concerns.', { field: 'concerns', severity: 'hard_block' }));
  }
  if (output.pass === false && !isPlainObject(output.repair_route)) {
    concerns.push(concern('G5_AUDIT_OUTPUT_REPAIR_ROUTE_MISSING', 'Failed g5_scene_audit must include repair_route.', { field: 'repair_route', severity: 'hard_block' }));
  }
  if (output.pass === true && output.repair_route !== null) {
    concerns.push(concern('G5_AUDIT_OUTPUT_REPAIR_ROUTE_UNEXPECTED', 'Passing g5_scene_audit must have repair_route=null.', { field: 'repair_route', severity: 'hard_block' }));
  }
  validateCommitPermission(output, concerns);
  validateConcerns(output, concerns);
  validateRepairRoute(output, concerns);
  validateNoForbiddenAuditPayload(output, concerns);
  if (Object.prototype.hasOwnProperty.call(output, 'commit_allowed')) {
    concerns.push(concern('G5_AUDIT_COMMIT_ALLOWED_LEGACY_FIELD', 'commit_allowed is not a normative Stage 14 gate.', { field: 'commit_allowed', severity: 'hard_block' }));
  }
  return dedupeConcerns(concerns);
}

export async function runStage14G5AuditBlock({ input, audit }) {
  const inputConcerns = validateStage14G5AuditInput(input);
  if (inputConcerns.length > 0) {
    const precheck = buildStage14G5SceneCodePrecheck(input);
    return {
      pass: false,
      output: buildStage14FailedAuditFromPrecheck(input, { ...precheck, concerns: [...inputConcerns, ...(precheck.concerns ?? [])] }),
      code_precheck: precheck,
      concerns: inputConcerns
    };
  }
  const precheck = buildStage14G5SceneCodePrecheck(input);
  if (precheck.pass !== true) {
    return {
      pass: false,
      output: buildStage14FailedAuditFromPrecheck(input, precheck),
      code_precheck: precheck,
      concerns: precheck.concerns ?? []
    };
  }
  if (typeof audit !== 'function') {
    throw new Error('Stage 14 requires audit callback.');
  }
  const output = await audit({ ...input, g5_scene_code_precheck: precheck });
  const outputConcerns = validateStage14G5SceneAuditOutput(output, input);
  return {
    pass: outputConcerns.length === 0 && output.pass === true,
    output,
    code_precheck: precheck,
    concerns: outputConcerns
  };
}

function validateCommitPermission(output, concerns) {
  const permission = output.commit_permission;
  if (!isPlainObject(permission)) {
    concerns.push(concern('G5_AUDIT_COMMIT_PERMISSION_MISMATCH', 'g5_scene_audit.commit_permission is required.', { field: 'commit_permission', severity: 'hard_block' }));
    return;
  }
  const expected = output.pass === true
    ? {
        can_commit_g5_scene_graph: true,
        can_continue_to_npc_placement: true,
        can_continue_to_item_placement: true,
        can_continue_to_visible_context: false
      }
    : {
        can_commit_g5_scene_graph: false,
        can_continue_to_npc_placement: false,
        can_continue_to_item_placement: false,
        can_continue_to_visible_context: false
      };
  for (const [key, value] of Object.entries(expected)) {
    if (permission[key] !== value) {
      concerns.push(concern('G5_AUDIT_COMMIT_PERMISSION_MISMATCH', `commit_permission.${key} must be ${value}.`, { field: `commit_permission.${key}`, severity: 'hard_block' }));
    }
  }
}

function validateConcerns(output, concerns) {
  for (const [index, item] of normalizeArray(output.concerns).entries()) {
    if (!STAGE14_CONCERN_CODE_ENUM.has(item?.code)) {
      concerns.push(concern('G5_AUDIT_CONCERN_CODE_UNKNOWN', `Unknown Stage 14 concern code: ${item?.code}.`, { field: `concerns.${index}.code`, severity: 'hard_block' }));
    }
    const severity = item?.severity ?? 'hard_block';
    if (!STAGE14_SEVERITY_ENUM.has(severity)) {
      concerns.push(concern('G5_AUDIT_CONCERN_SEVERITY_UNKNOWN', `Unknown Stage 14 concern severity: ${severity}.`, { field: `concerns.${index}.severity`, severity: 'hard_block' }));
    }
  }
}

function validateRepairRoute(output, concerns) {
  if (!isPlainObject(output.repair_route)) return;
  const route = output.repair_route.return_to_stage ?? output.repair_route.route ?? output.repair_route.target_stage;
  if (!STAGE14_REPAIR_ROUTE_ENUM.has(String(route))) {
    concerns.push(concern('G5_AUDIT_REPAIR_ROUTE_UNKNOWN', `Unknown Stage 14 repair route: ${route}.`, { field: 'repair_route.return_to_stage', severity: 'hard_block' }));
  }
}

function validateNoForbiddenAuditPayload(output, concerns) {
  const forbidden = [
    ['g5_scene_graph_draft', 'Audit must not contain modified g5_scene_graph_draft.'],
    ['modified_draft', 'Audit must not contain modified draft.'],
    ['corrected_draft', 'Audit must not contain corrected draft.'],
    ['new_anchors', 'Audit must not create new anchors.'],
    ['added_anchors', 'Audit must not create new anchors.'],
    ['new_edges', 'Audit must not create new edges.'],
    ['added_edges', 'Audit must not create new edges.'],
    ['npc', 'Audit must not contain NPCs.'],
    ['npcs', 'Audit must not contain NPCs.'],
    ['npc_instances', 'Audit must not contain NPCs.'],
    ['item', 'Audit must not contain items.'],
    ['items', 'Audit must not contain items.'],
    ['item_instances', 'Audit must not contain items.'],
    ['visible_scene', 'Audit must not contain visible_scene.'],
    ['intro_prose', 'Audit must not contain intro_prose.'],
    ['hidden_event', 'Audit must not contain hidden_event.'],
    ['hidden_events', 'Audit must not contain hidden_event.'],
    ['narrator_prose', 'Audit must not contain narrator_prose.']
  ];
  for (const [key, message] of forbidden) {
    if (hasOwnRecursive(output, key)) {
      concerns.push(concern('G5_AUDIT_FORBIDDEN_OUTPUT_FIELD', message, { field: key, severity: 'hard_block' }));
    }
  }
}

function buildFailedChecks(precheck = {}) {
  return Object.fromEntries(STAGE14_REQUIRED_CHECKS.map((key) => [key, {
    pass: precheck.pass === true,
    evidence: normalizeArray(precheck.evidence)
  }]));
}

function buildCommitPermission(pass) {
  return {
    can_commit_g5_scene_graph: pass === true,
    can_continue_to_npc_placement: pass === true,
    can_continue_to_item_placement: pass === true,
    can_continue_to_visible_context: false
  };
}

function normalizeAllowedG5TemplateSet(value = {}) {
  return {
    version: value.version ?? 1,
    schema: value.schema ?? 'allowed_g5_template_set',
    selected_g4_type_id: value.selected_g4_type_id ?? value.g4_type_id ?? null,
    allowed_g5_templates: normalizeArray(value.allowed_g5_templates ?? value.templates ?? value.g5_templates)
  };
}

function mapDraftConcernCode(code) {
  const map = {
    G5_SCENE_GRAPH_SCHEMA_MISMATCH: 'G5_AUDIT_SCHEMA_MISMATCH',
    G5_SCENE_GRAPH_VERSION_MISMATCH: 'G5_AUDIT_SCHEMA_MISMATCH',
    G5_SCENE_GRAPH_STATUS_NOT_MATERIALIZED: 'G5_AUDIT_MATERIALIZATION_STATUS_INVALID',
    G5_SCENE_GRAPH_PARENT_G4_MISMATCH: 'G5_AUDIT_SELECTED_G4_MISMATCH',
    G5_SCENE_GRAPH_PARENT_LOCATION_MISMATCH: 'G5_AUDIT_SELECTED_G4_MISMATCH',
    G5_SCENE_GRAPH_MINILOCATION_OUTSIDE_G4: 'G5_AUDIT_MINILOC_OUTSIDE_G4',
    G5_SCENE_GRAPH_ANCHOR_OUTSIDE_MINILOCATION: 'G5_AUDIT_ANCHOR_OUTSIDE_MINILOCATION',
    G5_SCENE_GRAPH_ANCHOR_OUTSIDE_G4: 'G5_AUDIT_ANCHOR_OUTSIDE_G4',
    G5_SCENE_GRAPH_TEMPLATE_NOT_ALLOWED: 'G5_AUDIT_TEMPLATE_NOT_ALLOWED',
    G5_SCENE_GRAPH_ANCHOR_TYPE_NOT_ALLOWED: 'G5_AUDIT_ANCHOR_TYPE_NOT_ALLOWED',
    G5_SCENE_GRAPH_START_POSITION_MISSING: 'G5_AUDIT_START_POSITION_MISSING',
    G5_SCENE_GRAPH_START_ANCHOR_MISSING: 'G5_AUDIT_START_ANCHOR_MISSING',
    G5_SCENE_GRAPH_START_MINILOCATION_MISSING: 'G5_AUDIT_START_MINILOCATION_MISSING',
    G5_SCENE_GRAPH_EDGE_ANCHOR_MISSING: 'G5_AUDIT_EDGE_ANCHOR_MISSING',
    G5_SCENE_GRAPH_VISIBILITY_MODEL_MISSING: 'G5_AUDIT_VISIBILITY_MODEL_MISSING',
    G5_SCENE_GRAPH_ACCESS_MODEL_MISSING: 'G5_AUDIT_ACCESS_MODEL_MISSING',
    G5_SCENE_GRAPH_VISIBILITY_ACCESS_MIXED: 'G5_AUDIT_VISIBILITY_ACCESS_MIXED',
    G5_SCENE_GRAPH_CLOCK_LIGHT_CONTRADICTION: 'G5_AUDIT_CLOCK_LIGHT_CONTRADICTION',
    G5_SCENE_GRAPH_CREATED_NPC: 'G5_AUDIT_CREATED_NPC',
    G5_SCENE_GRAPH_CREATED_ITEM: 'G5_AUDIT_CREATED_ITEM',
    G5_SCENE_GRAPH_CREATED_CONTAINER_CONTENTS: 'G5_AUDIT_CREATED_CONTAINER_CONTENTS',
    G5_SCENE_GRAPH_CREATED_VISIBLE_SCENE: 'G5_AUDIT_CREATED_VISIBLE_SCENE',
    G5_SCENE_GRAPH_CREATED_INTRO_PROSE: 'G5_AUDIT_CREATED_INTRO_PROSE',
    G5_SCENE_GRAPH_CREATED_HIDDEN_EVENT: 'G5_AUDIT_CREATED_HIDDEN_EVENT',
    G5_SCENE_GRAPH_CREATED_NEW_G4: 'G5_AUDIT_CREATED_PARENT_LOCATION',
    G5_SCENE_GRAPH_SOURCE_TRACE_EMPTY: 'G5_AUDIT_SOURCE_TRACE_MISSING',
    G5_SCENE_GRAPH_SELF_CHECK_EVIDENCE_EMPTY: 'G5_AUDIT_SELF_CHECK_EVIDENCE_MISSING'
  };
  return map[code] ?? (STAGE14_CONCERN_CODE_ENUM.has(code) ? code : 'G5_AUDIT_REQUIRED_BLOCK_MISSING');
}

function hasConcern(concerns, codes) {
  return concerns.some((item) => codes.includes(item.code));
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwnRecursive(value, key) {
  if (!value || typeof value !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(value, key) && value[key] != null) return true;
  if (Array.isArray(value)) return value.some((item) => hasOwnRecursive(item, key));
  return Object.values(value).some((item) => hasOwnRecursive(item, key));
}

function dedupeConcerns(concerns) {
  const seen = new Set();
  const result = [];
  for (const item of concerns) {
    const key = `${item.code}:${item.field ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}
