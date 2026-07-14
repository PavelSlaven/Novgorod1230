import { ACTION_CHECK_KEYS, SAFETY_CHECK_KEYS, STAGE26_ACTION_AUDIT_SCHEMA, STAGE26_CONCERN_CODES, STAGE26_SAFETY_AUDIT_SCHEMA, STAGE26_SEVERITIES } from '../policy/constants.js';
import { computeStage26Digest } from '../shared/digest.js';
import { dedupeIssues, issue } from '../shared/issues.js';
import { array, isObject, text } from '../shared/utils.js';

export function validateFirstScreenSafetyAudit(audit = {}, screen = {}, input = {}) {
  return validateAuditCommon(audit, {
    schema: STAGE26_SAFETY_AUDIT_SCHEMA,
    requiredChecks: SAFETY_CHECK_KEYS,
    screen,
    input,
    requirePermissions: true
  });
}

export function validateFirstScreenActionAudit(audit = {}, screen = {}, input = {}) {
  return validateAuditCommon(audit, {
    schema: STAGE26_ACTION_AUDIT_SCHEMA,
    requiredChecks: ACTION_CHECK_KEYS,
    screen,
    input,
    requirePermissions: false
  });
}

export function validateAuditCommon(audit, { schema, requiredChecks, screen, input, requirePermissions }) {
  const concerns = [];
  if (!isObject(audit) || audit.version !== 1 || audit.schema !== schema) return [issue('FIRST_SCREEN_AUDIT_INVALID', `Expected ${schema} version 1.`, 'audit', 'format_error')];
  if (audit.request_id !== input.request_id) concerns.push(issue('FIRST_SCREEN_REQUEST_ID_MISMATCH', 'Audit request_id mismatch.', 'audit.request_id', 'format_error'));
  if (audit.screen_digest !== computeStage26Digest(screen)) concerns.push(issue('FIRST_SCREEN_AUDIT_INVALID', 'Audit screen digest mismatch.', 'audit.screen_digest', 'format_error'));
  if (typeof audit.pass !== 'boolean') concerns.push(issue('FIRST_SCREEN_AUDIT_INVALID', 'Audit pass must be boolean.', 'audit.pass', 'format_error'));
  for (const key of requiredChecks) if (audit.checks?.[key]?.pass !== true && audit.pass === true) concerns.push(issue('FIRST_SCREEN_AUDIT_INVALID', `Successful audit missing passed check: ${key}.`, `audit.checks.${key}`, 'format_error'));
  for (const concern of array(audit.concerns)) {
    if (!STAGE26_CONCERN_CODES.includes(concern?.code) || !STAGE26_SEVERITIES.includes(concern?.severity) || !text(concern?.message)) concerns.push(issue('FIRST_SCREEN_AUDIT_INVALID', 'Audit concern is invalid.', 'audit.concerns', 'format_error'));
  }
  if (audit.pass === true) {
    if (array(audit.concerns).length !== 0 || array(audit.evidence).length === 0) concerns.push(issue('FIRST_SCREEN_AUDIT_INVALID', 'Successful audit requires empty concerns and non-empty evidence.', 'audit', 'format_error'));
    if (requirePermissions && (audit.commit_permission?.can_show_to_player !== true || audit.commit_permission?.can_accept_first_turn !== true)) concerns.push(issue('FIRST_SCREEN_AUDIT_INVALID', 'Successful safety audit permissions must be true.', 'audit.commit_permission', 'format_error'));
  } else {
    if (array(audit.concerns).length === 0 || array(audit.evidence).length === 0) concerns.push(issue('FIRST_SCREEN_AUDIT_INVALID', 'Failed audit requires concerns and evidence.', 'audit', 'format_error'));
    if (requirePermissions && (audit.commit_permission?.can_show_to_player !== false || audit.commit_permission?.can_accept_first_turn !== false)) concerns.push(issue('FIRST_SCREEN_AUDIT_INVALID', 'Failed safety audit permissions must be false.', 'audit.commit_permission', 'format_error'));
  }
  for (const forbidden of ['first_game_screen', 'modified_screen', 'hidden_state', 'visible_context_package', 'party_public_state']) if (Object.hasOwn(audit, forbidden)) concerns.push(issue('FIRST_SCREEN_AUDIT_INVALID', `Audit must not embed ${forbidden}.`, `audit.${forbidden}`, 'format_error'));
  return dedupeIssues(concerns);
}
