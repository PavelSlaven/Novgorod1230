import { executeBoundedDecision, issueBoundedDecisionRequest, validateBoundedDecisionResult } from '@rus/materialization';

export function createTurnDecisionRequest({ requestId, partyId, actorId, policy, stateVersion, expiresAt, issuedAt, eligibleOptions, secret }) {
  if (policy?.requires_bounded_decision !== true) throw new TypeError('Policy does not authorize a bounded decision.');
  const allowed = new Set(policy.command_ids ?? []);
  const options = (eligibleOptions ?? []).filter((option) => allowed.has(option.command_id) && option.preconditions_pass === true);
  return issueBoundedDecisionRequest({ requestId, partyId, actorId, policyId: policy.policy_id, policyVersion: policy.version, stateVersion, expiresAt, issuedAt, options, secret });
}

export function resolveTurnDecision({ request, llmResult, currentStateVersion, currentPolicyVersion, currentState, evaluatePrecondition, validateChangeSet, secret, handlers, context, now }) {
  if (currentStateVersion !== request.state_version) throw Object.assign(new Error('Party state changed after bounded decision request.'), { code: 'TURN_DECISION_STATE_STALE' });
  const validatedResult = validateBoundedDecisionResult({ request, result: llmResult, secret, now, currentPolicyVersion, currentState, evaluatePrecondition });
  return executeBoundedDecision({ validatedResult, handlers, context, validateChangeSet });
}
