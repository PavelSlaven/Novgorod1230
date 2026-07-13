import { STAGE23_AUDIT_SCHEMA, STAGE23_CONCERN_CODES, STAGE23_REQUIRED_CHECKS, STAGE23_RESULT_SCHEMA, STAGE23_ROUTES, STAGE23_SEVERITIES } from '../policy/constants.js';
import { validateStage23AuditInput } from '../input/input-boundary.js';
import { buildNarratorProseCodePrecheck } from '../precheck/build-precheck.js';
import { hasFormatOnlyFailures, validateAuditFormatPreservation, validateNarratorProseAudit, validateStage23RepairRoute } from '../validation/audit-validation.js';
import { array, isObject, issue, safeClone, stripJsonFence } from '../shared/utils.js';

export async function runStage23NarratorProseAuditBlock({ input, auditor, formatRepairer, seniorAuditor, router } = {}) {
  const inputConcerns = validateStage23AuditInput(input);
  if (inputConcerns.length > 0) throw stage23Error('Stage 23 input gate failed.', inputConcerns, { failed_gate: 'stage23_input_gate', input_snapshot: safeClone(input), terminal: true });
  for (const [name, callback] of Object.entries({ auditor, formatRepairer, seniorAuditor, router })) if (typeof callback !== 'function') throw new Error(`Stage 23 requires ${name} callback.`);
  const precheck = buildNarratorProseCodePrecheck(input);
  if (precheck.pass !== true) throw stage23Error('Stage 23 code precheck failed.', precheck.concerns, { failed_gate: 'stage23_code_precheck', narrator_prose_code_precheck: precheck, terminal: true });

  const history = [];
  const diagnostics = { auditor_attempts: 0, format_repair_attempts: 0, senior_auditor_attempts: 0, router_attempts: 0, repair_cycles: 0, last_error_codes: [] };
  const auditRoleInput = buildAuditorRoleInput(input, precheck);
  let raw = await callRole(auditor, auditRoleInput, 'NarratorProseSemanticAuditor');
  diagnostics.auditor_attempts += 1;
  let parsed = parseRoleResult(raw);
  let audit = parsed.value;
  let validation = parsed.parseError
    ? [issue('STAGE23_AUDIT_INVALID_JSON', parsed.parseError, 'root')]
    : validateNarratorProseAudit(audit, input, { allowRouteMissing: audit?.pass === false });

  if (parsed.parseError || hasFormatOnlyFailures(validation)) {
    const repairedRaw = await callRole(formatRepairer, {
      version: 1,
      schema: 'narrator_prose_audit_format_repair_input',
      request_id: input.request_id,
      raw_audit_response: safeClone(parsed.raw),
      format_errors: safeClone(validation),
      required_schema: buildAuditOutputContract(),
      constraints: { repair_json_only: true, do_not_add_semantic_findings: true, do_not_change_pass_meaning: true }
    }, 'NarratorProseAuditFormatRepairer');
    diagnostics.format_repair_attempts += 1;
    history.push({ attempt_index: history.length + 1, kind: 'audit_format_repair', role: 'NarratorProseAuditFormatRepairer', issue_codes: validation.map((item) => item.code) });
    const repaired = parseRoleResult(repairedRaw);
    const preservation = validateAuditFormatPreservation(audit, repaired.value);
    parsed = repaired;
    audit = parsed.value;
    validation = parsed.parseError
      ? [issue('STAGE23_AUDIT_INVALID_JSON', parsed.parseError, 'root')]
      : [...validateNarratorProseAudit(audit, input, { allowRouteMissing: audit?.pass === false }), ...preservation];
  }

  if (validation.length > 0) {
    raw = await callRole(seniorAuditor, {
      ...auditRoleInput,
      schema: 'senior_narrator_prose_audit_input',
      failed_audit_output: safeClone(audit ?? parsed.raw),
      audit_validation_errors: safeClone(validation),
      constraints: { use_only_exact_input: true, return_strict_json: true }
    }, 'SeniorNarratorProseSemanticAuditor');
    diagnostics.senior_auditor_attempts += 1;
    history.push({ attempt_index: history.length + 1, kind: 'senior_audit', role: 'SeniorNarratorProseSemanticAuditor', issue_codes: validation.map((item) => item.code) });
    parsed = parseRoleResult(raw);
    audit = parsed.value;
    validation = parsed.parseError
      ? [issue('STAGE23_AUDIT_INVALID_JSON', parsed.parseError, 'root')]
      : validateNarratorProseAudit(audit, input, { allowRouteMissing: audit?.pass === false });
  }

  if (validation.length > 0) {
    diagnostics.last_error_codes = validation.map((item) => item.code);
    throw stage23Error('Stage 23 audit output validation failed.', validation, { failed_gate: 'stage23_audit_validation', narrator_prose_code_precheck: precheck, failed_output: safeClone(audit ?? parsed.raw), audit_history: history, terminal: true });
  }

  let route = null;
  if (audit.pass === false) {
    const routerOutput = await callRole(router, {
      version: 1,
      schema: 'narrator_prose_audit_router_input',
      request_id: input.request_id,
      concerns: safeClone(audit.concerns),
      evidence: safeClone(audit.evidence),
      failed_checks: STAGE23_REQUIRED_CHECKS.filter((key) => audit.checks?.[key]?.pass === false),
      allowed_routes: safeClone(STAGE23_ROUTES)
    }, 'NarratorProseAuditRouter');
    diagnostics.router_attempts += 1;
    const parsedRoute = parseRoleResult(routerOutput);
    route = parsedRoute.value;
    const routeConcerns = parsedRoute.parseError
      ? [issue('STAGE23_ROUTE_INVALID_JSON', parsedRoute.parseError, 'repair_route')]
      : validateStage23RepairRoute(route, audit);
    if (routeConcerns.length > 0) throw stage23Error('Stage 23 repair route validation failed.', routeConcerns, { failed_gate: 'stage23_route_validation', narrator_prose_code_precheck: precheck, failed_output: safeClone(audit), failed_route: safeClone(route), terminal: true });
    audit = { ...safeClone(audit), repair_route: safeClone(route) };
    const finalConcerns = validateNarratorProseAudit(audit, input);
    if (finalConcerns.length > 0) throw stage23Error('Stage 23 final audit validation failed.', finalConcerns, { failed_gate: 'stage23_final_validation', narrator_prose_code_precheck: precheck, failed_output: safeClone(audit), terminal: true });
  }

  return buildStage23Result(input, precheck, audit, route, history, diagnostics);
}

