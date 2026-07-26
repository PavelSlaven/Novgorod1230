import { json, ref } from '../../../runtime/first-playable/shared.js';

export async function finalizeLocalTraversal(tx, context) {
  const {
    state, traversal, partyId, intervalId, executionId, travelStateId,
    changeSet, turnNumber, idemId, sourceEndpoint, targetEndpoint,
    actualElapsed
  } = context;
  if (traversal.success) {
    await tx.query(
      `UPDATE party_runtime.traveller_travel_states
       SET segment_progress_ppm=1000000,
           cumulative_actual_time_numerator=$2,next_interval_ordinal=1,
           status='closed',closed_result='completed',state_version=2,
           updated_change_set_id=$3,closed_change_set_id=$3
       WHERE id=$1`,
      [travelStateId, actualElapsed, changeSet]
    );
    await tx.query(
      `UPDATE party_runtime.party_route_plan_executions
       SET status='completed',current_step_ordinal=NULL,
           active_travel_state_id=NULL,final_location_snapshot=$2::jsonb,
           terminal_at_turn=$3,state_version=3,updated_change_set_id=$4
       WHERE id=$1`,
      [executionId, json(targetEndpoint), turnNumber, changeSet]
    );
    await tx.query(
      `INSERT INTO party_runtime.party_route_plan_execution_events
       (execution_id,event_ordinal,event_kind,from_status,to_status,
        step_ordinal,location_snapshot,causal_result_ref,change_set_id,
        idempotency_record_id,occurred_at_turn)
       VALUES ($1,2,'completed','active','completed',0,$2::jsonb,
        $3::jsonb,$4,$5,$6)`,
      [
        executionId,
        json(targetEndpoint),
        json({
          entity_kind: 'party_traversal_interval_result',
          entity_id: intervalId
        }),
        changeSet,
        idemId,
        turnNumber
      ]
    );
  } else {
    await tx.query(
      `UPDATE party_runtime.traveller_travel_states
       SET cumulative_actual_time_numerator=$2,next_interval_ordinal=1,
           status='closed',closed_result='interrupted_to_anchor',
           state_version=2,updated_change_set_id=$3,
           closed_change_set_id=$3
       WHERE id=$1`,
      [travelStateId, actualElapsed, changeSet]
    );
    await tx.query(
      `UPDATE party_runtime.party_route_plan_executions
       SET status='waiting_at_anchor',current_endpoint_ref=$2::jsonb,
           active_travel_state_id=NULL,state_version=3,
           updated_change_set_id=$3
       WHERE id=$1`,
      [executionId, json(sourceEndpoint), changeSet]
    );
    await tx.query(
      `INSERT INTO party_runtime.party_route_plan_execution_events
       (execution_id,event_ordinal,event_kind,from_status,to_status,
        step_ordinal,location_snapshot,causal_result_ref,change_set_id,
        idempotency_record_id,occurred_at_turn)
       VALUES ($1,2,'wait_started','active','waiting_at_anchor',0,
        $2::jsonb,$3::jsonb,$4,$5,$6)`,
      [
        executionId,
        json(sourceEndpoint),
        json({
          entity_kind: 'party_traversal_interval_result',
          entity_id: intervalId
        }),
        changeSet,
        idemId,
        turnNumber
      ]
    );
    await tx.query(
      `UPDATE party_runtime.party_route_plan_executions
       SET status='aborted',current_step_ordinal=NULL,
           current_endpoint_ref=NULL,final_location_snapshot=$2::jsonb,
           abort_reason_code='landing_edge_slip',
           terminal_at_turn=$3,state_version=4,updated_change_set_id=$4
       WHERE id=$1`,
      [executionId, json(sourceEndpoint), turnNumber, changeSet]
    );
    await tx.query(
      `INSERT INTO party_runtime.party_route_plan_execution_events
       (execution_id,event_ordinal,event_kind,from_status,to_status,
        step_ordinal,location_snapshot,change_set_id,
        idempotency_record_id,occurred_at_turn)
       VALUES ($1,3,'aborted','waiting_at_anchor','aborted',0,
        $2::jsonb,$3,$4,$5)`,
      [
        executionId,
        json(sourceEndpoint),
        changeSet,
        idemId,
        turnNumber
      ]
    );
    await tx.query(
      `INSERT INTO party_runtime.party_actor_active_conditions
       (party_id,actor_kind,actor_id,condition_id,condition_profile_ref,
        status,state_version,created_change_set_id)
       VALUES ($1,'player_character',$2,'wet',$3::jsonb,'active',1,$4)
       ON CONFLICT (party_id,actor_kind,actor_id,condition_id) DO NOTHING`,
      [
        partyId,
        state.player.id,
        json(ref('condition_profile', 'wet', 1)),
        changeSet
      ]
    );
  }
}
