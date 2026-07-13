import { computeVisibleContextPackageDigest } from './visible-context-digest.js';

export const STAGE22_INPUT_SCHEMA = 'narrator_start_input';
export const STAGE22_OUTPUT_SCHEMA = 'narrator_starting_prose';
export const STAGE22_PRECHECK_SCHEMA = 'narrator_start_code_precheck';
export const STAGE22_RESULT_SCHEMA = 'stage22_narrator_prose_result';
export const STAGE22_APPROVAL_SCHEMA = 'visible_context_audit_approval';

export const STAGE22_ALLOWED_STATUSES = Object.freeze(['drafted', 'blocked', 'requires_repair']);
export const STAGE22_ALLOWED_ACTION_KINDS = Object.freeze(['move', 'inspect', 'ask', 'listen', 'wait', 'take', 'open', 'rest', 'warm_up', 'hide', 'trade', 'other']);
export const STAGE22_ALLOWED_BASES = Object.freeze(['visible', 'audible', 'known', 'inferred']);
export const STAGE22_ALLOWED_RISK_HINTS = Object.freeze(['none', 'low', 'medium', 'high', 'unknown']);
export const STAGE22_ALLOWED_BLOCK_REASONS = Object.freeze(['visible_context_audit_not_passed', 'narrator_input_invalid', 'no_visible_context', 'policy_conflict']);

export const DEFAULT_STAGE22_NARRATOR_POLICY = Object.freeze({
  write_only_from_visible_context_package: true,
  do_not_add_new_world_facts: true,
  do_not_reveal_hidden_state: true,
  do_not_explain_private_motives: true,
  do_not_reveal_closed_container_contents: true,
  do_not_reveal_future_events: true,
  do_not_upgrade_rumors_to_facts: true,
  do_not_upgrade_uncertainty_to_fact: true,
  do_not_change_clock_weather_light: true,
  do_not_change_position: true,
  respect_must_include: true,
  respect_must_not_include: true,
  action_options_only_from_available_actions_context: true,
  do_not_promise_action_outcomes: true,
  avoid_raw_ids_in_prose: true,
  avoid_raw_json: true,
  avoid_system_language: true,
  avoid_debug_language: true,
  output_player_facing_text: true,
  allow_action_suggestions: true,
  max_opening_paragraphs: 4,
  max_action_options: 6
});

const REQUIRED_TRUE_POLICY_FIELDS = Object.freeze(Object.entries(DEFAULT_STAGE22_NARRATOR_POLICY)
  .filter(([, value]) => value === true)
  .map(([key]) => key));

const SELF_CHECK_FIELDS = Object.freeze([
  'used_only_visible_context',
  'did_not_add_new_world_facts',
  'did_not_reveal_hidden_state',
  'preserved_time_weather_light',
  'preserved_position',
  'rumors_remain_rumors',
  'uncertainty_remains_uncertain'
]);

const FORBIDDEN_INPUT_KEYS = new Set([
  'full_hidden_scene_state',
  'full_hidden_state_audit',
  'character_knowledge_map',
  'character_knowledge_map_audit',
  'repair_history',
  'audit_history',
  'diagnostics',
  'world_base',
  'pipeline_context',
  'stage_outputs'
]);

const FORBIDDEN_OUTPUT_KEYS = new Set([
  'full_hidden_scene_state',
  'character_knowledge_map',
  'repair_history',
  'audit_history',
  'visible_context_package',
  'visible_context_audit',
  'pipeline_context',
  'stage_outputs'
]);

const TECHNICAL_TEXT_PATTERNS = Object.freeze([
  /\bfull_hidden_scene_state\b/iu,
  /\bcharacter_knowledge_map\b/iu,
  /\brepair_route\b/iu,
  /\bsemantic_audit\b/iu,
  /\bdebug\b/iu,
  /\bpipeline\b/iu,
  /\bjson\b/iu,
  /\bschema\b/iu
]);

export function normalizeStage22NarratorPolicy(policy = {}) {
  const source = isObject(policy) ? policy : {};
  return Object.freeze({
    ...DEFAULT_STAGE22_NARRATOR_POLICY,
    ...source,
    max_opening_paragraphs: boundedInteger(source.max_opening_paragraphs, 1, 4, DEFAULT_STAGE22_NARRATOR_POLICY.max_opening_paragraphs),
    max_action_options: boundedInteger(source.max_action_options, 0, 6, DEFAULT_STAGE22_NARRATOR_POLICY.max_action_options)
  });
}

export function buildStage21Approval(stage21Result) {
  const result = isObject(stage21Result) ? stage21Result : {};
  const audit = isObject(result.visible_context_audit) ? result.visible_context_audit : {};
  return {
    version: 1,
    schema: STAGE22_APPROVAL_SCHEMA,
    request_id: result.request_id ?? audit.request_id ?? null,
    pass: result.pass === true && audit.pass === true,
    visible_context_package_digest: result.visible_context_package_digest ?? audit.visible_context_package_digest ?? null,
    commit_permission: {
      can_send_to_narrator: result.commit_permission?.can_send_to_narrator === true,
      can_write_visible_context_snapshot: result.commit_permission?.can_write_visible_context_snapshot === true,
      can_generate_player_facing_prose: result.commit_permission?.can_generate_player_facing_prose === true
    }
  };
}

export function buildStage22NarratorInput(values = {}) {
  const source = isObject(values) ? values : {};
  const visibleContextPackage = source.visible_context_package ?? source.stage20_result?.visible_context_package ?? null;
  const digest = source.visible_context_package_digest
    ?? source.stage20_result?.visible_context_package_digest
    ?? (isObject(visibleContextPackage) ? computeVisibleContextPackageDigest(visibleContextPackage) : null);
  const approval = source.visible_context_approval
    ?? buildStage21Approval(source.stage21_result ?? source.visible_context_audit_result ?? {});
  return {
    version: 1,
    schema: STAGE22_INPUT_SCHEMA,
    request_id: source.request_id ?? visibleContextPackage?.request_id ?? approval?.request_id ?? null,
    visible_context_package: safeClone(visibleContextPackage),
    visible_context_package_digest: digest,
    visible_context_approval: safeClone(approval),
    narrator_policy: normalizeStage22NarratorPolicy(source.narrator_policy ?? source.policy ?? {})
  };
}

