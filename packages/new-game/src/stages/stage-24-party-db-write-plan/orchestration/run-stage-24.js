import { computePartyDbWritePlanDigest } from '@rus/contracts';
import { buildPartyRuntimeV2WritePlan } from '../code/build-party-runtime-v2-plan.js';
import { buildAuditFormatRepairInput, buildAuditorRoleInput } from '../roles/inputs.js';
import { buildPartyDbWritePlanCodePrecheck } from '../precheck/build-precheck.js';
import { validateStage24Input } from '../input/input-boundary.js';
import { validatePartyDbWritePlan } from '../validation/plan-validation.js';
import { validatePartyDbWritePlanAudit } from '../audit/validation.js';
import { buildStage24Result } from '../result/index.js';
import { array, callRole, historyEntry, issue, parseRoleResult, stage24Error } from '../shared/utils.js';

export async function runStage24PartyDbWritePlanBlock({ input, builder = buildPartyRuntimeV2WritePlan, auditor, auditFormatRepairer } = {}) {
  const inputConcerns = validateStage24Input(input);
  if (inputConcerns.length > 0) throw stage24Error('Stage 24 input gate failed.', inputConcerns, 'stage24_input_gate');
  const precheck = buildPartyDbWritePlanCodePrecheck(input);
  if (!precheck.pass) throw stage24Error('Stage 24 code precheck failed.', precheck.concerns, 'stage24_code_precheck');
  if (typeof builder !== 'function') throw new TypeError('Stage 24 requires a code builder.');
  if (typeof auditor !== 'function') throw new TypeError('Stage 24 requires an audit service.');

  const histories = { generation: [], audit: [], repair: [] };
  const diagnostics = { builder_attempts: 1, plan_format_repair_attempts: 0, auditor_attempts: 1, audit_format_repair_attempts: 0, router_attempts: 0, semantic_repair_attempts: 0, senior_builder_attempts: 0, senior_auditor_attempts: 0, last_error_codes: [] };
  let plan;
  try {
    plan = await builder(structuredClone(input));
  } catch (error) {
    throw stage24Error('Stage 24 code builder failed.', [issue(error.code ?? 'WRITE_PLAN_CODE_BUILDER_FAILED', error.message, 'plan')], 'stage24_code_builder');
  }
  histories.generation.push(historyEntry('build', 'PartyRuntimeV2CodeBuilder', []));
  const planConcerns = validatePartyDbWritePlan(plan, input, precheck);
  diagnostics.last_error_codes = planConcerns.map((item) => item.code);
  if (planConcerns.length > 0) throw stage24Error('Stage 24 code-generated plan failed validation.', planConcerns, 'stage24_plan_validation');

  const planDigest = computePartyDbWritePlanDigest(plan);
  let rawAudit = await callRole(auditor, buildAuditorRoleInput(input, plan, planDigest), 'PartyDbWritePlanAuditor');
  let parsedAudit = parseRoleResult(rawAudit);
  let auditConcerns = parsedAudit.parseError
    ? [issue('WRITE_PLAN_AUDIT_INVALID', parsedAudit.parseError, 'audit')]
    : validatePartyDbWritePlanAudit(parsedAudit.value, input, plan);
  if (auditConcerns.length > 0 && typeof auditFormatRepairer === 'function') {
    rawAudit = await callRole(auditFormatRepairer, buildAuditFormatRepairInput(input, plan, planDigest, rawAudit, auditConcerns), 'PartyDbWritePlanAuditFormatRepairer');
    diagnostics.audit_format_repair_attempts = 1;
    histories.repair.push(historyEntry('audit_format', 'PartyDbWritePlanAuditFormatRepairer', auditConcerns.map((item) => item.code)));
    parsedAudit = parseRoleResult(rawAudit);
    auditConcerns = parsedAudit.parseError ? [issue('WRITE_PLAN_AUDIT_INVALID', parsedAudit.parseError, 'audit')] : validatePartyDbWritePlanAudit(parsedAudit.value, input, plan);
  }
  if (auditConcerns.length > 0) throw stage24Error('Stage 24 audit contract failed.', auditConcerns, 'stage24_audit_contract');
  const audit = parsedAudit.value;
  histories.audit.push(historyEntry('audit', 'PartyDbWritePlanAuditor', array(audit.concerns).map((item) => item.code)));
  if (audit.pass !== true) throw stage24Error('Stage 24 audit rejected the immutable code plan.', audit.concerns, 'stage24_semantic_audit');
  return buildStage24Result({ input, precheck, plan, audit, histories, diagnostics });
}
