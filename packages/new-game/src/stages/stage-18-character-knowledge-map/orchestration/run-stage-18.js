import { STAGE18_OUTPUT_SCHEMA, STAGE18_AUDIT_SCHEMA, STAGE18_RESULT_SCHEMA, FORMAT_AUDIT_CODES } from '../policy/constants.js';
import { validateStage18Input } from '../input/input-boundary.js';
import { buildStage18ReferenceIndex } from '../references/reference-index.js';
import { buildCharacterKnowledgeCodePrecheck, formatOnlyOutputValidation } from '../validation/map-validation.js';
import { buildCharacterKnowledgeAuditInput, validateCharacterKnowledgeAudit, withAuditPermissions, referenceSummary } from '../audit/audit-boundary.js';
import { buildCharacterKnowledgeWriteProjection, validateCharacterKnowledgeWriteProjection } from '../projection/write-projection.js';
import { array, isObject, issue, safeClone } from '../shared/utils.js';
export async function runStage18CharacterKnowledgeMapBlock({
  input,
  build,
  audit,
  formatRepair,
  semanticRepair,
  seniorRepair
} = {}) {
  const inputConcerns = validateStage18Input(input);
  if (inputConcerns.length > 0) throw stage18Error('Stage 18 input gate failed.', inputConcerns, { failedGate: 'stage18_input_gate', input_snapshot: safeClone(input), terminal: true });
  for (const [name, callback] of Object.entries({ build, audit, formatRepair, semanticRepair, seniorRepair })) {
    if (typeof callback !== 'function') throw new Error(`Stage 18 requires ${name} callback.`);
  }
  const refs = buildStage18ReferenceIndex(input);
  const repairHistory = [];
  let candidate = await callRole(build, structuredClone(input), 'CharacterKnowledgeMapBuilder');
  candidate = await normalizeOutputFormat(candidate, input, formatRepair, repairHistory, 'CharacterKnowledgeMapBuilder');
  let lastPrecheck = null;
  let lastAudit = null;

  for (let semanticAttempt = 0; semanticAttempt <= 2; semanticAttempt += 1) {
    lastPrecheck = buildCharacterKnowledgeCodePrecheck(candidate.value, input, refs);
    if (lastPrecheck.pass === true) {
      let auditResult = await callRole(audit, buildCharacterKnowledgeAuditInput(input, candidate.value, lastPrecheck, refs), 'CharacterKnowledgeMapAuditor');
      auditResult = await normalizeAuditFormat(auditResult, input, candidate.value, lastPrecheck, formatRepair, repairHistory);
      const auditValidation = validateCharacterKnowledgeAudit(auditResult.value, candidate.value, lastPrecheck);
      if (auditValidation.length > 0) throw stage18Error('Stage 18 audit output is invalid after format repair.', auditValidation, { failedGate: 'stage18_audit_contract', terminal: true });
      lastAudit = withAuditPermissions(auditResult.value);
      if (lastAudit.pass === true) {
        const writePlan = buildCharacterKnowledgeWriteProjection(candidate.value, lastPrecheck, lastAudit, repairHistory);
        const writeIssues = validateCharacterKnowledgeWriteProjection(writePlan, candidate.value);
        if (writeIssues.length > 0) throw stage18Error('Stage 18 write projection is invalid.', writeIssues, { failedGate: 'stage18_write_projection', terminal: true });
        return {
          version: 1,
          schema: STAGE18_RESULT_SCHEMA,
          request_id: input.request_id,
          pass: true,
          character_knowledge_map: structuredClone(candidate.value),
          code_precheck: structuredClone(lastPrecheck),
          character_knowledge_map_audit: structuredClone(lastAudit),
          write_plan: writePlan,
          repair_history: structuredClone(repairHistory),
          diagnostics: { reference_index_summary: referenceSummary(refs) },
          commit_permission: true
        };
      }
    }

    const semanticIssues = lastPrecheck.pass === true ? array(lastAudit?.concerns) : array(lastPrecheck.concerns);
    if (semanticAttempt >= 2) throw stage18Error('Stage 18 semantic repair escalation exhausted.', semanticIssues, { failedGate: lastPrecheck.pass === true ? 'stage18_semantic_audit' : 'stage18_code_precheck', terminal: true });
    const role = semanticAttempt === 0 ? 'CharacterKnowledgeMapSemanticRepairer' : 'CharacterKnowledgeMapSeniorRepairer';
    const repair = semanticAttempt === 0 ? semanticRepair : seniorRepair;
    const repaired = await callRole(repair, {
      version: 1,
      schema: 'character_knowledge_map_semantic_repair_input',
      request_id: input.request_id,
      target: STAGE18_OUTPUT_SCHEMA,
      original_input: structuredClone(input),
      failed_character_knowledge_map: safeClone(candidate.value),
      validationErrors: safeClone(lastPrecheck?.concerns ?? []),
      audit: safeClone(lastAudit),
      repair_history: safeClone(repairHistory),
      forbidden_changes: ['world_state', 'player_character', 'g5_scene_graph', 'new_route', 'new_place', 'new_npc', 'new_item', 'visible_scene', 'intro_prose']
    }, role);
    repairHistory.push({ attempt_index: repairHistory.length + 1, kind: semanticAttempt === 0 ? 'semantic' : 'senior_semantic', role, issue_codes: semanticIssues.map((item) => item?.code).filter(Boolean) });
    candidate = await normalizeOutputFormat(repaired, input, formatRepair, repairHistory, role);
    lastAudit = null;
  }
  throw stage18Error('Stage 18 failed unexpectedly.', [issue('KNOWLEDGE_MAP_UNKNOWN_FAILURE', 'Unknown Stage 18 failure.', 'root')], { terminal: true });
}

