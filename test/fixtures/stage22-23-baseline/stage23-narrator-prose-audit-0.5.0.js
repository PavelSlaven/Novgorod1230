import { createHash } from 'node:crypto';
import {
  computeNarratorStartingProseDigest as computeNarratorStartingProseDigestContract,
  computeVisibleContextPackageDigest,
  VISIBLE_CONTEXT_AUDIT_APPROVAL_SCHEMA
} from '@rus/contracts';
import {
  buildStage22ReferenceIndex,
  STAGE22_ALLOWED_ACTION_KINDS,
  STAGE22_ALLOWED_BASES,
  STAGE22_ALLOWED_RISK_HINTS,
  STAGE22_OUTPUT_SCHEMA
} from './stage22-narrator-prose-0.5.0.js';

const STAGE22_APPROVAL_SCHEMA = VISIBLE_CONTEXT_AUDIT_APPROVAL_SCHEMA;

export const STAGE23_INPUT_SCHEMA = 'narrator_prose_audit_input';
export const STAGE23_PRECHECK_SCHEMA = 'narrator_prose_code_precheck';
export const STAGE23_AUDIT_SCHEMA = 'narrator_prose_audit';
export const STAGE23_ROUTE_SCHEMA = 'narrator_prose_audit_route';
export const STAGE23_RESULT_SCHEMA = 'stage23_narrator_prose_audit_result';
export const STAGE23_UPSTREAM_REPAIR_SCHEMA = 'stage23_upstream_repair_request';

export const STAGE23_REQUIRED_CHECKS = Object.freeze([
  'schema_and_structure',
  'visible_context_compliance',
  'new_fact_check',
  'npc_check',
  'item_check',
  'container_check',
  'door_exit_route_check',
  'time_light_weather_check',
  'position_check',
  'g5_anchor_check',
  'knowledge_boundary_check',
  'hidden_state_leak_check',
  'rumor_uncertainty_check',
  'action_options_check',
  'technical_text_check',
  'must_include_check',
  'must_not_include_check',
  'commit_readiness'
]);

export const STAGE23_CONCERN_CODES = Object.freeze([
  'NARRATOR_PROSE_INVALID_SCHEMA',
  'NARRATOR_PROSE_REQUEST_ID_MISMATCH',
  'NARRATOR_PROSE_EMPTY',
  'NARRATOR_PROSE_OUTSIDE_VISIBLE_CONTEXT',
  'NARRATOR_PROSE_USED_UNAVAILABLE_CONTEXT',
  'NARRATOR_PROSE_USED_HIDDEN_FILTERED_OUT_CONTEXT',
  'NARRATOR_PROSE_ADDED_FACT',
  'NARRATOR_PROSE_ADDED_NPC',
  'NARRATOR_PROSE_ADDED_ITEM',
  'NARRATOR_PROSE_ADDED_CONTAINER',
  'NARRATOR_PROSE_ADDED_EXIT',
  'NARRATOR_PROSE_ADDED_THREAT',
  'NARRATOR_PROSE_TIME_CONFLICT',
  'NARRATOR_PROSE_WEATHER_CONFLICT',
  'NARRATOR_PROSE_LIGHT_CONFLICT',
  'NARRATOR_PROSE_POSITION_CONFLICT',
  'NARRATOR_PROSE_INVALID_G5_REF',
  'NARRATOR_PROSE_KNOWLEDGE_BOUNDARY_VIOLATION',
  'NARRATOR_PROSE_HIDDEN_STATE_LEAK',
  'NARRATOR_PROSE_PRIVATE_MOTIVE_LEAK',
  'NARRATOR_PROSE_CLOSED_CONTAINER_LEAK',
  'NARRATOR_PROSE_FUTURE_EVENT_LEAK',
  'NARRATOR_PROSE_UNKNOWN_TRUE_OWNERSHIP',
  'NARRATOR_PROSE_RUMOR_UPGRADED',
  'NARRATOR_PROSE_UNCERTAINTY_UPGRADED',
  'NARRATOR_PROSE_ACTION_USES_HIDDEN_TRUTH',
  'NARRATOR_PROSE_TECHNICAL_TEXT',
  'NARRATOR_PROSE_MUST_INCLUDE_MISSING',
  'NARRATOR_PROSE_MUST_NOT_INCLUDE_VIOLATION',
  'NARRATOR_PROSE_AUDIT_FORMAT_INVALID',
  'NARRATOR_PROSE_AUDIT_INTERNAL_INCONSISTENCY'
]);

