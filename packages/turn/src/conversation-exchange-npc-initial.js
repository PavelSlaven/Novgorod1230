import { requestNpcSemanticDecision } from './npc-semantic-decision.js';
import { resolveNpcContributionSocialCheck } from
  './conversation-exchange-social-check.js';

export async function startNpcConversationContribution({ decision, normalized,
  ports, callPort, normalizeApplyResult, progressAndProject, plannedMinutes }) {
  const proposal = await requestNpcSemanticDecision({
    boundary: decision.boundary,
    request: decision.request,
    semanticModel: ports.npcSemanticModel,
    persistedTrace: decision.persisted_trace,
    revalidateStateVersion: ports.revalidateNpcStateVersion,
    validatePlan: ports.validateNpcPlan ?? null
  });
  const npcCheck = await resolveNpcContributionSocialCheck({
    plan: proposal.plan,
    request: decision.request,
    boundary: decision.boundary,
    resolver: ports.resolveNpcContributionCheck
  });
  const applied = normalizeApplyResult(await callPort(
    ports.applyNpcContribution,
    { working_state: normalized.initialWorkingState,
      boundary: decision.boundary, request: decision.request, proposal,
      check_result: npcCheck.check_result,
      social_delivery_result: npcCheck.social_delivery_result,
      contribution_index: 1 },
    'TURN_CONVERSATION_NPC_APPLY_FAILED',
    'NPC conversation contribution could not be applied'
  ), 'TURN_CONVERSATION_NPC_APPLY_INVALID');
  const progress = await progressAndProject({
    ports, applied, plan: proposal.plan, contributionIndex: 1,
    plannedMinutes,
    perceptionPort: ports.projectNpcContributionPerception,
    request: decision.request, proposal
  });
  return { progress, pendingPlayer: null, decision: {
    boundary: decision.boundary, request: decision.request, proposal
  } };
}
