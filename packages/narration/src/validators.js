import {
  NARRATION_AUDIT_SCHEMA,
  NARRATION_FLOW_RESULT_SCHEMA,
  NARRATION_OUTPUT_SCHEMA,
  NARRATION_REPAIR_ROUTE_SCHEMA,
  NARRATION_REPAIR_ROUTES,
  NARRATION_REQUEST_SCHEMA,
  NARRATION_RESULT_STATUSES,
  NARRATION_SURFACES
} from './contracts.js';

export function validateNarrationRequest(value) {
  const errors = [];
  if (!plain(value)) return fail('narration request must be an object');
  if (value.version !== 1 || value.schema !== NARRATION_REQUEST_SCHEMA) errors.push(`expected ${NARRATION_REQUEST_SCHEMA} version 1`);
  requiredText(errors, value.request_id, 'request_id');
  enumValue(errors, value.surface, NARRATION_SURFACES, 'surface');
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
  if (value.version !== 1 || value.schema !== NARRATION_OUTPUT_SCHEMA) errors.push(`expected ${NARRATION_OUTPUT_SCHEMA} version 1`);
  requiredText(errors, value.output_id, 'output_id');
  requiredText(errors, value.prose, 'prose');
  if (!Array.isArray(value.action_options)) errors.push('action_options must be an array');
  if (!Array.isArray(value.used_references)) errors.push('used_references must be an array');
  if (!plain(value.self_check)) errors.push('self_check must be an object');
  return result(errors);
}

export function validateNarrationAudit(value) {
  const errors = [];
  if (!plain(value)) return fail('narration audit must be an object');
  if (value.version !== 1 || value.schema !== NARRATION_AUDIT_SCHEMA) errors.push(`expected ${NARRATION_AUDIT_SCHEMA} version 1`);
  if (typeof value.pass !== 'boolean') errors.push('pass must be boolean');
  if (!Array.isArray(value.concerns)) errors.push('concerns must be an array');
  if (!Array.isArray(value.evidence)) errors.push('evidence must be an array');
  if (value.pass === true && Array.isArray(value.concerns) && value.concerns.length) errors.push('successful audit must have no concerns');
  if (value.pass === true && Array.isArray(value.evidence) && value.evidence.length === 0) errors.push('successful audit requires evidence');
  if (value.pass === false && Array.isArray(value.concerns) && value.concerns.length === 0) errors.push('failed audit requires concerns');
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
  if (value.pass !== (value.status === 'approved')) errors.push('pass must match approved status');
  if (value.status === 'approved') {
    errors.push(...validateNarrationOutput(value.approved_output).errors.map((item) => `approved_output: ${item}`));
    errors.push(...validateNarrationAudit(value.final_audit).errors.map((item) => `final_audit: ${item}`));
  }
  if (!Array.isArray(value.generation_history)) errors.push('generation_history must be an array');
  if (!Array.isArray(value.audit_history)) errors.push('audit_history must be an array');
  if (!Array.isArray(value.repair_history)) errors.push('repair_history must be an array');
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
function requiredText(errors, value, label) { if (!String(value ?? '').trim()) errors.push(`${label} is required`); }
function enumValue(errors, value, allowed, label) { if (!allowed.includes(String(value ?? '').trim())) errors.push(`${label} is invalid`); }
function result(errors) { return { ok: errors.length === 0, errors }; }
function fail(message) { return { ok: false, errors: [message] }; }
