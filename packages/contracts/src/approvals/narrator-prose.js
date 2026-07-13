import { NARRATOR_PROSE_AUDIT_APPROVAL_SCHEMA } from '../schema-names.js';

export function buildNarratorProseAuditApproval(stage23Result = {}) {
  const result = isObject(stage23Result) ? stage23Result : {};
  const audit = isObject(result.narrator_prose_audit) ? result.narrator_prose_audit : {};
  return deepFreeze({
    version: 1,
    schema: NARRATOR_PROSE_AUDIT_APPROVAL_SCHEMA,
    request_id: result.request_id ?? audit.request_id ?? null,
    pass: result.pass === true && audit.pass === true,
    narrator_output_digest: result.narrator_starting_prose_digest ?? null,
    visible_context_package_digest: result.visible_context_package_digest ?? null,
    repair_route: clone(result.repair_route ?? null),
    permissions: {
      can_show_to_player: result.commit_permission?.can_show_to_player === true,
      can_write_player_visible_message: result.commit_permission?.can_write_player_visible_message === true,
      can_mark_opening_scene_presented: result.commit_permission?.can_mark_opening_scene_presented === true
    }
  });
}

export function validateNarratorProseAuditApproval(approval = {}, binding = {}) {
  const issues = [];
  if (!isObject(approval) || approval.version !== 1 || approval.schema !== NARRATOR_PROSE_AUDIT_APPROVAL_SCHEMA) {
    issues.push(issue('NARRATOR_PROSE_APPROVAL_INVALID', `Expected ${NARRATOR_PROSE_AUDIT_APPROVAL_SCHEMA} version 1.`, 'approval'));
    return issues;
  }
  if (binding.request_id != null && approval.request_id !== binding.request_id) issues.push(issue('NARRATOR_PROSE_APPROVAL_REQUEST_ID_MISMATCH', 'Approval request_id mismatch.', 'approval.request_id'));
  if (binding.narrator_output_digest != null && approval.narrator_output_digest !== binding.narrator_output_digest) issues.push(issue('NARRATOR_PROSE_APPROVAL_DIGEST_MISMATCH', 'Narrator output digest mismatch.', 'approval.narrator_output_digest'));
  if (binding.visible_context_package_digest != null && approval.visible_context_package_digest !== binding.visible_context_package_digest) issues.push(issue('NARRATOR_PROSE_APPROVAL_VISIBLE_DIGEST_MISMATCH', 'Visible-context digest mismatch.', 'approval.visible_context_package_digest'));
  if (approval.pass !== true) issues.push(issue('NARRATOR_PROSE_APPROVAL_NOT_PASSED', 'Approval must pass.', 'approval.pass'));
  for (const key of ['can_show_to_player', 'can_write_player_visible_message', 'can_mark_opening_scene_presented']) {
    if (approval.permissions?.[key] !== true) issues.push(issue('NARRATOR_PROSE_APPROVAL_PERMISSION_DENIED', `permissions.${key} must be true.`, `approval.permissions.${key}`));
  }
  return issues;
}

function clone(value) { return value == null ? value : structuredClone(value); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function issue(code, message, path) { return { code, message, path }; }