export function validateProvidedStage18Result() {
  throw new Error('Provided Stage 18 output is forbidden in production, development and tests. Stub the Stage 18 role executor instead.');
}

async function normalizeOutputFormat(result, input, formatRepair, repairHistory, sourceRole) {
  const parsed = parseRoleResult(result);
  const validation = parsed.parseError ? [issue('KNOWLEDGE_MAP_INVALID_JSON', parsed.parseError, 'root')] : formatOnlyOutputValidation(parsed.value);
  if (validation.length === 0) return parsed;
  const repaired = await callRole(formatRepair, {
    version: 1,
    schema: 'character_knowledge_map_format_repair_input',
    request_id: input.request_id,
    target: STAGE18_OUTPUT_SCHEMA,
    raw_output: parsed.raw,
    parsed_output: safeClone(parsed.value),
    validation_errors: validation,
    original_input: structuredClone(input),
    constraints: { change_format_only: true, do_not_add_knowledge: true, do_not_remove_knowledge: true, do_not_change_basis: true, do_not_create_entities: true }
  }, 'CharacterKnowledgeMapFormatRepairer');
  repairHistory.push({ attempt_index: repairHistory.length + 1, kind: 'format', role: 'CharacterKnowledgeMapFormatRepairer', source: sourceRole, issue_codes: validation.map((item) => item.code) });
  return parseRoleResult(repaired);
}

async function normalizeAuditFormat(result, input, output, precheck, formatRepair, repairHistory) {
  const parsed = parseRoleResult(result);
  const validation = parsed.parseError ? [issue('KNOWLEDGE_MAP_AUDIT_INVALID_JSON', parsed.parseError, 'audit')] : validateCharacterKnowledgeAudit(parsed.value, output, precheck);
  if (validation.length === 0 || validation.every((item) => !FORMAT_AUDIT_CODES.has(item.code))) return parsed;
  const repaired = await callRole(formatRepair, {
    version: 1,
    schema: 'character_knowledge_map_format_repair_input',
    request_id: input.request_id,
    target: STAGE18_AUDIT_SCHEMA,
    raw_output: parsed.raw,
    parsed_output: safeClone(parsed.value),
    validation_errors: validation,
    original_input: structuredClone(input),
    character_knowledge_map: structuredClone(output),
    character_knowledge_map_code_precheck: structuredClone(precheck),
    constraints: { change_format_only: true, do_not_change_pass_semantics: true, do_not_repair_map: true }
  }, 'CharacterKnowledgeMapFormatRepairer');
  repairHistory.push({ attempt_index: repairHistory.length + 1, kind: 'audit_format', role: 'CharacterKnowledgeMapFormatRepairer', source: 'CharacterKnowledgeMapAuditor', issue_codes: validation.map((item) => item.code) });
  return parseRoleResult(repaired);
}
export async function callRole(callback, input, role) {
  try {
    return await callback(structuredClone(input));
  } catch (error) {
    throw stage18Error(`${role} failed: ${error?.message ?? String(error)}`, [issue('KNOWLEDGE_MAP_ROLE_CALL_FAILED', error?.message ?? String(error), role)], { failedGate: role, cause: error });
  }
}

export function parseRoleResult(result) {
  const raw = result?.output ?? result?.content ?? result;
  if (isObject(raw)) return { value: structuredClone(raw), raw: structuredClone(raw), parseError: null };
  if (typeof raw !== 'string') return { value: null, raw, parseError: 'Role output is neither object nor JSON string.' };
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return { value: JSON.parse(cleaned), raw, parseError: null }; }
  catch (error) { return { value: null, raw, parseError: error.message }; }
}

export function stage18Error(message, concerns = [], details = {}) {
  const error = new Error(message);
  error.name = 'Stage18CharacterKnowledgeError';
  error.code = concerns[0]?.code ?? 'KNOWLEDGE_MAP_STAGE_FAILED';
  error.concerns = safeClone(concerns);
  Object.assign(error, details);
  return error;
}

