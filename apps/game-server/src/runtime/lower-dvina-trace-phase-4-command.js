import { tracePhase4PreconditionSatisfied } from './lower-dvina-trace-phase-4-admission.js';
import { negotiationEffect, routeToShedEffect } from './lower-dvina-trace-phase-4-effects.js';
import { resolveTracePhase4NpcDecision } from './lower-dvina-trace-phase-4-npc-decision.js';
import { canonicalDigest } from '@rus/materialization';

export { tracePhase4PreconditionSatisfied };

export function createTracePhase4Commands({ contracts, inputDigest, selectNpcDecision }) {
  return [routeCommand({ contracts, inputDigest }), negotiationCommand({ contracts, inputDigest, selectNpcDecision })];
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
  return command({
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
  return command({
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

function command({ optionId, label, preconditions, duration,
  availability: canAttempt, consequence, check = null,
  checkContext = null }) {
  return {
    command_id: `lower_dvina_trace.${optionId}`,
    option_id: optionId,
    label,
    target_id: null,
    preconditions,
    expected_cost: { kind: 'exact_time', value: duration },
    known_risks: optionId.includes('protection')
      ? ['Ратша может угрожать или напасть.']
      : [],
    reason_visible_to_actor:
      'Действие доступно только по утверждённым состояниям.',
    mode: {
      selected_primary_mode: optionId.includes('protection')
        ? 'social_npc'
        : 'movement_route',
      secondary_modes: [],
      resolution_plan: {
        subsystems: ['time_progression'],
        checks_to_run: [],
        expected_writes: ['party_state', 'party_visible_context_package'],
        state_blocks_to_load: ['party_state', 'current_position']
      }
    },
    matches: () => false,
    availability(context) {
      const state = context.committed_state ?? context.retrievedState;
      const allowed = canAttempt(state);
      const causalStage = check && allowed && checkContext
        ? checkContext(state)
        : null;
      return {
        version: 1,
        schema: 'turn_availability_decision',
        status: check && allowed
          ? 'check_required'
          : allowed
            ? 'available'
            : 'blocked',
        can_attempt: allowed,
        reasons: allowed ? [] : ['phase4_precondition_failed'],
        check_requests: check && allowed
          ? [checkRequest(check, causalStage)]
          : [],
        ...(causalStage ? { causal_stages: [causalStage] } : {})
      };
    },
    consequence,
    writeTargets: phase4WriteTargets
  };
}

function promiseOfferStage(state, contracts) {
  const promise = state.promise_instances[0];
  const stage = {
    version: 1,
    schema: 'rus.trace_promise_offer_stage.v1',
    audit_ordinal: 0,
    operation: promise.current_state === 'not_offered'
      ? 'offer'
      : 'reuse_current_offer',
    prior_state: promise.current_state,
    resulting_state: 'offered',
    fact_id: 'promise_current_offered',
    obligation_id: promise.obligation_id,
    policy_id: contracts.promisePolicy.policy_id,
    beneficiary_actor_id: promise.beneficiary_actor_id,
    witness_actor_ids: structuredClone(promise.witness_actor_ids),
    scope_digest: canonicalDigest(promise.scope_snapshot)
  };
  return { ...stage, stage_digest: canonicalDigest(stage) };
}

function checkRequest(check, offerStage) {
  return {
    check_id: check.check_id,
    difficulty: check.dc,
    attribute: check.attribute,
    skill: check.skill,
    state_modifier: check.modifiers.state,
    equipment_modifier: check.modifiers.item_or_evidence,
    circumstance_modifier: check.modifiers.circumstance,
    audit_ordinal: 1,
    causal_predecessor_fact_id: offerStage?.fact_id,
    causal_predecessor_stage_digest: offerStage?.stage_digest,
    circumstance_modifier_provenance: offerStage == null
      ? null
      : {
          promise_policy_id: offerStage.policy_id,
          beneficiary_actor_id: offerStage.beneficiary_actor_id,
          witness_actor_ids: structuredClone(offerStage.witness_actor_ids),
          scope_digest: offerStage.scope_digest
        }
  };
}

function validOfferBeforeCheck({ offerStage, checkRequest: request, state,
  contracts }) {
  if (!offerStage || !request) return false;
  const expected = promiseOfferStage(state, contracts);
  return offerStage.audit_ordinal === 0
    && request.audit_ordinal === 1
    && request.causal_predecessor_fact_id === 'promise_current_offered'
    && request.causal_predecessor_stage_digest === offerStage.stage_digest
    && canonicalDigest(offerStage) === canonicalDigest(expected)
    && canonicalDigest(request.circumstance_modifier_provenance)
      === canonicalDigest({
        promise_policy_id: expected.policy_id,
        beneficiary_actor_id: expected.beneficiary_actor_id,
        witness_actor_ids: expected.witness_actor_ids,
        scope_digest: expected.scope_digest
      });
}

function phase4WriteTargets(input) {
  return [{
    target: 'party_state',
    value: {
      player_input: input.playerInput,
      mode_resolution: input.modeResolution,
      availability: input.availability,
      consequence: input.consequence,
      time_update: input.timeUpdate,
      body_update: input.bodyUpdate,
      hidden_update: input.hiddenUpdate
    }
  }, {
    target: 'party_visible_context_package',
    value: input.visibleContext
  }];
}
