import { createHmac, timingSafeEqual } from 'node:crypto';
import { deepFreeze, stableStringify } from '@rus/kernel';
import { canonicalDigest, MaterializationError } from './core.js';

export function issueBoundedDecisionRequest({ requestId, partyId, actorId, policyId, policyVersion, stateVersion, expiresAt, issuedAt, options, secret }) {
  if (!Array.isArray(options) || options.length < 2) throw new MaterializationError('DECISION_OPTIONS_INVALID', 'Bounded decision requires at least two options.');
  if (![requestId, partyId, actorId, policyId, policyVersion, expiresAt].every((value) => typeof value === 'string' && value.length > 0) || !Number.isInteger(stateVersion)) throw new MaterializationError('DECISION_ENVELOPE_INVALID', 'Bounded decision envelope is incomplete.');
  const issuedAtValue = issuedAt ?? new Date().toISOString();
  const expiresAtMs = parseRfc3339(expiresAt, 'expiresAt');
  const issuedAtMs = parseRfc3339(issuedAtValue, 'issuedAt');
  if (expiresAtMs <= issuedAtMs) throw new MaterializationError('DECISION_EXPIRY_INVALID', 'Decision expiry must be later than its issue time.');
  const seen = new Set();
  const commands = new Set();
  const optionBasis = options.map((option) => normalizeOptionBasis(option, stateVersion));
  const optionsDigest = canonicalDigest(optionBasis);
  const envelope = { requestId, partyId, actorId, policyId, policyVersion, stateVersion, expiresAt, optionsDigest };
  const normalized = options.map((option, ordinal) => {
    const basis = optionBasis[ordinal];
    if (seen.has(basis.option_id) || commands.has(basis.command_id)) throw new MaterializationError('DECISION_OPTIONS_INVALID', 'Option IDs and commands must be unique and non-empty.');
    seen.add(basis.option_id);
    commands.add(basis.command_id);
    return {
      ...structuredClone(basis),
      ordinal,
      command_token: signCommandToken({ ...envelope, optionId: basis.option_id, commandId: basis.command_id, secret })
    };
  });
  return deepFreeze({ version: 2, schema: 'bounded_decision_request_v2', request_id: requestId, party_id: partyId, actor_id: actorId, policy_id: policyId, policy_version: policyVersion, state_version: stateVersion, issued_at: issuedAtValue, expires_at: expiresAt, options_digest: optionsDigest, options: normalized });
}

export function validateBoundedDecisionResult({ request, result, secret, now = new Date().toISOString(), currentPolicyVersion, currentState, evaluatePrecondition }) {
  assertExactKeys(result, ['version', 'schema', 'request_id', 'state_version', 'option_id', 'command_token']);
  if (result?.schema !== 'bounded_decision_result_v2' || result?.version !== 2) throw new MaterializationError('DECISION_RESULT_INVALID', 'Decision result schema is invalid.');
  if (result.request_id !== request.request_id || result.state_version !== request.state_version) throw new MaterializationError('DECISION_STATE_MISMATCH', 'Request or state version mismatch.');
  if (currentPolicyVersion != null && currentPolicyVersion !== request.policy_version) throw new MaterializationError('DECISION_POLICY_STALE', 'Decision policy version changed.');
  const nowMs = parseRfc3339(now, 'now');
  const expiresAtMs = parseRfc3339(request.expires_at, 'request.expires_at');
  parseRfc3339(request.issued_at, 'request.issued_at');
  if (nowMs >= expiresAtMs) throw new MaterializationError('DECISION_EXPIRED', 'Decision request expired.');
  const option = request.options.find((entry) => entry.option_id === result.option_id);
  if (!option || result.command_token !== option.command_token) throw new MaterializationError('DECISION_OPTION_NOT_ALLOWED', 'Result is outside the offered option set.');
  const actualOptionsDigest = canonicalDigest(request.options.map((entry) => normalizeOptionBasis(entry, request.state_version)));
  if (actualOptionsDigest !== request.options_digest) throw new MaterializationError('DECISION_OPTIONS_TAMPERED', 'Decision option set digest changed.');
  const expected = signCommandToken({ requestId: request.request_id, partyId: request.party_id, actorId: request.actor_id, policyId: request.policy_id, policyVersion: request.policy_version, optionsDigest: request.options_digest, optionId: option.option_id, commandId: option.command_id, stateVersion: request.state_version, expiresAt: request.expires_at, secret });
  if (!safeEqual(expected, result.command_token)) throw new MaterializationError('DECISION_TOKEN_INVALID', 'Command token signature is invalid.');
  for (const precondition of option.preconditions ?? []) {
    if (typeof evaluatePrecondition !== 'function' || evaluatePrecondition(precondition, currentState) !== true) throw new MaterializationError('DECISION_PRECONDITION_FAILED', 'Decision option precondition no longer holds.');
  }
  return deepFreeze({ request_id: request.request_id, option_id: option.option_id, command_id: option.command_id, state_version: request.state_version, response_digest: canonicalDigest(result) });
}

