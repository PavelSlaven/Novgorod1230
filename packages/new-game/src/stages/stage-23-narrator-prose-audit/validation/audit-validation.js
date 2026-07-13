import { createHash } from 'node:crypto';
import { buildNarratorProseAuditApproval, computeVisibleContextPackageDigest } from '@rus/contracts';
import { AUDIT_TOP_LEVEL_KEYS, COMMIT_PERMISSION_KEYS, FORBIDDEN_AUDIT_KEYS, STAGE23_AUDIT_SCHEMA, STAGE23_CONCERN_CODES, STAGE23_PRECHECK_SCHEMA, STAGE23_REQUIRED_CHECKS, STAGE23_RESULT_SCHEMA, STAGE23_ROUTES, STAGE23_ROUTE_SCHEMA, STAGE23_SEVERITIES, STAGE23_UPSTREAM_REPAIR_SCHEMA } from '../policy/constants.js';
import { computeNarratorStartingProseDigest } from '../input/input-boundary.js';
import { array, canonicalJson, dedupe, findForbiddenKeys, isObject, issue, safeClone, text } from '../shared/utils.js';

export function validateNarratorProseAudit(output, input, { allowRouteMissing = false } = {}) {
  const concerns = [];
  if (!isObject(output)) return [issue('STAGE23_AUDIT_INVALID', 'Narrator prose audit must be an object.', 'root')];
  for (const key of Object.keys(output)) if (!AUDIT_TOP_LEVEL_KEYS.has(key)) concerns.push(issue('STAGE23_AUDIT_EXTRA_FIELD', 'Audit contains an unsupported top-level field.', key));
  for (const path of findForbiddenKeys(output, FORBIDDEN_AUDIT_KEYS)) concerns.push(issue('STAGE23_AUDIT_FORBIDDEN_FIELD', 'Audit must not embed prose, visible package, or hidden state.', path));
  if (output.version !== 1 || output.schema !== STAGE23_AUDIT_SCHEMA) concerns.push(issue('STAGE23_AUDIT_SCHEMA_MISMATCH', `Expected ${STAGE23_AUDIT_SCHEMA} version 1.`, 'schema'));
  if (output.request_id !== input?.request_id) concerns.push(issue('STAGE23_AUDIT_REQUEST_ID_MISMATCH', 'Audit request_id must match input.', 'request_id'));
  if (typeof output.pass !== 'boolean') concerns.push(issue('STAGE23_AUDIT_PASS_INVALID', 'Audit pass must be boolean.', 'pass'));

  if (!isObject(output.checks)) concerns.push(issue('STAGE23_AUDIT_CHECKS_MISSING', 'Audit checks object is required.', 'checks'));
  for (const key of STAGE23_REQUIRED_CHECKS) {
    const check = output.checks?.[key];
    if (!isObject(check) || typeof check.pass !== 'boolean') concerns.push(issue('STAGE23_AUDIT_CHECK_INVALID', `checks.${key} must be an object with boolean pass.`, `checks.${key}`));
  }

  if (!Array.isArray(output.concerns)) concerns.push(issue('STAGE23_AUDIT_CONCERNS_INVALID', 'Audit concerns must be an array.', 'concerns'));
  else output.concerns.forEach((item, index) => {
    if (!isObject(item)) { concerns.push(issue('STAGE23_AUDIT_CONCERN_INVALID', 'Concern must be an object.', `concerns[${index}]`)); return; }
    if (!STAGE23_CONCERN_CODES.includes(item.code)) concerns.push(issue('STAGE23_AUDIT_CONCERN_CODE_INVALID', 'Concern code is outside the allowed enum.', `concerns[${index}].code`));
    if (!STAGE23_SEVERITIES.includes(item.severity)) concerns.push(issue('STAGE23_AUDIT_SEVERITY_INVALID', 'Concern severity is outside the allowed enum.', `concerns[${index}].severity`));
    if (!text(item.message)) concerns.push(issue('STAGE23_AUDIT_CONCERN_MESSAGE_MISSING', 'Concern message is required.', `concerns[${index}].message`));
  });

  if (!Array.isArray(output.evidence) || output.evidence.length === 0) concerns.push(issue('STAGE23_AUDIT_EVIDENCE_MISSING', 'Audit evidence must be a non-empty array.', 'evidence'));
  else output.evidence.forEach((item, index) => { if (!text(item)) concerns.push(issue('STAGE23_AUDIT_EVIDENCE_INVALID', 'Every evidence entry must be a non-empty string.', `evidence[${index}]`)); });

  if (!isObject(output.commit_permission)) concerns.push(issue('STAGE23_AUDIT_PERMISSION_MISSING', 'commit_permission is required.', 'commit_permission'));
  if (allowRouteMissing && output.pass === false && output.repair_route != null) {
    concerns.push(issue('STAGE23_AUDITOR_ROUTE_FORBIDDEN', 'Semantic auditor must return findings without selecting repair_route; the Router owns routing.', 'repair_route'));
  }

  if (output.pass === true) {
    if (array(output.concerns).length > 0) concerns.push(issue('STAGE23_AUDIT_CONCERNS_ON_PASS', 'Successful audit must not contain concerns.', 'concerns'));
    if (output.repair_route != null) concerns.push(issue('STAGE23_AUDIT_ROUTE_ON_PASS', 'Successful audit must have repair_route=null.', 'repair_route'));
    for (const key of COMMIT_PERMISSION_KEYS) if (output.commit_permission?.[key] !== true) concerns.push(issue('STAGE23_AUDIT_PERMISSION_DENIED', `commit_permission.${key} must be true on pass.`, `commit_permission.${key}`));
    for (const key of STAGE23_REQUIRED_CHECKS) if (output.checks?.[key]?.pass !== true) concerns.push(issue('STAGE23_AUDIT_CHECK_FAILED_ON_PASS', `checks.${key}.pass must be true on successful audit.`, `checks.${key}.pass`));
  } else if (output.pass === false) {
    if (array(output.concerns).length === 0) concerns.push(issue('STAGE23_AUDIT_CONCERNS_MISSING', 'Failed audit requires concerns.', 'concerns'));
    if (!STAGE23_REQUIRED_CHECKS.some((key) => output.checks?.[key]?.pass === false)) concerns.push(issue('STAGE23_AUDIT_NO_FAILED_CHECK', 'Failed audit requires at least one failed check.', 'checks'));
    if (!allowRouteMissing && !isObject(output.repair_route)) concerns.push(issue('STAGE23_AUDIT_ROUTE_MISSING', 'Failed audit requires a router-validated repair route.', 'repair_route'));
    for (const key of COMMIT_PERMISSION_KEYS) if (output.commit_permission?.[key] !== false) concerns.push(issue('STAGE23_AUDIT_FAIL_PERMISSION_INVALID', `commit_permission.${key} must be false on failure.`, `commit_permission.${key}`));
  }

  if (isObject(output.repair_route)) concerns.push(...validateStage23RepairRoute(output.repair_route, output));
  if (input?.visible_context_package_digest !== computeVisibleContextPackageDigest(input?.visible_context_package)) concerns.push(issue('STAGE23_AUDIT_PACKAGE_DIGEST_MISMATCH', 'Input package digest changed during audit.', 'visible_context_package_digest'));
  if (input?.narrator_starting_prose_digest !== computeNarratorStartingProseDigest(input?.narrator_starting_prose)) concerns.push(issue('STAGE23_AUDIT_PROSE_DIGEST_MISMATCH', 'Input prose digest changed during audit.', 'narrator_starting_prose_digest'));
  return dedupe(concerns);
}

