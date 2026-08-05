import { canonicalDigest } from '@rus/materialization';
import { compareGameTimestamp } from '@rus/time-events-history';

export function tracePhase4PreconditionSatisfied(precondition, state, contracts) {
  if (precondition.kind === 'committed_location') {
    return state.position?.location_ref === precondition.location_ref;
  }
  if (precondition.kind === 'known_route') {
    return (state.route_knowledge ?? []).includes(precondition.route_ref);
  }
  if (precondition.kind === 'approved_access_policy') {
    return state.position?.location_ref === contracts.access.location_ref
      && (state.route_knowledge ?? []).includes(contracts.ids.route)
      && contracts.access.unmaterialized_access === 'forbidden';
  }
  if (precondition.kind === 'present_actor') {
    const actor = contracts.actors[precondition.ref];
    const expectedAnchor = precondition.location_ref === contracts.ids.camp
      ? contracts.anchors.camp
      : precondition.location_ref === contracts.ids.shed
        ? contracts.anchors.shed
        : null;
    return actor?.instance_id != null
      && (expectedAnchor == null || actor.anchor_id === expectedAnchor);
  }
  if (precondition.kind === 'capacity') {
    const zone = contracts.capacity.zones.find(
      (entry) => entry.zone_id === 'shed_approach'
    );
    const actorIds = new Set(precondition.actor_refs.map(
      (ref) => contracts.actors[ref]?.instance_id
    ));
    return zone != null && !actorIds.has(undefined)
      && actorIds.size === precondition.actor_refs.length
      && actorIds.size + 1 <= zone.max_actors;
  }
  if (precondition.kind === 'promise_state') {
    const promises = state.promise_instances ?? [];
    return promises.length === 1
      && precondition.allowed.includes(promises[0].current_state);
  }
  if (precondition.kind === 'actors_not_incompatible_activity') {
    return precondition.actor_refs.every((ref) => {
      const actor = ref === 'player_clerk'
        ? state
        : contracts.actors[ref];
      return actor != null
        && actor.machine_state?.current_activity_execution_id == null;
    });
  }
  if (precondition.kind === 'arrival_subject_state') {
    const onisim = contracts.actors.onisim_boatman;
    const condition = onisim.machine_state?.body_condition;
    return onisim.anchor_id === contracts.anchors.shed
      && condition?.condition_profile_ref
        === contracts.observation.trigger.subject_body_condition_ref
      && contracts.observation.trigger.allowed_subject_states.includes(
        condition?.state
      );
  }
  if (precondition.kind === 'ratsha_available') {
    const ratsha = contracts.actors.ratsha_storehouse_helper;
    return ratsha.machine_state?.surrender_state === 'not_surrendered'
      && ratsha.machine_state?.restraint_state === 'not_restrained';
  }
  if (precondition.kind === 'communication_admitted') {
    const ratsha = contracts.actors.ratsha_storehouse_helper;
    return Number(state.body_state?.health) > 0
      && ratsha.machine_state?.status === 'active'
      && ratsha.machine_state?.perception_state !== 'unable_to_perceive';
  }
  if (precondition.kind === 'exact_promise_contract') {
    const promise = state.promise_instances?.[0];
    const policy = contracts.promisePolicy;
    const expectedWitnesses = [
      contracts.actors.eremey_fisher.instance_id,
      contracts.actors.participating_fisher.instance_id
    ];
    if (!promise || !Array.isArray(promise.witness_actor_ids)
        || promise.scope_snapshot == null || policy?.scope == null) {
      return false;
    }
    const checks = {
      policy: promise?.policy_ref?.id === policy.policy_id,
      revision: Number(promise?.policy_ref?.revision) === policy.revision,
      promisor: promise.promisor_actor_id === state.actor_id,
      beneficiary: promise.beneficiary_actor_id
        === contracts.actors.ratsha_storehouse_helper.instance_id,
      witnesses: canonicalDigest(promise.witness_actor_ids)
        === canonicalDigest(expectedWitnesses),
      scope: canonicalDigest(promise.scope_snapshot)
        === canonicalDigest(policy.scope)
    };
    return Object.values(checks).every(Boolean);
  }
  if (precondition.kind === 'no_player_response_boundary') {
    return state.player_response_boundary == null;
  }
  if (precondition.kind === 'no_temporal_boundary_candidates') {
    return Array.isArray(state.temporal_boundary_candidates)
      && state.temporal_boundary_candidates.length === 0;
  }
  if (precondition.kind === 'no_current_temporal_boundary_candidates') {
    return Array.isArray(state.temporal_boundary_candidates)
      && state.temporal_boundary_candidates.every(
        ({ scheduled_at: scheduledAt }) =>
          compareGameTimestamp(scheduledAt, state.clock) > 0
      );
  }
  return false;
}
