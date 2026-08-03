import {
  createM2ConversationContext,
  executeM2ConversationExchange
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

export async function resolveTracePhase4ConversationExchange({
  state, contracts, playerInput, inputDigest, checkResult, offerStage,
  checkRequest, playerConversationModel, npcSemanticModel,
  revalidateStateVersion, playerPlan = null
} = {}) {
  requireCommonInput({ state, contracts, playerInput, inputDigest,
    playerConversationModel, npcSemanticModel, revalidateStateVersion });
  requireCausalInput({ checkResult, checkRequest, offerStage, contracts });
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
  const context = createM2ConversationContext({
    phase: 'phase_4', state, contracts, playerInput, inputDigest, checkResult,
    mapping, targetActor: { ref: 'ratsha_storehouse_helper', ...target },
    actualNpcActors, playerConversationModel, npcSemanticModel,
    revalidateStateVersion,
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
    offerStage, checkRequest,
    classifyNpcPlan: (plan) => classifyRatshaPlan(plan, {
      offerAvailable: offerStage !== null
    }),
    playerPlan
  });
  return resultProjection(
    await executeM2ConversationExchange(context),
    context,
    state,
    offerStage,
    checkRequest
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

function resultProjection(result, context, state, offerStage, checkRequest) {
  const surrender = result.npcOutcome?.kind === 'surrender'
    ? buildSurrenderProjection(result, context) : null;
  const combatHandoff = result.npcOutcome?.kind === 'combat_handoff'
    ? structuredClone(result.exchange.handoff) : null;
  return freezeResult({
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
    social_delivery_result: result.socialDeliveryResult,
    new_signal_records: result.newSignalRecords,
    consumed_signal_ids: result.consumedSignalIds,
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
    combat_handoff: combatHandoff,
    response_kind: result.npcOutcome?.kind ?? null,
    objective_truth_writes: []
  });
}
