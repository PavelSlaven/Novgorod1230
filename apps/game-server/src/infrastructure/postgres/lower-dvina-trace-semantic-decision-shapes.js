import {
  validateConversationContributionPlan,
  validateNpcActionDecisionRequest,
  validateNpcConversationResponseRequest,
  validateNpcStepPlan
} from '@rus/npc-runtime';

export function semanticRequestValid(request) {
  return request?.schema === 'npc_action_decision_request_v1'
    ? validateNpcActionDecisionRequest(request)
    : validateNpcConversationResponseRequest(request);
}

export function semanticPlanValid(plan, request) {
  return request?.schema === 'npc_action_decision_request_v1'
    ? validateNpcStepPlan(plan, request)
    : validateConversationContributionPlan(plan, request);
}

export function semanticRequestNpcId(request) {
  return request?.schema === 'npc_action_decision_request_v1'
    ? request.npc_ref
    : request?.npc_ref?.entity_id;
}

export function semanticRequestStateVersion(request) {
  return request?.schema === 'npc_action_decision_request_v1'
    ? request.committed_state_version
    : request?.state_version;
}
