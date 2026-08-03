import { canonicalDigest } from '@rus/materialization';

export function createTracePhase4Command({
  optionId,
  label,
  preconditions,
  duration,
  availability: canAttempt,
  consequence,
  check = null,
  checkContext = null
}) {
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
          ? [buildCheckRequest(check, causalStage)]
          : [],
        ...(causalStage ? { causal_stages: [causalStage] } : {})
      };
    },
    consequence,
    writeTargets: phase4WriteTargets
  };
}

export function promiseOfferStage(state, contracts) {
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
    obligation_id: promise.obligation_id ?? promise.instance_id,
    policy_id: contracts.promisePolicy.policy_id,
    beneficiary_actor_id: promise.beneficiary_actor_id,
    witness_actor_ids: structuredClone(promise.witness_actor_ids),
    scope_digest: canonicalDigest(promise.scope_snapshot)
  };
  return { ...stage, stage_digest: canonicalDigest(stage) };
}

export function validOfferBeforeCheck({
  offerStage,
  checkRequest: request,
  state,
  contracts
}) {
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

function buildCheckRequest(check, offerStage) {
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