export function validateStage23RepairRoute(route, audit) {
  const concerns = [];
  if (!isObject(route)) return [issue('STAGE23_ROUTE_INVALID', 'Stage 23 repair route must be an object.', 'repair_route')];
  const allowedKeys = new Set(['version', 'schema', 'request_id', 'return_to_stage', 'repair_kind', 'reason', 'supporting_concern_codes']);
  for (const key of Object.keys(route)) if (!allowedKeys.has(key)) concerns.push(issue('STAGE23_ROUTE_EXTRA_FIELD', 'Repair route contains an unsupported field.', `repair_route.${key}`));
  if (route.version !== 1 || route.schema !== STAGE23_ROUTE_SCHEMA) concerns.push(issue('STAGE23_ROUTE_SCHEMA_MISMATCH', `Expected ${STAGE23_ROUTE_SCHEMA} version 1.`, 'repair_route.schema'));
  if (route.request_id !== audit?.request_id) concerns.push(issue('STAGE23_ROUTE_REQUEST_ID_MISMATCH', 'Repair route request_id must match audit.', 'repair_route.request_id'));
  if (!STAGE23_ROUTES.includes(route.return_to_stage)) concerns.push(issue('STAGE23_ROUTE_TARGET_INVALID', 'return_to_stage is outside the allowed enum.', 'repair_route.return_to_stage'));
  if (!text(route.repair_kind) || !/^[a-z0-9_]+$/u.test(route.repair_kind)) concerns.push(issue('STAGE23_ROUTE_KIND_INVALID', 'repair_kind must be a non-empty snake_case identifier.', 'repair_route.repair_kind'));
  if (!text(route.reason)) concerns.push(issue('STAGE23_ROUTE_REASON_MISSING', 'Repair route reason is required.', 'repair_route.reason'));
  const concernCodes = new Set(array(audit?.concerns).map((item) => item?.code).filter(text));
  if (!Array.isArray(route.supporting_concern_codes) || route.supporting_concern_codes.length === 0) concerns.push(issue('STAGE23_ROUTE_CONCERNS_MISSING', 'supporting_concern_codes must be non-empty.', 'repair_route.supporting_concern_codes'));
  else for (const code of route.supporting_concern_codes) if (!concernCodes.has(code)) concerns.push(issue('STAGE23_ROUTE_CONCERN_UNKNOWN', 'Route references a concern absent from audit.', 'repair_route.supporting_concern_codes'));
  if (!routeCompatible(route.return_to_stage, array(audit?.concerns))) concerns.push(issue('STAGE23_ROUTE_INCOMPATIBLE', 'Repair route is incompatible with audit concerns.', 'repair_route.return_to_stage'));
  return dedupe(concerns);
}

