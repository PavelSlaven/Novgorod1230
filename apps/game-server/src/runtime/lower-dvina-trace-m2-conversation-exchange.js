import { buildPlayerConversationInput } from '@rus/npc-runtime';
import { runConversationExchange } from '@rus/turn';
import { buildNpcDecision } from
  './lower-dvina-trace-m2-conversation-decision.js';
import { committedPlayerKnowledgeRefs } from
  './lower-dvina-trace-m2-conversation-projections.js';
import {
  canonicalActors,
  deliveryResult,
  exactTimestamp,
  fail,
  npcRef,
  ref,
  requiredRawText,
  sameTimeBatchKey
} from './lower-dvina-trace-m2-conversation-shared.js';
import { applyNpcPlan, applyPlayerPlan } from
  './lower-dvina-trace-m2-conversation-statements.js';

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
  return {
    ...input,
    stateVersion,
    targetRef,
    actualNpcActors,
    batchKey,
    conversationId: `conversation:${input.inputDigest.slice(0, 32)}`,
    exchangeId: `exchange:${input.inputDigest.slice(0, 32)}`,
    socialDeliveryResult: deliveryResult(
      input.checkResult,
      input.phase,
      input.state.party_id,
      input.state.party_state.turn_number + 1
    )
  };
}

export async function executeM2ConversationExchange(context) {
  const playerRequest = buildPlayerRequest(context);
  const initialWorkingState = {
    state_version: context.stateVersion,
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
      context.contracts.conversationBindings.max_contributions_per_exchange
  }, {
    conversationModel: context.playerConversationModel,
    revalidatePlayerStateVersion: context.revalidateStateVersion,
    applyPlayerContribution: ({ working_state: working, plan }) =>
      applyPlayerPlan(context, working, plan),
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
      decision = buildNpcDecision(context, working, latestContribution);
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
        context,
        working,
        request,
        proposal,
        contributionIndex,
        npcOutcome
      );
    }
  });
  if (!decision || !npcOutcome || exchange.npc_decisions.length !== 1) {
    fail(
      'TRACE_M2_CONVERSATION_DECISION_CARDINALITY',
      'Exactly one NPC boundary and semantic decision are required.'
    );
  }
  return {
    exchange,
    decision: exchange.npc_decisions[0],
    statements: exchange.working_state.statements,
    audiences: exchange.working_state.audiences,
    newSignalRecords: exchange.working_state.new_signal_records,
    consumedSignalIds: exchange.working_state.consumed_signal_ids,
    socialDeliveryResult: context.socialDeliveryResult,
    npcOutcome
  };
}

function buildPlayerRequest(context) {
  const playerRef = ref('player_character', context.state.actor_id);
  const presentListenerRefs = context.actualNpcActors.map(
    ({ instance_id: instanceId }) => npcRef(instanceId)
  );
  return buildPlayerConversationInput({
    schema: 'player_conversation_input_v1',
    request_id: `player-conversation-request:${context.inputDigest}`,
    conversation_id: context.conversationId,
    state_version: context.stateVersion,
    speaker_ref: playerRef,
    raw_text: requiredRawText(context.playerInput),
    received_at: `turn-input:${context.inputDigest}`,
    player_safe_context: {
      phase: context.phase,
      location_ref: context.state.position.location_ref,
      target_npc_ref: context.targetRef,
      present_listener_refs: presentListenerRefs,
      committed_knowledge_refs:
        committedPlayerKnowledgeRefs(context.state),
      ...(context.phase === 'phase_3' && context.checkResult !== null
        ? { presented_evidence_ref: context.contracts.ids.evidence }
        : {}),
      ...(context.phase === 'phase_4'
        ? {
            offer_policy_ref: context.contracts.promisePolicy.policy_id,
            offer_stage_digest: context.offerStage.stage_digest
          }
        : {})
    },
    operation_contract: context.playerOperationContract
  });
}
