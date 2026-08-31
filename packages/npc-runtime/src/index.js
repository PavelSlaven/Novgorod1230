export {
  NPC_RUNTIME_OWNER,
  NPC_RUNTIME_RESOURCE_LIMITS,
  NPC_RUNTIME_TYPED_ERRORS
} from './runtime-configuration.js';
export { orderNpcDecisionRequests } from './bounded-decision.js';
export {
  buildNpcDecisionBoundary,
  buildNpcDecisionSignal,
  evaluateNpcDecisionSignals,
  orderNpcDecisionBoundaries,
  validateNpcDecisionBoundary,
  validateNpcDecisionSignal
} from './decision-signals.js';
export {
  buildConversationContributionPlan,
  buildConversationSession,
  buildConversationStatementEvent,
  diagnoseConversationPlanDominantAct,
  buildNpcConversationResponseRequest,
  buildPlayerConversationContributionPlan,
  buildPlayerConversationInput,
  buildSocialDeliveryResult,
  orderNpcConversationDecisionRequests,
  validateConversationContributionPlan,
  validateConversationSession,
  validateConversationStatementEvent,
  validateNpcConversationResponseRequest,
  validatePlayerConversationContributionPlan,
  validatePlayerConversationInput,
  validateSocialDeliveryResult
} from './conversation-contracts.js';
export {
  buildNpcActionDecisionRequest,
  buildNpcActionDecisionRequestFromSnapshots,
  npcSafeSnapshotHasEntityEvidence,
  projectNpcSafeResourceSnapshots,
  buildNpcSemanticDecisionTrace,
  buildNpcStepPlan,
  diagnoseNpcStepPlan,
  validateNpcActionDecisionRequest,
  validateNpcSemanticDecisionTrace,
  validateNpcStepPlan
} from './semantic-decision-contracts.js';
export { buildNpcCombatDecisionRequest, buildNpcCombatIntentPlan, validateNpcCombatDecisionRequest, validateNpcCombatIntentPlan, validateNpcCombatPlanApplicability } from './combat-decision-contracts.js';
export {
  proposeNpcPerception,
  resolveConversationListenerPerception,
  resolveConversationVisualPerception
} from './perception.js';
export { proposeNpcScheduleTransition } from './schedule.js';
export {
  createNpcScheduleDecisionTerminalEffect,
  NPC_SCHEDULE_DECISION_TERMINAL_EFFECT_REF,
  npcScheduleDecisionTransitionId,
  resolveNpcScheduleDecisionTerminal
} from './schedule-decision-terminal.js';
export { selectApplicableNpcActivityExecution } from
  './activity-execution-selection.js';
export { matchesOperationContract } from './operation-contract-match.js';
export {
  buildNpcReactionPolicySnapshotFromAuthoringRow
} from './reaction-policy.js';

import { decideBoundedNpcAction as decideBoundedNpcActionInternal } from './bounded-decision.js';
import { proposeNpcReactionOptions as proposeNpcReactionOptionsInternal } from './reaction-options.js';
import { NPC_RUNTIME_RESOURCE_LIMITS } from './runtime-configuration.js';

export function proposeNpcReactionOptions(input = {}) {
  return proposeNpcReactionOptionsInternal(input, {
    maxDecisionOptions: NPC_RUNTIME_RESOURCE_LIMITS.max_decision_options
  });
}

export function decideBoundedNpcAction({
  request,
  selection = null,
  current_state_version,
  observed_preconditions_digest = null,
  validated_at,
  persisted_trace = null
} = {}) {
  return decideBoundedNpcActionInternal({
    request,
    selection,
    current_state_version,
    observed_preconditions_digest,
    validated_at,
    persisted_trace
  }, { maxDecisionOptions: NPC_RUNTIME_RESOURCE_LIMITS.max_decision_options });
}