export const STAGE23_SEVERITIES = Object.freeze(['warning', 'repairable', 'hard_block', 'upstream_block']);
export const STAGE23_ROUTES = Object.freeze([
  'narrator_prose_format_repair',
  'narrator_prose_semantic_repair',
  'visible_context_semantic_repair',
  'visible_context_audit',
  'time_light_semantic_repair',
  'character_knowledge_map_semantic_repair',
  'full_hidden_state_semantic_repair',
  'blocked'
]);

export const DEFAULT_STAGE23_AUDIT_POLICY = Object.freeze({
  compare_only_against_visible_context_package: true,
  reject_added_facts: true,
  reject_added_npcs: true,
  reject_added_items: true,
  reject_added_containers: true,
  reject_added_doors_or_exits: true,
  reject_added_threats: true,
  reject_added_time_of_day: true,
  reject_added_character_knowledge: true,
  reject_hidden_leaks: true,
  reject_private_motives: true,
  reject_closed_container_contents: true,
  reject_future_events: true,
  reject_unknown_true_ownership: true,
  reject_rumor_as_fact: true,
  reject_uncertainty_as_fact: true,
  reject_action_labels_using_hidden_truth: true,
  reject_raw_json_or_debug_text: true,
  reject_time_light_conflict: true,
  reject_position_conflict: true,
  require_must_include_coverage: true,
  require_must_not_include_compliance: true,
  require_evidence: true,
  require_repair_route_on_fail: true
});

const INPUT_KEYS = new Set([
  'version', 'schema', 'request_id', 'visible_context_package',
  'visible_context_package_digest', 'visible_context_approval',
  'narrator_starting_prose', 'narrator_starting_prose_digest', 'audit_policy'
]);
const FORBIDDEN_INPUT_KEYS = new Set([
  'full_hidden_scene_state', 'hidden_state', 'character_knowledge_map',
  'visible_context_audit', 'stage22_result', 'generation_history', 'diagnostics',
  'repair_history', 'world_base', 'pipeline_context', 'stage_outputs', 'context'
]);
const AUDIT_TOP_LEVEL_KEYS = new Set([
  'version', 'schema', 'request_id', 'pass', 'checks', 'concerns', 'evidence',
  'repair_route', 'commit_permission'
]);
const FORBIDDEN_AUDIT_KEYS = new Set([
  'prose', 'new_prose', 'modified_prose', 'narrator_starting_prose',
  'modified_action_options', 'visible_context_package', 'full_hidden_scene_state',
  'character_knowledge_map', 'hidden_state', 'repair_payload', 'world_base',
  'pipeline_context', 'stage_outputs'
]);
const COMMIT_PERMISSION_KEYS = Object.freeze([
  'can_show_to_player',
  'can_write_player_visible_message',
  'can_mark_opening_scene_presented'
]);
const TECHNICAL_TEXT_PATTERNS = Object.freeze([
  /\bfull_hidden_scene_state\b/iu,
  /\bcharacter_knowledge_map\b/iu,
  /\brepair_route\b/iu,
  /\bsemantic_audit\b/iu,
  /\bpipeline\b/iu,
  /\bdebug\b/iu,
  /\bschema\b/iu,
  /\bjson\b/iu
]);

export function normalizeStage23AuditPolicy(policy = {}) {
  const source = isObject(policy) ? policy : {};
  return Object.freeze({ ...DEFAULT_STAGE23_AUDIT_POLICY, ...source });
}

export function computeNarratorStartingProseDigest(prose) {
  return computeNarratorStartingProseDigestContract(prose);
}