export function validateStage22Input(input) {
  const concerns = [];
  if (!isObject(input)) return [issue('NARRATOR_INPUT_INVALID', 'Stage 22 input must be an object.', 'root')];
  if (input.version !== 1 || input.schema !== STAGE22_INPUT_SCHEMA) concerns.push(issue('NARRATOR_INPUT_SCHEMA_MISMATCH', `Expected ${STAGE22_INPUT_SCHEMA} version 1.`, 'schema'));
  if (!text(input.request_id)) concerns.push(issue('NARRATOR_INPUT_REQUEST_ID_MISSING', 'request_id is required.', 'request_id'));
  const forbiddenPaths = findForbiddenKeys(input, FORBIDDEN_INPUT_KEYS);
  for (const path of forbiddenPaths) concerns.push(issue('NARRATOR_INPUT_FORBIDDEN_FIELD', 'Stage 22 input contains a forbidden upstream/internal field.', path));

  const pkg = input.visible_context_package;
  if (!isObject(pkg) || pkg.version !== 1 || pkg.schema !== 'visible_context_package') concerns.push(issue('NARRATOR_VISIBLE_CONTEXT_INVALID', 'visible_context_package must be visible_context_package version 1.', 'visible_context_package'));
  if (isObject(pkg) && pkg.visible_context_status !== 'formed') concerns.push(issue('NARRATOR_VISIBLE_CONTEXT_NOT_FORMED', 'visible_context_status must be formed.', 'visible_context_package.visible_context_status'));
  if (isObject(pkg) && text(pkg.request_id) && pkg.request_id !== input.request_id) concerns.push(issue('NARRATOR_REQUEST_ID_MISMATCH', 'visible_context_package.request_id must match input request_id.', 'visible_context_package.request_id'));
  const digest = isObject(pkg) ? computeVisibleContextPackageDigest(pkg) : null;
  if (!text(input.visible_context_package_digest) || input.visible_context_package_digest !== digest) concerns.push(issue('NARRATOR_VISIBLE_CONTEXT_DIGEST_MISMATCH', 'visible_context_package digest mismatch.', 'visible_context_package_digest'));

  const approval = input.visible_context_approval;
  if (!isObject(approval) || approval.version !== 1 || approval.schema !== STAGE22_APPROVAL_SCHEMA) concerns.push(issue('NARRATOR_APPROVAL_INVALID', `visible_context_approval must be ${STAGE22_APPROVAL_SCHEMA} version 1.`, 'visible_context_approval'));
  if (isObject(approval)) {
    if (approval.request_id !== input.request_id) concerns.push(issue('NARRATOR_APPROVAL_REQUEST_ID_MISMATCH', 'Approval request_id must match input request_id.', 'visible_context_approval.request_id'));
    if (approval.pass !== true) concerns.push(issue('NARRATOR_APPROVAL_NOT_PASSED', 'Stage 21 approval must pass.', 'visible_context_approval.pass'));
    if (approval.visible_context_package_digest !== digest) concerns.push(issue('NARRATOR_APPROVAL_DIGEST_MISMATCH', 'Approval digest must match visible context digest.', 'visible_context_approval.visible_context_package_digest'));
    for (const key of ['can_send_to_narrator', 'can_write_visible_context_snapshot', 'can_generate_player_facing_prose']) {
      if (approval.commit_permission?.[key] !== true) concerns.push(issue('NARRATOR_APPROVAL_PERMISSION_DENIED', `visible_context_approval.commit_permission.${key} must be true.`, `visible_context_approval.commit_permission.${key}`));
    }
  }

  requireObject(concerns, pkg?.frame, 'visible_context_package.frame', 'NARRATOR_FRAME_MISSING');
  requireObject(concerns, pkg?.frame?.clock, 'visible_context_package.frame.clock', 'NARRATOR_CLOCK_MISSING');
  requireObject(concerns, pkg?.frame?.weather_state, 'visible_context_package.frame.weather_state', 'NARRATOR_WEATHER_MISSING');
  requireObject(concerns, pkg?.position, 'visible_context_package.position', 'NARRATOR_POSITION_MISSING');
  requireObject(concerns, pkg?.narrator_scope, 'visible_context_package.narrator_scope', 'NARRATOR_SCOPE_MISSING');
  requireObject(concerns, pkg?.visible_scene_dossier, 'visible_context_package.visible_scene_dossier', 'NARRATOR_DOSSIER_MISSING');
  if (!Array.isArray(pkg?.visible_scene_dossier?.must_include)) concerns.push(issue('NARRATOR_MUST_INCLUDE_MISSING', 'visible_scene_dossier.must_include must be an array.', 'visible_context_package.visible_scene_dossier.must_include'));
  if (!Array.isArray(pkg?.visible_scene_dossier?.must_not_include)) concerns.push(issue('NARRATOR_MUST_NOT_INCLUDE_MISSING', 'visible_scene_dossier.must_not_include must be an array.', 'visible_context_package.visible_scene_dossier.must_not_include'));
  if (!Array.isArray(pkg?.available_actions_context)) concerns.push(issue('NARRATOR_AVAILABLE_ACTIONS_INVALID', 'available_actions_context must be an array.', 'visible_context_package.available_actions_context'));

  const policy = input.narrator_policy;
  if (!isObject(policy)) concerns.push(issue('NARRATOR_POLICY_INVALID', 'narrator_policy is required.', 'narrator_policy'));
  for (const key of REQUIRED_TRUE_POLICY_FIELDS) if (policy?.[key] !== true) concerns.push(issue('NARRATOR_POLICY_WEAKENED', `narrator_policy.${key} must be true.`, `narrator_policy.${key}`));
  if (!Number.isInteger(policy?.max_opening_paragraphs) || policy.max_opening_paragraphs < 1 || policy.max_opening_paragraphs > 4) concerns.push(issue('NARRATOR_POLICY_LIMIT_INVALID', 'max_opening_paragraphs must be an integer from 1 to 4.', 'narrator_policy.max_opening_paragraphs'));
  if (!Number.isInteger(policy?.max_action_options) || policy.max_action_options < 0 || policy.max_action_options > 6) concerns.push(issue('NARRATOR_POLICY_LIMIT_INVALID', 'max_action_options must be an integer from 0 to 6.', 'narrator_policy.max_action_options'));
  return dedupe(concerns);
}

