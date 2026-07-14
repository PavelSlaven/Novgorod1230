import { CODE_ROUTE_COMPATIBILITY, STAGE21_ALLOWED_CONCERN_CODES, STAGE21_ALLOWED_REPAIR_KINDS, STAGE21_ALLOWED_RETURN_STAGES, STAGE21_ALLOWED_SEVERITIES, STAGE21_OUTPUT_SCHEMA, STAGE21_PRECHECK_SCHEMA, STAGE21_REQUIRED_CHECKS, STAGE21_ROUTE_SCHEMA } from '../policy/constants.js';
import { array, dedupe, hasOwnRecursive, isObject, issue, meaningful, text, walk } from '../../../visible-context/shared.js';

export function validateVisibleContextAuditOutput(output, input, precheck) {
  const concerns = [];
  if (!isObject(output)) return [issue('VISIBLE_CONTEXT_AUDIT_INVALID_JSON', 'Audit output must be a JSON object.', 'root')];
  if (output.version !== 1 || output.schema !== STAGE21_OUTPUT_SCHEMA) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_SCHEMA_MISMATCH', `Expected ${STAGE21_OUTPUT_SCHEMA} version 1.`, 'schema'));
  if (output.request_id !== input?.request_id) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_REQUEST_ID_MISMATCH', 'Audit request_id must match input.', 'request_id', input?.request_id, output.request_id));
  if (output.visible_context_package_digest !== input?.visible_context_package_digest) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_PACKAGE_DIGEST_MISMATCH', 'Audit package digest must match audited package.', 'visible_context_package_digest', input?.visible_context_package_digest, output.visible_context_package_digest));
  if (typeof output.pass !== 'boolean') concerns.push(issue('VISIBLE_CONTEXT_AUDIT_PASS_MISSING', 'pass must be boolean.', 'pass'));
  if (!isObject(output.checks)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_REQUIRED_BLOCK_MISSING', 'checks must be an object.', 'checks'));
  for (const key of STAGE21_REQUIRED_CHECKS) {
    if (!isObject(output?.checks?.[key])) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_REQUIRED_BLOCK_MISSING', `checks.${key} is required.`, `checks.${key}`));
    else if (typeof output.checks[key].pass !== 'boolean') concerns.push(issue('VISIBLE_CONTEXT_AUDIT_CHECK_INVALID', `checks.${key}.pass must be boolean.`, `checks.${key}.pass`));
  }
  if (!Array.isArray(output.concerns)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_ARRAY_INVALID', 'concerns must be an array.', 'concerns'));
  if (!Array.isArray(output.evidence)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_ARRAY_INVALID', 'evidence must be an array.', 'evidence'));
  for (const [index, item] of array(output.concerns).entries()) validateAuditConcern(item, index, concerns);
  for (const [index, item] of array(output.evidence).entries()) if (!meaningful(item)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_EVIDENCE_INVALID', 'Evidence entries must be non-empty.', `evidence[${index}]`));
  if (precheck?.schema !== STAGE21_PRECHECK_SCHEMA || precheck?.pass !== true) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_PRECHECK_FAILED', 'Audit cannot be accepted when Stage 21 precheck failed.', 'pass'));
  if (hasOwnRecursive(output, 'visible_context_package')) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_MUTATED_PACKAGE', 'Audit output must not contain or rewrite visible_context_package.', 'root'));
  if (hasNarratorProse(output)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_NARRATOR_PROSE_PRESENT', 'Audit output must not contain narrator prose.', 'root'));
  if (hasOwnRecursive(output, 'full_hidden_scene_state')) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_HIDDEN_STATE_PRESENT', 'Audit output must not contain full hidden state.', 'root'));

  const permissions = output.commit_permission;
  if (!isObject(permissions)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_REQUIRED_BLOCK_MISSING', 'commit_permission is required.', 'commit_permission'));
  if (output.pass === true) {
    for (const key of STAGE21_REQUIRED_CHECKS) if (output?.checks?.[key]?.pass !== true) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_CHECK_FAILED_ON_PASS', `checks.${key}.pass must be true when audit passes.`, `checks.${key}.pass`));
    if (array(output.concerns).length !== 0) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_SUCCESS_CONCERNS_PRESENT', 'Successful audit must have no concerns.', 'concerns'));
    if (array(output.evidence).length === 0) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_EVIDENCE_MISSING', 'Successful audit requires non-empty evidence.', 'evidence'));
    if (output.repair_route !== null) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_SUCCESS_ROUTE_PRESENT', 'Successful audit must have repair_route=null.', 'repair_route'));
    for (const key of ['can_send_to_narrator', 'can_write_visible_context_snapshot', 'can_generate_player_facing_prose']) if (permissions?.[key] !== true) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_PERMISSION_INVALID', `${key} must be true when audit passes.`, `commit_permission.${key}`));
  }
  if (output.pass === false) {
    if (!STAGE21_REQUIRED_CHECKS.some((key) => output?.checks?.[key]?.pass === false)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_NO_FAILED_CHECK', 'Failed audit requires at least one failed check.', 'checks'));
    if (array(output.concerns).length === 0) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_CONCERNS_MISSING', 'Failed audit requires concerns.', 'concerns'));
    if (array(output.evidence).length === 0) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_EVIDENCE_MISSING', 'Failed audit requires evidence.', 'evidence'));
    if (!isObject(output.repair_route)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_REPAIR_ROUTE_MISSING', 'Failed audit requires a proposed repair_route.', 'repair_route'));
    for (const key of ['can_send_to_narrator', 'can_write_visible_context_snapshot', 'can_generate_player_facing_prose']) if (permissions?.[key] !== false) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_PERMISSION_INVALID', `${key} must be false when audit fails.`, `commit_permission.${key}`));
    if (isObject(output.repair_route)) {
      if (!STAGE21_ALLOWED_RETURN_STAGES.includes(output.repair_route.return_to_stage)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_REPAIR_ROUTE_INVALID', 'Proposed repair_route.return_to_stage is invalid.', 'repair_route.return_to_stage'));
      if (!STAGE21_ALLOWED_REPAIR_KINDS.includes(output.repair_route.repair_kind)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_REPAIR_ROUTE_INVALID', 'Proposed repair_route.repair_kind is invalid.', 'repair_route.repair_kind'));
    }
  }
  return dedupe(concerns);
}

export function validateStage21RepairRoute(route, audit) {
  const concerns = [];
  if (!isObject(route) || route.version !== 1 || route.schema !== STAGE21_ROUTE_SCHEMA) return [issue('VISIBLE_CONTEXT_AUDIT_ROUTE_SCHEMA_MISMATCH', `Expected ${STAGE21_ROUTE_SCHEMA} version 1.`, 'route.schema')];
  if (route.request_id !== audit?.request_id) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_ROUTE_REQUEST_ID_MISMATCH', 'Route request_id must match audit.', 'route.request_id'));
  if (route.visible_context_package_digest !== audit?.visible_context_package_digest) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_ROUTE_DIGEST_MISMATCH', 'Route digest must match audit.', 'route.visible_context_package_digest'));
  if (!STAGE21_ALLOWED_RETURN_STAGES.includes(route.return_to_stage)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_ROUTE_TARGET_INVALID', 'return_to_stage is invalid.', 'route.return_to_stage'));
  if (!STAGE21_ALLOWED_REPAIR_KINDS.includes(route.repair_kind)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_ROUTE_KIND_INVALID', 'repair_kind is invalid.', 'route.repair_kind'));
  if (!Array.isArray(route.concern_codes) || route.concern_codes.length === 0) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_ROUTE_CONCERNS_MISSING', 'concern_codes must be non-empty.', 'route.concern_codes'));
  if (!Array.isArray(route.evidence_refs) || route.evidence_refs.length === 0) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_ROUTE_EVIDENCE_MISSING', 'evidence_refs must be non-empty.', 'route.evidence_refs'));
  if (!Array.isArray(route.allowed_mutable_paths) || !Array.isArray(route.forbidden_mutable_paths)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_ROUTE_SCOPE_INVALID', 'Mutable path arrays are required.', 'route'));
  if (route.requires_reaudit_from_stage !== 21) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_ROUTE_REAUDIT_INVALID', 'requires_reaudit_from_stage must be 21.', 'route.requires_reaudit_from_stage'));
  const auditCodes = new Set(array(audit?.concerns).map((item) => item?.code));
  for (const [index, code] of array(route.concern_codes).entries()) {
    if (!auditCodes.has(code)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_ROUTE_CONCERN_UNKNOWN', 'Route concern code is absent from audit.', `route.concern_codes[${index}]`));
    const allowedTargets = CODE_ROUTE_COMPATIBILITY[code];
    if (allowedTargets && !allowedTargets.includes(route.return_to_stage)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_ROUTE_TARGET_INCOMPATIBLE', `${code} is incompatible with ${route.return_to_stage}.`, 'route.return_to_stage'));
  }
  const auditEvidenceCount = array(audit?.evidence).length;
  for (const [index, ref] of array(route.evidence_refs).entries()) {
    const numeric = typeof ref === 'number' ? ref : ref?.evidence_index;
    if (!Number.isInteger(numeric) || numeric < 0 || numeric >= auditEvidenceCount) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_ROUTE_EVIDENCE_INVALID', 'evidence_ref must point to audit evidence.', `route.evidence_refs[${index}]`));
  }
  return dedupe(concerns);
}

export function validateAuditConcern(item, index, concerns) {
  if (!isObject(item)) { concerns.push(issue('VISIBLE_CONTEXT_AUDIT_CONCERN_INVALID', 'Concern must be an object.', `concerns[${index}]`)); return; }
  if (!STAGE21_ALLOWED_CONCERN_CODES.includes(item.code)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_CONCERN_CODE_INVALID', 'Concern code is outside the allowed enum.', `concerns[${index}].code`));
  if (!STAGE21_ALLOWED_SEVERITIES.includes(item.severity)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_CONCERN_SEVERITY_INVALID', 'Concern severity is outside the allowed enum.', `concerns[${index}].severity`));
  if (!text(item.message)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_CONCERN_MESSAGE_MISSING', 'Concern message is required.', `concerns[${index}].message`));
}

export function hasNarratorProse(value) {
  let found = false;
  walk(value, (key, child) => {
    if (['prose', 'narrator_prose', 'intro_prose', 'player_facing_prose'].includes(key) && meaningful(child)) found = true;
  });
  return found;
}
