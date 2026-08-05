import { requestPlayerConversationContribution } from './player-conversation.js';

export async function startPlayerConversationContribution({
  normalized,
  ports,
  fail,
  callPort,
  normalizeApplyResult,
  progressAndProject,
  plannedMinutes
}) {
  const pendingPlayer = normalized.pendingPlayerExecution;
  if (pendingPlayer !== null
      && typeof ports.applyPendingPlayerContribution !== 'function') {
    fail(
      'TURN_CONVERSATION_PORT_MISSING',
      'Pending player resume requires one application port'
    );
  }
  const playerPlan = pendingPlayer?.plan
    ?? (await requestPlayerConversationContribution({
      request: normalized.playerRequest,
      conversationModel: ports.conversationModel,
      revalidateStateVersion: ports.revalidatePlayerStateVersion,
      validatePlan: ports.validatePlayerPlan ?? null
    })).plan;
  const rawPlayerResult = await callPort(
    pendingPlayer === null
      ? ports.applyPlayerContribution : ports.applyPendingPlayerContribution,
    {
      working_state: normalized.initialWorkingState,
      plan: playerPlan,
      contribution_index: 1
    },
    'TURN_CONVERSATION_PLAYER_APPLY_FAILED',
    'Player conversation contribution could not be applied'
  );
  const playerApplied = normalizeApplyResult(
    rawPlayerResult,
    'TURN_CONVERSATION_PLAYER_APPLY_INVALID'
  );
  const playerProgress = await progressAndProject({
    ports,
    applied: playerApplied,
    plan: playerPlan,
    contributionIndex: 1,
    plannedMinutes: pendingPlayer?.remaining_minutes ?? plannedMinutes,
    elapsedAlreadyComplete: pendingPlayer?.remaining_minutes === 0,
    perceptionPort: ports.projectPlayerContributionPerception
  });
  return { pendingPlayer, playerPlan, playerProgress };
}
