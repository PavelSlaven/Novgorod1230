import {
  requestPlayerConversationContribution,
  runConversationExchange
} from '@rus/turn';
import { buildNpcDecision } from
  './lower-dvina-trace-m2-conversation-decision.js';
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
  const activeSession = findActiveSession(
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
    exchangeId: `exchange:${input.inputDigest.slice(0, 32)}`,
    socialDeliveryResult: deliveryResult(
      input.checkResult,
      input.phase,
      input.state.party_id,
      input.state.party_state.turn_number + 1
    )
  };
}

function findActiveSession(state, playerRef, targetRef) {
  const candidates = (state.conversation_sessions ?? []).filter((session) =>
    session?.status === 'active'
      && session.location_ref?.entity_id === state.position.location_ref
      && session.active_participant_refs?.some(
        (participant) => participant.entity_kind === playerRef.entity_kind
          && participant.entity_id === playerRef.entity_id
      )
      && session.active_participant_refs?.some(
        (participant) => participant.entity_kind === targetRef.entity_kind
          && participant.entity_id === targetRef.entity_id
      ));
  if (candidates.length > 1) {
    fail(
      'TRACE_M2_CONVERSATION_SESSION_AMBIGUOUS',
      'Only one active conversation with the target may be resumed.'
    );
  }
  return candidates[0] ?? null;
}

export async function executeM2ConversationExchange(context) {
  const playerRequest = buildPlayerRequest(context);
  const exchangeDurationMinutes = conversationExchangeDurationMinutes(context);
  const initialWorkingState = {
    state_version: context.stateVersion,
    clock: structuredClone(context.state.clock),
    world_state: structuredClone(context.state),
    elapsed_minutes: 0,
    temporal_boundary_refs: [],
    temporal_advance_results: [],
    statements: [],
    audiences: [],
    new_signal_records: [],
    consumed_signal_ids: []
  };
  let decision = null;
  let npcOutcome = null;
  const exchange = await runConversationExchange({
    playerRequest,
    initialWorkingState,
    maxContributionsPerExchange:
      context.contracts.conversationBindings.max_contributions_per_exchange,
    timeBudget: {
      total_minutes: exchangeDurationMinutes,
      contribution_slots: 2
    }
  }, {
    conversationModel: context.playerPlan
      ? async () => structuredClone(context.playerPlan)
      : context.playerConversationModel,
    revalidatePlayerStateVersion: context.revalidateStateVersion,
    applyPlayerContribution: ({ working_state: working, plan }) =>
      applyPlayerPlan(workingContext(context, working), working, plan),
    advanceContributionTime: ({
      working_state: working,
      planned_duration_minutes: plannedDurationMinutes
    }) => advanceConversationContributionTime(
      context, working, plannedDurationMinutes
    ),
    completeExchangeTime: ({
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
      contribution_event: contributionEvent
    }) => projectPlayerPerception(
      workingContext(context, working), working, contributionEvent
    ),
    buildNpcResponseBatch: ({
      working_state: working,
      latest_contribution: latestContribution,
      processed_boundary_ids: processedBoundaryIds
    }) => {
      if (processedBoundaryIds.length > 0
          || latestContribution.speaker_ref?.entity_kind !==
            'player_character') {
        return { decisions: [], direct_addressee_refs: [] };
      }
      const targetReceived = working.audiences.at(-1)?.received_messages.some(
        ({ listener_ref: listenerRef }) =>
          listenerRef.entity_kind === context.targetRef.entity_kind
          && listenerRef.entity_id === context.targetRef.entity_id
      );
      if (!targetReceived) {
        return { decisions: [], direct_addressee_refs: [] };
      }
      decision = buildNpcDecision(
        workingContext(context, working), working, latestContribution
      );
      return {
        decisions: [decision],
        direct_addressee_refs: [context.targetRef]
      };
    },
    npcSemanticModel: context.npcSemanticModel,
    revalidateNpcStateVersion: context.revalidateStateVersion,
    applyNpcContribution: ({
      working_state: working,
      request,
      proposal,
      contribution_index: contributionIndex
    }) => {
      npcOutcome = context.classifyNpcPlan(proposal.plan);
      return applyNpcPlan(
        workingContext(context, working),
        working,
        request,
        proposal,
        contributionIndex,
        npcOutcome
      );
    },
    projectNpcContributionPerception: ({
      working_state: working,
      contribution_event: contributionEvent
    }) => projectNpcPerception(
      workingContext(context, working),
      working,
      contributionEvent,
      npcOutcome
    )
  });
  if (exchange.npc_decisions.length > 1
      || (exchange.npc_decisions.length === 1 && (!decision || !npcOutcome))
      || (exchange.npc_decisions.length === 0 && (decision || npcOutcome))) {
    fail(
      'TRACE_M2_CONVERSATION_DECISION_CARDINALITY',
      'The exchange may contain at most one exact NPC semantic decision.'
    );
  }
  return {
    exchange,
    decision: exchange.npc_decisions[0] ?? null,
    statements: exchange.working_state.statements,
    audiences: exchange.working_state.audiences,
    newSignalRecords: exchange.working_state.new_signal_records,
    consumedSignalIds: exchange.working_state.consumed_signal_ids,
    clockAfter: exchange.working_state.clock,
    elapsedMinutes: exchange.working_state.elapsed_minutes,
    temporalBoundaryRefs: exchange.temporal_boundary_refs,
    socialDeliveryResult: context.socialDeliveryResult,
    npcOutcome
  };
}

function workingContext(context, working) {
  const state = {
    ...context.state,
    ...structuredClone(working.world_state ?? {}),
    clock: structuredClone(working.clock)
  };
  const stateActors = new Map((state.npcs ?? []).map(
    (actor) => [actor.instance_id, actor]
  ));
  const actualNpcActors = context.actualNpcActors.map((actor) => ({
    ...actor,
    ...(stateActors.get(actor.instance_id) ?? {})
  }));
  return {
    ...context,
    state,
    actualNpcActors,
    batchKey: sameTimeBatchKey(state.party_id, state.clock)
  };
}

export async function prepareM2PlayerConversationPlan(context) {
  const decision = await requestPlayerConversationContribution({
    request: buildPlayerRequest(context),
    conversationModel: context.playerConversationModel,
    revalidateStateVersion: context.revalidateStateVersion
  });
  return decision.plan;
}