export function validateProvidedStage23Result() {
  throw new Error('Provided Stage 23 output is forbidden in production, development and tests. Stub Stage 23 role executors instead.');
}

function buildStage23Result(input, precheck, audit, route, history, diagnostics) {
  const pass = audit?.pass === true;
  return Object.freeze({
    version: 1,
    schema: STAGE23_RESULT_SCHEMA,
    request_id: input.request_id,
    pass,
    visible_context_package_digest: input.visible_context_package_digest,
    narrator_starting_prose_digest: input.narrator_starting_prose_digest,
    narrator_prose_code_precheck: safeClone(precheck),
    narrator_prose_audit: safeClone(audit),
    repair_route: safeClone(route),
    audit_history: safeClone(history),
    diagnostics: safeClone(diagnostics),
    commit_permission: {
      can_show_to_player: pass && audit.commit_permission?.can_show_to_player === true,
      can_write_player_visible_message: pass && audit.commit_permission?.can_write_player_visible_message === true,
      can_mark_opening_scene_presented: pass && audit.commit_permission?.can_mark_opening_scene_presented === true
    }
  });
}

function buildAuditorRoleInput(input, precheck) {
  return Object.freeze({
    version: 1,
    schema: 'narrator_prose_semantic_audit_request',
    request_id: input.request_id,
    visible_context_package: safeClone(input.visible_context_package),
    visible_context_package_digest: input.visible_context_package_digest,
    visible_context_approval: safeClone(input.visible_context_approval),
    narrator_starting_prose: safeClone(input.narrator_starting_prose),
    narrator_starting_prose_digest: input.narrator_starting_prose_digest,
    audit_policy: safeClone(input.audit_policy),
    structural_precheck_summary: {
      pass: precheck.pass,
      checks: safeClone(precheck.checks)
    },
    output_contract: buildAuditOutputContract()
  });
}

function buildAuditOutputContract() {
  return {
    version: 1,
    schema: STAGE23_AUDIT_SCHEMA,
    required_checks: safeClone(STAGE23_REQUIRED_CHECKS),
    allowed_concern_codes: safeClone(STAGE23_CONCERN_CODES),
    allowed_severities: safeClone(STAGE23_SEVERITIES),
    router_selects_repair_route: true,
    require_nonempty_evidence: true
  };
}

function parseRoleResult(result) {
  if (isObject(result) && 'output' in result) return parseRoleResult(result.output);
  if (isObject(result) && 'content' in result && typeof result.content === 'string') return parseRoleResult(result.content);
  if (typeof result === 'string') {
    try { return { value: JSON.parse(stripJsonFence(result)), raw: result, parseError: null }; }
    catch (error) { return { value: null, raw: result, parseError: error?.message ?? String(error) }; }
  }
  if (isObject(result)) return { value: safeClone(result), raw: safeClone(result), parseError: null };
  return { value: null, raw: result, parseError: 'Unsupported role result type.' };
}

async function callRole(callback, input, role) {
  const result = await callback(safeClone(input));
  if (result == null) throw new Error(`${role} returned no result.`);
  return result;
}

function stage23Error(message, concerns = [], details = {}) {
  const error = new Error(message);
  error.name = 'Stage23NarratorProseAuditError';
  error.concerns = safeClone(concerns);
  error.lifecycle = {
    stage_id: 23,
    stage_slug: 'narrator_prose_audit',
    stage_type: 'isolated_llm_block',
    concerns: safeClone(concerns),
    ...safeClone(details)
  };
  return error;
}
