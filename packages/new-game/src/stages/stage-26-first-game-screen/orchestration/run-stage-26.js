import { validateFirstScreenActionAudit, validateFirstScreenSafetyAudit } from '../audit/audit-validation.js';
import { buildActionAuditorRoleInput, buildSafetyAuditorRoleInput } from '../audit/role-inputs.js';
import { buildFirstScreenCodePrecheck } from '../input/validate-input.js';
import { SCREEN_FORMAT_CODES, STAGE26_ACTION_AUDIT_SCHEMA, STAGE26_SAFETY_AUDIT_SCHEMA } from '../policy/constants.js';
import { buildFirstGameScreenProjection } from '../projection/project-screen.js';
import { buildFormatRepairRoleInput, buildSemanticRepairRoleInput } from '../repair/role-inputs.js';
import { routeForStage26Concerns } from '../repair/routing.js';
import { validateScreenRepair } from '../repair/validate-repair.js';
import { buildStage26Failure, buildStage26Success } from '../result/builders.js';
import { finalizeSafetyBoundary, stripSensitiveValidation } from '../result/finalize.js';
import { extractIssues, issue, normalizeAuditConcerns } from '../shared/issues.js';
import { array, deepFreeze, safeClone } from '../shared/utils.js';
import { validateFirstGameScreen } from '../validation/validate-screen.js';