function normalizeOptionBasis(option, stateVersion) {
  const textFields = ['option_id', 'command_id', 'actor_id', 'target_id', 'reason_visible_to_actor'];
  if (!option || textFields.some((field) => typeof option[field] !== 'string' || !option[field].trim())
    || !Array.isArray(option.preconditions) || option.preconditions.some((value) => !value || typeof value !== 'object' || Array.isArray(value))
    || !option.expected_cost || typeof option.expected_cost !== 'object' || Array.isArray(option.expected_cost)
    || !Array.isArray(option.known_risks)
    || option.state_version !== stateVersion
    || !option.metadata || typeof option.metadata !== 'object' || Array.isArray(option.metadata)) {
    throw new MaterializationError('DECISION_OPTIONS_INVALID', 'Every option must provide the complete bounded-decision contract for the pinned state version.');
  }
  return {
    option_id: option.option_id,
    command_id: option.command_id,
    actor_id: option.actor_id,
    target_id: option.target_id,
    preconditions: structuredClone(option.preconditions),
    expected_cost: structuredClone(option.expected_cost),
    known_risks: structuredClone(option.known_risks),
    reason_visible_to_actor: option.reason_visible_to_actor,
    state_version: option.state_version,
    metadata: structuredClone(option.metadata)
  };
}

function parseRfc3339(value, label) {
  const pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;
  const parsed = typeof value === 'string' && pattern.test(value) ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(parsed)) throw new MaterializationError('DECISION_EXPIRY_INVALID', `${label} must be a valid RFC3339 timestamp.`);
  return parsed;
}

export function executeBoundedDecision({ validatedResult, handlers, context, validateChangeSet }) {
  const handler = handlers?.[validatedResult.command_id];
  if (typeof handler !== 'function') throw new MaterializationError('DECISION_HANDLER_MISSING', `No registered handler for ${validatedResult.command_id}.`);
  const changeSet = handler(deepFreeze(structuredClone(context)), validatedResult);
  if (!changeSet || changeSet.schema !== 'party_change_set_v2' || changeSet.version !== 2 || typeof validateChangeSet !== 'function' || validateChangeSet(changeSet, context) !== true) {
    throw new MaterializationError('DECISION_CHANGE_SET_INVALID', 'Decision handler must return a validated party_change_set_v2.');
  }
  return deepFreeze(structuredClone(changeSet));
}

function signCommandToken({ requestId, partyId, actorId, policyId, policyVersion, optionsDigest, optionId, commandId, stateVersion, expiresAt, secret }) {
  if (!secret) throw new MaterializationError('DECISION_SECRET_MISSING', 'Decision token secret is required.');
  const payload = stableStringify([requestId, partyId, actorId, policyId, policyVersion, optionsDigest, optionId, commandId, stateVersion, expiresAt]);
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

function assertExactKeys(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !allowed.includes(key)) || allowed.some((key) => !(key in value))) {
    throw new MaterializationError('DECISION_RESULT_INVALID', 'Decision result must match the exact bounded response shape.');
  }
}
