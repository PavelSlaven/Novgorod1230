import {
  ALLOWED_AUDIT_KEYS,
  FORMAT_PLAN_CODES,
  FORBIDDEN_AUDIT_KEYS,
  REQUIRED_AUDIT_CHECKS,
  STAGE24_AUDIT_SCHEMA,
  STAGE24_CONCERN_CODES,
  STAGE24_REPAIR_ROUTES,
  STAGE24_ROUTE_SCHEMA,
  STAGE24_SEVERITIES
} from '../policy/constants.js';
import { array, computePartyDbWritePlanDigest, isObject, issue, text } from '../shared/utils.js';

export function validatePartyDbWritePlanAudit(audit = {}, input = {}, plan = {}) {
  const concerns = [];
  if (!isObject(audit)) return [issue('WRITE_PLAN_AUDIT_INVALID', 'party_db_write_plan_audit must be an object.', 'audit')];
  for (const key of Object.keys(audit)) {
    if (!ALLOWED_AUDIT_KEYS.has(key) || FORBIDDEN_AUDIT_KEYS.has(key)) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', `Forbidden or unexpected audit field: ${key}.`, key));
  }
  if (audit.version !== 1 || audit.schema !== STAGE24_AUDIT_SCHEMA) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', `Expected ${STAGE24_AUDIT_SCHEMA} version 1.`, 'audit.schema'));
  if (audit.request_id !== input.request_id) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Audit request_id must match Stage 24 input.', 'audit.request_id'));
  if (audit.party_db_write_plan_digest !== computePartyDbWritePlanDigest(plan)) concerns.push(issue('WRITE_PLAN_AUDIT_DIGEST_MISMATCH', 'Audit plan digest does not match the validated write plan.', 'audit.party_db_write_plan_digest'));
  if (typeof audit.pass !== 'boolean') concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'audit.pass must be boolean.', 'audit.pass'));
  if (!isObject(audit.checks)) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'audit.checks must be an object.', 'audit.checks'));
  for (const key of REQUIRED_AUDIT_CHECKS) {
    const check = audit.checks?.[key];
    if (!isObject(check) || typeof check.pass !== 'boolean') concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', `audit.checks.${key}.pass is required.`, `audit.checks.${key}`));
  }
  if (!Array.isArray(audit.concerns)) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'audit.concerns must be an array.', 'audit.concerns'));
  if (!Array.isArray(audit.evidence) || audit.evidence.length === 0 || audit.evidence.some((value) => !text(value))) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'audit.evidence must be a non-empty array of strings.', 'audit.evidence'));
  for (const [index, item] of array(audit.concerns).entries()) {
    if (!STAGE24_CONCERN_CODES.includes(item?.code)) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', `Unknown concern code: ${item?.code}.`, `audit.concerns[${index}].code`));
    if (!STAGE24_SEVERITIES.includes(item?.severity)) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', `Unknown severity: ${item?.severity}.`, `audit.concerns[${index}].severity`));
    if (!text(item?.message)) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Concern message is required.', `audit.concerns[${index}].message`));
  }
  const permissions = audit.commit_permission ?? {};
  for (const key of ['can_send_to_commit_gate', 'can_execute_transaction', 'can_write_party_snapshots']) {
    if (permissions[key] !== (audit.pass === true)) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', `commit_permission.${key} must equal audit.pass.`, `audit.commit_permission.${key}`));
  }
  const failedChecks = REQUIRED_AUDIT_CHECKS.filter((key) => audit.checks?.[key]?.pass === false);
  if (audit.pass === true) {
    if (array(audit.concerns).length > 0) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Passing audit cannot contain concerns.', 'audit.concerns'));
    if (failedChecks.length > 0) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Passing audit cannot contain failed checks.', 'audit.checks'));
    if (audit.proposed_repair_route != null) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Passing audit must not propose repair route.', 'audit.proposed_repair_route'));
  } else {
    if (array(audit.concerns).length === 0 || failedChecks.length === 0) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Failed audit requires concerns and failed checks.', 'audit'));
  }
  return concerns;
}

export function validateStage24RepairRoute(route = {}, audit = {}) {
  const concerns = [];
  if (!isObject(route) || route.version !== 1 || route.schema !== STAGE24_ROUTE_SCHEMA) {
    return [issue('WRITE_PLAN_AUDIT_INVALID', `Expected ${STAGE24_ROUTE_SCHEMA} version 1.`, 'route')];
  }
  if (route.request_id !== audit.request_id) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Route request_id must match audit.', 'route.request_id'));
  if (!STAGE24_REPAIR_ROUTES.includes(route.return_to_stage)) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', `Unsupported route: ${route.return_to_stage}.`, 'route.return_to_stage'));
  if (!text(route.repair_kind) || !text(route.reason)) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Route repair_kind and reason are required.', 'route'));
  if (!Array.isArray(route.supporting_concern_codes) || route.supporting_concern_codes.length === 0) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Route supporting_concern_codes must be non-empty.', 'route.supporting_concern_codes'));
  const auditCodes = new Set(array(audit.concerns).map((item) => item?.code));
  for (const code of array(route.supporting_concern_codes)) if (!auditCodes.has(code)) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', `Route references concern code not present in audit: ${code}.`, 'route.supporting_concern_codes'));
  if (!Array.isArray(route.allowed_mutable_paths) || !Array.isArray(route.forbidden_mutable_paths)) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Route mutable path lists are required.', 'route'));
  if (route.requires_reaudit_from_stage !== 24) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Route must require re-audit from Stage 24.', 'route.requires_reaudit_from_stage'));
  concerns.push(...validateRouteCompatibility(route, audit));
  return concerns;
}
function validateRouteCompatibility(route, audit) {
  const concerns = [];
  const codes = new Set(array(route.supporting_concern_codes));
  const selected = route.return_to_stage;
  if (selected === 'party_db_write_plan_format_repair' && [...codes].some((code) => !FORMAT_PLAN_CODES.has(code))) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Format repair route is incompatible with semantic concerns.', 'route.return_to_stage'));
  if (selected === 'party_database_schema_reload' && ![...codes].some((code) => ['WRITE_PLAN_UNKNOWN_TABLE', 'WRITE_PLAN_UNKNOWN_COLUMN', 'WRITE_PLAN_DATABASE_SCHEMA_INVALID'].includes(code))) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Schema reload route requires schema concern.', 'route.return_to_stage'));
  if (selected === 'character_knowledge_projection_repair' && ![...codes].some((code) => code.includes('KNOWLEDGE_PROJECTION'))) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Knowledge projection repair route requires knowledge concern.', 'route.return_to_stage'));
  if (audit.pass === true) concerns.push(issue('WRITE_PLAN_AUDIT_INVALID', 'Router cannot run for passing audit.', 'route'));
  return concerns;
}
