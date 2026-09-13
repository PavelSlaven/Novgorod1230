import {
  NARRATION_AUDIT_SCHEMA,
  NARRATION_FLOW_RESULT_SCHEMA,
  NARRATION_OUTPUT_SCHEMA,
  NARRATION_REPAIR_ROUTE_SCHEMA,
  NARRATION_REPAIR_ROUTES,
  NARRATION_REQUEST_SCHEMA,
  NARRATION_RESULT_STATUSES,
  NARRATION_SEMANTIC_REPAIR_SCHEMA,
  NARRATION_SURFACES
} from './contracts.js';
import { segmentProse } from './segments.js';

export function validateNarrationRequest(value) {
  const errors = [];
  if (!plain(value)) return fail('narration request must be an object');
  if (value.version !== 1 || value.schema !== NARRATION_REQUEST_SCHEMA) errors.push(`expected ${NARRATION_REQUEST_SCHEMA} version 1`);
  requiredText(errors, value.request_id, 'request_id');
  if (value.surface !== 'turn') errors.push('narration request surface must be turn; opening requires Stage 22/23 adapter');
  if (!plain(value.visible_context)) errors.push('visible_context must be an object');
  if (value.context != null && !plain(value.context)) errors.push('context must be an object');
  if (value.style_policy != null && !plain(value.style_policy)) errors.push('style_policy must be an object');
  const repairs = Number(value.max_repairs ?? 1);
  if (!Number.isInteger(repairs) || repairs < 0 || repairs > 2) errors.push('max_repairs must be integer 0..2');
  return result(errors);
}

export function validateNarrationOutput(value) {
  const errors = [];
  if (!plain(value)) return fail('narration output must be an object');
  for (const key of Object.keys(value)) {
    if (!['version', 'schema', 'output_id', 'prose', 'action_options', 'used_references', 'self_check'].includes(key)) errors.push(`forbidden field: ${key}`);
  }
  if (value.version !== 1 || value.schema !== NARRATION_OUTPUT_SCHEMA) errors.push(`expected ${NARRATION_OUTPUT_SCHEMA} version 1`);
  requiredText(errors, value.output_id, 'output_id');
  requiredText(errors, value.prose, 'prose');
  if (!Array.isArray(value.action_options)) errors.push('action_options must be an array');
  if (!Array.isArray(value.used_references)) errors.push('used_references must be an array');
  if (!plain(value.self_check)) errors.push('self_check must be an object');
  return result(errors);
}

export function validateNarrationAudit(value, segmentIds = null, sourceCounts = null) {
  const errors = [];
  if (!plain(value)) return fail('narration audit must be an object');
  forbiddenFields(errors, value, ['version', 'schema', 'pass', 'concerns', 'evidence', 'coverage', 'artistic_verdict', 'technical_verdict']);
  if (value.version !== 1 || value.schema !== NARRATION_AUDIT_SCHEMA) errors.push(`expected ${NARRATION_AUDIT_SCHEMA} version 1`);
  if (typeof value.pass !== 'boolean') errors.push('pass must be boolean');
  const concerns = Array.isArray(value.concerns) ? value.concerns : [];
  for (const [field, kind] of [['artistic_verdict', 'literary_quality'], ['technical_verdict', 'technical_presentation']]) {
    enumValue(errors, value[field], ['pass', 'fail'], field);
    if (value.pass === true && value[field] !== 'pass') errors.push(`successful audit requires ${field} pass`);
    if (value[field] === 'fail' && !concerns.some((concern) => concern?.kind === kind)) errors.push(`${field} fail requires ${kind} concern`);
    if (value[field] === 'pass' && concerns.some((concern) => concern?.kind === kind)) errors.push(`${field} pass contradicts ${kind} concern`);
  }
  validateCoverage(errors, value.coverage, segmentIds, sourceCounts, value.pass);
  if (!Array.isArray(value.concerns)) errors.push('concerns must be an array');
  if (!Array.isArray(value.evidence)) errors.push('evidence must be an array');
  if (Array.isArray(value.evidence) && value.evidence.some((item) => !evidenceText(item))) errors.push('evidence entries must be substantive text');
  if (Array.isArray(value.concerns)) {
    value.concerns.forEach((concern, index) => validateConcern(errors, concern, index, segmentIds));
  }
  if (value.pass === true && Array.isArray(value.concerns) && value.concerns.length) errors.push('successful audit must have no concerns');
  if (value.pass === true && Array.isArray(value.evidence) && value.evidence.length === 0) errors.push('successful audit requires evidence');
  if (value.pass === false && Array.isArray(value.concerns) && value.concerns.length === 0) errors.push('failed audit requires concerns');
  return result(errors);
}

