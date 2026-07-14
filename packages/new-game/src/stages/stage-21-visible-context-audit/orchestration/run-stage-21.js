import { computeVisibleContextPackageDigest } from '@rus/contracts';
import { CODE_ROUTE_COMPATIBILITY, FORMAT_CODES, RETURN_STAGE_NUMBER, STAGE21_ALLOWED_CONCERN_CODES, STAGE21_ALLOWED_REPAIR_KINDS, STAGE21_ALLOWED_RETURN_STAGES, STAGE21_ALLOWED_SEVERITIES, STAGE21_OUTPUT_SCHEMA, STAGE21_REQUIRED_CHECKS, STAGE21_RESULT_SCHEMA, STAGE21_ROUTE_SCHEMA } from '../policy/constants.js';
import { validateStage21Input } from '../input/input-boundary.js';
import { buildStage21AuditCodePrecheck, buildStage21ReferenceIndex } from '../precheck/build-precheck.js';
import { validateStage21RepairRoute, validateVisibleContextAuditOutput } from '../validation/audit-validation.js';
import { array, isObject, issue, safeClone } from '../../../visible-context/shared.js';

export async function runStage21VisibleContextAuditBlock({ input, auditor, formatRepairer, seniorAuditor, auditRouter } = {}) {
  const inputConcerns = validateStage21Input(input);
  if (inputConcerns.length > 0) throw stage21Error('Stage 21 input gate failed.', inputConcerns, { failed_gate: 'stage21_input_gate', input_snapshot: safeClone(input), terminal: true });
  for (const [name, callback] of Object.entries({ auditor, formatRepairer, seniorAuditor, auditRouter })) if (typeof callback !== 'function') throw new Error(`Stage 21 requires ${name} callback.`);
  const referenceIndex = buildStage21ReferenceIndex(input);
  const precheck = buildStage21AuditCodePrecheck(input, referenceIndex);
  if (precheck.pass !== true) throw stage21Error('Stage 21 independent code precheck failed.', precheck.concerns, { failed_gate: 'stage21_code_precheck', audit_code_precheck: precheck, terminal: true });

  const auditHistory = [];
  const diagnostics = { auditor_attempts: 0, format_repair_attempts: 0, senior_auditor_attempts: 0, router_attempts: 0, last_error_codes: [] };
  let candidate = await callRole(auditor, buildAuditorRoleInput(input, precheck, referenceIndex.summary), 'VisibleContextSemanticAuditor');
  diagnostics.auditor_attempts += 1;
  let seniorAlreadyUsed = false;
  try {
    candidate = await normalizeAuditFormat(candidate, input, precheck, referenceIndex.summary, formatRepairer, auditHistory, diagnostics);
  } catch (formatError) {
    auditHistory.push({ attempt_index: auditHistory.length + 1, kind: 'auditor_retry_after_format_failure', role: 'VisibleContextSemanticAuditor', issue_codes: array(formatError?.lifecycle?.concerns).map((item) => item?.code).filter(Boolean) });
    const retry = await callRole(auditor, {
      ...buildAuditorRoleInput(input, precheck, referenceIndex.summary),
      previous_format_failure: safeClone(formatError?.lifecycle?.concerns ?? []),
      constraints: { audit_only: true, output_strict_json: true, do_not_modify_visible_context_package: true }
    }, 'VisibleContextSemanticAuditor');
    diagnostics.auditor_attempts += 1;
    try {
      candidate = await normalizeAuditFormat(retry, input, precheck, referenceIndex.summary, formatRepairer, auditHistory, diagnostics);
    } catch (secondFormatError) {
      const senior = await callRole(seniorAuditor, {
        ...buildAuditorRoleInput(input, precheck, referenceIndex.summary),
        schema: 'visible_context_senior_semantic_audit_request',
        failed_audit_output: safeClone(retry),
        audit_validation_errors: safeClone(secondFormatError?.lifecycle?.concerns ?? []),
        constraints: { audit_only: true, output_strict_json: true, do_not_modify_visible_context_package: true, do_not_write_narrator_prose: true }
      }, 'SeniorVisibleContextSemanticAuditor');
      diagnostics.senior_auditor_attempts += 1;
      seniorAlreadyUsed = true;
      auditHistory.push({ attempt_index: auditHistory.length + 1, kind: 'senior_audit_after_format_failure', role: 'SeniorVisibleContextSemanticAuditor', issue_codes: array(secondFormatError?.lifecycle?.concerns).map((item) => item?.code).filter(Boolean) });
      candidate = await normalizeAuditFormat(senior, input, precheck, referenceIndex.summary, formatRepairer, auditHistory, diagnostics);
    }
  }
  let auditConcerns = validateVisibleContextAuditOutput(candidate.value, input, precheck);

  if (auditConcerns.length > 0 && !seniorAlreadyUsed && !auditConcerns.every((item) => FORMAT_CODES.has(item.code))) {
    const senior = await callRole(seniorAuditor, {
      ...buildAuditorRoleInput(input, precheck, referenceIndex.summary),
      schema: 'visible_context_senior_semantic_audit_request',
      failed_audit_output: safeClone(candidate.value),
      audit_validation_errors: safeClone(auditConcerns),
      constraints: { audit_only: true, do_not_modify_visible_context_package: true, do_not_write_narrator_prose: true }
    }, 'SeniorVisibleContextSemanticAuditor');
    diagnostics.senior_auditor_attempts += 1;
    seniorAlreadyUsed = true;
    auditHistory.push({ attempt_index: auditHistory.length + 1, kind: 'senior_audit', role: 'SeniorVisibleContextSemanticAuditor', issue_codes: auditConcerns.map((item) => item.code) });
    candidate = await normalizeAuditFormat(senior, input, precheck, referenceIndex.summary, formatRepairer, auditHistory, diagnostics);
    auditConcerns = validateVisibleContextAuditOutput(candidate.value, input, precheck);
  }

  if (auditConcerns.length > 0) {
    diagnostics.last_error_codes = auditConcerns.map((item) => item.code);
    throw stage21Error('Stage 21 audit output validation failed.', auditConcerns, { failed_gate: 'stage21_audit_output_validation', audit_code_precheck: precheck, failed_audit_output: safeClone(candidate.value), audit_history: auditHistory, terminal: true });
  }

  const audit = candidate.value;
  let route = null;
  if (audit.pass === false) {
    const routed = await callRole(auditRouter, buildRouterRoleInput(audit, input, precheck), 'VisibleContextAuditRouter');
    diagnostics.router_attempts += 1;
    const parsedRoute = parseRoleResult(routed);
    if (parsedRoute.parseError) throw stage21Error('Stage 21 router returned invalid JSON.', [issue('VISIBLE_CONTEXT_AUDIT_ROUTE_INVALID_JSON', parsedRoute.parseError, 'route')], { failed_gate: 'stage21_router_format', audit, terminal: true });
    const routeConcerns = validateStage21RepairRoute(parsedRoute.value, audit);
    if (routeConcerns.length > 0) throw stage21Error('Stage 21 router output validation failed.', routeConcerns, { failed_gate: 'stage21_router_validation', audit, route: safeClone(parsedRoute.value), terminal: true });
    route = parsedRoute.value;
    auditHistory.push({ attempt_index: auditHistory.length + 1, kind: 'audit_route', role: 'VisibleContextAuditRouter', concern_codes: route.concern_codes, return_to_stage: route.return_to_stage });
  }

  const pass = audit.pass === true && route === null;
  const permission = pass
    ? { can_send_to_narrator: true, can_write_visible_context_snapshot: true, can_generate_player_facing_prose: true }
    : { can_send_to_narrator: false, can_write_visible_context_snapshot: false, can_generate_player_facing_prose: false };
  return {
    version: 1,
    schema: STAGE21_RESULT_SCHEMA,
    request_id: input.request_id,
    pass,
    visible_context_package_digest: input.visible_context_package_digest,
    input_snapshot_digest: computeInputSnapshotDigest(input),
    audit_code_precheck: structuredClone(precheck),
    visible_context_audit: structuredClone(audit),
    repair_route: route ? structuredClone(route) : null,
    audit_history: structuredClone(auditHistory),
    diagnostics,
    commit_permission: permission
  };
}

