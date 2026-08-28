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
  createM2ConversationExchangeSetup
} from './lower-dvina-trace-m2-conversation-exchange-setup.js';
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
  const conversationActorRefs = input.conversationActorRefs == null ? null
    : canonicalActors(input.conversationActorRefs.map((reference) => ({
      instance_id: reference.entity_id, ref: reference
    }))).map(({ ref: reference, instance_id: instanceId }) =>
      reference ?? (instanceId === input.state.actor_id
        ? ref('player_character', instanceId) : npcRef(instanceId)));
  if (conversationActorRefs !== null && (!conversationActorRefs.some(
    (reference) => reference.entity_kind === 'npc'
      && reference.entity_id === targetRef.entity_id
  ) || conversationActorRefs.some((reference) =>
    reference.entity_kind === 'player_character'
      ? reference.entity_id !== input.state.actor_id
      : reference.entity_kind !== 'npc' || !actualNpcActors.some(
        ({ instance_id: instanceId }) => instanceId === reference.entity_id)))) {
    fail('TRACE_M2_CONVERSATION_ACTOR_SCOPE_INVALID',
      'Conversation actor scope must contain only current exact participants.');
  }
  const batchKey = sameTimeBatchKey(
    input.state.party_id,
    input.state.clock
  );
  const activeSession = conversationActorRefs === null
    ? findResumableConversationSession(
        input.state,
        ref('player_character', input.state.actor_id),
        targetRef
      )
    : null;
  return {
    ...input,
    stateVersion,
    targetRef,
    actualNpcActors,
    conversationActorRefs,
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
export async function executeM2ConversationExchange(context, {
  initialNpcDecision = null
} = {}) {
  const pendingPlayerExecution = context.conversationActorRefs === null
    ? hydratedPendingPlayerExecution(context) : null;
  const pendingExecution = context.conversationActorRefs === null
    ? hydratedPendingNpcExecution(context) : null;
  const { decisions, npcOutcomes, exchangeInput, advanceContributionTime } =
    createM2ConversationExchangeSetup(
      context, initialNpcDecision, pendingPlayerExecution, pendingExecution
    );
  let resumedOutcome = null;
  const exchange = await runConversationExchange(exchangeInput, {
    conversationModel: context.playerPlan ? async () =>
      structuredClone(context.playerPlan) : context.playerConversationModel,
    revalidatePlayerStateVersion: context.revalidateStateVersion,
    applyPlayerContribution: ({ working_state: working, plan }) =>
      applyPlayerPlan(workingConversationContext(context, working), working, plan),
    applyPendingPlayerContribution: ({ working_state: working, plan }) => applyPersistedPlayerPlan(context, working, plan),
    advanceContributionTime,
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
    ...(context.validateNpcPlan === undefined ? {} : {
      validateNpcPlan: context.validateNpcPlan
    }),
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
