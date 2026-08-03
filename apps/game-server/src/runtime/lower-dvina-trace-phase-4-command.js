import { tracePhase4PreconditionSatisfied } from './lower-dvina-trace-phase-4-admission.js';
import { negotiationEffect, routeToShedEffect } from './lower-dvina-trace-phase-4-effects.js';
import { resolveTracePhase4NpcDecision } from './lower-dvina-trace-phase-4-npc-decision.js';
import {
  createTracePhase4Command,
  promiseOfferStage,
  validOfferBeforeCheck
} from './lower-dvina-trace-phase-4-command-shared.js';
import { semanticNegotiationCommand } from
  './lower-dvina-trace-phase-4-semantic-command.js';

export { tracePhase4PreconditionSatisfied };

export function createTracePhase4Commands({ contracts, inputDigest,
  selectNpcDecision, playerConversationModel = null, npcSemanticModel = null,
  temporalAdvanceOwner = null,
  revalidateStateVersion = null }) {
  const conversation = contracts.conversationBindings != null
    ? semanticNegotiationCommand({
        contracts,
        inputDigest,
        playerConversationModel,
        npcSemanticModel,
        temporalAdvanceOwner,
        revalidateStateVersion
      })
    : negotiationCommand({ contracts, inputDigest, selectNpcDecision });
  return [routeCommand({ contracts, inputDigest }), conversation];
}
function routeCommand({ contracts, inputDigest }) {
  const preconditions = [
    { kind: 'committed_location', location_ref: contracts.ids.camp },
    { kind: 'known_route', route_ref: contracts.route.route_id },
    { kind: 'present_actor', ref: 'eremey_fisher', location_ref: contracts.ids.camp },
    { kind: 'present_actor', ref: 'participating_fisher', location_ref: contracts.ids.camp },
    {
      kind: 'capacity',
      actor_refs: [
        'eremey_fisher',
        'participating_fisher',
        'ratsha_storehouse_helper',
        'onisim_boatman'
      ]
    },
    {
      kind: 'actors_not_incompatible_activity',
      actor_refs: [
        'player_clerk',
        'eremey_fisher',
        'participating_fisher'
      ]
    },
    { kind: 'arrival_subject_state' },
    { kind: 'no_temporal_boundary_candidates' },
    { kind: 'no_player_response_boundary' }
  ];
  return createTracePhase4Command({
    optionId: contracts.ids.routeOption,
    label: 'Пройти известной тропой к старой сушильне',
    preconditions,
    duration: 12,
    availability: (state) => preconditions.every(
      (precondition) =>
        tracePhase4PreconditionSatisfied(precondition, state, contracts)
    ),
    consequence: ({ retrievedState, playerInput }) => routeToShedEffect({
      contracts,
      inputDigest,
      state: retrievedState,
      playerInput
    })
  });
}
function negotiationCommand({ contracts, inputDigest, selectNpcDecision }) {
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
    consequence: async ({ retrievedState, availability, checks }) => {
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
      if (!checkResult || typeof selectNpcDecision !== 'function') {
        throw Object.assign(
          new Error('Phase 4 check or NPC selection is missing.'),
          { code: 'TRACE_PHASE_4_NPC_DECISION_MISSING' }
        );
      }
      const decision = await resolveTracePhase4NpcDecision({
        state: retrievedState,
        contracts,
        checkResult,
        inputDigest,
        selectNpcDecision
      });
      return negotiationEffect({
        contracts,
        inputDigest,
        checkResult,
        decision,
        offerStage,
        checkRequest
      });
    }
  });
}