export function validateProvidedStage21Result() {
  throw new Error('Provided Stage 21 output is forbidden in production, development and tests. Stub the Stage 21 role executors instead.');
}

export function returnStageNumber(route) {
  return RETURN_STAGE_NUMBER[route?.return_to_stage] ?? null;
}

export function buildAuditorRoleInput(input, precheck, referenceSummary) {
  return {
    version: 1,
    schema: 'visible_context_semantic_audit_request',
    request_id: input.request_id,
    visible_context_audit_input: structuredClone(input),
    audit_code_precheck: structuredClone(precheck),
    reference_index_summary: structuredClone(referenceSummary),
    allowed_concern_codes: [...STAGE21_ALLOWED_CONCERN_CODES],
    allowed_concern_severities: [...STAGE21_ALLOWED_SEVERITIES],
    allowed_repair_routes: [...STAGE21_ALLOWED_RETURN_STAGES],
    allowed_repair_kinds: [...STAGE21_ALLOWED_REPAIR_KINDS],
    constraints: {
      output_only_schema: STAGE21_OUTPUT_SCHEMA,
      audit_only: true,
      do_not_modify_visible_context_package: true,
      do_not_reveal_hidden_state_beyond_minimal_evidence: true,
      require_nonempty_evidence_even_on_success: true,
      do_not_write_narrator_prose: true
    }
  };
}

