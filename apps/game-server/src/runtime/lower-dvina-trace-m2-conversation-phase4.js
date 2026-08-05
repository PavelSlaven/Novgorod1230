import {
  createM2ConversationContext,
  executeM2ConversationExchange,
  prepareM2PlayerConversationPlan
} from './lower-dvina-trace-m2-conversation-exchange.js';
import { classifyRatshaPlan } from
  './lower-dvina-trace-m2-conversation-plans.js';
import {
  BARGAIN_OPERATION,
  fail,
  freezeResult,
  LIE_OPERATION,
  PROMISE_OPERATION,
  ref,
  requireCommonInput,
  sameTimeBatchKey,
  SURRENDER_OPERATION
} from './lower-dvina-trace-m2-conversation-shared.js';
import { buildSurrenderProjection } from
  './lower-dvina-trace-m2-conversation-surrender.js';
import { hydratedPendingPlayerExecution } from
  './lower-dvina-trace-m2-conversation-resume.js';

export async function resolveTracePhase4ConversationExchange({
  state, contracts, playerInput, inputDigest, checkResult, offerStage,
  checkRequest, playerConversationModel, npcSemanticModel,
  temporalAdvanceOwner, revalidateStateVersion, playerPlan = null,
  npcSocialCheckResolver = null
} = {}) {
  requireCommonInput({ state, contracts, playerInput, inputDigest,
    playerConversationModel, npcSemanticModel, revalidateStateVersion });
  const persistedPlayer = state.pending_player_conversation_execution ?? null;
  const effectiveCheckResult = persistedPlayer?.check_result ?? checkResult;
  const effectiveCheckRequest = persistedPlayer?.check_request ?? checkRequest;
  const effectiveOfferStage = persistedPlayer?.offer_stage ?? offerStage;
  requireCausalInput({ checkResult: effectiveCheckResult,
    checkRequest: effectiveCheckRequest, offerStage: effectiveOfferStage,
    contracts });
  const mapping = contracts.conversationSignalMappings?.demand;
  const target = contracts.actors?.ratsha_storehouse_helper;
  if (!mapping || !target?.instance_id
      || mapping.target_npc_ref !== 'ratsha_storehouse_helper') {
    fail('TRACE_M2_PHASE_4_CONTRACT_GAP',
      'The exact Phase 4 conversation binding is required.');
  }
  const actualNpcActors = Object.entries(contracts.actors)
    .map(([actorRef, actor]) => ({ ref: actorRef, ...structuredClone(actor) }))
    .filter(({ anchor_id: anchorId }) => anchorId === contracts.anchors.shed);
  const pendingExecution = state.pending_npc_conversation_execution ?? null;
  const pendingPlayer = hydratedPendingPlayerExecution({ state });
  const effectiveInputDigest = (pendingExecution ?? persistedPlayer)
    ?.source_input_digest
    ?? inputDigest;
  const initialContext = createM2ConversationContext({
    phase: 'phase_4', state, contracts, playerInput,
    inputDigest: effectiveInputDigest, checkResult: effectiveCheckResult,
    mapping, targetActor: { ref: 'ratsha_storehouse_helper', ...target },
    actualNpcActors, playerConversationModel, npcSemanticModel,
    revalidateStateVersion, temporalAdvanceOwner, npcSocialCheckResolver,
    playerOperationContract: {
      [PROMISE_OPERATION]: {
        owner: '@rus/social-law', policy_ref: contracts.promisePolicy.policy_id
      }
    },
    npcOperationContract: {
      [SURRENDER_OPERATION]: {
        required_dominant_acts: ['accept', 'promise', 'confess'],
        required_interaction_tag: 'surrender'
      },
      [BARGAIN_OPERATION]: {
        required_dominant_acts: ['negotiate', 'offer', 'threaten'],
        required_interaction_tag: 'bargain'
      },
      [LIE_OPERATION]: {
        required_interaction_tag: 'lie',
        required_speaker_posture: 'knowingly_false'
      }
    },
    npcDecisionScope: {
      action_handoff_available: false, combat_handoff_available: true
    },
    npcSocialCheckProfile: contracts.npcSocialCheckProfile,
    npcContributionReferencePolicy: {
      entity_refs: [],
      knowledge_refs: [],
      combat_target_refs: [ref('player_character', state.actor_id)]
    },
    offerStage: effectiveOfferStage, checkRequest: effectiveCheckRequest,
    classifyNpcPlan: classifyRatshaPlan,
    playerPlan
  });
  const effectivePlayerPlan = pendingExecution !== null ? null
    : pendingPlayer?.plan
      ?? playerPlan ?? await prepareM2PlayerConversationPlan(initialContext);
  const context = { ...initialContext, playerPlan: effectivePlayerPlan };
  return resultProjection(
    await executeM2ConversationExchange(context),
    context,
    state,
    effectiveOfferStage,
    effectiveCheckRequest,
    effectiveInputDigest
  );
}

