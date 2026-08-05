import { planApprovedItemZoneTransition } from '@rus/items-property';
import { planApprovedLocalZoneTransition } from '@rus/movement-routes';
import { addElapsedTime } from '@rus/time-events-history';
import {
  createTurnStepExecutionRegistry,
  executeTurnStepActorStep
} from '@rus/turn';

export async function executeTracePhase7SchedulePlan({
  state,
  contracts,
  temporal,
  scheduleTemporal,
  autonomous
}) {
  const registry = createTurnStepExecutionRegistry({
    domain: {
      request_activity: (execution) => executeActivityOwner({
        execution,
        state,
        contracts,
        temporal,
        scheduleTemporal
      })
    }
  });
  const execution = await executeTurnStepActorStep({
    plan: autonomous.proposal.plan,
    request: autonomous.request,
    workingProjection: state,
    preparedChainContext: null,
    registry,
    ports: {}
  });
  if (execution.consequenceFragments.length !== 1) {
    fail('TRACE_PHASE_7_ACTOR_STEP_RESULT_INVALID');
  }
  return Object.freeze(execution.consequenceFragments[0]);
}

function executeActivityOwner({ execution, state, contracts, temporal,
  scheduleTemporal }) {
  const operation = execution.operation;
  const matching = contracts.autonomousActivityBindings.filter(
    (binding) => applicable(binding.applicability, operation)
  );
  if (matching.length > 1) {
    fail('TRACE_PHASE_7_ACTIVITY_PROFILE_AMBIGUOUS');
  }
  const result = matching.length === 0
    ? unavailable({ state, temporal, scheduleTemporal, operation,
      npcRef: contracts.zhdanko.instance_id })
    : executeProfile({ state, contracts, temporal, scheduleTemporal,
      operation, binding: matching[0] });
  return {
    working_projection: execution.working_projection,
    summary: result.status === 'executed'
      ? `npc_activity:${result.activity_profile_ref}`
      : 'npc_activity:unavailable',
    consequence_fragment: result,
    goal_result: result.status === 'executed'
      ? execution.plan.goal_result : 'not_achieved',
    continuation: null,
    player_response_boundary: true
  };
}

function applicable(applicability, operation) {
  if (applicability?.operation !== operation.op
      || !applicability.activity_kinds.includes(operation.activity_kind)) {
    return false;
  }
  const targets = new Set(operation.target_refs);
  const allowed = new Set(applicability.allowed_target_refs);
  return applicability.required_target_refs.every((ref) => targets.has(ref))
    && operation.target_refs.every((ref) => allowed.has(ref));
}

function executeProfile({ state, contracts, temporal, scheduleTemporal,
  operation, binding }) {
  const profile = binding.execution_profile;
  if (profile.movement_ref === null
      && profile.property_transition_refs.length === 0) {
    return finish({
      state,
      temporal,
      scheduleTemporal,
      operation,
      profile,
      npcRef: contracts.zhdanko.instance_id,
      movement: null,
      property: null
    });
  }
  if (profile.movement_ref !== contracts.localTransition.transition_id
      || !profile.property_transition_refs.includes(
        contracts.bagTransition.transition_profile_id
      )) {
    fail('TRACE_PHASE_7_ACTIVITY_PROFILE_OWNER_MISSING');
  }
  const npc = contracts.zhdanko;
  const bag = findBag(state, contracts);
  const actorSource = {
    actor_id: npc.instance_id,
    location_ref: npc.machine_state?.location_ref
      ?? npc.location_profile_ref,
    zone_ref: npc.machine_state?.spatial_zone_ref ?? npc.zone_ref
  };
  const movement = planApprovedLocalZoneTransition({
    expected_state_version: state.party_state.state_version,
    state_version: state.party_state.state_version,
    parent_execution_ref: profile.execution_binding_id,
    transition_binding: contracts.localTransition,
    actor: actorSource
  });
  const property = planApprovedItemZoneTransition({
    expected_state_version: state.party_state.state_version,
    state_version: state.party_state.state_version,
    approved_transition: contracts.bagTransition,
    item: bag,
    resolved_actor_refs: {
      zhdanko_storehouse_controller: npc.instance_id
    },
    source: {
      location_ref: bag.state?.location_ref,
      zone_ref: bag.state?.zone_ref,
      holder_actor_id: bag.holder_npc_id,
      controller_actor_id: bag.state?.controller_npc_id
    }
  });
  if (!movement.pass || !property.pass) {
    fail('TRACE_PHASE_7_SCHEDULE_OWNER_REJECTED', {
      movement: movement.errors,
      property: property.errors
    });
  }
  return finish({ state, temporal, scheduleTemporal, operation, profile,
    npcRef: contracts.zhdanko.instance_id,
    movement: movement.proposal, property: property.proposal });
}

