import { canonicalDigest } from '@rus/materialization';
import { serverError } from '../../errors.js';
import { expected, sealedCheck } from './first-playable/plan-shared.js';
import { expectedSemanticConversationSession } from
  './lower-dvina-trace-phase-3-commit-support.js';

export function expectedVersions({ partyId, state, factual }) {
  const values = [
    expected('parties', partyId, state.party_state.state_version),
    expected('party_server_sessions', partyId,
      state.party_state.session_state_version),
    expected('party_clocks', partyId, state.party_state.clock_state_version),
    expected('party_actor_body_states',
      `player_character:${state.actor_id}`,
      state.party_state.body_state_version)
  ];
  const changed = new Set(
    (factual.body_update.proposal.condition_transitions ?? []).map(
      ({ storage_condition_id: id, condition_id: fallback, from }) =>
        id ?? fallback ?? from
    )
  );
  for (const condition of state.body_state.active_conditions ?? []) {
    if (!changed.has(condition.storage_condition_id)
        && !changed.has(condition.id)) continue;
    values.push(expected('party_actor_active_conditions',
      `player_character:${state.actor_id}:${condition.storage_condition_id}`,
      condition.state_version));
  }
  if (factual.consequence.phase7.schedule_execution.property_proposal) {
    const bag = roadBag(state);
    if (!Number.isInteger(bag.state_version)) {
      fail('TRACE_PHASE_7_ROAD_BAG_VERSION_MISSING');
    }
    values.push(expected('party_containers', bag.container_id,
      bag.state_version));
  }
  if (factual.consequence.turn10_kind === 'companion_request') {
    values.push(...expectedSemanticConversationSession(
      state,
      factual.consequence.conversation?.semantic_exchange
    ));
  }
  return values;
}

export function commitRechecks({ partyId, state, factual, phase7Contracts,
  inputDigest }) {
  return [
    sealedCheck('physical', {
      party_id: partyId,
      npc_id: factual.consequence.phase7.autonomous.request.npc_ref,
      schedule_option_id:
        factual.consequence.phase7.schedule_execution.schedule_option_id,
      expected_location_ref: state.position.location_ref
    }),
    sealedCheck('state', {
      party_id: partyId,
      expected_party_state_version: state.party_state.state_version
    }),
    sealedCheck('pin', {
      activity_ref: phase7Contracts.restActivity.profile_id,
      body_effect_ref: phase7Contracts.bodyEffect.effect_profile_id,
      schedule_policy_ref: phase7Contracts.schedulePolicy.schedule_policy_id
    }),
    sealedCheck('endpoint', {
      location_ref: state.position.location_ref,
      waiting_boundary_id:
        factual.consequence.phase7.autonomous.boundary.boundary_id
    }),
    sealedCheck('route', {
      local_transition_ref:
        factual.consequence.phase7.schedule_execution.movement_proposal
          ?.transition_ref ?? null,
      schedule_execution_ref:
        factual.consequence.phase7.schedule_execution.execution_binding_ref
    }),
    sealedCheck('capacity', {
      party_id: partyId,
      root_activity_ref: phase7Contracts.restActivity.profile_id,
      admitted_schedule_option:
        factual.consequence.phase7.schedule_execution.schedule_option_id
    }),
    sealedCheck('time', {
      expected_clock_state_version: state.party_state.clock_state_version,
      exact_elapsed_minutes: 30
    }),
    sealedCheck('change_set', { canonical_input_digest: inputDigest })
  ];
}

export function scheduleItemKeys(state, factual) {
  if (!factual.consequence.phase7.schedule_execution.property_proposal) {
    return [];
  }
  return [`party_runtime.party_containers:${roadBag(state).container_id}`];
}

function roadBag(state) {
  const bag = state.containers.find(({ template_id: id }) =>
    id === 'trace_ld_v1_container_road_bag');
  if (!bag) fail('TRACE_PHASE_7_ROAD_BAG_WRITE_MISSING');
  return bag;
}

function fail(code) {
  throw serverError(code, 'Phase 7 factual commit failed closed.', {
    status: 409, details: null
  });
}
