import { serverError } from '../../../errors.js';
import { hash, json, ref } from '../../../runtime/first-playable/shared.js';

export async function persistSimpleTimedActivity(tx, {
  state,
  changeSet,
  turnNumber,
  command,
  profile,
  elapsed
}) {
  if (!profile || !Number.isInteger(elapsed) || elapsed <= 0) {
    throw serverError(
      'ACTIVITY_PROFILE_GAP',
      'Timed activity requires one exact approved profile and elapsed time.',
      { status: 409 }
    );
  }
  const partyId = state.party_id;
  const executionId = `activity:${partyId}:${turnNumber}`;
  const seriesId = `series:${partyId}:${turnNumber}`;
  const idemId = `idem:${partyId}:${hash(command.idempotency_key).slice(0, 20)}`;
  const startedAt = state.clock_minutes - elapsed;
  const context = {
    location: state.location,
    npc_id: state.npc?.id ?? null,
    quantity: command.quantity ?? null
  };
  await tx.query(
    `INSERT INTO party_runtime.party_timed_activity_executions
     (id,series_ordinal,activity_snapshot,original_total_minutes,
      cumulative_elapsed_numerator,cumulative_elapsed_denominator,
      remaining_time_numerator,remaining_time_denominator,next_attempt_ordinal,
      status,state_version,updated_change_set_id,terminal_change_set_id,
      execution_scope,activity_series_id,activity_owner_ref,
      origin_location_snapshot,execution_context_snapshot,
      originating_command_ref,originating_command_digest,idempotency_record_id,
      started_at_whole_minutes,started_at_subminute_numerator,
      started_at_subminute_denominator,last_processed_at_whole_minutes,
      last_processed_at_subminute_numerator,last_processed_at_subminute_denominator,
      next_boundary_at_whole_minutes,next_boundary_at_subminute_numerator,
      next_boundary_at_subminute_denominator,progress,preconditions_digest)
     VALUES ($1,0,$2::jsonb,$3,0,1,$3,1,0,'active',1,$4,NULL,
       'standalone',$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,
       $12,0,1,$12,0,1,$13,0,1,'{}'::jsonb,$14)`,
    [
      executionId,
      json({
        profile_id: profile.activity_profile_id,
        version: 1,
        profile_snapshot: profile
      }),
      elapsed,
      changeSet,
      seriesId,
      json(ref('actor', state.player.id)),
      json({ position: state.location }),
      json(context),
      json(ref('semantic_command', command.request_id)),
      command.canonical_digest,
      idemId,
      startedAt,
      state.clock_minutes,
      hash(`preconditions:${executionId}`)
    ]
  );
  await tx.query(
    `INSERT INTO party_runtime.party_timed_activity_attempts
     (activity_execution_id,attempt_ordinal,remaining_before_numerator,
      remaining_before_denominator,planned_time_numerator,planned_time_denominator,
      actual_time_numerator,actual_time_denominator,remaining_after_numerator,
      remaining_after_denominator,cumulative_time_before_numerator,
      cumulative_time_before_denominator,cumulative_time_after_numerator,
      cumulative_time_after_denominator,crossed_whole_minute_boundaries,
      clock_commit_mode,execution_context_snapshot,result_kind,result_code,
      dynamic_dependency_pins,result_change_set_id,idempotency_record_id,occurred_at_turn,
      started_at_whole_minutes,started_at_subminute_numerator,
      started_at_subminute_denominator,ended_at_whole_minutes,
      ended_at_subminute_numerator,ended_at_subminute_denominator,reason_code,
      progress_before,progress_after,resource_reservations,resource_consumptions,
      body_effect_refs,participant_attendance,rule_and_policy_pins)
     VALUES ($1,0,$2,1,$2,1,$2,1,0,1,0,1,$2,1,$2,
       'direct_party_clock',$3::jsonb,'completed',$4,$5::jsonb,$6,$7,$8,
       $9,0,1,$10,0,1,$4,'{}'::jsonb,'{}'::jsonb,'[]'::jsonb,'[]'::jsonb,
       $11::jsonb,$12::jsonb,$13::jsonb)`,
    [
      executionId,
      elapsed,
      json(context),
      `${command.verb}_completed`,
      json(state.exact_pins),
      changeSet,
      idemId,
      turnNumber,
      startedAt,
      state.clock_minutes,
      json(command.verb === 'perform_simple_work'
        ? [{ effect: 'energy_delta', value: -8 }]
        : []),
      json(state.npc
        ? [{ participant_kind: 'npc', participant_id: state.npc.id }]
        : []),
      json({ activity_profile: `${profile.activity_profile_id}@1` })
    ]
  );
  await tx.query(
    `UPDATE party_runtime.party_timed_activity_executions
     SET cumulative_elapsed_numerator=$2,
         remaining_time_numerator=0,
         next_attempt_ordinal=1,
         status='completed',
         state_version=2,
         updated_change_set_id=$3,
         terminal_change_set_id=$3,
         last_processed_at_whole_minutes=$4,
         next_boundary_at_whole_minutes=NULL,
         next_boundary_at_subminute_numerator=NULL,
         next_boundary_at_subminute_denominator=NULL,
         terminal_reason_code=$5
     WHERE id=$1`,
    [executionId, elapsed, changeSet, state.clock_minutes,
      `${command.verb}_completed`]
  );
  return Object.freeze({
    executionId,
    attemptOrdinal: 0,
    idempotencyRecordId: idemId
  });
}

export async function persistWorkEffects(tx, { state, changeSet, activity }) {
  const partyId = state.party_id;
  const ropeId = `item:${partyId}:rope`;
  await tx.query(
    `INSERT INTO party_runtime.party_activity_resource_bindings
     (activity_execution_id,resource_kind,resource_id,binding_kind,
      quantity_numerator,quantity_denominator,change_set_id,
      idempotency_record_id,consumption_policy_ref,state_version)
     VALUES ($1,'item',$2,'required_tool',1,1,$3,$4,$5::jsonb,1)`,
    [
      activity.executionId,
      ropeId,
      changeSet,
      activity.idempotencyRecordId,
      json(ref('resource_policy', 'resource_policy_temporary_rope_holder_v1'))
    ]
  );
  await tx.query(
    `INSERT INTO party_runtime.party_actor_relations
     (relation_id,party_id,subject_ref,object_ref,relation_category_ref,
      relation_state,causal_evidence_kind,causal_evidence_ref,state_version,
      created_change_set_id,updated_change_set_id)
     VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,
       'terminal_activity_attempt',$7::jsonb,1,$8,$8)
     ON CONFLICT (
       party_id,
       (subject_ref->>'entity_kind'),
       (subject_ref->>'entity_id'),
       (object_ref->>'entity_kind'),
       (object_ref->>'entity_id'),
       (relation_category_ref->>'entity_id')
     ) DO UPDATE SET
       relation_state=EXCLUDED.relation_state,
       causal_evidence_kind=EXCLUDED.causal_evidence_kind,
       causal_evidence_ref=EXCLUDED.causal_evidence_ref,
       state_version=party_actor_relations.state_version+1,
       updated_change_set_id=EXCLUDED.updated_change_set_id`,
    [
      `relation:${partyId}:player:fisher`,
      partyId,
      json(ref('actor', state.player.id)),
      json(ref('npc', state.npc.id)),
      json(ref('relation_category', 'cooperative_familiarity')),
      json({ value: state.relation }),
      json({
        activity_execution_id: activity.executionId,
        attempt_ordinal: activity.attemptOrdinal
      }),
      changeSet
    ]
  );
}