export function buildStage22ReferenceIndex(input) {
  const pkg = input?.visible_context_package ?? {};
  const anchors = new Set(array(pkg.visible_anchors).map((item) => item?.anchor_id).filter(text));
  const exits = new Set(array(pkg.visible_exits).flatMap((item) => [item?.g5_edge_id, item?.edge_id, item?.route_id, item?.from_anchor_id, item?.to_anchor_id]).filter(text));
  const npcs = new Set(array(pkg.visible_npcs).map((item) => item?.npc_instance_id).filter(text));
  const items = new Set(array(pkg.visible_items).map((item) => item?.item_instance_id).filter(text));
  const containers = new Set(array(pkg.visible_containers).map((item) => item?.container_instance_id).filter(text));
  const actions = new Map();
  for (const action of array(pkg.available_actions_context)) if (text(action?.action_id)) actions.set(action.action_id, safeClone(action));
  const allVisibleRefs = new Set([...anchors, ...exits, ...npcs, ...items, ...containers, ...actions.keys()]);
  walk(pkg, (key, value) => {
    if ((key === 'visible_fact_id' || key === 'context_id' || key === 'source_id' || key === 'requirement_id') && text(value)) allVisibleRefs.add(value);
  });
  return {
    anchors, exits, npcs, items, containers, actions, allVisibleRefs,
    summary: {
      anchor_ids: sorted(anchors), exit_ids: sorted(exits), npc_ids: sorted(npcs), item_ids: sorted(items), container_ids: sorted(containers), action_ids: sorted(new Set(actions.keys()))
    }
  };
}

export function buildNarratorStartCodePrecheck(input, referenceIndex = buildStage22ReferenceIndex(input)) {
  const inputConcerns = validateStage22Input(input);
  const actionConcerns = validateAvailableActions(input?.visible_context_package?.available_actions_context, referenceIndex);
  const concerns = dedupe([...inputConcerns, ...actionConcerns]);
  const checks = {
    input_schema_valid: inputConcerns.every((item) => !['NARRATOR_INPUT_INVALID', 'NARRATOR_INPUT_SCHEMA_MISMATCH'].includes(item.code)),
    request_id_match: !concerns.some((item) => item.code.includes('REQUEST_ID')),
    visible_context_package_present: isObject(input?.visible_context_package),
    visible_context_package_schema_valid: input?.visible_context_package?.schema === 'visible_context_package' && input?.visible_context_package?.version === 1,
    visible_context_package_digest_valid: !concerns.some((item) => item.code.includes('DIGEST')),
    visible_context_approval_valid: !concerns.some((item) => item.code.startsWith('NARRATOR_APPROVAL')),
    visible_context_audit_passed: input?.visible_context_approval?.pass === true,
    can_send_to_narrator: input?.visible_context_approval?.commit_permission?.can_send_to_narrator === true,
    can_generate_player_facing_prose: input?.visible_context_approval?.commit_permission?.can_generate_player_facing_prose === true,
    frame_present: isObject(input?.visible_context_package?.frame),
    clock_present: isObject(input?.visible_context_package?.frame?.clock),
    weather_present: isObject(input?.visible_context_package?.frame?.weather_state),
    position_present: isObject(input?.visible_context_package?.position),
    narrator_scope_present: isObject(input?.visible_context_package?.narrator_scope),
    visible_scene_dossier_present: isObject(input?.visible_context_package?.visible_scene_dossier),
    must_include_present: Array.isArray(input?.visible_context_package?.visible_scene_dossier?.must_include),
    must_not_include_present: Array.isArray(input?.visible_context_package?.visible_scene_dossier?.must_not_include),
    available_actions_context_valid: Array.isArray(input?.visible_context_package?.available_actions_context),
    action_target_refs_valid: actionConcerns.length === 0,
    narrator_policy_valid: !concerns.some((item) => item.code.startsWith('NARRATOR_POLICY')),
    no_hidden_inputs_present: findForbiddenKeys(input, FORBIDDEN_INPUT_KEYS).length === 0
  };
  return {
    version: 1,
    schema: STAGE22_PRECHECK_SCHEMA,
    request_id: input?.request_id ?? null,
    visible_context_package_digest: input?.visible_context_package_digest ?? null,
    pass: concerns.length === 0 && Object.values(checks).every(Boolean),
    checks,
    concerns,
    evidence: concerns.length === 0
      ? ['Stage 22 exact input validated', 'visible context digest and Stage 21 approval match', 'narrator policy and action references validated']
      : concerns.map((item) => `${item.code}:${item.field}`)
  };
}

