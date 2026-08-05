import { planApprovedItemZoneTransition } from '@rus/items-property';
import { planApprovedLocalZoneTransition } from '@rus/movement-routes';

export function executeTracePhase7SchedulePlan({
  state,
  contracts,
  temporal,
  scheduleTemporal,
  autonomous
}) {
  const binding = autonomous.schedule_execution;
  if (binding.schedule_option_id === 'wait') {
    return finish({
      state,
      temporal,
      scheduleTemporal,
      binding,
      npcRef: contracts.zhdanko.instance_id,
      movement: null,
      property: null
    });
  }
  if (binding.schedule_option_id !== 'move_bag'
      || binding.movement_ref !== contracts.localTransition.transition_id
      || !binding.property_transition_refs.includes(
        contracts.bagTransition.transition_profile_id
      )) {
    fail('TRACE_PHASE_7_SCHEDULE_EXECUTION_UNSUPPORTED');
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
    parent_execution_ref: binding.execution_binding_id,
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
  if (!movement.pass || !property.pass
      || movement.proposal.exact_elapsed.exact_minutes.numerator
        !== String(binding.elapsed_plan.stages[0].duration_minutes)) {
    fail('TRACE_PHASE_7_SCHEDULE_OWNER_REJECTED', {
      movement: movement.errors,
      property: property.errors
    });
  }
  return finish({ state, temporal, scheduleTemporal, binding,
    npcRef: contracts.zhdanko.instance_id,
    movement: movement.proposal, property: property.proposal });
}

function finish({ state, temporal, scheduleTemporal, binding, npcRef,
  movement, property }) {
  const minutes = Number(binding.time_profile_ref === 'trace_ld_v1_time_5m'
    ? 5 : NaN);
  if (!Number.isSafeInteger(minutes)
      || scheduleTemporal?.elapsed_after_decision !== minutes
      || scheduleTemporal.result.clock_before.whole_minutes
        !== temporal.result.clock_after.whole_minutes
      || scheduleTemporal.result.clock_after.whole_minutes
        !== temporal.limit_timestamp.whole_minutes
      || scheduleTemporal.result.temporal_status !== 'completed') {
    fail('TRACE_PHASE_7_SCHEDULE_TIME_PROFILE_INVALID');
  }
  return Object.freeze({
    owner: '@rus/npc-runtime',
    npc_ref: npcRef,
    execution_binding_ref: binding.execution_binding_id,
    schedule_option_id: binding.schedule_option_id,
    activity_profile_ref: binding.activity_profile_ref,
    exact_elapsed: { exact_minutes: {
      numerator: String(minutes), denominator: '1'
    } },
    clock_before: structuredClone(scheduleTemporal.result.clock_before),
    clock_after: structuredClone(scheduleTemporal.result.clock_after),
    temporal_result: scheduleTemporal.result,
    root_clock_write_count: 1,
    movement_proposal: movement,
    property_proposal: property,
    factual_result_source: 'code_owned_approved_execution_binding',
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
