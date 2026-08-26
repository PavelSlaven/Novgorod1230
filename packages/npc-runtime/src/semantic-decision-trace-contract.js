import { exactKeys, freeze, stableId } from './internal.js';
import {
  validateConversationContributionPlan,
  validateNpcConversationResponseRequest
} from './conversation-contracts.js';
import {
  validateNpcCombatDecisionRequest,
  validateNpcCombatIntentPlan
} from './combat-decision-contracts.js';
import {
  finiteInteger,
  jsonSafe,
  TRACE_KEYS,
  validateNpcActionDecisionRequest
} from './semantic-decision-request-contract.js';

export function validateNpcSemanticDecisionTrace(value, request = null,
  validateNpcStepPlan) {
  if (!exactKeys(value, TRACE_KEYS)
    || value.schema !== 'npc_semantic_decision_trace_v1'
    || !stableId(value.request_id)
    || !stableId(value.root_turn_id)
    || !stableId(value.boundary_id)
    || !stableId(value.npc_ref)
    || !finiteInteger(value.committed_state_version, 1)
    || !finiteInteger(value.working_revision)
    || !stableId(value.applied_change_set_id)
    || value.status !== 'committed'
    || !semanticTracePlanValid(value.plan, request, validateNpcStepPlan)
    || value.request_id !== value.plan.request_id
    || value.boundary_id !== value.plan.boundary_id
    || value.npc_ref !== semanticPlanNpcId(value.plan)
    || value.committed_state_version !== semanticPlanStateVersion(value.plan)
    || !semanticTraceLineageMatches(value, value.plan)
    || !jsonSafe(value)) {
    return false;
  }
  return request === null || semanticTraceRequestMatches(value, request);
}

export function buildNpcSemanticDecisionTrace({
  request,
  plan,
  root_turn_id = request?.root_turn_id,
  working_revision = request?.working_revision,
  applied_change_set_id,
  status = 'committed'
} = {}, validateNpcStepPlan) {
  if (!semanticTracePlanValid(plan, request, validateNpcStepPlan)) {
    throw new TypeError('Semantic decision trace requires a matching request and NPC step plan');
  }
  const trace = {
    schema: 'npc_semantic_decision_trace_v1',
    request_id: request.request_id,
    root_turn_id,
    boundary_id: request.boundary_id,
    npc_ref: semanticPlanNpcId(plan),
    committed_state_version: semanticPlanStateVersion(plan),
    working_revision,
    plan,
    applied_change_set_id,
    status
  };
  if (!validateNpcSemanticDecisionTrace(trace, request, validateNpcStepPlan)) {
    throw new TypeError('NPC semantic decision trace must match npc_semantic_decision_trace_v1');
  }
  return freeze(trace);
}

function semanticTracePlanValid(plan, request, validateNpcStepPlan) {
  if (plan?.schema === 'npc_step_plan_v1') {
    return typeof validateNpcStepPlan === 'function'
      && (request === null
        ? validateNpcStepPlan(plan, null)
        : validateNpcActionDecisionRequest(request)
          && validateNpcStepPlan(plan, request));
  }
  if (plan?.schema === 'conversation_contribution_plan_v1') {
    return request === null
      ? validateConversationContributionPlan(plan)
      : validateNpcConversationResponseRequest(request)
        && validateConversationContributionPlan(plan, request);
  }
  if (plan?.schema === 'npc_combat_intent_plan_v1') {
    return request === null
      ? validateNpcCombatIntentPlan(plan)
      : validateNpcCombatDecisionRequest(request)
        && validateNpcCombatIntentPlan(plan, request);
  }
  return false;
}

function semanticPlanNpcId(plan) {
  if (plan?.schema === 'npc_step_plan_v1') return plan.npc_ref;
  if (plan?.schema === 'npc_combat_intent_plan_v1') {
    return plan.npc_ref?.entity_id;
  }
  return plan?.speaker_ref?.entity_id;
}

function semanticPlanStateVersion(plan) {
  if (plan?.schema === 'npc_step_plan_v1') {
    return plan.committed_state_version;
  }
  return plan?.schema === 'npc_combat_intent_plan_v1'
    ? Number(plan.state_version) : plan?.state_version;
}

function semanticTraceLineageMatches(trace, plan) {
  return plan.schema === 'npc_step_plan_v1'
    ? trace.root_turn_id === plan.root_turn_id
      && trace.working_revision === plan.working_revision
    : true;
}

function semanticTraceRequestMatches(trace, request) {
  if (request.schema === 'npc_action_decision_request_v1') {
    return validateNpcActionDecisionRequest(request)
      && matchingIdentity(trace.plan, request)
      && trace.root_turn_id === request.root_turn_id
      && trace.working_revision === request.working_revision;
  }
  if (request.schema === 'npc_combat_decision_request_v1') {
    return validateNpcCombatDecisionRequest(request)
      && validateNpcCombatIntentPlan(trace.plan, request)
      && trace.npc_ref === request.npc_ref.entity_id
      && trace.committed_state_version === Number(request.state_version);
  }
  return validateNpcConversationResponseRequest(request)
    && validateConversationContributionPlan(trace.plan, request)
    && trace.npc_ref === request.npc_ref.entity_id
    && trace.committed_state_version === request.state_version;
}

function matchingIdentity(value, request) {
  return value.request_id === request.request_id
    && value.root_turn_id === request.root_turn_id
    && value.boundary_id === request.boundary_id
    && value.committed_state_version === request.committed_state_version
    && value.working_revision === request.working_revision
    && value.decision_index === request.decision_index
    && value.npc_ref === request.npc_ref;
}
