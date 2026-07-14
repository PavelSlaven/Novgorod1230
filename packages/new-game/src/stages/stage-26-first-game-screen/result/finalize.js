import { deepFreeze, safeClone } from '../shared/utils.js';
import { findRawIdLeaks } from '../validation/security.js';

export function finalizeSafetyBoundary(screen, codeValidation, safetyAudit, actionAudit) {
  const next = safeClone(screen);
  next.ui_safety_boundary = {
    hidden_state_not_included: codeValidation.checks.hidden_state_absent.pass === true && safetyAudit.checks.hidden_state_absent?.pass === true && actionAudit.checks.no_hidden_truth?.pass === true,
    audit_not_included: codeValidation.checks.audit_absent.pass === true,
    source_trace_not_included: codeValidation.checks.source_trace_absent.pass === true,
    raw_ids_not_included: !findRawIdLeaks(screen).length && safetyAudit.checks.technical_text_absent?.pass === true,
    player_sees_only_character_safe_context: codeValidation.pass === true && safetyAudit.pass === true && actionAudit.pass === true
  };
  return deepFreeze(next);
}

export function stripSensitiveValidation(validation) {
  return safeClone(validation);
}