export function validateNarratorStartingProseOutput(output, input, precheck, referenceIndex = buildStage22ReferenceIndex(input)) {
  const concerns = [];
  if (!isObject(output)) return [issue('NARRATOR_PROSE_INVALID_JSON', 'Narrator output must be a JSON object.', 'root')];
  if (output.version !== 1 || output.schema !== STAGE22_OUTPUT_SCHEMA) concerns.push(issue('NARRATOR_PROSE_SCHEMA_MISMATCH', `Expected ${STAGE22_OUTPUT_SCHEMA} version 1.`, 'schema'));
  if (output.request_id !== input?.request_id) concerns.push(issue('NARRATOR_PROSE_REQUEST_ID_MISMATCH', 'Narrator output request_id must match input.', 'request_id'));
  if (!STAGE22_ALLOWED_STATUSES.includes(output.prose_status)) concerns.push(issue('NARRATOR_PROSE_STATUS_INVALID', 'prose_status is outside the allowed enum.', 'prose_status'));
  if (output.prose_status === 'drafted' && !text(output.prose)) concerns.push(issue('NARRATOR_PROSE_EMPTY', 'Drafted prose must be non-empty.', 'prose'));
  if (output.prose_status === 'blocked') {
    if (String(output.prose ?? '') !== '') concerns.push(issue('NARRATOR_BLOCKED_PROSE_NOT_EMPTY', 'Blocked output must have empty prose.', 'prose'));
    if (!STAGE22_ALLOWED_BLOCK_REASONS.includes(output.block_reason)) concerns.push(issue('NARRATOR_BLOCK_REASON_INVALID', 'Blocked output requires a valid block_reason.', 'block_reason'));
  }
  if (output.prose_status === 'requires_repair' && !text(output.prose)) concerns.push(issue('NARRATOR_REPAIR_PROSE_EMPTY', 'requires_repair output must preserve the draft prose.', 'prose'));
  if (!Array.isArray(output.action_options)) concerns.push(issue('NARRATOR_ACTION_OPTIONS_INVALID', 'action_options must be an array.', 'action_options'));
  if (!Array.isArray(output.used_visible_context_refs)) concerns.push(issue('NARRATOR_USED_REFS_INVALID', 'used_visible_context_refs must be an array.', 'used_visible_context_refs'));
  if (!isObject(output.self_constraints_check)) concerns.push(issue('NARRATOR_SELF_CHECK_MISSING', 'self_constraints_check is required.', 'self_constraints_check'));

  const maxActions = input?.narrator_policy?.max_action_options ?? 6;
  if (array(output.action_options).length > maxActions) concerns.push(issue('NARRATOR_ACTION_LIMIT_EXCEEDED', `At most ${maxActions} action options are allowed.`, 'action_options'));
  const seenOptions = new Set();
  array(output.action_options).forEach((option, index) => validateActionOption(option, index, concerns, referenceIndex, seenOptions));

  array(output.used_visible_context_refs).forEach((ref, index) => {
    const value = typeof ref === 'string' ? ref : ref?.ref_id ?? ref?.source_ref;
    if (!text(value) || !referenceIndex.allVisibleRefs.has(value)) concerns.push(issue('NARRATOR_USED_REF_UNKNOWN', 'used_visible_context_ref must exist in visible_context_package.', `used_visible_context_refs[${index}]`));
  });

  const mandatoryRefs = extractMandatoryRefs(input?.visible_context_package?.visible_scene_dossier?.must_include);
  const usedRefs = new Set(array(output.used_visible_context_refs).map((item) => typeof item === 'string' ? item : item?.ref_id ?? item?.source_ref).filter(text));
  for (const ref of mandatoryRefs) if (!usedRefs.has(ref)) concerns.push(issue('NARRATOR_MUST_INCLUDE_REF_MISSING', 'A mandatory visible-context reference was not declared as used.', 'used_visible_context_refs', ref));

  for (const field of SELF_CHECK_FIELDS) {
    if (typeof output.self_constraints_check?.[field] !== 'boolean') concerns.push(issue('NARRATOR_SELF_CHECK_FIELD_MISSING', `self_constraints_check.${field} must be boolean.`, `self_constraints_check.${field}`));
    if (output.prose_status === 'drafted' && output.self_constraints_check?.[field] !== true) concerns.push(issue('NARRATOR_SELF_CHECK_FAILED', `Drafted prose requires self_constraints_check.${field}=true.`, `self_constraints_check.${field}`));
  }

  const paragraphs = paragraphCount(output.prose);
  if (output.prose_status === 'drafted' && paragraphs > (input?.narrator_policy?.max_opening_paragraphs ?? 4)) concerns.push(issue('NARRATOR_PARAGRAPH_LIMIT_EXCEEDED', 'Prose exceeds max_opening_paragraphs.', 'prose'));
  if (text(output.prose)) for (const pattern of TECHNICAL_TEXT_PATTERNS) if (pattern.test(output.prose)) concerns.push(issue('NARRATOR_TECHNICAL_TEXT_PRESENT', 'Prose contains technical pipeline/debug language.', 'prose'));
  for (const path of findForbiddenKeys(output, FORBIDDEN_OUTPUT_KEYS)) concerns.push(issue('NARRATOR_OUTPUT_FORBIDDEN_FIELD', 'Narrator output contains a forbidden field.', path));
  if (precheck?.pass !== true) concerns.push(issue('NARRATOR_PRECHECK_NOT_PASSED', 'narrator_start_code_precheck must pass before accepting prose.', 'precheck.pass'));
  return dedupe(concerns);
}