export function buildStage23AuditInput(values = {}) {
  const source = isObject(values) ? values : {};
  const pkg = safeClone(source.visible_context_package ?? source.stage20_result?.visible_context_package ?? null);
  const prose = safeClone(source.narrator_starting_prose ?? source.stage22_result?.narrator_starting_prose ?? null);
  const packageDigest = source.visible_context_package_digest
    ?? source.stage20_result?.visible_context_package_digest
    ?? (pkg ? computeVisibleContextPackageDigest(pkg) : null);
  const proseDigest = source.narrator_starting_prose_digest
    ?? source.stage22_result?.narrator_starting_prose_digest
    ?? (prose ? computeNarratorStartingProseDigest(prose) : null);
  return Object.freeze({
    version: 1,
    schema: STAGE23_INPUT_SCHEMA,
    request_id: source.request_id ?? prose?.request_id ?? null,
    visible_context_package: pkg,
    visible_context_package_digest: packageDigest,
    visible_context_approval: safeClone(source.visible_context_approval ?? null),
    narrator_starting_prose: prose,
    narrator_starting_prose_digest: proseDigest,
    audit_policy: normalizeStage23AuditPolicy(source.audit_policy)
  });
}

export function validateStage23AuditInput(input) {
  const concerns = [];
  if (!isObject(input)) return [issue('STAGE23_INPUT_INVALID', 'Stage 23 input must be an object.', 'root')];
  for (const key of Object.keys(input)) if (!INPUT_KEYS.has(key)) concerns.push(issue('STAGE23_INPUT_EXTRA_FIELD', 'Stage 23 exact input contains an unsupported field.', key));
  for (const path of findForbiddenKeys(input, FORBIDDEN_INPUT_KEYS)) concerns.push(issue('STAGE23_INPUT_FORBIDDEN_FIELD', 'Stage 23 input contains a forbidden field.', path));
  if (input.version !== 1 || input.schema !== STAGE23_INPUT_SCHEMA) concerns.push(issue('STAGE23_INPUT_SCHEMA_MISMATCH', `Expected ${STAGE23_INPUT_SCHEMA} version 1.`, 'schema'));
  if (!text(input.request_id)) concerns.push(issue('STAGE23_REQUEST_ID_MISSING', 'request_id is required.', 'request_id'));

  const pkg = input.visible_context_package;
  if (!isObject(pkg) || pkg.version !== 1 || pkg.schema !== 'visible_context_package') concerns.push(issue('STAGE23_PACKAGE_INVALID', 'visible_context_package version 1 is required.', 'visible_context_package'));
  const actualPackageDigest = isObject(pkg) ? computeVisibleContextPackageDigest(pkg) : null;
  if (!text(input.visible_context_package_digest) || input.visible_context_package_digest !== actualPackageDigest) concerns.push(issue('STAGE23_PACKAGE_DIGEST_MISMATCH', 'visible_context_package_digest must match canonical package bytes.', 'visible_context_package_digest'));

  const approval = input.visible_context_approval;
  if (!isObject(approval) || approval.version !== 1 || approval.schema !== STAGE22_APPROVAL_SCHEMA) concerns.push(issue('STAGE23_APPROVAL_INVALID', `visible_context_approval must use ${STAGE22_APPROVAL_SCHEMA} version 1.`, 'visible_context_approval'));
  if (approval?.request_id !== input.request_id) concerns.push(issue('STAGE23_APPROVAL_REQUEST_ID_MISMATCH', 'Approval request_id must match Stage 23 input.', 'visible_context_approval.request_id'));
  if (approval?.pass !== true) concerns.push(issue('STAGE23_APPROVAL_NOT_PASSED', 'Visible-context approval must pass.', 'visible_context_approval.pass'));
  if (approval?.visible_context_package_digest !== input.visible_context_package_digest) concerns.push(issue('STAGE23_APPROVAL_DIGEST_MISMATCH', 'Approval digest must match Stage 23 package digest.', 'visible_context_approval.visible_context_package_digest'));
  for (const key of ['can_send_to_narrator', 'can_write_visible_context_snapshot', 'can_generate_player_facing_prose']) {
    if (approval?.commit_permission?.[key] !== true) concerns.push(issue('STAGE23_APPROVAL_PERMISSION_DENIED', `visible_context_approval.commit_permission.${key} must be true.`, `visible_context_approval.commit_permission.${key}`));
  }

  const prose = input.narrator_starting_prose;
  if (!isObject(prose) || prose.version !== 1 || prose.schema !== STAGE22_OUTPUT_SCHEMA) concerns.push(issue('STAGE23_PROSE_SCHEMA_INVALID', `narrator_starting_prose must use ${STAGE22_OUTPUT_SCHEMA} version 1.`, 'narrator_starting_prose'));
  if (prose?.request_id !== input.request_id) concerns.push(issue('STAGE23_PROSE_REQUEST_ID_MISMATCH', 'Narrator prose request_id must match Stage 23 input.', 'narrator_starting_prose.request_id'));
  if (prose?.prose_status !== 'drafted') concerns.push(issue('STAGE23_PROSE_STATUS_INVALID', 'Stage 23 requires prose_status=drafted.', 'narrator_starting_prose.prose_status'));
  if (!text(prose?.prose)) concerns.push(issue('STAGE23_PROSE_EMPTY', 'Drafted narrator prose must be non-empty.', 'narrator_starting_prose.prose'));
  const actualProseDigest = isObject(prose) ? computeNarratorStartingProseDigest(prose) : null;
  if (!text(input.narrator_starting_prose_digest) || input.narrator_starting_prose_digest !== actualProseDigest) concerns.push(issue('STAGE23_PROSE_DIGEST_MISMATCH', 'narrator_starting_prose_digest must match canonical prose object.', 'narrator_starting_prose_digest'));

  const policy = input.audit_policy;
  if (!isObject(policy)) concerns.push(issue('STAGE23_POLICY_INVALID', 'audit_policy is required.', 'audit_policy'));
  for (const key of Object.keys(DEFAULT_STAGE23_AUDIT_POLICY)) if (policy?.[key] !== true) concerns.push(issue('STAGE23_POLICY_WEAKENED', `audit_policy.${key} must be true.`, `audit_policy.${key}`));
  return dedupe(concerns);
}

