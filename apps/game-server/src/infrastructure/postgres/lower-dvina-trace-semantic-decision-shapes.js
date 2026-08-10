import {
  validateConversationContributionPlan,
  validateNpcActionDecisionRequest,
  validateNpcCombatDecisionRequest,
  validateNpcCombatIntentPlan,
  validateNpcConversationResponseRequest,
  validateNpcStepPlan
} from '@rus/npc-runtime';
import { canonicalDigest } from '@rus/materialization';

export function semanticRequestValid(request) {
  if (request?.schema === 'npc_action_decision_request_v1') {
    return validateNpcActionDecisionRequest(request);
  }
  return request?.schema === 'npc_combat_decision_request_v1'
    ? validateNpcCombatDecisionRequest(request)
    : validateNpcConversationResponseRequest(request);
}

export function semanticPlanValid(plan, request) {
  if (request?.schema === 'npc_action_decision_request_v1') {
    return validateNpcStepPlan(plan, request);
  }
  return request?.schema === 'npc_combat_decision_request_v1'
    ? validateNpcCombatIntentPlan(plan, request)
    : validateConversationContributionPlan(plan, request);
}

export function semanticRequestNpcId(request) {
  return request?.schema === 'npc_action_decision_request_v1'
    ? request.npc_ref
    : request?.npc_ref?.entity_id;
}

export function semanticRequestStateVersion(request) {
  return request?.schema === 'npc_action_decision_request_v1'
    ? request.committed_state_version : Number(request?.state_version);
}

export function semanticSignalsMatchBoundary(
  signals,
  boundary,
  snapshotSignals
) {
  return signals.every((signal) => {
    const snapshot = snapshotSignals.get(signal.signal_id);
    return semanticSignalsMatchDecisionBoundary([signal], boundary)
      && snapshot?.same_time_batch_key
        === boundary.same_time_batch_ref.entity_id
      && canonicalDigest(snapshot?.signal) === canonicalDigest(signal);
  });
}

export function semanticSignalsMatchDecisionBoundary(signals, boundary) {
  return signals.every((signal) =>
    canonicalDigest(signal.subject_ref) === canonicalDigest(boundary.npc_ref)
      && canonicalDigest(signal.occurred_at)
        === canonicalDigest(boundary.scheduled_at));
}