export async function runStage22NarratorProseBlock({ input, writer, formatRepairer, seniorWriter } = {}) {
  const inputConcerns = validateStage22Input(input);
  if (inputConcerns.length > 0) throw stage22Error('Stage 22 input gate failed.', inputConcerns, { failed_gate: 'stage22_input_gate', input_snapshot: safeClone(input), terminal: true });
  for (const [name, callback] of Object.entries({ writer, formatRepairer, seniorWriter })) if (typeof callback !== 'function') throw new Error(`Stage 22 requires ${name} callback.`);
  const referenceIndex = buildStage22ReferenceIndex(input);
  const precheck = buildNarratorStartCodePrecheck(input, referenceIndex);
  if (precheck.pass !== true) throw stage22Error('Stage 22 code precheck failed.', precheck.concerns, { failed_gate: 'stage22_code_precheck', narrator_start_code_precheck: precheck, terminal: true });

  const history = [];
  const diagnostics = { writer_attempts: 0, format_repair_attempts: 0, senior_writer_attempts: 0, semantic_repair_attempts: 0, last_error_codes: [] };
  let candidate = await callRole(writer, buildWriterRoleInput(input, precheck, referenceIndex.summary), 'NarratorStartingProseWriter');
  diagnostics.writer_attempts += 1;
  let parsed;
  try {
    parsed = await normalizeWriterFormat(candidate, input, formatRepairer, history, diagnostics);
  } catch (firstFormatError) {
    const retry = await callRole(writer, { ...buildWriterRoleInput(input, precheck, referenceIndex.summary), previous_format_errors: safeClone(firstFormatError?.lifecycle?.concerns ?? []), constraints: { output_strict_json: true, use_only_visible_context_package: true } }, 'NarratorStartingProseWriter');
    diagnostics.writer_attempts += 1;
    history.push({ attempt_index: history.length + 1, kind: 'writer_retry_after_format_failure', role: 'NarratorStartingProseWriter' });
    try {
      parsed = await normalizeWriterFormat(retry, input, formatRepairer, history, diagnostics);
    } catch (secondFormatError) {
      const senior = await callRole(seniorWriter, { ...buildWriterRoleInput(input, precheck, referenceIndex.summary), schema: 'senior_narrator_start_writer_request', failed_writer_output: safeClone(retry), validation_errors: safeClone(secondFormatError?.lifecycle?.concerns ?? []) }, 'SeniorNarratorStartingProseWriter');
      diagnostics.senior_writer_attempts += 1;
      history.push({ attempt_index: history.length + 1, kind: 'senior_writer_after_format_failure', role: 'SeniorNarratorStartingProseWriter' });
      parsed = await normalizeWriterFormat(senior, input, formatRepairer, history, diagnostics);
    }
  }

  let concerns = validateNarratorStartingProseOutput(parsed.value, input, precheck, referenceIndex);
  if (concerns.length > 0) {
    const senior = await callRole(seniorWriter, { ...buildWriterRoleInput(input, precheck, referenceIndex.summary), schema: 'senior_narrator_start_writer_request', failed_writer_output: safeClone(parsed.value), validation_errors: safeClone(concerns), constraints: { use_only_visible_context_package: true, do_not_add_world_facts: true, preserve_request_id: true } }, 'SeniorNarratorStartingProseWriter');
    diagnostics.senior_writer_attempts += 1;
    history.push({ attempt_index: history.length + 1, kind: 'senior_writer', role: 'SeniorNarratorStartingProseWriter', issue_codes: concerns.map((item) => item.code) });
    parsed = await normalizeWriterFormat(senior, input, formatRepairer, history, diagnostics);
    concerns = validateNarratorStartingProseOutput(parsed.value, input, precheck, referenceIndex);
  }
  if (concerns.length > 0) {
    diagnostics.last_error_codes = concerns.map((item) => item.code);
    throw stage22Error('Stage 22 output validation failed.', concerns, { failed_gate: 'stage22_output_validation', narrator_start_code_precheck: precheck, failed_output: safeClone(parsed.value), generation_history: history, terminal: true });
  }
  return buildStage22Result(input, precheck, parsed.value, history, diagnostics);
}

export async function runStage22SemanticRepairBlock({ input, failedResult, proseAudit, semanticRepairer, formatRepairer, seniorRepairer } = {}) {
  const inputConcerns = validateStage22Input(input);
  if (inputConcerns.length > 0) throw stage22Error('Stage 22 repair input gate failed.', inputConcerns, { failed_gate: 'stage22_repair_input_gate', terminal: true });
  for (const [name, callback] of Object.entries({ semanticRepairer, formatRepairer, seniorRepairer })) if (typeof callback !== 'function') throw new Error(`Stage 22 semantic repair requires ${name} callback.`);
  const failedProse = failedResult?.narrator_starting_prose ?? failedResult;
  if (!isObject(failedProse) || failedProse.schema !== STAGE22_OUTPUT_SCHEMA) throw stage22Error('Stage 22 semantic repair requires a prior narrator draft.', [issue('NARRATOR_REPAIR_BASELINE_INVALID', 'Prior narrator_starting_prose is required.', 'failedResult')], { terminal: true });
  if (!isObject(proseAudit) || proseAudit.schema !== 'narrator_prose_audit' || proseAudit.pass !== false || !array(proseAudit.concerns).length || !array(proseAudit.evidence).length) throw stage22Error('Stage 22 semantic repair requires a failed Stage 23 audit with concerns and evidence.', [issue('NARRATOR_REPAIR_AUDIT_INVALID', 'Failed Stage 23 audit is required.', 'proseAudit')], { terminal: true });

  const referenceIndex = buildStage22ReferenceIndex(input);
  const precheck = buildNarratorStartCodePrecheck(input, referenceIndex);
  if (precheck.pass !== true) throw stage22Error('Stage 22 repair precheck failed.', precheck.concerns, { failed_gate: 'stage22_repair_precheck', narrator_start_code_precheck: precheck, terminal: true });
  const history = array(failedResult?.generation_history).map(safeClone);
  const diagnostics = { ...(failedResult?.diagnostics ?? {}), semantic_repair_attempts: (failedResult?.diagnostics?.semantic_repair_attempts ?? 0) + 1, format_repair_attempts: failedResult?.diagnostics?.format_repair_attempts ?? 0, senior_writer_attempts: failedResult?.diagnostics?.senior_writer_attempts ?? 0, writer_attempts: failedResult?.diagnostics?.writer_attempts ?? 0, last_error_codes: [] };
  const repairInput = {
    version: 1,
    schema: 'narrator_prose_semantic_repair_input',
    request_id: input.request_id,
    narrator_start_input: safeClone(input),
    failed_narrator_starting_prose: safeClone(failedProse),
    prose_audit_concerns: safeClone(proseAudit.concerns),
    prose_audit_evidence: safeClone(proseAudit.evidence),
    repair_route: safeClone(proseAudit.repair_route ?? null),
    allowed_mutable_paths: ['prose', 'action_options', 'used_visible_context_refs', 'self_constraints_check', 'prose_status', 'block_reason'],
    forbidden_mutable_paths: ['visible_context_package', 'visible_context_package_digest', 'visible_context_approval', 'narrator_policy'],
    previous_repair_history: safeClone(history),
    constraints: { use_only_visible_context_package: true, do_not_add_world_facts: true, do_not_read_hidden_state: true, preserve_request_id: true }
  };
  let candidate = await callRole(semanticRepairer, repairInput, 'NarratorProseSemanticRepairer');
  history.push({ attempt_index: history.length + 1, kind: 'semantic_repair', role: 'NarratorProseSemanticRepairer', issue_codes: array(proseAudit.concerns).map((item) => item?.code).filter(Boolean) });
  let parsed = await normalizeWriterFormat(candidate, input, formatRepairer, history, diagnostics);
  let concerns = validateNarratorStartingProseOutput(parsed.value, input, precheck, referenceIndex);
  if (concerns.length > 0) {
    const senior = await callRole(seniorRepairer, { ...repairInput, schema: 'senior_narrator_prose_semantic_repair_input', failed_repair_output: safeClone(parsed.value), repair_validation_errors: safeClone(concerns) }, 'SeniorNarratorProseSemanticRepairer');
    diagnostics.senior_writer_attempts += 1;
    history.push({ attempt_index: history.length + 1, kind: 'senior_semantic_repair', role: 'SeniorNarratorProseSemanticRepairer', issue_codes: concerns.map((item) => item.code) });
    parsed = await normalizeWriterFormat(senior, input, formatRepairer, history, diagnostics);
    concerns = validateNarratorStartingProseOutput(parsed.value, input, precheck, referenceIndex);
  }
  if (concerns.length > 0) {
    diagnostics.last_error_codes = concerns.map((item) => item.code);
    throw stage22Error('Stage 22 semantic repair validation failed.', concerns, { failed_gate: 'stage22_semantic_repair_validation', narrator_start_code_precheck: precheck, failed_output: safeClone(parsed.value), generation_history: history, terminal: true });
  }
  return buildStage22Result(input, precheck, parsed.value, history, diagnostics);
}

