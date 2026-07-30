import { buildLocalTraversalWriteSet } from './local-traversal-write-set.js';
import { serverError } from '../../errors.js';

export function appendPhase3MovementTraversal({
  inserts,
  updates,
  appends,
  state,
  factual,
  partyId,
  turnNumber,
  changeSetId,
  idemId,
  phase3Contracts
}) {
  const movement = factual.consequence.movement;
  const route = phase3Contracts.route;
  const traversal = movement.traversal;
  const ids = {
    planId: traversal.ids.plan_id,
    executionId: traversal.ids.execution_id,
    travelStateId: traversal.ids.travel_state_id,
    intervalId: traversal.ids.interval_id
  };
  assertTraversalProof({
    traversal, movement, route, ids, partyId, turnNumber, state
  });
  const set = buildLocalTraversalWriteSet({
    partyId,
    ids,
    owner: { entity_kind: 'actor', entity_id: state.actor_id },
    sourceEndpoint: traversal.source_endpoint,
    targetEndpoint: traversal.target_endpoint,
    route: {
      route_binding_ref: {
        entity_kind: 'movement_route_binding',
        entity_id: route.route_id,
        version: route.version
      },
      connection_profile_ref: null,
      duration_minutes: route.duration_minutes,
      movement_method: route.movement_method,
      load_category: movement.inventory_load.load_category,
      planning_algorithm_version: 'exact-local-binding@1',
      outcome_composition_policy_version:
        traversal.interval_result.outcome_composition_policy_version
    },
    dependencyPins: traversal.dependency_pins,
    worldPin: state.world_identity,
    planningRequestId: factual.player_input.request_id,
    planningStateVersion: traversal.planning_state_version,
    turnNumber,
    changeSetId,
    idempotencyRecordId: idemId,
    dynamicSnapshot: traversal.interval_result.dynamic_snapshot,
    resultCode: traversal.interval_result.result_code,
    plannedTimeMinutes:
      Number(traversal.interval_result.planned_time_numerator),
    actualElapsedMinutes:
      Number(traversal.interval_result.actual_time_numerator),
    outcomeCompositionTraceDigest:
      traversal.interval_result.outcome_composition_trace_digest
  });
  inserts.push(...set.inserts);
  updates.push(...set.updates);
  appends.push(...set.appends);
}

function assertTraversalProof({
  traversal, movement, route, ids, partyId, turnNumber, state
}) {
  const result = traversal?.interval_result;
  const final = traversal?.final_travel_state;
  if (ids.planId !== `route-plan:${partyId}:trace-phase3:${turnNumber}`
      || result?.route_plan_execution_id !== ids.executionId
      || final?.id !== ids.travelStateId
      || result?.id !== ids.intervalId
      || traversal?.planning_state_version
        !== state.party_state.state_version
      || result?.occurred_at_turn !== turnNumber
      || final?.occurred_at_turn !== turnNumber
      || result?.result_kind !== 'segment_completed'
      || final?.closed_result !== 'completed'
      || result?.clock_commit_mode !== 'direct_party_clock'
      || result?.actual_time_numerator !== String(route.duration_minutes)
      || result?.actual_time_denominator !== '1'
      || traversal.inventory_load.load_category
        !== movement.inventory_load.load_category) {
    throw serverError(
      'TRACE_PHASE_3_TRAVERSAL_PROOF_INVALID',
      'Phase 3 traversal owner proof is inconsistent.',
      { status: 409 }
    );
  }
}
