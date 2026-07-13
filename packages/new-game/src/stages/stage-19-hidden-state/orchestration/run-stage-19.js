import { STAGE19_OUTPUT_SCHEMA, STAGE19_AUDIT_SCHEMA, STAGE19_RESULT_SCHEMA, FORMAT_STATE_CODES, FORMAT_AUDIT_CODES } from '../policy/constants.js';
import { validateStage19Input } from '../input/input-boundary.js';
import { buildStage19ReferenceIndex } from '../references/reference-index.js';
import { buildFullHiddenStateCodePrecheck, formatOnlyStateValidation } from '../validation/state-validation.js';
import { buildFullHiddenStateAuditInput, validateFullHiddenStateAudit, classifyStage19Failure, validateStage19CommitPermission } from '../audit/audit-boundary.js';
import { array, isObject, issue, safeClone } from '../shared/utils.js';
export async function runStage19HiddenStateBlock({
  input,
  build,
  audit,
  formatRepair,
  semanticRepair,
  seniorRepair
} = {}) {
  const inputConcerns = validateStage19Input(input);
  if (inputConcerns.length > 0) {
    throw stage19Error('Stage 19 input gate failed.', inputConcerns, {
      failedGate: 'stage19_input_gate',
      input_snapshot: safeClone(input),
      terminal: true
    });
  }
  for (const [name, callback] of Object.entries({ build, audit, formatRepair, semanticRepair, seniorRepair })) {
    if (typeof callback !== 'function') throw new Error(`Stage 19 requires ${name} callback.`);
  }

  const refs = buildStage19ReferenceIndex(input);
  const repairHistory = [];
  let candidate = await callRole(build, structuredClone(input), 'FullHiddenStateBuilder');
  candidate = await normalizeStateFormat(candidate, input, formatRepair, repairHistory, 'builder');

  let lastPrecheck = null;
  let lastAudit = null;
  for (let semanticAttempt = 0; semanticAttempt <= 2; semanticAttempt += 1) {
    lastPrecheck = buildFullHiddenStateCodePrecheck(candidate.value, input, refs);
    if (lastPrecheck.pass === true) {
      let auditResult = await callRole(
        audit,
        buildFullHiddenStateAuditInput(input, candidate.value, lastPrecheck, refs),
        'FullHiddenStateAuditor'
      );
      auditResult = await normalizeAuditFormat(auditResult, input, candidate.value, lastPrecheck, formatRepair, repairHistory);
      const auditValidation = validateFullHiddenStateAudit(auditResult.value, candidate.value, lastPrecheck);
      if (auditValidation.length > 0) {
        throw stage19Error('Stage 19 audit output is invalid after format repair.', auditValidation, {
          failedGate: 'full_hidden_state_audit_contract',
          full_hidden_scene_state: safeClone(candidate.value),
          code_precheck: safeClone(lastPrecheck),
          full_hidden_state_audit: safeClone(auditResult.value),
          repair_history: safeClone(repairHistory),
          terminal: true
        });
      }
      lastAudit = auditResult.value;
      if (lastAudit.pass === true) {
        const commitPermission = validateStage19CommitPermission(candidate.value, lastPrecheck, lastAudit);
        if (!commitPermission.can_continue_to_visible_context) {
          throw stage19Error('Stage 19 commit gate denied continuation.', commitPermission.reasons.map((reason) => issue('HIDDEN_STATE_COMMIT_DENIED', reason, 'commit_permission')), {
            failedGate: 'stage19_commit_gate',
            full_hidden_scene_state: safeClone(candidate.value),
            code_precheck: safeClone(lastPrecheck),
            full_hidden_state_audit: safeClone(lastAudit),
            terminal: true
          });
        }
        return {
          version: 1,
          schema: STAGE19_RESULT_SCHEMA,
          request_id: input.request_id,
          pass: true,
          full_hidden_scene_state: structuredClone(candidate.value),
          full_hidden_state_code_precheck: structuredClone(lastPrecheck),
          full_hidden_state_audit: structuredClone(lastAudit),
          repair_history: structuredClone(repairHistory),
          diagnostics: {
            reference_index_summary: {
              npc_count: refs.npcIds.size,
              item_count: refs.itemIds.size,
              container_count: refs.containerIds.size,
              anchor_count: refs.anchorIds.size,
              g5_edge_count: refs.g5EdgeIds.size,
              graph_edge_count: refs.graphEdgeIds.size,
              route_id_count_before_commit: 0
            }
          },
          commit_permission: commitPermission
        };
      }
    }

    const semanticIssues = lastPrecheck.pass === true
      ? array(lastAudit?.concerns)
      : array(lastPrecheck.concerns);
    if (semanticAttempt >= 2) {
      throw stage19Error('Stage 19 semantic repair escalation exhausted.', semanticIssues, {
        failedGate: lastPrecheck.pass === true ? 'full_hidden_state_semantic_audit' : 'full_hidden_state_code_precheck',
        full_hidden_scene_state: safeClone(candidate.value),
        code_precheck: safeClone(lastPrecheck),
        full_hidden_state_audit: safeClone(lastAudit),
        repair_history: safeClone(repairHistory),
        terminal: true
      });
    }

    const role = semanticAttempt === 0 ? 'FullHiddenStateSemanticRepairer' : 'FullHiddenStateSeniorRepairer';
    const repair = semanticAttempt === 0 ? semanticRepair : seniorRepair;
    const repairInput = {
      version: 1,
      schema: 'full_hidden_state_semantic_repair_input',
      request_id: input.request_id,
      target: STAGE19_OUTPUT_SCHEMA,
      original_input: structuredClone(input),
      original_full_hidden_scene_state: safeClone(candidate.value),
      validationErrors: safeClone(lastPrecheck.concerns ?? []),
      audit: safeClone(lastAudit),
      audit_concerns: safeClone(lastAudit?.concerns ?? []),
      audit_evidence: safeClone(lastAudit?.evidence ?? []),
      repair_history: safeClone(repairHistory),
      forbidden_changes: [
        'new_npc', 'new_item', 'new_container', 'new_g5_anchor', 'new_graph_edge', 'new_route_id',
        'visible_scene', 'intro_prose', 'narrator_text', 'character_knowledge_map', 'clock', 'season', 'weather_state'
      ]
    };
    const repaired = await callRole(repair, repairInput, role);
    repairHistory.push({
      attempt_index: repairHistory.length + 1,
      kind: semanticAttempt === 0 ? 'semantic' : 'senior_semantic',
      role,
      source: lastPrecheck.pass === true ? 'semantic_audit' : 'code_precheck',
      issue_codes: semanticIssues.map((item) => item?.code).filter(Boolean)
    });
    candidate = await normalizeStateFormat(repaired, input, formatRepair, repairHistory, role);
    lastAudit = null;
  }

  throw stage19Error('Stage 19 failed unexpectedly.', [issue('HIDDEN_STATE_UNKNOWN_FAILURE', 'Unknown Stage 19 failure.', 'root')], { terminal: true });
}

