import {
  createM2ConversationContext,
  executeM2ConversationExchange,
  prepareM2PlayerConversationPlan
} from './lower-dvina-trace-m2-conversation-exchange.js';
import { classifyOrdinaryConversationPlan, classifyRatshaPlan } from
  './lower-dvina-trace-m2-conversation-plans.js';
import {
  BARGAIN_OPERATION,
  fail,
  LIE_OPERATION,
  PROMISE_OPERATION,
  ref,
  requireCommonInput,
  SURRENDER_OPERATION
} from './lower-dvina-trace-m2-conversation-shared.js';
import { hydratedPendingPlayerExecution } from
  './lower-dvina-trace-m2-conversation-resume.js';
import { phase4ConversationResult as resultProjection } from
  './lower-dvina-trace-m2-conversation-phase4-result.js';
export async function resolveTracePhase4ConversationExchange({
  state, contracts, playerInput, inputDigest, checkResult, offerStage,
  checkRequest, playerConversationModel, npcSemanticModel,
  temporalAdvanceOwner, revalidateStateVersion, playerPlan = null,
  npcSocialCheckResolver = null, targetActorRef = 'ratsha_storehouse_helper'
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
  const target = contracts.actors?.[targetActorRef];
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
  const ratshaTarget = targetActorRef === 'ratsha_storehouse_helper';
  const followupAdmission = ratshaTarget
    ? phase4FollowupAdmission(
        effectiveCheckResult,
        contracts.npcSocialCheckProfile
      )
    : ordinaryFollowupAdmission();
  const initialContext = createM2ConversationContext({
    phase: 'phase_4', state, contracts, playerInput,
    inputDigest: effectiveInputDigest, checkResult: effectiveCheckResult,
    mapping, targetActor: { ref: targetActorRef, ...target },
    actualNpcActors, playerConversationModel, npcSemanticModel,
    revalidateStateVersion, temporalAdvanceOwner, npcSocialCheckResolver,
    playerOperationContract: ratshaTarget ? {
      [PROMISE_OPERATION]: {
        owner: '@rus/social-law', policy_ref: contracts.promisePolicy.policy_id
      }
    } : {},
    ...followupAdmission,
    npcSocialCheckProfile: ratshaTarget
      ? contracts.npcSocialCheckProfile : null,
    npcContributionReferencePolicy: {
      entity_refs: [],
      knowledge_refs: ratshaTarget
        ? contracts.confessionStatement.source_knowledge_refs.map(
          statementKnowledgeRef)
        : [],
      combat_target_refs: followupAdmission.npcDecisionScope
        .combat_handoff_available ? [ref('player_character', state.actor_id)] : []
    },
    offerStage: effectiveOfferStage, checkRequest: effectiveCheckRequest,
    classifyNpcPlan: ratshaTarget
      ? (plan, request = null) => classifyRatshaFollowup(plan, {
          checkResult: effectiveCheckResult,
          confessionAssertionId:
            contracts.confessionStatement.assertion.assertion_id
        }, request)
      : classifyOrdinaryConversationPlan,
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

function statementKnowledgeRef(value) {
  const separator = value.indexOf(':');
  if (separator < 1 || separator === value.length - 1) {
    fail('TRACE_M2_RATSHA_CONFESSION_KNOWLEDGE_REF_INVALID',
      'Ratsha confession source knowledge ref is invalid.');
  }
  return ref(value.slice(0, separator), value.slice(separator + 1));
}
function ordinaryFollowupAdmission() {
  return {
    npcOperationContract: {},
    npcDecisionScope: {
      action_handoff_available: false,
      combat_handoff_available: false
    }
  };
}
function phase4FollowupAdmission(checkResult, socialCheckProfile) {
  const band = checkResult?.outcome?.band ?? null;
  if (['clean_success', 'success', 'success_with_cost'].includes(band)) {
    return {
      npcOperationContract: {
        [SURRENDER_OPERATION]: {
          required_dominant_acts: ['accept', 'promise', 'confess'],
          required_interaction_tag: 'surrender'
        }
      },
      npcDecisionScope: {
        action_handoff_available: false,
        combat_handoff_available: false,
        allowed_contribution_kinds: ['speech'],
        required_supporting_operation: { op: SURRENDER_OPERATION }
      }
    };
  }
  if (band === 'failure_with_consequence') {
    return {
      npcOperationContract: {
        [BARGAIN_OPERATION]: {
          required_dominant_acts: ['negotiate', 'offer', 'threaten'],
          required_interaction_tag: 'bargain',
          required_resolution: 'check_required',
          required_check: {
            attribute_ref: socialCheckProfile.attribute_ref,
            skill_ref: socialCheckProfile.skill_ref,
            difficulty_band: socialCheckProfile.profile_id
          }
        }
      },
      npcDecisionScope: {
        action_handoff_available: false, combat_handoff_available: true,
        allowed_contribution_kinds: ['speech', 'combat_handoff'],
        required_supporting_operation: { op: BARGAIN_OPERATION }
      }
    };
  }
  if (band === 'severe_failure') return {
    npcOperationContract: {},
    npcDecisionScope: { action_handoff_available: false,
      combat_handoff_available: true,
      allowed_contribution_kinds: ['combat_handoff'] }
  };
  return {
    npcOperationContract: {
      [SURRENDER_OPERATION]: {
        required_dominant_acts: ['accept', 'promise', 'confess'],
        required_interaction_tag: 'surrender'
      },
      [BARGAIN_OPERATION]: {
        required_dominant_acts: ['negotiate', 'offer', 'threaten'],
        required_interaction_tag: 'bargain',
        required_resolution: 'check_required',
        required_check: {
          attribute_ref: socialCheckProfile.attribute_ref,
          skill_ref: socialCheckProfile.skill_ref,
          difficulty_band: socialCheckProfile.profile_id
        }
      },
      [LIE_OPERATION]: {
        required_interaction_tag: 'lie',
        required_speaker_posture: 'knowingly_false'
      }
    },
    npcDecisionScope: {
      action_handoff_available: false, combat_handoff_available: true
    }
  };
}
function classifyRatshaFollowup(plan, { checkResult, confessionAssertionId },
  request = null) {
  const outcome = classifyRatshaPlan(plan, { confessionAssertionId });
  if (request?.decision_scope.required_supporting_operation === undefined) {
    return outcome;
  }
  const band = checkResult?.outcome?.band ?? null;
  const admitted = ['clean_success', 'success', 'success_with_cost'].includes(band)
    ? ['surrender']
    : ['failure_with_consequence', 'severe_failure'].includes(band)
      ? ['bargain', 'combat_handoff'] : null;
  if (admitted !== null && !admitted.includes(outcome.kind)) {
    fail('TRACE_M2_RATSHA_FOLLOWUP_NOT_ADMITTED',
      'Ratsha response is outside the check-admitted follow-up set.');
  }
  return outcome;
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
