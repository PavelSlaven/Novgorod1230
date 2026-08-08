import { requestPlayerConversationContribution, runConversationExchange } from
  '@rus/turn';
import { buildNpcDecision } from
  './lower-dvina-trace-m2-conversation-decision.js';
import { buildNpcResponseBoundaryBatch } from
  './lower-dvina-trace-m2-conversation-boundaries.js';
import {
  canonicalActors,
  deliveryResult,
  exactTimestamp,
  fail,
  npcRef,
  ref,
  sameTimeBatchKey
} from './lower-dvina-trace-m2-conversation-shared.js';
import { buildPlayerRequest } from
  './lower-dvina-trace-m2-conversation-request.js';
export { buildPlayerRequest } from
  './lower-dvina-trace-m2-conversation-request.js';
import {
  applyNpcPlan,
  applyPlayerPlan,
  projectNpcPerception,
  projectPlayerPerception
} from
  './lower-dvina-trace-m2-conversation-statements.js';
import {
  advanceConversationContributionTime,
  conversationExchangeDurationMinutes
} from
  './lower-dvina-trace-m2-conversation-time.js';
import { conversationNpcContext } from
  './lower-dvina-trace-m2-conversation-participants.js';
import {
  revalidatePendingNpcContribution,
  workingConversationContext
} from './lower-dvina-trace-m2-conversation-working-state.js';
import {
  findResumableConversationSession,
  hydratedPendingPlayerExecution,
  hydratedPendingNpcExecution
} from './lower-dvina-trace-m2-conversation-resume.js';
import {
  applyTerminalConversationOutcomes,
  initialConversationParticipantRefs,
  retireTerminalConversationParticipants
} from './lower-dvina-trace-m2-conversation-session.js';
import { projectM2ConversationExecutionResult } from
  './lower-dvina-trace-m2-conversation-result.js';
import { applyPersistedPlayerPlan } from './lower-dvina-trace-m2-conversation-player-resume.js';