function finish({ state, temporal, scheduleTemporal, operation, profile,
  npcRef, movement, property }) {
  const minutes = (profile.elapsed_plan?.stages ?? []).reduce(
    (sum, stage) => sum + stage.duration_minutes, 0
  );
  if (!Number.isSafeInteger(minutes) || minutes < 1
      || minutes > scheduleTemporal.elapsed_after_decision
      || scheduleTemporal.result.clock_before.whole_minutes
        !== temporal.result.clock_after.whole_minutes
      || scheduleTemporal.result.clock_after.whole_minutes
        !== temporal.limit_timestamp.whole_minutes
      || scheduleTemporal.result.temporal_status !== 'completed'
      || (movement && movement.exact_elapsed.exact_minutes.numerator
        !== String(minutes))) {
    fail('TRACE_PHASE_7_SCHEDULE_TIME_PROFILE_INVALID');
  }
  return Object.freeze({
    owner: '@rus/turn/actor-step',
    domain_owner: '@rus/npc-runtime',
    status: 'executed',
    npc_ref: npcRef,
    semantic_operation: structuredClone(operation),
    execution_binding_ref: profile.execution_binding_id,
    schedule_option_id: profile.schedule_option_id,
    activity_profile_ref: profile.activity_profile_ref,
    exact_elapsed: { exact_minutes: {
      numerator: String(minutes), denominator: '1'
    } },
    clock_before: structuredClone(scheduleTemporal.result.clock_before),
    clock_after: addElapsedTime(scheduleTemporal.result.clock_before, {
      exact_minutes: { numerator: String(minutes), denominator: '1' }
    }),
    root_clock_write_count: 0,
    movement_proposal: movement,
    property_proposal: property,
    factual_result_source: 'code_owned_actor_step_domain_execution',
    parent_state_version: state.party_state.state_version
  });
}

function unavailable({ state, temporal, scheduleTemporal, operation,
  npcRef }) {
  if (scheduleTemporal.result.clock_before.whole_minutes
        !== temporal.result.clock_after.whole_minutes
      || scheduleTemporal.result.temporal_status !== 'completed') {
    fail('TRACE_PHASE_7_SCHEDULE_TIME_PROFILE_INVALID');
  }
  return Object.freeze({
    owner: '@rus/turn/actor-step',
    domain_owner: '@rus/npc-runtime',
    status: 'unavailable',
    failure_code: 'NPC_ACTIVITY_PROFILE_NOT_APPLICABLE',
    npc_ref: npcRef,
    semantic_operation: structuredClone(operation),
    execution_binding_ref: null,
    schedule_option_id: null,
    activity_profile_ref: null,
    exact_elapsed: { exact_minutes: { numerator: '0', denominator: '1' } },
    clock_before: structuredClone(scheduleTemporal.result.clock_before),
    clock_after: structuredClone(scheduleTemporal.result.clock_before),
    root_clock_write_count: 0,
    movement_proposal: null,
    property_proposal: null,
    factual_result_source: 'code_owned_actor_step_domain_admission',
    parent_state_version: state.party_state.state_version
  });
}

function findBag(state, contracts) {
  const matches = (state.containers ?? []).filter(
    ({ template_id: id }) => id === contracts.roadBag.item_ref
  );
  if (matches.length !== 1) fail('TRACE_PHASE_7_ROAD_BAG_INSTANCE_MISSING');
  return matches[0];
}

function fail(code, details = null) {
  throw Object.assign(new Error(code), { code, details });
}