async function normalizeStateFormat(result, input, formatRepair, repairHistory, sourceRole) {
  const parsed = isParsedRoleResult(result) ? result : parseRoleResult(result);
  let value = parsed.value;
  let validation = parsed.parseError
    ? [issue('HIDDEN_STATE_INVALID_JSON', parsed.parseError, 'root')]
    : formatOnlyStateValidation(value);
  if (validation.length === 0) return parsed;

  const repaired = await callRole(formatRepair, {
    version: 1,
    schema: 'full_hidden_state_format_repair_input',
    request_id: input.request_id,
    target: STAGE19_OUTPUT_SCHEMA,
    raw_output: parsed.raw,
    parsed_output: safeClone(value),
    validation_errors: validation,
    original_input: structuredClone(input),
    constraints: {
      change_format_only: true,
      do_not_add_hidden_facts: true,
      do_not_remove_hidden_facts: true,
      do_not_create_entities: true,
      remove_player_facing_prose: true
    }
  }, 'FullHiddenStateFormatRepairer');
  repairHistory.push({
    attempt_index: repairHistory.length + 1,
    kind: 'format',
    role: 'FullHiddenStateFormatRepairer',
    source: sourceRole,
    issue_codes: validation.map((item) => item.code)
  });
  const normalized = isParsedRoleResult(repaired) ? repaired : parseRoleResult(repaired);
  if (normalized.parseError) return normalized;
  validation = formatOnlyStateValidation(normalized.value);
  if (validation.length > 0) return { ...normalized, formatValidation: validation };
  return normalized;
}

