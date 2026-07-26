import { serverError } from '../../../errors.js';
import { hash, json, ref } from '../../../runtime/first-playable/shared.js';

export async function prepareLocalTraversal(tx, {
  state,
  changeSet,
  turnNumber,
  command,
  traversal,
  idempotencyKey
}) {
  if (!traversal?.route_binding_ref) {
    throw serverError(
      'LOCAL_TRAVERSAL_CONTRACT_GAP',
      'The exact local traversal binding is missing.',
      { status: 409 }
    );
  }
  const partyId = state.party_id;
  const suffix = hash(command.canonical_digest).slice(0, 24);
  const planId = `route-plan:${partyId}:${suffix}`;
  const executionId = `route-execution:${partyId}:${suffix}`;
  const travelStateId = `travel-state:${partyId}:${suffix}`;
  const intervalId = `traversal-interval:${partyId}:${suffix}`;
  const idemId =
    `idem:${partyId}:${hash(idempotencyKey).slice(0, 20)}`;
  const sourceLocation = command.destination_ref.entity_id === 'landing_edge'
    ? 'high'
    : 'landing';
  const targetLocation = command.destination_ref.entity_id === 'landing_edge'
    ? 'landing'
    : 'high';
  const sourceEndpoint = {
    endpoint_kind: 'scene_position',
    endpoint_id: `position:${partyId}:${sourceLocation}`
  };
  const targetEndpoint = {
    endpoint_kind: 'scene_position',
    endpoint_id: `position:${partyId}:${targetLocation}`
  };
  const ownerRef = ref('actor', state.player.id);
  const staticContract = {
    snapshot_kind: 'timed_traversal',
    route_binding_ref: traversal.route_binding_ref,
    connection_profile_ref: ref(
      'canonical_g5_connection_profile',
      'cprofv3__site_connection__local_passage',
      2
    ),
    cost_kind: 'action',
    action_units: 1,
    base_minutes: null,
    risk_profile_ref: traversal.risk_profile_ref
  };
  const planDigest = hash(json({
    party_id: partyId,
    command_digest: command.canonical_digest,
    source_endpoint: sourceEndpoint,
    target_endpoint: targetEndpoint,
    static_contract: staticContract
  }));
  const worldPin = state.exact_pins.pins.find(
    ({ kind }) => kind === 'release'
  );
  await tx.query(
    `INSERT INTO party_runtime.party_route_plans
     (id,party_id,journey_owner_ref,journey_scope,request_kind,
      planning_request_id,path_query_digest,option_id,knowledge_scope,
      source_endpoint_snapshot,target_request,resolved_factual_target_ref,
      target_resolution_dependency_pins,world_revision_id,catalog_digest,
      planning_algorithm_version,planning_state_version,
      planning_context_dependency_pins,canonical_serialization_digest,
      status,lifecycle_state_version,created_change_set_id,
      lifecycle_change_set_id,created_at_turn)
     VALUES ($1,$2,$3::jsonb,'world_travel','ordinary',$4,$5,$6,
      'factual',$7::jsonb,$8::jsonb,$8::jsonb,$9::jsonb,$10,$11,
      'exact-local-binding@1',$12,$9::jsonb,$13,'ready',1,$14,$14,$15)`,
    [
      planId,
      partyId,
      json(ownerRef),
      command.request_id,
      hash(json({ sourceEndpoint, targetEndpoint })),
      traversal.route_binding_ref.entity_id,
      json(sourceEndpoint),
      json(targetEndpoint),
      json(state.exact_pins),
      worldPin.world_revision_id,
      worldPin.world_catalog_digest,
      command.base_state_version,
      planDigest,
      changeSet,
      turnNumber
    ]
  );
  await tx.query(
    `INSERT INTO party_runtime.party_route_plan_steps
     (route_plan_id,ordinal,step_kind,departure_endpoint_snapshot,
      arrival_endpoint_snapshot,static_contract_snapshot)
     VALUES ($1,0,'timed_traversal',$2::jsonb,$3::jsonb,$4::jsonb)`,
    [planId, json(sourceEndpoint), json(targetEndpoint), json(staticContract)]
  );
  await tx.query(
    `INSERT INTO party_runtime.party_route_plan_executions
     (id,party_id,route_plan_id,journey_owner_ref,journey_scope,status,
      current_step_ordinal,current_endpoint_ref,state_version,
      updated_change_set_id)
     VALUES ($1,$2,$3,$4::jsonb,'world_travel','planned',0,$5::jsonb,1,$6)`,
    [executionId, partyId, planId, json(ownerRef), json(sourceEndpoint), changeSet]
  );
  await tx.query(
    `INSERT INTO party_runtime.party_route_plan_execution_events
     (execution_id,event_ordinal,event_kind,from_status,to_status,
      step_ordinal,location_snapshot,change_set_id,idempotency_record_id,
      occurred_at_turn)
     VALUES ($1,0,'planned',NULL,'planned',0,$2::jsonb,$3,$4,$5)`,
    [executionId, json(sourceEndpoint), changeSet, idemId, turnNumber]
  );
  await tx.query(
    `UPDATE party_runtime.party_route_plan_executions
     SET status='active',current_endpoint_ref=NULL,
         active_travel_state_id=$2,started_at_turn=$3,
         state_version=2,updated_change_set_id=$4
     WHERE id=$1`,
    [executionId, travelStateId, turnNumber, changeSet]
  );
  await tx.query(
    `INSERT INTO party_runtime.party_route_plan_execution_events
     (execution_id,event_ordinal,event_kind,from_status,to_status,
      step_ordinal,location_snapshot,change_set_id,idempotency_record_id,
      occurred_at_turn)
     VALUES ($1,1,'activated','planned','active',0,$2::jsonb,$3,$4,$5)`,
    [executionId, json(sourceEndpoint), changeSet, idemId, turnNumber]
  );
  await tx.query(
    `INSERT INTO party_runtime.traveller_travel_states
     (id,party_id,route_plan_execution_id,plan_step_ordinal,
      movement_carrier_ref,segment_progress_ppm,
      cumulative_actual_time_numerator,cumulative_actual_time_denominator,
      next_interval_ordinal,intended_direction_id,navigation_state,
      last_confirmed_endpoint_ref,status,state_version,
      updated_change_set_id)
     VALUES ($1,$2,$3,0,$4::jsonb,0,0,1,0,$5,'on_course',
      $6::jsonb,'active',1,$7)`,
    [
      travelStateId,
      partyId,
      executionId,
      json(ownerRef),
      traversal.route_binding_ref.entity_id,
      json(sourceEndpoint),
      changeSet
    ]
  );

  return {
    state, traversal, partyId, intervalId, executionId, travelStateId,
    idemId, sourceEndpoint, targetEndpoint, changeSet, turnNumber
  };
}
