import { computeVisibleContextPackageDigest } from '@rus/contracts';
import { STAGE20_OUTPUT_SCHEMA, STAGE20_RESULT_SCHEMA } from '../policy/constants.js';
import { validateStage20Input } from '../input/input-boundary.js';
import { buildStage20ReferenceIndex, buildStage20VisibilityFilter, buildVisibleContextReferenceSummary } from '../references/reference-index.js';
import { buildVisibleContextCodePrecheck, validateStage20CommitPermission, validateVisibleContextPackage } from '../validation/output-validation.js';
import { array, isObject, issue, safeClone } from '../../../visible-context/shared.js';

const OUTPUT_ARRAYS = Object.freeze([
  'visible_scene_facts', 'visible_anchors', 'visible_exits', 'visible_npcs', 'visible_items',
  'visible_containers', 'visible_risks', 'audible_context', 'smell_context', 'touch_body_context',
  'weather_light_context', 'known_context', 'rumor_context', 'uncertain_context',
  'available_actions_context', 'hidden_filtered_out', 'source_trace'
]);
const FORMAT_CODES = new Set([
  'VISIBLE_CONTEXT_INVALID_JSON', 'VISIBLE_CONTEXT_SCHEMA_MISMATCH',
  'VISIBLE_CONTEXT_REQUIRED_BLOCK_MISSING', 'VISIBLE_CONTEXT_ARRAY_INVALID'
]);
export async function runStage20VisibleContextBlock({ input, build, formatRepair, semanticRepair, seniorRepair, repairRequest = null } = {}) {
  const inputConcerns = validateStage20Input(input);
  if (inputConcerns.length > 0) throw stage20Error('Stage 20 input gate failed.', inputConcerns, { failedGate: 'stage20_input_gate', input_snapshot: safeClone(input), terminal: true });
  const callbacks = repairRequest
    ? { formatRepair, semanticRepair, seniorRepair }
    : { build, formatRepair, semanticRepair, seniorRepair };
  for (const [name, callback] of Object.entries(callbacks)) if (typeof callback !== 'function') throw new Error(`Stage 20 requires ${name} callback.`);
  const refs = buildStage20ReferenceIndex(input);
  const visibilityFilter = buildStage20VisibilityFilter(input, refs);
  const repairHistory = [];
  let candidate;
  let firstSemanticAttempt = 0;
  if (repairRequest) {
    const semanticAudit = repairRequest.semantic_audit ?? repairRequest.stage21_visible_context_audit;
    const repairRoute = repairRequest.repair_route ?? repairRequest.stage21_repair_route;
    const repaired = await callRole(semanticRepair, {
      version: 1,
      schema: repairRequest.stage21_visible_context_audit ? 'visible_context_stage21_semantic_repair_input' : 'visible_context_targeted_semantic_repair_input',
      request_id: input.request_id,
      target: STAGE20_OUTPUT_SCHEMA,
      original_input: structuredClone(input),
      visibility_filter: structuredClone(visibilityFilter),
      reference_index_summary: buildVisibleContextReferenceSummary(refs),
      failed_visible_context_package: safeClone(repairRequest.failed_visible_context_package),
      visible_context_code_precheck: safeClone(repairRequest.visible_context_code_precheck),
      semantic_audit: safeClone(semanticAudit),
      repair_route: safeClone(repairRoute),
      stage21_visible_context_audit: safeClone(repairRequest.stage21_visible_context_audit ?? null),
      stage21_repair_route: safeClone(repairRequest.stage21_repair_route ?? null),
      previous_repair_history: safeClone(repairRequest.previous_repair_history ?? []),
      allowed_mutable_paths: array(repairRoute?.allowed_mutable_paths),
      forbidden_mutable_paths: array(repairRoute?.forbidden_mutable_paths),
      constraints: {
        targeted_repair_only: true,
        preserve_uncontested_fields: true,
        do_not_modify_upstream_state: true,
        do_not_create_world_facts: true,
        requires_stage21_reaudit: true
      }
    }, 'VisibleContextSemanticRepairer');
    repairHistory.push({
      attempt_index: 1,
      kind: repairRequest.stage21_visible_context_audit ? 'stage21_targeted_semantic' : 'targeted_semantic_repair',
      role: 'VisibleContextSemanticRepairer',
      issue_codes: array(semanticAudit?.concerns).map((item) => item?.code).filter(Boolean)
    });
    candidate = await normalizeOutputFormat(repaired, input, refs, visibilityFilter, formatRepair, repairHistory, 'VisibleContextSemanticRepairer');
    firstSemanticAttempt = 1;
  } else {
    candidate = await callRole(build, buildVisibleContextBuilderRoleInput(input, refs, visibilityFilter), 'VisibleContextBuilder');
    candidate = await normalizeOutputFormat(candidate, input, refs, visibilityFilter, formatRepair, repairHistory, 'VisibleContextBuilder');
  }
  let lastPrecheck = null;

  for (let semanticAttempt = firstSemanticAttempt; semanticAttempt <= 2; semanticAttempt += 1) {
    lastPrecheck = buildVisibleContextCodePrecheck(candidate.value, input, refs, visibilityFilter);
    if (lastPrecheck.pass === true) {
      const permission = validateStage20CommitPermission(candidate.value, lastPrecheck);
      if (!permission.can_continue_to_visible_context_audit) throw stage20Error('Stage 20 commit gate denied continuation.', permission.reasons.map((reason) => issue('VISIBLE_CONTEXT_COMMIT_DENIED', reason, 'commit_permission')), { failedGate: 'stage20_commit_gate', terminal: true });
      return {
        version: 1,
        schema: STAGE20_RESULT_SCHEMA,
        request_id: input.request_id,
        pass: true,
        input_snapshot: structuredClone(input),
        visibility_filter: structuredClone(visibilityFilter),
        visible_context_package: structuredClone(candidate.value),
        visible_context_package_digest: computeVisibleContextPackageDigest(candidate.value),
        visible_context_code_precheck: structuredClone(lastPrecheck),
        repair_history: structuredClone(repairHistory),
        diagnostics: {
          visibility_filter_counts: {
            visible_anchors: visibilityFilter.visible_anchor_ids.length,
            audible_anchors: visibilityFilter.audible_anchor_ids.length,
            visible_npcs: visibilityFilter.visible_npc_ids.length,
            audible_npcs: visibilityFilter.audible_npc_ids.length,
            visible_items: visibilityFilter.visible_item_ids.length,
            visible_containers: visibilityFilter.visible_container_ids.length,
            forbidden_hidden_facts: visibilityFilter.forbidden_hidden_fact_ids.length
          },
          reference_index_summary: buildVisibleContextReferenceSummary(refs)
        },
        commit_permission: permission
      };
    }
    const issues = array(lastPrecheck.concerns);
    if (semanticAttempt >= 2) throw stage20Error('Stage 20 semantic repair escalation exhausted.', issues, { failedGate: 'visible_context_code_precheck', visible_context_package: safeClone(candidate.value), visible_context_code_precheck: safeClone(lastPrecheck), repair_history: safeClone(repairHistory), terminal: true });
    const role = semanticAttempt === 0 ? 'VisibleContextSemanticRepairer' : 'SeniorVisibleContextSemanticRepairer';
    const repair = semanticAttempt === 0 ? semanticRepair : seniorRepair;
    const repaired = await callRole(repair, {
      version: 1,
      schema: 'visible_context_semantic_repair_input',
      request_id: input.request_id,
      target: STAGE20_OUTPUT_SCHEMA,
      original_input: structuredClone(input),
      visibility_filter: structuredClone(visibilityFilter),
      reference_index_summary: buildVisibleContextReferenceSummary(refs),
      failed_visible_context_package: safeClone(candidate.value),
      visible_context_code_precheck: safeClone(lastPrecheck),
      validationErrors: safeClone(issues),
      repair_history: safeClone(repairHistory),
      allowed_mutable_paths: OUTPUT_ARRAYS.concat(['visible_context_status', 'narrator_scope', 'visible_scene_dossier', 'audit_self_check']),
      forbidden_mutable_paths: ['historical_frame', 'weather_state', 'current_position', 'g5_scene_graph', 'initial_npc_placement', 'initial_item_placement', 'character_knowledge_map', 'full_hidden_scene_state']
    }, role);
    repairHistory.push({ attempt_index: repairHistory.length + 1, kind: semanticAttempt === 0 ? 'semantic' : 'senior_semantic', role, issue_codes: issues.map((item) => item?.code).filter(Boolean) });
    candidate = await normalizeOutputFormat(repaired, input, refs, visibilityFilter, formatRepair, repairHistory, role);
  }
  throw stage20Error('Stage 20 failed unexpectedly.', [issue('VISIBLE_CONTEXT_UNKNOWN_FAILURE', 'Unknown Stage 20 failure.', 'root')], { terminal: true });
}