export function buildRouterRoleInput(audit, input, precheck) {
  return {
    version: 1,
    schema: 'visible_context_audit_router_input',
    request_id: input.request_id,
    visible_context_package_digest: input.visible_context_package_digest,
    visible_context_audit: structuredClone(audit),
    audit_code_precheck: structuredClone(precheck),
    permitted_return_stages: [...STAGE21_ALLOWED_RETURN_STAGES],
    permitted_repair_kinds: [...STAGE21_ALLOWED_REPAIR_KINDS],
    route_compatibility: structuredClone(CODE_ROUTE_COMPATIBILITY),
    constraints: {
      choose_one_route_only: true,
      cite_audit_evidence_by_index: true,
      do_not_modify_audit: true,
      do_not_modify_visible_context_package: true,
      requires_reaudit_from_stage: 21
    }
  };
}

export async function normalizeAuditFormat(result, input, precheck, referenceSummary, formatRepairer, auditHistory, diagnostics) {
  const parsed = parseRoleResult(result);
  const formatConcerns = parsed.parseError
    ? [issue('VISIBLE_CONTEXT_AUDIT_INVALID_JSON', parsed.parseError, 'root')]
    : validateAuditFormatOnly(parsed.value);
  if (formatConcerns.length === 0) return parsed;
  const repaired = await callRole(formatRepairer, {
    version: 1,
    schema: 'visible_context_audit_format_repair_input',
    request_id: input.request_id,
    target: STAGE21_OUTPUT_SCHEMA,
    raw_audit_response: parsed.raw,
    parsed_audit_response: safeClone(parsed.value),
    parse_errors: formatConcerns,
    visible_context_package_digest: input.visible_context_package_digest,
    required_checks: [...STAGE21_REQUIRED_CHECKS],
    required_schema: STAGE21_OUTPUT_SCHEMA,
    reference_index_summary: structuredClone(referenceSummary),
    audit_code_precheck: structuredClone(precheck),
    constraints: { change_format_only: true, do_not_change_pass: true, do_not_add_semantic_evidence: true, do_not_choose_repair_route: true, do_not_modify_world_refs: true }
  }, 'VisibleContextAuditFormatRepairer');
  diagnostics.format_repair_attempts += 1;
  auditHistory.push({ attempt_index: auditHistory.length + 1, kind: 'format_repair', role: 'VisibleContextAuditFormatRepairer', issue_codes: formatConcerns.map((item) => item.code) });
  const repairedParsed = parseRoleResult(repaired);
  const repairedConcerns = repairedParsed.parseError ? [issue('VISIBLE_CONTEXT_AUDIT_INVALID_JSON', repairedParsed.parseError, 'root')] : validateAuditFormatOnly(repairedParsed.value);
  if (repairedConcerns.length > 0) throw stage21Error('Stage 21 format repair failed.', repairedConcerns, { failed_gate: 'stage21_format_repair', terminal: false });
  return repairedParsed;
}