export async function runStage22FormatRepairBlock({ input, failedResult, proseAudit, formatRepairer } = {}) {
  const inputConcerns = validateStage22Input(input);
  if (inputConcerns.length > 0) throw stage22Error('Stage 22 format repair input gate failed.', inputConcerns, { failed_gate: 'stage22_format_repair_input_gate', terminal: true });
  if (typeof formatRepairer !== 'function') throw new Error('Stage 22 format repair requires formatRepairer callback.');
  const failedProse = failedResult?.narrator_starting_prose ?? failedResult;
  if (!isObject(failedProse)) throw stage22Error('Stage 22 format repair requires a prior narrator output.', [issue('NARRATOR_FORMAT_REPAIR_BASELINE_INVALID', 'Prior narrator output is required.', 'failedResult')], { terminal: true });
  const referenceIndex = buildStage22ReferenceIndex(input);
  const precheck = buildNarratorStartCodePrecheck(input, referenceIndex);
  if (precheck.pass !== true) throw stage22Error('Stage 22 format repair precheck failed.', precheck.concerns, { failed_gate: 'stage22_format_repair_precheck', narrator_start_code_precheck: precheck, terminal: true });
  const history = array(failedResult?.generation_history).map(safeClone);
  const diagnostics = {
    ...(failedResult?.diagnostics ?? {}),
    writer_attempts: failedResult?.diagnostics?.writer_attempts ?? 0,
    format_repair_attempts: (failedResult?.diagnostics?.format_repair_attempts ?? 0) + 1,
    senior_writer_attempts: failedResult?.diagnostics?.senior_writer_attempts ?? 0,
    semantic_repair_attempts: failedResult?.diagnostics?.semantic_repair_attempts ?? 0,
    last_error_codes: []
  };
  const raw = await callRole(formatRepairer, {
    version: 1,
    schema: 'narrator_prose_format_repair_input',
    request_id: input.request_id,
    parsed_writer_response: safeClone(failedProse),
    raw_writer_response: safeClone(failedProse),
    format_errors: safeClone(proseAudit?.concerns ?? []),
    required_output_schema: STAGE22_OUTPUT_SCHEMA,
    constraints: {
      repair_json_wrapper_only: true,
      preserve_prose: true,
      preserve_action_options: true,
      preserve_used_visible_context_refs: true,
      preserve_self_constraints_check: true
    }
  }, 'NarratorProseFormatRepairer');
  history.push({ attempt_index: history.length + 1, kind: 'targeted_format_repair', role: 'NarratorProseFormatRepairer', issue_codes: array(proseAudit?.concerns).map((item) => item?.code).filter(Boolean) });
  const parsed = parseRoleResult(raw);
  if (parsed.parseError) throw stage22Error('Stage 22 targeted format repair returned invalid JSON.', [issue('NARRATOR_PROSE_INVALID_JSON', parsed.parseError, 'root')], { failed_gate: 'stage22_targeted_format_repair', terminal: true });
  const preservation = validateFormatRepairPreservation(failedProse, parsed.value);
  const concerns = [...preservation, ...validateNarratorStartingProseOutput(parsed.value, input, precheck, referenceIndex)];
  if (concerns.length > 0) {
    diagnostics.last_error_codes = concerns.map((item) => item.code);
    throw stage22Error('Stage 22 targeted format repair validation failed.', concerns, { failed_gate: 'stage22_targeted_format_repair_validation', narrator_start_code_precheck: precheck, failed_output: safeClone(parsed.value), terminal: true });
  }
  return buildStage22Result(input, precheck, parsed.value, history, diagnostics);
}