export function buildNarratorProseCodePrecheck(input) {
  const inputConcerns = validateStage23AuditInput(input);
  const structuralConcerns = validateNarratorProseStructure(input?.narrator_starting_prose, input?.visible_context_package);
  const concerns = dedupe([...inputConcerns, ...structuralConcerns]);
  const codes = new Set(concerns.map((item) => item.code));
  const prose = input?.narrator_starting_prose;
  const checks = {
    input_schema_valid: !codes.has('STAGE23_INPUT_INVALID') && !codes.has('STAGE23_INPUT_SCHEMA_MISMATCH'),
    request_id_match: ![...codes].some((code) => code.includes('REQUEST_ID')),
    package_schema_valid: !codes.has('STAGE23_PACKAGE_INVALID'),
    package_digest_valid: !codes.has('STAGE23_PACKAGE_DIGEST_MISMATCH'),
    visible_context_approval_valid: ![...codes].some((code) => code.startsWith('STAGE23_APPROVAL')),
    narrator_prose_present: isObject(prose),
    narrator_prose_schema_valid: !codes.has('STAGE23_PROSE_SCHEMA_INVALID'),
    narrator_prose_digest_valid: !codes.has('STAGE23_PROSE_DIGEST_MISMATCH'),
    prose_not_empty: text(prose?.prose),
    action_options_schema_valid: ![...codes].some((code) => code.startsWith('STAGE23_ACTION_')),
    all_action_target_refs_exist_in_visible_context: !codes.has('STAGE23_ACTION_TARGET_NOT_VISIBLE'),
    all_used_visible_refs_exist: !codes.has('STAGE23_USED_REF_UNKNOWN'),
    self_constraints_check_present: isObject(prose?.self_constraints_check),
    audit_policy_valid: ![...codes].some((code) => code.startsWith('STAGE23_POLICY')),
    no_forbidden_input_fields: ![...codes].some((code) => code.includes('FORBIDDEN_FIELD') || code.includes('EXTRA_FIELD')),
    no_raw_json_detected: !codes.has('STAGE23_TECHNICAL_TEXT_PRESENT'),
    no_schema_debug_audit_terms_detected: !codes.has('STAGE23_TECHNICAL_TEXT_PRESENT'),
    must_not_include_structural_refs_absent: !codes.has('STAGE23_MUST_NOT_INCLUDE_REF_USED')
  };
  return Object.freeze({
    version: 1,
    schema: STAGE23_PRECHECK_SCHEMA,
    request_id: input?.request_id ?? null,
    visible_context_package_digest: input?.visible_context_package_digest ?? null,
    narrator_starting_prose_digest: input?.narrator_starting_prose_digest ?? null,
    pass: concerns.length === 0 && Object.values(checks).every(Boolean),
    checks,
    concerns,
    evidence: concerns.length === 0
      ? ['Stage 23 exact input validated', 'visible package and narrator prose digests match', 'narrator prose structural references validated']
      : concerns.map((item) => `${item.code}:${item.field}`)
  });
}

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