export function validateAuditFormatOnly(output) {
  const concerns = [];
  if (!isObject(output)) return [issue('VISIBLE_CONTEXT_AUDIT_INVALID_JSON', 'Audit output must be an object.', 'root')];
  if (output.version !== 1 || output.schema !== STAGE21_OUTPUT_SCHEMA) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_SCHEMA_MISMATCH', `Expected ${STAGE21_OUTPUT_SCHEMA} version 1.`, 'schema'));
  if (!isObject(output.checks) || !isObject(output.commit_permission)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_REQUIRED_BLOCK_MISSING', 'checks and commit_permission are required objects.', 'root'));
  if (!Array.isArray(output.concerns) || !Array.isArray(output.evidence)) concerns.push(issue('VISIBLE_CONTEXT_AUDIT_ARRAY_INVALID', 'concerns and evidence must be arrays.', 'root'));
  return concerns;
}

export function computeInputSnapshotDigest(input) {
  const technical = {
    request_id: input?.request_id,
    visible_context_package_digest: input?.visible_context_package_digest,
    historical_frame: input?.historical_frame,
    weather_state: input?.weather_state,
    current_position: input?.current_position,
    g5_scene_audit: input?.g5_scene_audit,
    npc_placement_audit: input?.npc_placement_audit,
    item_placement_audit: input?.item_placement_audit,
    time_light_consistency_audit: input?.time_light_consistency_audit,
    character_knowledge_map_audit: input?.character_knowledge_map_audit,
    full_hidden_state_audit: input?.full_hidden_state_audit
  };
  return computeVisibleContextPackageDigest(technical);
}

export async function callRole(callback, input, role) {
  const result = await callback(structuredClone(input));
  if (result == null) throw new Error(`${role} returned no result.`);
  return result;
}

export function parseRoleResult(result) {
  if (isObject(result) && 'output' in result) return parseRoleResult(result.output);
  if (isObject(result) && 'content' in result && typeof result.content === 'string') return parseRoleResult(result.content);
  if (typeof result === 'string') {
    try { return { value: JSON.parse(stripJsonFence(result)), raw: result, parseError: null }; }
    catch (error) { return { value: null, raw: result, parseError: error?.message ?? String(error) }; }
  }
  if (isObject(result)) return { value: structuredClone(result), raw: structuredClone(result), parseError: null };
  return { value: null, raw: result, parseError: 'Unsupported role result type.' };
}

export function stripJsonFence(value) {
  return String(value).trim().replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '');
}

export function stage21Error(message, concerns = [], details = {}) {
  const error = new Error(message);
  error.name = 'Stage21VisibleContextAuditError';
  error.lifecycle = {
    stage_id: 21,
    stage_slug: 'visible_context_audit',
    stage_type: 'isolated_llm_audit_block',
    concerns: safeClone(concerns),
    ...safeClone(details)
  };
  return error;
}