export function validateProvidedStage22Result() {
  throw new Error('Provided Stage 22 output is forbidden in production, development and tests. Stub the Stage 22 role executors instead.');
}

function buildStage22Result(input, precheck, prose, history, diagnostics) {
  const canHandoff = prose?.prose_status === 'drafted';
  return {
    version: 1,
    schema: STAGE22_RESULT_SCHEMA,
    request_id: input.request_id,
    pass: canHandoff,
    visible_context_package_digest: input.visible_context_package_digest,
    narrator_start_code_precheck: safeClone(precheck),
    narrator_starting_prose: safeClone(prose),
    generation_history: safeClone(history),
    diagnostics: safeClone(diagnostics),
    handoff_permission: { can_send_to_prose_audit: canHandoff }
  };
}

function buildWriterRoleInput(input, precheck, referenceSummary) {
  return {
    version: 1,
    schema: 'narrator_start_writer_request',
    request_id: input.request_id,
    visible_context_package: safeClone(input.visible_context_package),
    visible_context_package_digest: input.visible_context_package_digest,
    narrator_policy: safeClone(input.narrator_policy),
    output_contract: { version: 1, schema: STAGE22_OUTPUT_SCHEMA },
    constraints: { output_strict_json: true, use_only_visible_context_package: true, do_not_add_world_facts: true, do_not_read_hidden_state: true, do_not_include_audit_or_debug_text: true }
  };
}

async function normalizeWriterFormat(result, input, formatRepairer, history, diagnostics) {
  const parsed = parseRoleResult(result);
  const formatConcerns = parsed.parseError ? [issue('NARRATOR_PROSE_INVALID_JSON', parsed.parseError, 'root')] : validateWriterFormatOnly(parsed.value);
  if (formatConcerns.length === 0) return parsed;
  const repaired = await callRole(formatRepairer, {
    version: 1,
    schema: 'narrator_prose_format_repair_input',
    request_id: input.request_id,
    raw_writer_response: parsed.raw,
    parsed_writer_response: safeClone(parsed.value),
    parse_errors: safeClone(formatConcerns),
    required_schema: STAGE22_OUTPUT_SCHEMA,
    constraints: { change_format_only: true, do_not_rewrite_prose_semantically: true, do_not_add_or_remove_world_facts: true, do_not_change_action_options_semantically: true, preserve_request_id: true }
  }, 'NarratorProseFormatRepairer');
  diagnostics.format_repair_attempts = (diagnostics.format_repair_attempts ?? 0) + 1;
  history.push({ attempt_index: history.length + 1, kind: 'format_repair', role: 'NarratorProseFormatRepairer', issue_codes: formatConcerns.map((item) => item.code) });
  const repairedParsed = parseRoleResult(repaired);
  const preservationConcerns = validateFormatRepairPreservation(parsed.value, repairedParsed.value);
  const remaining = repairedParsed.parseError
    ? [issue('NARRATOR_PROSE_INVALID_JSON', repairedParsed.parseError, 'root')]
    : [...validateWriterFormatOnly(repairedParsed.value), ...preservationConcerns];
  if (remaining.length > 0) throw stage22Error('Stage 22 format repair failed.', remaining, { failed_gate: 'stage22_format_repair', terminal: false });
  return repairedParsed;
}

function validateFormatRepairPreservation(original, repaired) {
  if (!isObject(original) || !isObject(repaired)) return [];
  const concerns = [];
  for (const field of ['prose', 'action_options', 'used_visible_context_refs', 'self_constraints_check', 'prose_status', 'block_reason']) {
    if (!(field in original)) continue;
    if (!deepEqual(original[field], repaired[field])) concerns.push(issue(
      'NARRATOR_FORMAT_REPAIR_SEMANTIC_CHANGE',
      `Format repair must preserve existing ${field}.`,
      field
    ));
  }
  return concerns;
}

function validateWriterFormatOnly(output) {
  const concerns = [];
  if (!isObject(output)) return [issue('NARRATOR_PROSE_INVALID_JSON', 'Narrator output must be an object.', 'root')];
  if (output.version !== 1 || output.schema !== STAGE22_OUTPUT_SCHEMA) concerns.push(issue('NARRATOR_PROSE_SCHEMA_MISMATCH', `Expected ${STAGE22_OUTPUT_SCHEMA} version 1.`, 'schema'));
  if (!Array.isArray(output.action_options) || !Array.isArray(output.used_visible_context_refs)) concerns.push(issue('NARRATOR_PROSE_ARRAY_INVALID', 'action_options and used_visible_context_refs must be arrays.', 'root'));
  if (!isObject(output.self_constraints_check)) concerns.push(issue('NARRATOR_SELF_CHECK_MISSING', 'self_constraints_check is required.', 'self_constraints_check'));
  return concerns;
}

function validateAvailableActions(actions, referenceIndex) {
  const concerns = [];
  array(actions).forEach((action, index) => {
    if (!isObject(action)) { concerns.push(issue('NARRATOR_AVAILABLE_ACTION_INVALID', 'Available action must be an object.', `available_actions_context[${index}]`)); return; }
    if (!text(action.action_id)) concerns.push(issue('NARRATOR_AVAILABLE_ACTION_ID_MISSING', 'Available action requires action_id.', `available_actions_context[${index}].action_id`));
    validateTargetRef(action.target_ref, `available_actions_context[${index}].target_ref`, concerns, referenceIndex, true);
  });
  return concerns;
}