function validateNarratorProseStructure(prose, pkg) {
  const concerns = [];
  if (!isObject(prose)) return [issue('STAGE23_PROSE_STRUCTURE_INVALID', 'narrator_starting_prose must be an object.', 'narrator_starting_prose')];
  if (!Array.isArray(prose.action_options)) concerns.push(issue('STAGE23_ACTION_OPTIONS_INVALID', 'action_options must be an array.', 'narrator_starting_prose.action_options'));
  if (array(prose.action_options).length > 6) concerns.push(issue('STAGE23_ACTION_OPTIONS_LIMIT', 'action_options may contain at most 6 entries.', 'narrator_starting_prose.action_options'));
  if (!Array.isArray(prose.used_visible_context_refs)) concerns.push(issue('STAGE23_USED_REFS_INVALID', 'used_visible_context_refs must be an array.', 'narrator_starting_prose.used_visible_context_refs'));
  if (!isObject(prose.self_constraints_check)) concerns.push(issue('STAGE23_SELF_CHECK_MISSING', 'self_constraints_check is required.', 'narrator_starting_prose.self_constraints_check'));
  const index = buildStage22ReferenceIndex({ visible_context_package: pkg });
  const seen = new Set();
  array(prose.action_options).forEach((option, optionIndex) => {
    const path = `narrator_starting_prose.action_options[${optionIndex}]`;
    if (!isObject(option)) { concerns.push(issue('STAGE23_ACTION_OPTION_INVALID', 'Action option must be an object.', path)); return; }
    if (!text(option.option_id) || seen.has(option.option_id)) concerns.push(issue('STAGE23_ACTION_OPTION_ID_INVALID', 'option_id must be non-empty and unique.', `${path}.option_id`));
    else seen.add(option.option_id);
    if (!text(option.label)) concerns.push(issue('STAGE23_ACTION_LABEL_MISSING', 'Action option label is required.', `${path}.label`));
    if (!STAGE22_ALLOWED_ACTION_KINDS.includes(option.action_kind)) concerns.push(issue('STAGE23_ACTION_KIND_INVALID', 'action_kind is outside the allowed enum.', `${path}.action_kind`));
    if (!STAGE22_ALLOWED_BASES.includes(option.basis)) concerns.push(issue('STAGE23_ACTION_BASIS_INVALID', 'basis is outside the allowed enum.', `${path}.basis`));
    if (!STAGE22_ALLOWED_RISK_HINTS.includes(option.risk_hint)) concerns.push(issue('STAGE23_ACTION_RISK_INVALID', 'risk_hint is outside the allowed enum.', `${path}.risk_hint`));
    if (option.must_not_reveal_hidden_truth !== true) concerns.push(issue('STAGE23_ACTION_HIDDEN_GUARD_MISSING', 'must_not_reveal_hidden_truth must be true.', `${path}.must_not_reveal_hidden_truth`));
    validateTargetRef(option.target_ref, `${path}.target_ref`, index, concerns);
  });
  array(prose.used_visible_context_refs).forEach((ref, indexNo) => {
    const value = typeof ref === 'string' ? ref : ref?.ref_id ?? ref?.source_ref;
    if (!text(value) || !index.allVisibleRefs.has(value)) concerns.push(issue('STAGE23_USED_REF_UNKNOWN', 'used_visible_context_ref must exist in visible context.', `narrator_starting_prose.used_visible_context_refs[${indexNo}]`));
  });
  if (text(prose.prose)) for (const pattern of TECHNICAL_TEXT_PATTERNS) if (pattern.test(prose.prose)) concerns.push(issue('STAGE23_TECHNICAL_TEXT_PRESENT', 'Prose contains technical pipeline/debug language.', 'narrator_starting_prose.prose'));
  const forbiddenRefs = extractRefs(pkg?.visible_scene_dossier?.must_not_include);
  const usedRefs = new Set(array(prose.used_visible_context_refs).map((entry) => typeof entry === 'string' ? entry : entry?.ref_id ?? entry?.source_ref).filter(text));
  for (const ref of forbiddenRefs) if (usedRefs.has(ref)) concerns.push(issue('STAGE23_MUST_NOT_INCLUDE_REF_USED', 'A must_not_include reference appears in used_visible_context_refs.', 'narrator_starting_prose.used_visible_context_refs'));
  return dedupe(concerns);
}