function requireCausalInput({ checkResult, checkRequest, offerStage, contracts }) {
  const hasCheck = checkResult !== null || checkRequest !== null;
  if ((checkResult === null) !== (checkRequest === null)
      || (hasCheck && (checkResult.check_id !== contracts.check?.check_id
        || checkRequest.check_id !== contracts.check?.check_id))
      || (offerStage !== null && typeof offerStage.stage_digest !== 'string')
      || (offerStage !== null && hasCheck
        && checkRequest.causal_predecessor_stage_digest
          !== offerStage.stage_digest)) {
    fail('TRACE_M2_PHASE_4_CAUSAL_INPUT_MISSING',
      'The committed offer stage and code-owned check are required.');
  }
}

function resultProjection(result, context, state, offerStage, checkRequest,
  inputDigest) {
  const surrender = result.npcOutcome?.kind === 'surrender'
    ? buildSurrenderProjection(result, context) : null;
  const handoff = structuredClone(result.exchange.handoff);
  return freezeResult({
    input_digest: inputDigest,
    exchange: result.exchange,
    same_time_batch_ref: ref('temporal_batch',
      sameTimeBatchKey(state.party_id, result.clockAfter)),
    clock_after: structuredClone(result.clockAfter),
    exact_elapsed_minutes: result.elapsedMinutes,
    temporal_boundary_refs: structuredClone(result.temporalBoundaryRefs),
    statements: result.statements, audiences: result.audiences,
    decision_boundary: result.decision?.boundary ?? null,
    decision_request: result.decision?.request ?? null,
    decision_plan: result.decision?.proposal.plan ?? null,
    decisions: structuredClone(result.decisions),
    npc_outcomes: structuredClone(result.npcOutcomes),
    pending_npc_execution:
      structuredClone(result.exchange.pending_npc_execution),
    pending_player_execution: result.exchange.pending_player_execution == null
      ? null : {
          ...structuredClone(result.exchange.pending_player_execution),
          conversation_id: context.conversationId,
          exchange_id: context.exchangeId,
          check_result: structuredClone(context.checkResult),
          social_delivery_result:
            structuredClone(context.socialDeliveryResult),
          offer_stage: structuredClone(offerStage),
          check_request: structuredClone(checkRequest)
        },
    resumed_npc_execution:
      structuredClone(result.resumedNpcExecution),
    resumed_player_execution:
      structuredClone(result.resumedPlayerExecution),
    social_delivery_result: result.socialDeliveryResult,
    new_signal_records: result.newSignalRecords,
    consumed_signal_ids: result.consumedSignalIds,
    terminal_npc_outcomes: structuredClone(result.terminalNpcOutcomes),
    offer_stage: structuredClone(offerStage),
    check_request: structuredClone(checkRequest),
    surrender: surrender?.surrender ?? null,
    commitment: surrender?.commitment ?? null,
    knife_transition_eligibility: surrender?.knifeTransitionEligibility ?? null,
    lie: result.npcOutcome?.kind === 'lie'
      ? result.npcOutcome.factualProjection : null,
    bargain: result.npcOutcome?.kind === 'bargain'
      ? result.npcOutcome.factualProjection : null,
    speech: result.npcOutcome?.kind === 'speech'
      ? result.npcOutcome.factualProjection : null,
    silence: result.npcOutcome?.kind === 'silence',
    leave_conversation: result.npcOutcome?.kind === 'leave_conversation',
    handoff,
    action_handoff: handoff?.kind === 'actor_step' ? handoff : null,
    combat_handoff: handoff?.kind === 'combat' ? handoff : null,
    response_kind: result.npcOutcome?.kind ?? null,
    objective_truth_writes: []
  });
}
