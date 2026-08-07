import {
  planApplicableApprovedItemTransition,
  planApprovedItemZoneTransition
} from '@rus/items-property';
import { planApprovedLocalZoneTransition } from '@rus/movement-routes';

export function resolveTracePhase7DomainProposals({ operation, state,
  contracts, profile = null }) {
  if (operation.op === 'request_activity') {
    if (profile == null) fail('TRACE_PHASE_7_ACTIVITY_PROFILE_OWNER_MISSING');
    return profile.movement_ref == null
      ? { movement: null, property: null }
      : planMovementAndProperty({ state, contracts, profile });
  }
  if (operation.op === 'request_item_use') {
    return { movement: null, property: planItemUse({
      operation, state, contracts
    }) };
  }
  if (operation.op === 'request_movement') {
    return {
      movement: planMovement({
        state,
        contracts,
        parentExecutionRef:
          contracts.scheduleExecutions.moveBag?.execution_binding_id
          ?? contracts.localTransition.transition_id
      }),
      property: null
    };
  }
  fail('TRACE_PHASE_7_DOMAIN_REQUEST_NOT_APPLICABLE');
}

export function tracePhase7PropertyTransitions(contracts) {
  return [contracts.bagTransition, contracts.bagConcealTransition]
    .filter(Boolean);
}

export function tracePhase7ItemUseTransitions(contracts) {
  return tracePhase7PropertyTransitions(contracts).filter((transition) =>
    transition.write_targets?.includes('item_visibility_state'));
}

export function tracePhase7TransitionTarget(transition) {
  return transition.writes.zone_ref ?? transition.writes.location_ref;
}

function planMovementAndProperty({ state, contracts, profile }) {
  if (profile.movement_ref !== contracts.localTransition.transition_id
      || !profile.property_transition_refs.includes(
        contracts.bagTransition.transition_profile_id)) {
    fail('TRACE_PHASE_7_ACTIVITY_PROFILE_OWNER_MISSING');
  }
  return {
    movement: planMovement({ state, contracts,
      parentExecutionRef: profile.execution_binding_id }),
    property: planProperty({ state, contracts,
      transition: contracts.bagTransition })
  };
}

function planMovement({ state, contracts, parentExecutionRef }) {
  const npc = contracts.zhdanko;
  const result = planApprovedLocalZoneTransition({
    expected_state_version: state.party_state.state_version,
    state_version: state.party_state.state_version,
    parent_execution_ref: parentExecutionRef,
    transition_binding: contracts.localTransition,
    actor: {
      actor_id: npc.instance_id,
      location_ref: npc.machine_state?.location_ref
        ?? npc.location_profile_ref,
      zone_ref: npc.machine_state?.spatial_zone_ref ?? npc.zone_ref
    }
  });
  if (!result.pass) fail('TRACE_PHASE_7_MOVEMENT_OWNER_REJECTED', result.errors);
  return result.proposal;
}

function planItemUse({ operation, state, contracts }) {
  const bag = findBag(state, contracts);
  const selected = planApplicableApprovedItemTransition({
    approved_transitions: tracePhase7ItemUseTransitions(contracts),
    target_ref: operation.target_refs[0],
    expected_state_version: state.party_state.state_version,
    state_version: state.party_state.state_version,
    item: bag,
    resolved_actor_refs: {
      zhdanko_storehouse_controller: contracts.zhdanko.instance_id
    },
    source: itemSource(bag)
  });
  if (!selected.pass) fail(selected.errors[0].code, selected.errors);
  return selected.proposal;
}

function planProperty({ state, contracts, transition }) {
  const bag = findBag(state, contracts);
  const result = planApprovedItemZoneTransition({
    expected_state_version: state.party_state.state_version,
    state_version: state.party_state.state_version,
    approved_transition: transition,
    item: bag,
    resolved_actor_refs: {
      zhdanko_storehouse_controller: contracts.zhdanko.instance_id
    },
    source: itemSource(bag)
  });
  if (!result.pass) fail('TRACE_PHASE_7_PROPERTY_OWNER_REJECTED', result.errors);
  return result.proposal;
}

function findBag(state, contracts) {
  const matches = (state.containers ?? []).filter(
    ({ template_id: id }) => id === contracts.roadBag.item_ref);
  if (matches.length !== 1) fail('TRACE_PHASE_7_ROAD_BAG_INSTANCE_MISSING');
  return matches[0];
}

function itemSource(bag) {
  return {
    location_ref: bag.state?.location_ref,
    zone_ref: bag.state?.zone_ref,
    holder_actor_id: bag.holder_npc_id,
    controller_actor_id: bag.state?.controller_npc_id
  };
}

function fail(code, details = null) {
  throw Object.assign(new Error(code), { code, details });
}