function validateCoverage(errors, coverage, segmentIds, sourceCounts, pass) {
  if (!plain(coverage)) return errors.push('coverage must be an object');
  forbiddenFields(errors, coverage, ['visible_changes', 'uncertainties'], 'coverage');
  for (const field of ['visible_changes', 'uncertainties']) {
    const entries = coverage[field];
    if (!Array.isArray(entries)) { errors.push(`coverage.${field} must be an array`); continue; }
    const seen = new Set();
    for (const entry of entries) {
      if (!plain(entry)) { errors.push(`coverage.${field} entry must be an object`); continue; }
      forbiddenFields(errors, entry, ['source_index', 'segment_ids'], `coverage.${field}`);
      const index = entry.source_index;
      if (!Number.isInteger(index) || index < 0 || (sourceCounts && index >= sourceCounts[field])) errors.push(`coverage.${field} source_index out of range`);
      if (seen.has(index)) errors.push(`coverage.${field} duplicate source_index`);
      seen.add(index);
      if (!Array.isArray(entry.segment_ids)) { errors.push(`coverage.${field} segment_ids must be an array`); continue; }
      if (pass && entry.segment_ids.length === 0) errors.push(`coverage.${field} source ${index} is uncovered`);
      if (new Set(entry.segment_ids).size !== entry.segment_ids.length) errors.push(`coverage.${field} duplicate segment_id`);
      for (const id of entry.segment_ids) if (typeof id !== 'string' || !id.trim() || (segmentIds && !segmentIds.includes(id))) errors.push(`coverage.${field} unknown segment_id`);
    }
    if (pass && sourceCounts) for (let index = 0; index < sourceCounts[field]; index += 1) {
      if (!seen.has(index)) errors.push(`coverage.${field} missing source_index ${index}`);
    }
  }
}

export function validateNarrationSemanticRepair(value, flaggedIds = []) {
  const errors = [];
  if (!plain(value)) return fail('narration semantic repair must be an object');
  forbiddenFields(errors, value, ['version', 'schema', 'replacements']);
  if (value.version !== 1 || value.schema !== NARRATION_SEMANTIC_REPAIR_SCHEMA) errors.push(`expected ${NARRATION_SEMANTIC_REPAIR_SCHEMA} version 1`);
  if (!Array.isArray(value.replacements)) errors.push('replacements must be an array');
  const seen = new Set();
  if (Array.isArray(value.replacements)) {
    value.replacements.forEach((replacement, index) => {
      if (!plain(replacement)) return errors.push(`replacement ${index} must be an object`);
      forbiddenFields(errors, replacement, ['segment_id', 'prose'], `replacement ${index}`);
      const id = replacement.segment_id;
      if (typeof id !== 'string' || !id.trim()) errors.push(`replacement ${index} segment_id is required`);
      else if (!flaggedIds.includes(id)) errors.push(`replacement ${index} targets unflagged segment_id: ${id}`);
      else if (seen.has(id)) errors.push(`duplicate replacement segment_id: ${id}`);
      seen.add(id);
      if (typeof replacement.prose !== 'string') {
        errors.push(`replacement ${index} prose must be a string`);
      }
    });
  }
  for (const id of flaggedIds) if (!seen.has(id)) errors.push(`missing replacement segment_id: ${id}`);
  return result(errors);
}

export function validateNarrationRepairRoute(value) {
  const errors = [];
  if (!plain(value)) return fail('narration repair route must be an object');
  if (value.version !== 1 || value.schema !== NARRATION_REPAIR_ROUTE_SCHEMA) errors.push(`expected ${NARRATION_REPAIR_ROUTE_SCHEMA} version 1`);
  enumValue(errors, value.route, NARRATION_REPAIR_ROUTES, 'route');
  requiredText(errors, value.reason, 'reason');
  return result(errors);
}