function validateTargetRef(targetRef, path, index, concerns) {
  if (!isObject(targetRef)) { concerns.push(issue('STAGE23_ACTION_TARGET_INVALID', 'target_ref must be an object.', path)); return; }
  const fields = ['anchor_id', 'npc_instance_id', 'item_instance_id', 'container_instance_id'];
  const populated = fields.filter((key) => text(targetRef[key]));
  if (populated.length > 1) concerns.push(issue('STAGE23_ACTION_TARGET_AMBIGUOUS', 'target_ref may populate at most one id.', path));
  if (populated.length === 0) return;
  const key = populated[0];
  const value = targetRef[key];
  const set = key === 'anchor_id' ? index.anchors : key === 'npc_instance_id' ? index.npcs : key === 'item_instance_id' ? index.items : index.containers;
  if (!set.has(value)) concerns.push(issue('STAGE23_ACTION_TARGET_NOT_VISIBLE', 'Action target is absent from visible context.', `${path}.${key}`));
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

function hasFormatOnlyFailures(concerns) {
  if (!array(concerns).length) return false;
  const formatCodes = new Set([
    'STAGE23_AUDIT_INVALID_JSON', 'STAGE23_AUDIT_INVALID', 'STAGE23_AUDIT_SCHEMA_MISMATCH',
    'STAGE23_AUDIT_CHECKS_MISSING', 'STAGE23_AUDIT_CHECK_INVALID', 'STAGE23_AUDIT_CONCERNS_INVALID',
    'STAGE23_AUDIT_EVIDENCE_MISSING', 'STAGE23_AUDIT_EVIDENCE_INVALID', 'STAGE23_AUDIT_PERMISSION_MISSING'
  ]);
  return concerns.every((item) => formatCodes.has(item.code));
}

function validateAuditFormatPreservation(original, repaired) {
  if (!isObject(original) || !isObject(repaired)) return [];
  const concerns = [];
  for (const field of ['pass', 'checks', 'concerns', 'evidence', 'commit_permission']) {
    if (!(field in original)) continue;
    if (!deepEqual(original[field], repaired[field])) concerns.push(issue('STAGE23_FORMAT_REPAIR_SEMANTIC_CHANGE', `Audit format repair must preserve existing ${field}.`, field));
  }
  return concerns;
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

function extractRefs(entries) {
  return array(entries).map((entry) => typeof entry === 'string' ? entry : entry?.source_ref ?? entry?.ref_id ?? entry?.visible_context_ref).filter(text);
}
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function stripJsonFence(value) { return String(value).trim().replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, ''); }
function issue(code, message, field) { return { code, severity: 'hard_block', message, field }; }
function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function array(value) { return Array.isArray(value) ? value : []; }
function safeClone(value) { try { return structuredClone(value); } catch { return null; } }
function deepEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => deepEqual(item, right[index]));
  if (isObject(left) || isObject(right)) {
    if (!isObject(left) || !isObject(right)) return false;
    const a = Object.keys(left).sort(); const b = Object.keys(right).sort();
    return a.length === b.length && a.every((key, index) => key === b[index] && deepEqual(left[key], right[key]));
  }
  return false;
}
function dedupe(items) { const seen = new Set(); return items.filter((item) => { const key = `${item.code}|${item.field}|${item.message}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function walk(value, visitor, path = 'root') { if (value == null || typeof value !== 'object') return; if (Array.isArray(value)) { value.forEach((child, index) => walk(child, visitor, `${path}[${index}]`)); return; } for (const [key, child] of Object.entries(value)) { visitor(key, child, `${path}.${key}`); walk(child, visitor, `${path}.${key}`); } }
function findForbiddenKeys(value, forbidden) { const paths = []; walk(value, (key, child, path) => { if (forbidden.has(key) && child != null) paths.push(path); }); return paths; }
