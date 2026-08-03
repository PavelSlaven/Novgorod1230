import {
  resolveTracePhase4ConversationExchange
} from './lower-dvina-trace-m2-conversation.js';
import { prepareTracePhase4PlayerConversationPlan } from
  './lower-dvina-trace-m2-conversation-player.js';
import { PROMISE_OPERATION } from './lower-dvina-trace-m2-conversation-shared.js';
import {
  tracePhase4PreconditionSatisfied
} from './lower-dvina-trace-phase-4-admission.js';
import {
  createTracePhase4Command,
  buildPhase4CheckRequest,
  promiseOfferStage,
  validOfferBeforeCheck
} from './lower-dvina-trace-phase-4-command-shared.js';

export function semanticNegotiationCommand({
  contracts,
  inputDigest,
  playerConversationModel,
  npcSemanticModel,
  revalidateStateVersion
}) {
  const preconditions = [
    { kind: 'committed_location', location_ref: contracts.ids.shed },
    { kind: 'approved_access_policy' },
    { kind: 'present_actor', ref: 'ratsha_storehouse_helper', location_ref: contracts.ids.shed },
    { kind: 'present_actor', ref: 'onisim_boatman', location_ref: contracts.ids.shed },
    { kind: 'present_actor', ref: 'eremey_fisher', location_ref: contracts.ids.shed },
    { kind: 'present_actor', ref: 'participating_fisher', location_ref: contracts.ids.shed },
    {
      kind: 'capacity',
      actor_refs: [
        'eremey_fisher',
        'participating_fisher',
        'ratsha_storehouse_helper',
        'onisim_boatman'
      ]
    },
    { kind: 'ratsha_available' },
    { kind: 'communication_admitted' },
    { kind: 'exact_promise_contract' },
    { kind: 'promise_state', allowed: ['not_offered', 'offered'] },
    { kind: 'no_temporal_boundary_candidates' },
    { kind: 'no_player_response_boundary' }
  ];
  return createTracePhase4Command({
    optionId: contracts.ids.negotiationOption,
    label: 'Предложить Ратше условную защиту и потребовать сдачи',
    preconditions,
    duration: 10,
    availability: (state) => preconditions.every(
      (precondition) =>
        tracePhase4PreconditionSatisfied(precondition, state, contracts)
    ),
    prepareAvailability: async ({ state, playerInput }) => {
      const playerPlan = await prepareTracePhase4PlayerConversationPlan({
        state,
        contracts,
        playerInput,
        inputDigest,
        playerConversationModel,
        revalidateStateVersion
      });
      const offersProtection = playerPlan.supporting_operations.some(
        ({ op } = {}) => op === PROMISE_OPERATION
      );
      const offerStage = offersProtection
        ? promiseOfferStage(state, contracts) : null;
      const checkRequests = checkRequestsForPlan(
        playerPlan,
        contracts,
        offerStage
      );
      return {
        check_requests: checkRequests,
        causal_stages: [{
          schema: 'rus.trace_player_conversation_plan_stage.v1',
          plan: structuredClone(playerPlan)
        }, ...(offerStage ? [offerStage] : [])]
      };
    },
    consequence: async ({
      retrievedState,
      availability,
      checks,
      playerInput
    }) => {
      const playerPlan = availability.causal_stages?.find(
        ({ schema }) => schema === 'rus.trace_player_conversation_plan_stage.v1'
      )?.plan;
      const promiseStage = availability.causal_stages?.find(
        ({ schema }) => schema === 'rus.trace_promise_offer_stage.v1'
      ) ?? null;
      const checkRequest = availability.check_requests?.[0] ?? null;
      if (!playerPlan
          || (promiseStage !== null && checkRequest !== null
            && !validOfferBeforeCheck({
        offerStage: promiseStage,
        checkRequest,
        state: retrievedState,
        contracts
      }))) {
        throw Object.assign(
          new Error('Phase 4 promise offer does not causally precede the check.'),
          { code: 'TRACE_PHASE_4_OFFER_STAGE_INVALID' }
        );
      }
      const checkResult = checkRequest
        ? checks.results.find(
            (result) => result.check_id === contracts.check.check_id
          ) ?? null
        : null;
      if (checkRequest && !checkResult) {
        throw Object.assign(
          new Error('Phase 4 code-owned check result is missing.'),
          { code: 'TRACE_PHASE_4_CHECK_RESULT_MISSING' }
        );
      }
      const semanticExchange =
        await resolveTracePhase4ConversationExchange({
          state: retrievedState,
          contracts,
          playerInput,
          inputDigest,
          checkResult,
          offerStage: promiseStage,
          checkRequest,
          playerPlan,
          playerConversationModel,
          npcSemanticModel,
          revalidateStateVersion
        });
      const outcomeRef = checkResult
        ? contracts.check.outcome_refs[
            checkResult.outcome.success ? 'success' : 'failure'
          ]
        : null;
      return semanticConsequence({
        contracts,
        inputDigest,
        checkResult,
        offerStage: promiseStage,
        checkRequest,
        outcomeRef,
        semanticExchange
      });
    }
  });
}

function semanticConsequence({ contracts, inputDigest, checkResult,
  offerStage, checkRequest, outcomeRef, semanticExchange }) {
  return {
    version: 1,
    schema: 'turn_consequence_package',
    status: 'resolved',
    activity_attempt_id: `attempt:${inputDigest.slice(0, 32)}`,
    duration_minutes: 10,
    phase4_kind: 'negotiation',
    negotiation: {
      activity_ref: contracts.negotiation.profile_id,
      offer_committed_before_check: offerStage !== null,
      offer_stage: structuredClone(offerStage),
      check_request: structuredClone(checkRequest),
      check_result: structuredClone(checkResult),
      outcome_ref: outcomeRef,
      semantic_exchange: semanticExchange,
      response_kind: semanticExchange.response_kind,
      participating_fisher_id:
        contracts.actors.participating_fisher.instance_id,
      promise_state: offerStage === null ? 'unchanged' : 'offer_only',
      objective_fact_outputs: [],
      player_response_boundary: semanticExchange.combat_handoff ?? null,
      activity_roots: [{
        activity_ref: contracts.negotiation.profile_id,
        duration_minutes: 10
      }]
    },
    visible_seed: {},
    hidden_update: {},
    state_changes: [],
    suggested_actions: []
  };
}

function checkRequestsForPlan(plan, contracts, offerStage) {
  if (plan.resolution === 'automatic') return [];
  if (plan.check?.attribute_ref !== contracts.check.attribute
      || plan.check?.skill_ref !== contracts.check.skill
      || plan.check?.difficulty_band !== contracts.check.check_id) {
    throw Object.assign(new Error('Unsupported Phase 4 player social check.'), {
      code: 'TRACE_M2_PLAYER_CHECK_UNSUPPORTED'
    });
  }
  return [buildPhase4CheckRequest(contracts.check, offerStage)];
}
