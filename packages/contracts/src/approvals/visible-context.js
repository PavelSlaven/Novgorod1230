import { VISIBLE_CONTEXT_AUDIT_APPROVAL_SCHEMA } from '../schema-names.js';

export function buildVisibleContextAuditApproval(stage21Result = {}) {
  const result = object(stage21Result);
  const audit = object(result.visible_context_audit);
  return freeze({
    version: 1,
    schema: VISIBLE_CONTEXT_AUDIT_APPROVAL_SCHEMA,
    request_id: result.request_id ?? audit.request_id ?? null,
    pass: result.pass === true && audit.pass === true,
    visible_context_package_digest: result.visible_context_package_digest ?? audit.visible_context_package_digest ?? null,
    commit_permission: {
      can_send_to_narrator: result.commit_permission?.can_send_to_narrator === true,
      can_write_visible_context_snapshot: result.commit_permission?.can_write_visible_context_snapshot === true,
      can_generate_player_facing_prose: result.commit_permission?.can_generate_player_facing_prose === true
    }
  });
}

export function validateVisibleContextAuditApproval(approval = {}, binding = {}) {
  const issues = [];
  if (!isObject(approval) || approval.version !== 1 || approval.schema !== VISIBLE_CONTEXT_AUDIT_APPROVAL_SCHEMA) {
    issues.push(issue('VISIBLE_CONTEXT_APPROVAL_INVALID', `Expected ${VISIBLE_CONTEXT_AUDIT_APPROVAL_SCHEMA} version 1.`, 'approval'));
    return issues;
  }
  if (binding.request_id != null && approval.request_id !== binding.request_id) issues.push(issue('VISIBLE_CONTEXT_APPROVAL_REQUEST_ID_MISMATCH', 'Approval request_id mismatch.', 'approval.request_id'));
  if (binding.visible_context_package_digest != null && approval.visible_context_package_digest !== binding.visible_context_package_digest) issues.push(issue('VISIBLE_CONTEXT_APPROVAL_DIGEST_MISMATCH', 'Approval digest mismatch.', 'approval.visible_context_package_digest'));
  if (approval.pass !== true) issues.push(issue('VISIBLE_CONTEXT_APPROVAL_NOT_PASSED', 'Approval must pass.', 'approval.pass'));
  for (const key of ['can_send_to_narrator', 'can_write_visible_context_snapshot', 'can_generate_player_facing_prose']) {
    if (approval.commit_permission?.[key] !== true) issues.push(issue('VISIBLE_CONTEXT_APPROVAL_PERMISSION_DENIED', `commit_permission.${key} must be true.`, `approval.commit_permission.${key}`));
  }
  return issues;
}

function object(value) { return isObject(value) ? value : {}; }
function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function freeze(value) { return Object.freeze(structuredClone(value)); }
function issue(code, message, path) { return { code, message, path }; }