export function validateStage23CommitHandoff({ request_id, visible_context_package, stage22_result, stage23_result } = {}) {
  const concerns = [];
  const packageDigest = isObject(visible_context_package) ? computeVisibleContextPackageDigest(visible_context_package) : null;
  const prose = stage22_result?.narrator_starting_prose;
  const proseDigest = isObject(prose) ? computeNarratorStartingProseDigest(prose) : null;
  const audit = stage23_result?.narrator_prose_audit;
  if (stage23_result?.version !== 1 || stage23_result?.schema !== STAGE23_RESULT_SCHEMA) concerns.push(issue('STAGE23_HANDOFF_RESULT_INVALID', 'Stage 23 result bundle is invalid.', 'stage23_result'));
  if (stage23_result?.request_id !== request_id) concerns.push(issue('STAGE23_HANDOFF_REQUEST_ID_MISMATCH', 'Stage 23 request_id is stale.', 'stage23_result.request_id'));
  if (stage22_result?.request_id !== request_id || prose?.request_id !== request_id) concerns.push(issue('STAGE23_HANDOFF_STAGE22_REQUEST_ID_MISMATCH', 'Stage 22 result and prose request_id must match the current request.', 'stage22_result.request_id'));
  if (stage23_result?.pass !== true || audit?.pass !== true) concerns.push(issue('STAGE23_HANDOFF_NOT_APPROVED', 'Stage 23 audit must pass.', 'stage23_result.pass'));
  const precheck = stage23_result?.narrator_prose_code_precheck;
  if (precheck?.schema !== STAGE23_PRECHECK_SCHEMA || precheck?.pass !== true) concerns.push(issue('STAGE23_HANDOFF_PRECHECK_INVALID', 'Stage 23 code precheck must pass.', 'stage23_result.narrator_prose_code_precheck'));
  if (precheck?.request_id !== request_id
    || precheck?.visible_context_package_digest !== packageDigest
    || precheck?.narrator_starting_prose_digest !== proseDigest) concerns.push(issue('STAGE23_HANDOFF_PRECHECK_STALE', 'Stage 23 precheck digests or request_id are stale.', 'stage23_result.narrator_prose_code_precheck'));
  if (audit?.schema !== STAGE23_AUDIT_SCHEMA || audit?.request_id !== request_id || !Array.isArray(audit?.evidence) || audit.evidence.length === 0) concerns.push(issue('STAGE23_HANDOFF_AUDIT_INVALID', 'Stage 23 audit, request_id and evidence are required.', 'stage23_result.narrator_prose_audit'));
  for (const key of COMMIT_PERMISSION_KEYS) if (audit?.commit_permission?.[key] !== true) concerns.push(issue('STAGE23_HANDOFF_AUDIT_PERMISSION_DENIED', `Stage 23 audit permission ${key} must be true.`, `stage23_result.narrator_prose_audit.commit_permission.${key}`));
  if (stage23_result?.repair_route !== null || audit?.repair_route !== null) concerns.push(issue('STAGE23_HANDOFF_ROUTE_PRESENT', 'Approved Stage 23 result must not contain a repair route.', 'stage23_result.repair_route'));
  for (const key of COMMIT_PERMISSION_KEYS) if (stage23_result?.commit_permission?.[key] !== true) concerns.push(issue('STAGE23_HANDOFF_PERMISSION_DENIED', `Stage 23 permission ${key} must be true.`, `stage23_result.commit_permission.${key}`));
  if (stage22_result?.pass !== true || stage22_result?.handoff_permission?.can_send_to_prose_audit !== true) concerns.push(issue('STAGE23_HANDOFF_STAGE22_INVALID', 'Current Stage 22 result is not approved for audit.', 'stage22_result'));
  if (stage23_result?.visible_context_package_digest !== packageDigest || stage22_result?.visible_context_package_digest !== packageDigest) concerns.push(issue('STAGE23_HANDOFF_PACKAGE_STALE', 'Stage 23 package digest does not match current Stage 20/22 package.', 'stage23_result.visible_context_package_digest'));
  if (stage23_result?.narrator_starting_prose_digest !== proseDigest) concerns.push(issue('STAGE23_HANDOFF_PROSE_STALE', 'Stage 23 prose digest does not match current Stage 22 prose.', 'stage23_result.narrator_starting_prose_digest'));
  return dedupe(concerns);
}