export async function runStage26FirstGameScreenBlock({
  input,
  safetyAuditor,
  actionLabelAuditor,
  formatRepairer = null,
  semanticRepairer = null,
  seniorRepairer = null,
  maxRepairCycles = 2
} = {}) {
  const precheck = buildFirstScreenCodePrecheck(input);
  if (!precheck.pass) return buildStage26Failure({ input, phase: 'input_validation', precheck, concerns: precheck.concerns });
  if (typeof safetyAuditor !== 'function' || typeof actionLabelAuditor !== 'function') {
    return buildStage26Failure({ input, phase: 'audit_setup', precheck, concerns: [issue('FIRST_SCREEN_AUDIT_INVALID', 'Stage 26 requires safetyAuditor and actionLabelAuditor.', 'auditors', 'hard_block')] });
  }

  let screen;
  try {
    screen = buildFirstGameScreenProjection(input);
  } catch (error) {
    return buildStage26Failure({ input, phase: 'projection', precheck, concerns: extractIssues(error, 'FIRST_SCREEN_INPUT_INVALID') });
  }

  const validationHistory = [];
  const auditHistory = [];
  const repairHistory = [];
  const diagnostics = {
    projection_attempts: 1,
    safety_audit_attempts: 0,
    action_audit_attempts: 0,
    format_repair_attempts: 0,
    semantic_repair_attempts: 0,
    senior_repair_attempts: 0
  };

  for (let cycle = 0; cycle <= maxRepairCycles + 1; cycle += 1) {
    let codeValidation = validateFirstGameScreen(screen, input);
    validationHistory.push(stripSensitiveValidation(codeValidation));
    if (!codeValidation.pass) {
      const formatOnly = codeValidation.concerns.every((item) => SCREEN_FORMAT_CODES.has(item.code));
      if (formatOnly && typeof formatRepairer === 'function' && diagnostics.format_repair_attempts < 1) {
        diagnostics.format_repair_attempts += 1;
        const repaired = await invokeRole(formatRepairer, buildFormatRepairRoleInput({ artifactKind: 'first_game_screen', artifact: screen, issues: codeValidation.concerns, input }), 'FirstScreenFormatRepairer');
        const repairIssues = validateScreenRepair(screen, repaired, input, { formatOnly: true });
        if (repairIssues.length > 0) return buildStage26Failure({ input, phase: 'format_repair', precheck, screen, codeValidation, concerns: repairIssues, histories: { validationHistory, auditHistory, repairHistory }, diagnostics });
        repairHistory.push({ cycle, repair_kind: 'first_screen_format_repair', concerns: safeClone(codeValidation.concerns) });
        screen = deepFreeze(safeClone(repaired));
        continue;
      }
      return buildStage26Failure({ input, phase: 'code_validation', precheck, screen, codeValidation, concerns: codeValidation.concerns, histories: { validationHistory, auditHistory, repairHistory }, diagnostics });
    }

    diagnostics.safety_audit_attempts += 1;
    let safetyAuditRaw = await invokeRole(safetyAuditor, buildSafetyAuditorRoleInput(input, screen), 'FirstScreenSafetyAuditor');
    let safetyIssues = validateFirstScreenSafetyAudit(safetyAuditRaw, screen, input);
    if (safetyIssues.length > 0 && typeof formatRepairer === 'function' && diagnostics.format_repair_attempts < 2) {
      diagnostics.format_repair_attempts += 1;
      safetyAuditRaw = await invokeRole(formatRepairer, buildFormatRepairRoleInput({ artifactKind: STAGE26_SAFETY_AUDIT_SCHEMA, artifact: safetyAuditRaw, issues: safetyIssues, input, screen }), 'FirstScreenFormatRepairer');
      safetyIssues = validateFirstScreenSafetyAudit(safetyAuditRaw, screen, input);
    }
    if (safetyIssues.length > 0) return buildStage26Failure({ input, phase: 'safety_audit_format', precheck, screen, codeValidation, concerns: safetyIssues, histories: { validationHistory, auditHistory, repairHistory }, diagnostics });
    auditHistory.push({ cycle, kind: STAGE26_SAFETY_AUDIT_SCHEMA, audit: safeClone(safetyAuditRaw) });

    diagnostics.action_audit_attempts += 1;
    let actionAuditRaw = await invokeRole(actionLabelAuditor, buildActionAuditorRoleInput(input, screen), 'FirstScreenActionLabelAuditor');
    let actionIssues = validateFirstScreenActionAudit(actionAuditRaw, screen, input);
    if (actionIssues.length > 0 && typeof formatRepairer === 'function' && diagnostics.format_repair_attempts < 3) {
      diagnostics.format_repair_attempts += 1;
      actionAuditRaw = await invokeRole(formatRepairer, buildFormatRepairRoleInput({ artifactKind: STAGE26_ACTION_AUDIT_SCHEMA, artifact: actionAuditRaw, issues: actionIssues, input, screen }), 'FirstScreenFormatRepairer');
      actionIssues = validateFirstScreenActionAudit(actionAuditRaw, screen, input);
    }
    if (actionIssues.length > 0) return buildStage26Failure({ input, phase: 'action_audit_format', precheck, screen, codeValidation, safetyAudit: safetyAuditRaw, concerns: actionIssues, histories: { validationHistory, auditHistory, repairHistory }, diagnostics });
    auditHistory.push({ cycle, kind: STAGE26_ACTION_AUDIT_SCHEMA, audit: safeClone(actionAuditRaw) });

    if (safetyAuditRaw.pass === true && actionAuditRaw.pass === true) {
      const finalized = finalizeSafetyBoundary(screen, codeValidation, safetyAuditRaw, actionAuditRaw);
      codeValidation = validateFirstGameScreen(finalized, input);
      validationHistory.push(stripSensitiveValidation(codeValidation));
      if (!codeValidation.pass) return buildStage26Failure({ input, phase: 'final_validation', precheck, screen: finalized, codeValidation, safetyAudit: safetyAuditRaw, actionAudit: actionAuditRaw, concerns: codeValidation.concerns, histories: { validationHistory, auditHistory, repairHistory }, diagnostics });
      return buildStage26Success({ input, precheck, screen: finalized, codeValidation, safetyAudit: safetyAuditRaw, actionAudit: actionAuditRaw, validationHistory, auditHistory, repairHistory, diagnostics });
    }

    const semanticConcerns = normalizeAuditConcerns([
      ...array(safetyAuditRaw.concerns),
      ...array(actionAuditRaw.concerns)
    ]);
    const route = routeForStage26Concerns(semanticConcerns);
    if (route.return_to_stage !== 'first_screen_label_semantic_repair' && route.return_to_stage !== 'first_screen_action_label_repair') {
      return buildStage26Failure({ input, phase: 'semantic_audit', precheck, screen, codeValidation, safetyAudit: safetyAuditRaw, actionAudit: actionAuditRaw, concerns: semanticConcerns, repairRoute: route, histories: { validationHistory, auditHistory, repairHistory }, diagnostics });
    }

    const useSenior = cycle >= maxRepairCycles;
    const repairer = useSenior ? seniorRepairer : semanticRepairer;
    if (typeof repairer !== 'function') {
      return buildStage26Failure({ input, phase: useSenior ? 'senior_repair' : 'semantic_repair', precheck, screen, codeValidation, safetyAudit: safetyAuditRaw, actionAudit: actionAuditRaw, concerns: semanticConcerns.length ? semanticConcerns : [issue('FIRST_SCREEN_AUDIT_FAILED', 'Screen semantic audit failed.', 'audit', 'repairable')], repairRoute: route, histories: { validationHistory, auditHistory, repairHistory }, diagnostics });
    }
    if (useSenior) diagnostics.senior_repair_attempts += 1;
    else diagnostics.semantic_repair_attempts += 1;
    const repaired = await invokeRole(repairer, buildSemanticRepairRoleInput({ input, screen, safetyAudit: safetyAuditRaw, actionAudit: actionAuditRaw, route, senior: useSenior }), useSenior ? 'SeniorFirstScreenRepairer' : 'FirstScreenSemanticRepairer');
    const repairIssues = validateScreenRepair(screen, repaired, input, { formatOnly: false });
    if (repairIssues.length > 0) return buildStage26Failure({ input, phase: useSenior ? 'senior_repair' : 'semantic_repair', precheck, screen, codeValidation, safetyAudit: safetyAuditRaw, actionAudit: actionAuditRaw, concerns: repairIssues, repairRoute: route, histories: { validationHistory, auditHistory, repairHistory }, diagnostics });
    repairHistory.push({ cycle, repair_kind: route.return_to_stage, senior: useSenior, concerns: safeClone(semanticConcerns) });
    screen = deepFreeze(safeClone(repaired));
  }

  return buildStage26Failure({ input, phase: 'repair_exhausted', precheck, screen, concerns: [issue('FIRST_SCREEN_REPAIR_EXHAUSTED', 'Stage 26 repair escalation exhausted.', 'repair', 'hard_block')], histories: { validationHistory, auditHistory, repairHistory }, diagnostics });
}

export async function invokeRole(role, roleInput, roleId) {
  const response = await role({
    input: roleInput,
    stage: Object.freeze({ id: 26, slug: 'first_game_screen', role_id: roleId })
  });
  return safeClone(response?.output ?? response?.result ?? response);
}
