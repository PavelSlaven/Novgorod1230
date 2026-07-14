import { STAGE19_AUDIT_SCHEMA, STAGE19_OUTPUT_SCHEMA, STAGE19_PRECHECK_SCHEMA } from '../policy/constants.js';
import { buildStage19ReferenceIndex } from '../references/reference-index.js';
import { array, dedupe, isObject, issue } from '../shared/utils.js';
export function buildFullHiddenStateAuditInput(input, output, precheck, refs = buildStage19ReferenceIndex(input)) {
  return {
    version: 1,
    schema: 'full_hidden_state_audit_input',
    request_id: input?.request_id ?? null,
    hidden_state_builder_input: structuredClone(input),
    full_hidden_scene_state: structuredClone(output),
    full_hidden_state_code_precheck: structuredClone(precheck),
    reference_index_summary: {
      npc_ids: [...refs.npcIds],
      item_ids: [...refs.itemIds],
      container_ids: [...refs.containerIds],
      anchor_ids: [...refs.anchorIds],
      g5_edge_ids: [...refs.g5EdgeIds],
      graph_edge_ids: [...refs.graphEdgeIds],
      route_ids_allowed_before_commit: []
    },
    audit_policy: {
      do_not_repair: true,
      require_evidence: true,
      reject_new_entities: true,
      reject_player_facing_output: true,
      reject_hidden_leaks: true
    }
  };
}

export function validateFullHiddenStateAudit(audit, output, precheck) {
  const concerns = [];
  if (!isObject(audit)) return [issue('HIDDEN_STATE_AUDIT_INVALID_JSON', 'FullHiddenStateAuditor must return a JSON object.', 'audit')];
  if (audit.version !== 1 || audit.schema !== STAGE19_AUDIT_SCHEMA) {
    concerns.push(issue('HIDDEN_STATE_AUDIT_SCHEMA_MISMATCH', `Expected ${STAGE19_AUDIT_SCHEMA} version 1.`, 'audit.schema'));
  }
  if (typeof audit.pass !== 'boolean') concerns.push(issue('HIDDEN_STATE_AUDIT_SCHEMA_MISMATCH', 'audit.pass must be boolean.', 'audit.pass'));
  if (!Array.isArray(audit.concerns)) concerns.push(issue('HIDDEN_STATE_AUDIT_REQUIRED_BLOCK_MISSING', 'audit.concerns must be an array.', 'audit.concerns'));
  if (!Array.isArray(audit.evidence)) concerns.push(issue('HIDDEN_STATE_AUDIT_REQUIRED_BLOCK_MISSING', 'audit.evidence must be an array.', 'audit.evidence'));
  if (audit.pass === true) {
    if (array(audit.concerns).length > 0) concerns.push(issue('HIDDEN_STATE_AUDIT_SCHEMA_MISMATCH', 'Passing audit must have empty concerns.', 'audit.concerns'));
    if (array(audit.evidence).length === 0) concerns.push(issue('HIDDEN_STATE_EMPTY_AUDIT_EVIDENCE', 'Passing audit requires evidence.', 'audit.evidence'));
    if (precheck?.pass !== true) concerns.push(issue('HIDDEN_STATE_AUDIT_PRECHECK_MISMATCH', 'Audit cannot pass when code precheck failed.', 'audit.pass'));
    if (output?.audit_self_check?.pass !== true) concerns.push(issue('HIDDEN_STATE_AUDIT_PRECHECK_MISMATCH', 'Audit cannot pass when output self-check failed.', 'audit.pass'));
  } else {
    if (array(audit.concerns).length === 0) concerns.push(issue('HIDDEN_STATE_AUDIT_SCHEMA_MISMATCH', 'Failed audit requires concerns.', 'audit.concerns'));
    if (array(audit.evidence).length === 0) concerns.push(issue('HIDDEN_STATE_AUDIT_SCHEMA_MISMATCH', 'Failed audit requires evidence.', 'audit.evidence'));
  }
  if (hasForbiddenRepairFields(audit)) {
    concerns.push(issue('HIDDEN_STATE_AUDITOR_MUTATED_OUTPUT', 'Auditor output must not contain repaired hidden state.', 'audit'));
  }
  return dedupe(concerns);
}

export function classifyStage19Failure({ parseError = null, validationIssues = [], audit = null } = {}) {
  if (parseError) return 'format';
  const issues = array(validationIssues);
  if (issues.length > 0 && issues.every((item) => FORMAT_STATE_CODES.has(item.code) || FORMAT_AUDIT_CODES.has(item.code))) return 'format';
  if (audit?.pass === false || issues.length > 0) return 'semantic';
  return 'unknown';
}

export function validateStage19CommitPermission(output, precheck, audit) {
  const reasons = [];
  if (output?.schema !== STAGE19_OUTPUT_SCHEMA || output?.version !== 1) reasons.push('invalid_hidden_state_schema');
  if (!['formed', 'empty_limited'].includes(output?.hidden_state_status)) reasons.push('hidden_state_not_commit_ready');
  if (precheck?.schema !== STAGE19_PRECHECK_SCHEMA || precheck?.pass !== true) reasons.push('code_precheck_failed');
  if (audit?.schema !== STAGE19_AUDIT_SCHEMA || audit?.pass !== true) reasons.push('semantic_audit_failed');
  return {
    can_continue_to_visible_context: reasons.length === 0,
    reasons
  };
}

export function hasForbiddenRepairFields(audit){return['full_hidden_scene_state','repaired_output','replacement_state','patch'].some((key)=>Object.prototype.hasOwnProperty.call(audit??{},key));}