export function validateNarrationFlowResult(value) {
  const errors = [];
  if (!plain(value)) return fail('narration flow result must be an object');
  if (value.version !== 1 || value.schema !== NARRATION_FLOW_RESULT_SCHEMA) errors.push(`expected ${NARRATION_FLOW_RESULT_SCHEMA} version 1`);
  requiredText(errors, value.request_id, 'request_id');
  enumValue(errors, value.status, NARRATION_RESULT_STATUSES, 'status');
  enumValue(errors, value.surface, NARRATION_SURFACES, 'surface');
  if (value.pass !== (value.status === 'approved')) errors.push('pass must match approved status');
  if (value.status === 'approved') {
    if (value.final_audit?.pass !== true) errors.push('approved result requires passing final_audit');
    errors.push(...validateNarrationOutput(value.approved_output).errors.map((item) => `approved_output: ${item}`));
    const auditValidation = value.surface === 'first_game'
      ? validateOpeningNarrationAudit(value.final_audit, value.request_id)
      : validateNarrationAudit(value.final_audit,
        typeof value.approved_output?.prose === 'string'
          ? segmentProse(value.approved_output.prose).map(({ segment_id }) => segment_id) : []);
    errors.push(...auditValidation.errors.map((item) => `final_audit: ${item}`));
  }
  if (!Array.isArray(value.generation_history)) errors.push('generation_history must be an array');
  if (!Array.isArray(value.audit_history)) errors.push('audit_history must be an array');
  if (!Array.isArray(value.repair_history)) errors.push('repair_history must be an array');
  return result(errors);
}

export function validateOpeningNarrationAudit(audit, requestId) {
  const errors = [];
  if (!plain(audit)) return fail('opening audit must be an object');
  if (audit.version !== 1 || audit.schema !== 'narrator_prose_audit') errors.push('expected narrator_prose_audit version 1');
  requiredText(errors, audit.request_id, 'opening audit request_id');
  if (audit.request_id !== requestId) errors.push('opening audit request_id mismatch');
  if (audit.pass !== true) errors.push('opening audit must pass');
  if (!Array.isArray(audit.concerns) || audit.concerns.length) errors.push('opening audit requires empty concerns');
  if (!Array.isArray(audit.evidence) || !audit.evidence.length || audit.evidence.some((entry) => !evidenceText(entry))) errors.push('opening audit requires evidence');
  if (audit.repair_route !== null) errors.push('opening audit repair_route must be null');
  for (const key of ['schema_and_structure', 'visible_context_compliance', 'new_fact_check',
    'npc_check', 'item_check', 'container_check', 'door_exit_route_check', 'time_light_weather_check',
    'position_check', 'g5_anchor_check', 'knowledge_boundary_check', 'hidden_state_leak_check',
    'rumor_uncertainty_check', 'action_options_check', 'technical_text_check', 'must_include_check',
    'must_not_include_check', 'commit_readiness']) {
    if (audit.checks?.[key]?.pass !== true) errors.push(`opening audit checks.${key} must pass`);
  }
  for (const key of ['can_show_to_player', 'can_write_player_visible_message', 'can_mark_opening_scene_presented']) {
    if (audit.commit_permission?.[key] !== true) errors.push(`opening audit permission ${key} must be true`);
  }
  return result(errors);
}

export function assertNarrationValid(label, validation) {
  if (validation.ok) return;
  const error = new Error(`${label} invalid: ${validation.errors.join('; ')}`);
  error.code = 'NARRATION_CONTRACT_INVALID';
  error.details = { label, errors: validation.errors };
  throw error;
}

function plain(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function requiredText(errors, value, label) { if (typeof value !== 'string' || !value.trim()) errors.push(`${label} is required`); }
function enumValue(errors, value, allowed, label) { if (typeof value !== 'string' || !allowed.includes(value)) errors.push(`${label} is invalid`); }
function evidenceText(value) { return typeof value === 'string' && Boolean(value.trim()) && !/^<[^<>]*>$/u.test(value.trim()); }
function forbiddenFields(errors, value, allowed, label = 'narration audit') {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push(`${label} forbidden field: ${key}`);
}
function validateConcern(errors, concern, index, segmentIds) {
  if (!plain(concern)) return errors.push(`concern ${index} must be an object`);
  forbiddenFields(errors, concern, ['segment_id', 'kind', 'reason'], `concern ${index}`);
  const id = concern.segment_id;
  if (typeof id !== 'string' || !id.trim()) errors.push(`concern ${index} segment_id is required`);
  else if (segmentIds && !segmentIds.includes(id)) errors.push(`concern ${index} has unknown segment_id: ${id}`);
  requiredText(errors, concern.kind, `concern ${index} kind`);
  requiredText(errors, concern.reason, `concern ${index} reason`);
}
function result(errors) { return { ok: errors.length === 0, errors }; }
function fail(message) { return { ok: false, errors: [message] }; }