export function validateProvidedStage20Result() {
  throw new Error('Provided Stage 20 output is forbidden in production, development and tests. Stub the Stage 20 role executor instead.');
}

export function buildVisibleContextBuilderRoleInput(input, refs, visibilityFilter) {
  return {
    ...structuredClone(input),
    visibility_filter: structuredClone(visibilityFilter),
    reference_index_summary: buildVisibleContextReferenceSummary(refs),
    constraints: {
      output_only_schema: STAGE20_OUTPUT_SCHEMA,
      hidden_filtered_out_must_contain_ids_and_reasons_only: true,
      inference_requires_player_safe_basis_refs: true,
      inference_must_be_uncertain: true,
      inference_confidence_maximum: 'medium',
      visible_hints_require_allowed_visible_hint_ref: true,
      narrator_permission_is_stage21_only: true
    }
  };
}

export async function normalizeOutputFormat(result, input, refs, filter, formatRepair, repairHistory, sourceRole) {
  const parsed = parseRoleResult(result);
  const validation = parsed.parseError ? [issue('VISIBLE_CONTEXT_INVALID_JSON', parsed.parseError, 'root')] : formatOnlyValidation(parsed.value);
  if (validation.length === 0) return parsed;
  const repaired = await callRole(formatRepair, {
    version: 1,
    schema: 'visible_context_format_repair_input',
    request_id: input.request_id,
    target: STAGE20_OUTPUT_SCHEMA,
    raw_output: parsed.raw,
    parsed_output: safeClone(parsed.value),
    validation_errors: validation,
    original_input: structuredClone(input),
    visibility_filter: structuredClone(filter),
    reference_index_summary: buildVisibleContextReferenceSummary(refs),
    constraints: { change_format_only: true, do_not_add_facts: true, do_not_remove_facts: true, do_not_change_refs: true, do_not_create_entities: true }
  }, 'VisibleContextFormatRepairer');
  repairHistory.push({ attempt_index: repairHistory.length + 1, kind: 'format', role: 'VisibleContextFormatRepairer', source: sourceRole, issue_codes: validation.map((item) => item.code) });
  return parseRoleResult(repaired);
}

