import { STAGE26_RESULT_SCHEMA } from '../policy/constants.js';
import { routeForStage26Concerns } from '../repair/routing.js';
import { computeStage26Digest } from '../shared/digest.js';
import { dedupeIssues, normalizeAuditConcerns } from '../shared/issues.js';
import { deepFreeze, isObject, safeClone } from '../shared/utils.js';

export function buildStage26Success({ input, precheck, screen, codeValidation, safetyAudit, actionAudit, validationHistory, auditHistory, repairHistory, diagnostics }) {
  const result = {
    version: 1,
    schema: STAGE26_RESULT_SCHEMA,
    request_id: input.request_id,
    pass: true,
    party_id: screen.party_id,
    transaction_id: input.party_start_committed.transaction_id,
    input_digest: computeStage26Digest(input),
    screen_digest: computeStage26Digest(screen),
    party_public_state_digest: input.stage25_party_commit_approval.party_public_state_digest,
    narrator_output_digest: input.narrator_output_digest,
    visible_context_package_digest: input.visible_context_package_digest,
    postcommit_state_digest: input.stage25_party_commit_approval.postcommit_state_digest,
    first_screen_code_precheck: safeClone(precheck),
    first_screen_code_validation: safeClone(codeValidation),
    first_game_screen: safeClone(screen),
    first_screen_safety_audit: safeClone(safetyAudit),
    first_screen_action_label_audit: safeClone(actionAudit),
    repair_route: null,
    validation_history: safeClone(validationHistory),
    audit_history: safeClone(auditHistory),
    repair_history: safeClone(repairHistory),
    diagnostics: safeClone(diagnostics),
    delivery_permission: {
      can_create_delivery_attempt: true,
      can_show_screen: true,
      can_accept_first_turn_intent: true
    }
  };
  return deepFreeze(result);
}

export function buildStage26Failure({ input, phase, precheck = null, screen = null, codeValidation = null, safetyAudit = null, actionAudit = null, concerns = [], repairRoute = null, histories = {}, diagnostics = {} }) {
  const normalized = dedupeIssues(normalizeAuditConcerns(concerns));
  return deepFreeze({
    version: 1,
    schema: STAGE26_RESULT_SCHEMA,
    request_id: input?.request_id ?? null,
    pass: false,
    failed_phase: phase ?? 'unknown',
    input_digest: isObject(input) ? computeStage26Digest(input) : null,
    screen_digest: isObject(screen) ? computeStage26Digest(screen) : null,
    postcommit_state_digest: input?.stage25_party_commit_approval?.postcommit_state_digest ?? null,
    first_screen_code_precheck: safeClone(precheck),
    first_screen_code_validation: safeClone(codeValidation),
    first_game_screen: safeClone(screen),
    first_screen_safety_audit: safeClone(safetyAudit),
    first_screen_action_label_audit: safeClone(actionAudit),
    concerns: normalized,
    evidence: normalized.map((item) => item.message),
    repair_route: safeClone(repairRoute ?? routeForStage26Concerns(normalized)),
    validation_history: safeClone(histories.validationHistory ?? []),
    audit_history: safeClone(histories.auditHistory ?? []),
    repair_history: safeClone(histories.repairHistory ?? []),
    diagnostics: safeClone(diagnostics),
    delivery_permission: {
      can_create_delivery_attempt: false,
      can_show_screen: false,
      can_accept_first_turn_intent: false
    }
  });
}
