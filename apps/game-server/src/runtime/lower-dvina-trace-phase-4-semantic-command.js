import {
  resolveTracePhase4ConversationExchange
} from './lower-dvina-trace-m2-conversation.js';
import {
  tracePhase4PreconditionSatisfied
} from './lower-dvina-trace-phase-4-admission.js';
import {
  createTracePhase4Command,
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
    check: contracts.check,
    checkContext: (state) => promiseOfferStage(state, contracts),
    consequence: async ({
      retrievedState,
      availability,
      checks,
      playerInput
    }) => {
      const offerStage = availability.causal_stages?.[0];
      const checkRequest = availability.check_requests?.[0];
      if (!validOfferBeforeCheck({
        offerStage,
        checkRequest,
        state: retrievedState,
        contracts
      })) {
        throw Object.assign(
          new Error('Phase 4 promise offer does not causally precede the check.'),
          { code: 'TRACE_PHASE_4_OFFER_STAGE_INVALID' }
        );
      }
      const checkResult = checks.results.find(
        (result) => result.check_id === contracts.check.check_id
      );
      if (!checkResult) {
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
          offerStage,
          checkRequest,
          playerConversationModel,
          npcSemanticModel,
          revalidateStateVersion
        });
      const outcomeRef = contracts.check.outcome_refs[
        checkResult.outcome.success ? 'success' : 'failure'
      ];
      return semanticConsequence({
        contracts,
        inputDigest,
        checkResult,
        offerStage,
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
      offer_committed_before_check: true,
      offer_stage: structuredClone(offerStage),
      check_request: structuredClone(checkRequest),
      check_result: structuredClone(checkResult),
      outcome_ref: outcomeRef,
      semantic_exchange: semanticExchange,
      response_kind: semanticExchange.response_kind,
      participating_fisher_id:
        contracts.actors.participating_fisher.instance_id,
      promise_state: 'offer_only',
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
