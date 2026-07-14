import { STAGE25_PARTY_COMMIT_APPROVAL_SCHEMA } from '../schema-names.js';

export function buildStage25PartyCommitApproval(result = {}) {
  const source = isObject(result) ? result : {};
  return deepFreeze({
    version: 1,
    schema: STAGE25_PARTY_COMMIT_APPROVAL_SCHEMA,
    request_id: source.request_id ?? null,
    pass: source.pass === true,
    commit_status: source.commit_status ?? null,
    party_id: source.party_id ?? null,
    transaction_id: source.transaction_id ?? null,
    physical_plan_digest: source.physical_plan_digest ?? null,
    postcommit_state_digest: source.postcommit_state_digest ?? null,
    party_start_committed_digest: source.party_start_committed_digest ?? null,
    party_public_state_digest: source.party_public_state_digest ?? null,
    permissions: clone(source.handoff_permission ?? {})
  });
}

export function validateStage25PartyCommitApproval(approval = {}, binding = {}) {
  const issues = [];
  if (!isObject(approval) || approval.version !== 1 || approval.schema !== STAGE25_PARTY_COMMIT_APPROVAL_SCHEMA) {
    issues.push(issue('STAGE25_APPROVAL_INVALID', `Expected ${STAGE25_PARTY_COMMIT_APPROVAL_SCHEMA} version 1.`, 'approval'));
    return issues;
  }
  if (approval.pass !== true || approval.commit_status !== 'committed') issues.push(issue('STAGE25_APPROVAL_NOT_COMMITTED', 'Approval must represent a committed party.', 'approval.commit_status'));
  for (const key of ['request_id', 'party_id', 'transaction_id', 'party_start_committed_digest', 'party_public_state_digest']) {
    if (binding[key] != null && approval[key] !== binding[key]) issues.push(issue('STAGE25_APPROVAL_BINDING_MISMATCH', `${key} mismatch.`, `approval.${key}`));
  }
  for (const key of ['can_start_stage_26', 'can_show_player_output', 'can_accept_player_input']) {
    if (approval.permissions?.[key] !== true) issues.push(issue('STAGE25_APPROVAL_PERMISSION_DENIED', `permissions.${key} must be true.`, `approval.permissions.${key}`));
  }
  return issues;
}

function clone(value) { return value == null ? value : structuredClone(value); }
function deepFreeze(value) { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); return value; }
function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function issue(code, message, path) { return { code, message, path }; }