async function normalizeAuditFormat(result, input, state, precheck, formatRepair, repairHistory) {
  const parsed = isParsedRoleResult(result) ? result : parseRoleResult(result);
  const validation = parsed.parseError
    ? [issue('HIDDEN_STATE_AUDIT_INVALID_JSON', parsed.parseError, 'audit')]
    : validateFullHiddenStateAudit(parsed.value, state, precheck);
  const formatIssues = validation.filter((item) => FORMAT_AUDIT_CODES.has(item.code));
  if (validation.length === 0 || formatIssues.length === 0) return parsed;

  const repaired = await callRole(formatRepair, {
    version: 1,
    schema: 'full_hidden_state_format_repair_input',
    request_id: input.request_id,
    target: STAGE19_AUDIT_SCHEMA,
    raw_output: parsed.raw,
    parsed_output: safeClone(parsed.value),
    validation_errors: validation,
    original_input: structuredClone(input),
    full_hidden_scene_state: structuredClone(state),
    full_hidden_state_code_precheck: structuredClone(precheck),
    constraints: {
      change_format_only: true,
      do_not_change_pass_semantics: true,
      do_not_repair_hidden_state: true
    }
  }, 'FullHiddenStateFormatRepairer');
  repairHistory.push({
    attempt_index: repairHistory.length + 1,
    kind: 'audit_format',
    role: 'FullHiddenStateFormatRepairer',
    source: 'FullHiddenStateAuditor',
    issue_codes: validation.map((item) => item.code)
  });
  return isParsedRoleResult(repaired) ? repaired : parseRoleResult(repaired);
}

export function isParsedRoleResult(value) {
  return isObject(value)
    && Object.prototype.hasOwnProperty.call(value, 'value')
    && Object.prototype.hasOwnProperty.call(value, 'parseError')
    && Object.prototype.hasOwnProperty.call(value, 'raw');
}

export function parseRoleResult(raw) {
  const unwrapped = raw?.output ?? raw;
  if (typeof unwrapped !== 'string') return { value: unwrapped, raw: unwrapped, parseError: null };
  try { return { value: JSON.parse(unwrapped), raw: unwrapped, parseError: null }; }
  catch (error) { return { value: unwrapped, raw: unwrapped, parseError: error.message }; }
}

export async function callRole(callback, input, role) {
  const raw = await callback(structuredClone(input));
  return parseRoleResult(raw);
}

export function stage19Error(message, concerns, { failedGate = 'stage19_hidden_state_gate', terminal = false, ...snapshots } = {}) {
  const error = new Error(message);
  error.lifecycle = {
    stage_id: 19,
    stage_slug: 'hidden_state',
    stage_type: 'isolated_semantic_generation',
    failed_gate: failedGate,
    concerns: array(concerns),
    terminal_status: terminal ? 'needs_manual_review' : 'stage_failed',
    ...snapshots
  };
  error.semanticRecoveryRoute = {
    repair_kind: 'semantic',
    return_to_stage: terminal ? 'manual_review' : 'hidden_state',
    rerun_from_stage: 19,
    reason_code: array(concerns)[0]?.code ?? 'HIDDEN_STATE_FAILED',
    terminal_status: terminal ? 'needs_manual_review' : null
  };
  return error;
}