export function buildStage23RepairSignature(result) {
  const audit = result?.narrator_prose_audit ?? result;
  const route = result?.repair_route ?? audit?.repair_route ?? {};
  return `sha256:${createHash('sha256').update(canonicalJson({
    route: route.return_to_stage ?? null,
    repair_kind: route.repair_kind ?? null,
    concern_codes: array(audit?.concerns).map((item) => item?.code).filter(text).sort(),
    evidence: array(audit?.evidence).map(String),
    narrator_starting_prose_digest: result?.narrator_starting_prose_digest ?? null,
    visible_context_package_digest: result?.visible_context_package_digest ?? null
  })).digest('hex')}`;
}

export function buildStage23UpstreamRepairRequest(result, targetStage) {
  const audit = result?.narrator_prose_audit ?? result;
  const route = result?.repair_route ?? audit?.repair_route;
  return Object.freeze({
    version: 1,
    schema: STAGE23_UPSTREAM_REPAIR_SCHEMA,
    request_id: result?.request_id ?? audit?.request_id ?? null,
    source_stage: 23,
    target_stage: targetStage,
    repair_route: safeClone(route),
    concerns: safeClone(audit?.concerns ?? []),
    evidence: safeClone(audit?.evidence ?? []),
    visible_context_package_digest: result?.visible_context_package_digest ?? null,
    narrator_starting_prose_digest: result?.narrator_starting_prose_digest ?? null
  });
}

function routeCompatible(route, concerns) {
  if (route === 'blocked') return concerns.some((item) => ['hard_block', 'upstream_block'].includes(item?.severity));
  const codes = concerns.map((item) => item?.code).filter(text);
  if (route === 'narrator_prose_format_repair') return codes.some((code) => code.includes('INVALID_SCHEMA') || code.includes('FORMAT'));
  if (route === 'narrator_prose_semantic_repair') return codes.length > 0;
  if (route === 'time_light_semantic_repair') return codes.some((code) => /TIME|WEATHER|LIGHT/u.test(code));
  if (route === 'character_knowledge_map_semantic_repair') return codes.some((code) => /KNOWLEDGE/u.test(code));
  if (route === 'full_hidden_state_semantic_repair') return codes.some((code) => /HIDDEN|PRIVATE_MOTIVE|CLOSED_CONTAINER|FUTURE_EVENT|OWNERSHIP/u.test(code));
  if (route === 'visible_context_semantic_repair' || route === 'visible_context_audit') return codes.some((code) => /VISIBLE_CONTEXT|ADDED_|MUST_INCLUDE|MUST_NOT_INCLUDE|G5_REF/u.test(code));
  return false;
}

export function hasFormatOnlyFailures(concerns) {
  if (!array(concerns).length) return false;
  const formatCodes = new Set([
    'STAGE23_AUDIT_INVALID_JSON', 'STAGE23_AUDIT_INVALID', 'STAGE23_AUDIT_SCHEMA_MISMATCH',
    'STAGE23_AUDIT_CHECKS_MISSING', 'STAGE23_AUDIT_CHECK_INVALID', 'STAGE23_AUDIT_CONCERNS_INVALID',
    'STAGE23_AUDIT_EVIDENCE_MISSING', 'STAGE23_AUDIT_EVIDENCE_INVALID', 'STAGE23_AUDIT_PERMISSION_MISSING'
  ]);
  return concerns.every((item) => formatCodes.has(item.code));
}

export function validateAuditFormatPreservation(original, repaired) {
  if (!isObject(original) || !isObject(repaired)) return [];
  const concerns = [];
  for (const field of ['pass', 'checks', 'concerns', 'evidence', 'commit_permission']) {
    if (!(field in original)) continue;
    if (!deepEqual(original[field], repaired[field])) concerns.push(issue('STAGE23_FORMAT_REPAIR_SEMANTIC_CHANGE', `Audit format repair must preserve existing ${field}.`, field));
  }
  return concerns;
}