function validateActionOption(option, index, concerns, referenceIndex, seenOptions) {
  const path = `action_options[${index}]`;
  if (!isObject(option)) { concerns.push(issue('NARRATOR_ACTION_OPTION_INVALID', 'Action option must be an object.', path)); return; }
  if (!text(option.option_id)) concerns.push(issue('NARRATOR_ACTION_OPTION_ID_MISSING', 'option_id is required.', `${path}.option_id`));
  else if (seenOptions.has(option.option_id)) concerns.push(issue('NARRATOR_ACTION_OPTION_ID_DUPLICATE', 'option_id must be unique.', `${path}.option_id`));
  else seenOptions.add(option.option_id);
  if (!text(option.label)) concerns.push(issue('NARRATOR_ACTION_LABEL_MISSING', 'Action label is required.', `${path}.label`));
  if (!STAGE22_ALLOWED_ACTION_KINDS.includes(option.action_kind)) concerns.push(issue('NARRATOR_ACTION_KIND_INVALID', 'action_kind is outside the allowed enum.', `${path}.action_kind`));
  if (!STAGE22_ALLOWED_BASES.includes(option.basis)) concerns.push(issue('NARRATOR_ACTION_BASIS_INVALID', 'basis is outside the allowed enum.', `${path}.basis`));
  if (!STAGE22_ALLOWED_RISK_HINTS.includes(option.risk_hint)) concerns.push(issue('NARRATOR_ACTION_RISK_HINT_INVALID', 'risk_hint is outside the allowed enum.', `${path}.risk_hint`));
  if (option.must_not_reveal_hidden_truth !== true) concerns.push(issue('NARRATOR_ACTION_HIDDEN_TRUTH_GUARD_MISSING', 'must_not_reveal_hidden_truth must be true.', `${path}.must_not_reveal_hidden_truth`));
  const target = validateTargetRef(option.target_ref, `${path}.target_ref`, concerns, referenceIndex, false);
  if (target?.id && !availableActionPermits(option, target, referenceIndex.actions)) concerns.push(issue('NARRATOR_ACTION_NOT_AVAILABLE', 'Action option target/kind is not grounded in available_actions_context.', path));
}

function validateTargetRef(targetRef, path, concerns, referenceIndex, allowMissing) {
  if (targetRef == null && allowMissing) return null;
  if (!isObject(targetRef)) { concerns.push(issue('NARRATOR_ACTION_TARGET_INVALID', 'target_ref must be an object.', path)); return null; }
  const keys = ['anchor_id', 'npc_instance_id', 'item_instance_id', 'container_instance_id'];
  const populated = keys.filter((key) => targetRef[key] != null && targetRef[key] !== '');
  if (populated.length > 1) concerns.push(issue('NARRATOR_ACTION_TARGET_AMBIGUOUS', 'target_ref may contain at most one populated target id.', path));
  if (populated.length === 0) return null;
  const key = populated[0];
  const id = targetRef[key];
  const set = key === 'anchor_id' ? referenceIndex.anchors : key === 'npc_instance_id' ? referenceIndex.npcs : key === 'item_instance_id' ? referenceIndex.items : referenceIndex.containers;
  if (!text(id) || !set.has(id)) concerns.push(issue('NARRATOR_ACTION_TARGET_NOT_VISIBLE', 'Action target must exist in visible_context_package.', `${path}.${key}`));
  return { key, id };
}

function availableActionPermits(option, target, actions) {
  for (const action of actions.values()) {
    const sourceTarget = isObject(action.target_ref) ? action.target_ref[target.key] : null;
    if (sourceTarget !== target.id) continue;
    if (text(action.action_kind) && action.action_kind !== option.action_kind) continue;
    return true;
  }
  return false;
}

function extractMandatoryRefs(mustInclude) {
  const refs = [];
  for (const entry of array(mustInclude)) {
    if (!isObject(entry)) continue;
    const ref = entry.source_ref ?? entry.ref_id ?? entry.visible_context_ref;
    if (text(ref)) refs.push(ref);
  }
  return refs;
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

function stage22Error(message, concerns = [], details = {}) {
  const error = new Error(message);
  error.name = 'Stage22NarratorProseError';
  error.concerns = safeClone(concerns);
  error.lifecycle = {
    stage_id: 22,
    stage_slug: 'narrator_prose',
    stage_type: 'isolated_llm_block',
    concerns: safeClone(concerns),
    ...safeClone(details)
  };
  return error;
}

function requireObject(concerns, value, field, code) { if (!isObject(value)) concerns.push(issue(code, `${field} is required.`, field)); }
function issue(code, message, field, expected = undefined, actual = undefined) { return { code, severity: 'hard_block', message, field, ...(expected !== undefined ? { expected } : {}), ...(actual !== undefined ? { actual } : {}) }; }
function boundedInteger(value, min, max, fallback) { return Number.isInteger(value) && value >= min && value <= max ? value : fallback; }
function paragraphCount(value) { return text(value) ? String(value).trim().split(/\n\s*\n/u).filter(Boolean).length : 0; }
function stripJsonFence(value) { return String(value).trim().replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, ''); }
function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function array(value) { return Array.isArray(value) ? value : []; }
function safeClone(value) { try { return structuredClone(value); } catch { return null; } }
function deepEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((value, index) => deepEqual(value, right[index]));
  }
  if (isObject(left) || isObject(right)) {
    if (!isObject(left) || !isObject(right)) return false;
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length || !leftKeys.every((key, index) => key === rightKeys[index])) return false;
    return leftKeys.every((key) => deepEqual(left[key], right[key]));
  }
  return false;
}
function sorted(set) { return [...set].sort(); }
function dedupe(items) { const seen = new Set(); return items.filter((item) => { const key = `${item.code}|${item.field}|${item.message}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function walk(value, visitor, path = 'root') { if (value == null || typeof value !== 'object') return; if (Array.isArray(value)) { value.forEach((child, index) => walk(child, visitor, `${path}[${index}]`)); return; } for (const [key, child] of Object.entries(value)) { visitor(key, child, `${path}.${key}`); walk(child, visitor, `${path}.${key}`); } }
function findForbiddenKeys(value, forbidden) { const paths = []; walk(value, (key, child, path) => { if (forbidden.has(key) && child != null) paths.push(path); }); return paths; }