export function createM2ConversationContext(input) {
  const stateVersion = input.state.party_state?.state_version;
  if (!Number.isSafeInteger(stateVersion) || stateVersion < 1
      || !Number.isSafeInteger(input.state.party_state?.turn_number)
      || input.state.party_state.turn_number < 0
      || !exactTimestamp(input.state.clock)
      || typeof input.state.party_id !== 'string'
      || !input.state.party_id.trim()
      || typeof input.state.actor_id !== 'string'
      || !input.state.actor_id.trim()
      || typeof input.state.position?.location_ref !== 'string'
      || !input.state.position.location_ref.trim()) {
    fail(
      'TRACE_M2_CONVERSATION_STATE_INVALID',
      'Conversation requires one exact committed state version and clock.'
    );
  }
  const targetRef = npcRef(input.targetActor.instance_id);
  const actualNpcActors = canonicalActors(input.actualNpcActors);
  if (!actualNpcActors.some(
    ({ instance_id: instanceId }) => instanceId === targetRef.entity_id
  )) {
    fail(
      'TRACE_M2_CONVERSATION_TARGET_NOT_PRESENT',
      'The target NPC must be an actual present listener.'
    );
  }
  const batchKey = sameTimeBatchKey(
    input.state.party_id,
    input.state.clock
  );
  const activeSession = findResumableConversationSession(
    input.state,
    ref('player_character', input.state.actor_id),
    targetRef
  );
  return {
    ...input,
    stateVersion,
    targetRef,
    actualNpcActors,
    batchKey,
    activeSession,
    conversationId: activeSession?.conversation_id
      ?? `conversation:${input.inputDigest.slice(0, 32)}`,
    exchangeId: (input.state.pending_npc_conversation_execution
      ?? input.state.pending_player_conversation_execution)?.exchange_id
      ?? `exchange:${input.inputDigest.slice(0, 32)}`,
    socialDeliveryResult:
      input.state.pending_player_conversation_execution
        ?.social_delivery_result
      ?? deliveryResult(
        input.checkResult,
        input.phase,
        input.state.party_id,
        input.state.party_state.turn_number + 1
      )
  };
}
export async function executeM2ConversationExchange(context) {
  const pendingPlayerExecution = hydratedPendingPlayerExecution(context);
  const pendingExecution = hydratedPendingNpcExecution(context);
  const playerRequest = buildPlayerRequest(context);
  const exchangeDurationMinutes = (pendingPlayerExecution ?? pendingExecution)
    ?.remaining_exchange_minutes
    ?? conversationExchangeDurationMinutes(context);
  const initialWorkingState = {
    state_version: context.stateVersion,
    clock: structuredClone(context.state.clock),
    world_state: structuredClone(context.state),
    elapsed_minutes: 0,
    temporal_boundary_refs: [],
    temporal_advance_results: [],
    statements: [],
    audiences: [],
    supporting_operation_perceptions: [],
    new_signal_records: [],
    consumed_signal_ids: [],
    terminal_npc_outcomes: [],
    active_participant_refs: initialConversationParticipantRefs(context)
  };
  const decisions = new Map();
  const npcOutcomes = new Map();
  let resumedOutcome = null;
  const contributionSlots = Math.min(
    context.contracts.conversationBindings.max_contributions_per_exchange,
    pendingExecution === null
      ? 1 + (pendingPlayerExecution?.plan ?? context.playerPlan)
        .intended_addressee_refs.length
      : Math.max(1, pendingExecution.remaining_responder_refs.length
        + (pendingExecution.remaining_minutes > 0 ? 1 : 0))
  );
  const exchange = await runConversationExchange({
    playerRequest,
    initialWorkingState,
    maxContributionsPerExchange:
      context.contracts.conversationBindings.max_contributions_per_exchange,
    timeBudget: {
      total_minutes: exchangeDurationMinutes,
      contribution_slots: contributionSlots,
      ...(context.conversationTimeContract?.mode === 'same_timestamp'
        ? { mode: 'same_timestamp' } : {})
    },
    pendingPlayerExecution,
    pendingNpcExecution: pendingExecution
  }, {
    conversationModel: context.playerPlan ? async () =>
      structuredClone(context.playerPlan) : context.playerConversationModel,
    revalidatePlayerStateVersion: context.revalidateStateVersion,
    applyPlayerContribution: ({ working_state: working, plan }) =>
      applyPlayerPlan(workingConversationContext(context, working), working, plan),
    applyPendingPlayerContribution: ({ working_state: working, plan }) => applyPersistedPlayerPlan(context, working, plan),
    advanceContributionTime: ({
      working_state: working,
      planned_duration_minutes: plannedDurationMinutes
    }) => advanceConversationContributionTime(
      context, working, plannedDurationMinutes
    ),
    revalidateAfterContribution: async () => {
      const current = await context.revalidateStateVersion();
      if (current !== context.stateVersion) {
        throw new Error('Conversation committed state changed during elapsed time.');
      }
      return true;
    },
    projectPlayerContributionPerception: ({
      working_state: working,
      contribution_event: contributionEvent,
      plan
    }) => projectPlayerPerception(
      workingConversationContext(context, working), working, contributionEvent,
      plan
    ),
    buildNpcResponseBoundaries: ({
      working_state: working,
      latest_contribution: latestContribution,
      processed_boundary_ids: processedBoundaryIds,
      pending_boundaries: pendingBoundaries = [],
      pending_responder_refs: pendingResponderRefs = [],
      same_time_batch_ref: resumedBatchRef = null
    }) => buildNpcResponseBoundaryBatch(
      workingConversationContext(context, working), working,
      { latestContribution, processedBoundaryIds, pendingBoundaries,
        pendingResponderRefs, resumedBatchRef }
    ),
    buildNpcResponseDecision: ({ working_state: working,
      latest_contribution: latestContribution, boundary }) => {
      const targetContext = conversationNpcContext({
        ...workingConversationContext(context, working),
        batchKey: boundary.same_time_batch_ref.entity_id
      }, boundary.npc_ref);
      const decision = buildNpcDecision(targetContext, working, boundary,
        latestContribution);
      decisions.set(decision.request.request_id, decision);
      return decision;
    },
    npcSemanticModel: context.npcSemanticModel,
    resolveNpcContributionCheck:
      context.npcSocialCheckResolver ?? undefined,
    revalidateNpcStateVersion: context.revalidateStateVersion,
    applyNpcContribution: ({
      working_state: working,
      request,
      proposal,
      check_result: checkResult,
      social_delivery_result: socialDeliveryResult,
      contribution_index: contributionIndex
    }) => {
      const targetContext = conversationNpcContext(
        workingConversationContext(context, working), request.npc_ref
      );
      const npcOutcome = targetContext.classifyNpcPlan(proposal.plan);
      npcOutcomes.set(request.request_id, npcOutcome);
      return applyNpcPlan(
        targetContext,
        working,
        request,
        proposal,
        contributionIndex,
        npcOutcome,
        socialDeliveryResult,
        checkResult
      );
    },
    applyPendingNpcContribution: ({
      working_state: working,
      plan,
      check_result: checkResult,
      social_delivery_result: socialDeliveryResult,
      contribution_index: contributionIndex
    }) => {
      const targetRef = plan.speaker_ref;
      const targetContext = conversationNpcContext(
        workingConversationContext(context, working), targetRef
      );
      resumedOutcome = targetContext.classifyNpcPlan(plan);
      return applyNpcPlan(
        targetContext,
        working,
        null,
        { plan, signal_ids_to_consume: [] },
        contributionIndex,
        resumedOutcome,
        socialDeliveryResult,
        checkResult
      );
    },
    revalidatePendingNpcContribution: ({ working_state: working, plan }) =>
      revalidatePendingNpcContribution(context, working, plan),
    applyNpcTerminalOutcomes: ({ working_state: working,
      terminal_outcomes: outcomes }) =>
      applyTerminalConversationOutcomes(working, outcomes),
    projectNpcContributionPerception: ({
      working_state: working,
      contribution_event: contributionEvent,
      request,
      proposal
    }) => projectNpcPerception(
      conversationNpcContext(workingConversationContext(context, working),
        request?.npc_ref ?? contributionEvent.speaker_ref),
      working,
      contributionEvent,
      request === null ? resumedOutcome : npcOutcomes.get(request.request_id),
      proposal.plan,
      request
    )
  });
  if (pendingExecution === null && (
    exchange.npc_decisions.some(({ request }) =>
      !decisions.has(request.request_id) || !npcOutcomes.has(request.request_id))
      || npcOutcomes.size !== exchange.npc_decisions.length)) {
    fail(
      'TRACE_M2_CONVERSATION_DECISION_CARDINALITY',
      'Every executed NPC semantic decision must have one exact outcome.'
    );
  }
  return projectM2ConversationExecutionResult({ exchange, context,
    pendingExecution, pendingPlayerExecution, npcOutcomes, resumedOutcome });
}

export async function prepareM2PlayerConversationPlan(context) {
  const decision = await requestPlayerConversationContribution({
    request: buildPlayerRequest(context),
    conversationModel: context.playerConversationModel,
    revalidateStateVersion: context.revalidateStateVersion
  });
  return decision.plan;
}
