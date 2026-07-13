import { FORMAT_PLAN_CODES } from '../policy/constants.js';
import { buildPartyDbWritePlanCodePrecheck } from '../precheck/build-precheck.js';
import { validateStage24Input } from '../input/input-boundary.js';
import { validatePartyDbWritePlan } from '../validation/plan-validation.js';
import { validatePartyDbWritePlanAudit, validateStage24RepairRoute } from '../audit/validation.js';
import {
  buildAuditFormatRepairInput,
  buildAuditorRoleInput,
  buildBuilderRoleInput,
  buildPlanFormatRepairInput,
  buildPlanSemanticRepairInput,
  buildRouterRoleInput,
  buildSeniorBuilderInput
} from '../roles/inputs.js';
import { buildStage24Result } from '../result/index.js';
import {
  array,
  callRole,
  computePartyDbWritePlanDigest,
  historyEntry,
  issue,
  parseRoleResult,
  safeClone,
  stage24Error,
  unwrapRoleResult
} from '../shared/utils.js';
import { assertStage24Ports } from '../ports.js';

export async function runStage24PartyDbWritePlanBlock({ input, maxRepairCycles = 3, ...serviceSet } = {}) {
  const inputConcerns = validateStage24Input(input);
  if (inputConcerns.length > 0) throw stage24Error('Stage 24 input gate failed.', inputConcerns, 'stage24_input_gate');
  const precheck = buildPartyDbWritePlanCodePrecheck(input);
  if (!precheck.pass) throw stage24Error('Stage 24 code precheck failed.', precheck.concerns, 'stage24_code_precheck');
  const {
    builder, planFormatRepairer, auditor, auditFormatRepairer, router,
    semanticRepairer, seniorSemanticRepairer, seniorBuilder, seniorAuditor
  } = assertStage24Ports(serviceSet);

  const histories = { generation: [], audit: [], repair: [] };
  const diagnostics = {
    builder_attempts: 0,
    plan_format_repair_attempts: 0,
    auditor_attempts: 0,
    audit_format_repair_attempts: 0,
    router_attempts: 0,
    semantic_repair_attempts: 0,
    senior_builder_attempts: 0,
    senior_auditor_attempts: 0,
    last_error_codes: []
  };

  let rawPlan = await callRole(builder, buildBuilderRoleInput(input), 'PartyDbWritePlanBuilder');
  diagnostics.builder_attempts += 1;
  histories.generation.push(historyEntry('build', 'PartyDbWritePlanBuilder', []));
  let parsedPlan = parseRoleResult(rawPlan);
  if (parsedPlan.parseError) {
    rawPlan = await callRole(planFormatRepairer, buildPlanFormatRepairInput(input, rawPlan, parsedPlan.parseError), 'PartyDbWritePlanFormatRepairer');
    diagnostics.plan_format_repair_attempts += 1;
    histories.repair.push(historyEntry('format', 'PartyDbWritePlanFormatRepairer', ['WRITE_PLAN_FORMAT_INVALID']));
    parsedPlan = parseRoleResult(rawPlan);
  }
  let plan = parsedPlan.value;
  let repairCycle = 0;
  let semanticRepairCount = 0;
  let audit = null;
  let route = null;

  while (true) {
    const planConcerns = parsedPlan.parseError
      ? [issue('WRITE_PLAN_FORMAT_INVALID', parsedPlan.parseError, 'plan')]
      : validatePartyDbWritePlan(plan, input, precheck);
    diagnostics.last_error_codes = planConcerns.map((item) => item.code);
    if (planConcerns.length > 0) {
      if (repairCycle >= maxRepairCycles) throw stage24Error('Stage 24 plan repair escalation exhausted.', planConcerns, 'stage24_plan_validation');
      const formatOnly = planConcerns.every((item) => FORMAT_PLAN_CODES.has(item.code));
      if (formatOnly) {
        const repaired = await callRole(planFormatRepairer, buildPlanFormatRepairInput(input, plan, null, planConcerns), 'PartyDbWritePlanFormatRepairer');
        diagnostics.plan_format_repair_attempts += 1;
        histories.repair.push(historyEntry('format', 'PartyDbWritePlanFormatRepairer', planConcerns.map((item) => item.code)));
        parsedPlan = parseRoleResult(repaired);
        plan = parsedPlan.value;
      } else {
        const useSenior = semanticRepairCount >= 1;
        const role = useSenior ? 'SeniorPartyDbWritePlanSemanticRepairer' : 'PartyDbWritePlanSemanticRepairer';
        const callback = useSenior ? seniorSemanticRepairer : semanticRepairer;
        const repaired = await callRole(callback, buildPlanSemanticRepairInput(input, plan, planConcerns, audit, histories.repair), role);
        diagnostics.semantic_repair_attempts += 1;
        semanticRepairCount += 1;
        histories.repair.push(historyEntry(useSenior ? 'senior_semantic' : 'semantic', role, planConcerns.map((item) => item.code)));
        parsedPlan = parseRoleResult(repaired);
        plan = parsedPlan.value;
      }
      repairCycle += 1;
      audit = null;
      route = null;
      continue;
    }

    const planDigest = computePartyDbWritePlanDigest(plan);
    let rawAudit = await callRole(auditor, buildAuditorRoleInput(input, plan, planDigest), 'PartyDbWritePlanAuditor');
    diagnostics.auditor_attempts += 1;
    let parsedAudit = parseRoleResult(rawAudit);
    let auditConcerns = parsedAudit.parseError
      ? [issue('WRITE_PLAN_AUDIT_INVALID', parsedAudit.parseError, 'audit')]
      : validatePartyDbWritePlanAudit(parsedAudit.value, input, plan);
    if (auditConcerns.length > 0) {
      const repairedAudit = await callRole(auditFormatRepairer, buildAuditFormatRepairInput(input, plan, planDigest, rawAudit, auditConcerns), 'PartyDbWritePlanAuditFormatRepairer');
      diagnostics.audit_format_repair_attempts += 1;
      histories.repair.push(historyEntry('audit_format', 'PartyDbWritePlanAuditFormatRepairer', auditConcerns.map((item) => item.code)));
      parsedAudit = parseRoleResult(repairedAudit);
      auditConcerns = parsedAudit.parseError
        ? [issue('WRITE_PLAN_AUDIT_INVALID', parsedAudit.parseError, 'audit')]
        : validatePartyDbWritePlanAudit(parsedAudit.value, input, plan);
    }
    if (auditConcerns.length > 0) {
      const seniorAudit = await callRole(seniorAuditor, buildAuditorRoleInput(input, plan, planDigest, {
        previous_invalid_audit: safeClone(parsedAudit.value),
        audit_validation_errors: safeClone(auditConcerns)
      }), 'SeniorPartyDbWritePlanAuditor');
      diagnostics.senior_auditor_attempts += 1;
      parsedAudit = parseRoleResult(seniorAudit);
      auditConcerns = parsedAudit.parseError
        ? [issue('WRITE_PLAN_AUDIT_INVALID', parsedAudit.parseError, 'audit')]
        : validatePartyDbWritePlanAudit(parsedAudit.value, input, plan);
    }
    if (auditConcerns.length > 0) throw stage24Error('Stage 24 audit contract failed after format and senior escalation.', auditConcerns, 'stage24_audit_contract');
    audit = parsedAudit.value;
    histories.audit.push(historyEntry('audit', diagnostics.senior_auditor_attempts ? 'SeniorPartyDbWritePlanAuditor' : 'PartyDbWritePlanAuditor', array(audit.concerns).map((item) => item.code)));

    if (audit.pass === true) return buildStage24Result({ input, precheck, plan, audit, histories, diagnostics });
    if (repairCycle >= maxRepairCycles) throw stage24Error('Stage 24 semantic audit repair escalation exhausted.', audit.concerns, 'stage24_semantic_audit');

    route = await callRole(router, buildRouterRoleInput(input, audit), 'PartyDbWritePlanAuditRouter');
    diagnostics.router_attempts += 1;
    route = unwrapRoleResult(route);
    const routeConcerns = validateStage24RepairRoute(route, audit);
    if (routeConcerns.length > 0) throw stage24Error('Stage 24 router output is invalid.', routeConcerns, 'stage24_router_contract');

    if (route.return_to_stage === 'party_db_write_plan_format_repair') {
      const repaired = await callRole(planFormatRepairer, buildPlanFormatRepairInput(input, plan, null, audit.concerns), 'PartyDbWritePlanFormatRepairer');
      diagnostics.plan_format_repair_attempts += 1;
      histories.repair.push(historyEntry('format', 'PartyDbWritePlanFormatRepairer', route.supporting_concern_codes));
      parsedPlan = parseRoleResult(repaired);
      plan = parsedPlan.value;
    } else if (route.return_to_stage === 'party_db_write_plan_rebuild') {
      const repaired = await callRole(seniorBuilder, buildSeniorBuilderInput(input, plan, audit, route, histories.repair), 'SeniorPartyDbWritePlanBuilder');
      diagnostics.senior_builder_attempts += 1;
      histories.repair.push(historyEntry('senior_rebuild', 'SeniorPartyDbWritePlanBuilder', route.supporting_concern_codes));
      parsedPlan = parseRoleResult(repaired);
      plan = parsedPlan.value;
    } else if (route.return_to_stage === 'party_db_write_plan_semantic_repair') {
      const useSenior = semanticRepairCount >= 1;
      const role = useSenior ? 'SeniorPartyDbWritePlanSemanticRepairer' : 'PartyDbWritePlanSemanticRepairer';
      const callback = useSenior ? seniorSemanticRepairer : semanticRepairer;
      const repaired = await callRole(callback, buildPlanSemanticRepairInput(input, plan, audit.concerns, audit, histories.repair, route), role);
      diagnostics.semantic_repair_attempts += 1;
      semanticRepairCount += 1;
      histories.repair.push(historyEntry(useSenior ? 'senior_semantic' : 'semantic', role, route.supporting_concern_codes));
      parsedPlan = parseRoleResult(repaired);
      plan = parsedPlan.value;
    } else {
      throw stage24Error('Stage 24 requires upstream repair or manual review.', audit.concerns, 'stage24_upstream_repair', route);
    }
    repairCycle += 1;
    audit = null;
  }
}
