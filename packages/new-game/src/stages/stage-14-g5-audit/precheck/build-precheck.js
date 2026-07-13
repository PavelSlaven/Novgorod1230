import { STAGE14_CODE_PRECHECK_SCHEMA, STAGE14_CONCERN_CODE_ENUM, STAGE14_OUTPUT_SCHEMA, STAGE14_REQUIRED_CHECKS } from '@rus/contracts';
import { validateStage13G5SceneGraphDraft } from '../../../g5-scene/draft-validation.js';
import { validateStage14G5AuditInput } from '../input/input-boundary.js';
import { dedupeConcerns, normalizeArray } from '../shared/utils.js';

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

export function buildFailedChecks(precheck = {}) {
  return Object.fromEntries(STAGE14_REQUIRED_CHECKS.map((key) => [key, {
    pass: precheck.pass === true,
    evidence: normalizeArray(precheck.evidence)
  }]));
}

export function buildCommitPermission(pass) {
  return {
    can_commit_g5_scene_graph: pass === true,
    can_continue_to_npc_placement: pass === true,
    can_continue_to_item_placement: pass === true,
    can_continue_to_visible_context: false
  };
}

export function mapDraftConcernCode(code) {
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

export function hasConcern(concerns, codes) {
  return concerns.some((item) => codes.includes(item.code));
}
