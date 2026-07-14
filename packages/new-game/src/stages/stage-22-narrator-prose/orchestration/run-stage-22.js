import { STAGE22_OUTPUT_SCHEMA, STAGE22_RESULT_SCHEMA } from '../policy/constants.js';
import { validateStage22Input } from '../input/input-boundary.js';
import { buildStage22ReferenceIndex } from '../references/reference-index.js';
import { buildNarratorStartCodePrecheck } from '../precheck/build-precheck.js';
import { validateNarratorStartingProseOutput } from '../validation/output-validation.js';
import { array, deepEqual, isObject, issue, safeClone, stripJsonFence } from '../shared/utils.js';

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