export function formatOnlyValidation(output) {
  const concerns = [];
  if (!isObject(output)) return [issue('VISIBLE_CONTEXT_INVALID_JSON', 'Output must be a JSON object.', 'root')];
  if (output.version !== 1 || output.schema !== STAGE20_OUTPUT_SCHEMA) concerns.push(issue('VISIBLE_CONTEXT_SCHEMA_MISMATCH', `Expected ${STAGE20_OUTPUT_SCHEMA} version 1.`, 'schema'));
  for (const key of OUTPUT_ARRAYS) if (!Array.isArray(output[key])) concerns.push(issue('VISIBLE_CONTEXT_ARRAY_INVALID', `${key} must be an array.`, key));
  for (const key of ['frame', 'position', 'narrator_scope', 'visible_scene_dossier', 'audit_self_check']) if (!isObject(output[key])) concerns.push(issue('VISIBLE_CONTEXT_REQUIRED_BLOCK_MISSING', `${key} must be an object.`, key));
  return concerns;
}

export async function callRole(callback, input, role) {
  try { return await callback(structuredClone(input)); }
  catch (error) { throw stage20Error(`${role} failed: ${error?.message ?? String(error)}`, [issue('VISIBLE_CONTEXT_ROLE_CALL_FAILED', error?.message ?? String(error), role)], { failedGate: role, cause: error }); }
}

export function parseRoleResult(result) {
  const raw = result?.output ?? result?.content ?? result;
  if (isObject(raw)) return { value: structuredClone(raw), raw: structuredClone(raw), parseError: null };
  if (typeof raw !== 'string') return { value: null, raw, parseError: 'Role output is neither object nor JSON string.' };
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return { value: JSON.parse(cleaned), raw, parseError: null }; } catch (error) { return { value: null, raw, parseError: error.message }; }
}

export function stage20Error(message, concerns = [], details = {}) {
  const error = new Error(message);
  error.name = 'Stage20VisibleContextError';
  error.code = concerns[0]?.code ?? 'VISIBLE_CONTEXT_STAGE_FAILED';
  error.concerns = safeClone(concerns);
  Object.assign(error, details);
  return error;
}
