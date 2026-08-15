import {
  hash, json, ref
} from '../../../runtime/first-playable/shared.js';

export async function persistConversation(tx, { state, changeSet, turnNumber, command }) {
  const partyId = state.party_id;
  const executionId = `activity:${partyId}:${turnNumber}`;
  const seriesId = `series:${partyId}:${turnNumber}`;
  const idemId = `idem:${partyId}:${hash(command.idempotency_key).slice(0, 20)}`;
  await tx.query(
    `INSERT INTO party_runtime.party_actor_profile_bindings
     (party_id,actor_kind,actor_id,role_ref,occupation_ref,skill_profile_snapshot,
      name_profile_snapshot,language_profile_snapshot,knowledge_profile_snapshot,
      profile_candidate_set_digest,state_version,created_change_set_id,updated_change_set_id)
     VALUES ($1,'npc',$2,$3::jsonb,$4::jsonb,'{}'::jsonb,$5::jsonb,$6::jsonb,
      $7::jsonb,$8,1,$9,$9)
     ON CONFLICT (party_id,actor_kind,actor_id) DO NOTHING`,
    [partyId, state.npc.id, json(ref('role', state.npc.role_id)),
      json(ref('occupation', state.npc.occupation_id)),
      json({ name_id: state.npc.name_id, display_name: state.npc.name,
        name_provenance: 'first_playable_catalog' }),
      json(state.npc.language_profile),
      json(state.npc.knowledge_profile),
      state.npc.profile_candidate_set_digest, changeSet]
  );
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
     VALUES ($1,0,$2::jsonb,5,0,1,5,1,0,'active',1,$3,NULL,
       'standalone',$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10,
       $11,0,1,$11,0,1,$12,0,1,'{}'::jsonb,$13)`,
    [executionId, json({ profile_id: 'activity_conversation_brief_v1', version: 1 }),
      changeSet, seriesId, json(ref('actor', state.player.id)),
      json({ position: state.location }), json({ npc_id: state.npc.id }),
      json(ref('semantic_command', command.request_id)), command.canonical_digest, idemId,
      state.clock_minutes - 5, state.clock_minutes, hash(`preconditions:${executionId}`)]
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
     VALUES ($1,0,5,1,5,1,5,1,0,1,0,1,5,1,5,'direct_party_clock',
      $2::jsonb,'completed','conversation_completed',$3::jsonb,$4,$5,$6,
      $7,0,1,$8,0,1,'conversation_completed','{}'::jsonb,'{}'::jsonb,
      '[]'::jsonb,'[]'::jsonb,'[]'::jsonb,$9::jsonb,$10::jsonb)`,
    [executionId, json({ npc_id: state.npc.id }), json(state.exact_pins),
      changeSet, idemId, turnNumber, state.clock_minutes - 5, state.clock_minutes,
      json([{ participant_kind: 'npc', participant_id: state.npc.id }]),
      json({ activity_profile: 'activity_conversation_brief_v1@1' })]
  );
  await tx.query(
    `UPDATE party_runtime.party_timed_activity_executions
     SET cumulative_elapsed_numerator=5,
         remaining_time_numerator=0,
         next_attempt_ordinal=1,
         status='completed',
         state_version=2,
         updated_change_set_id=$2,
         terminal_change_set_id=$2,
         last_processed_at_whole_minutes=$3,
         next_boundary_at_whole_minutes=NULL,
         next_boundary_at_subminute_numerator=NULL,
         next_boundary_at_subminute_denominator=NULL,
         terminal_reason_code='conversation_completed'
     WHERE id=$1`,
    [executionId, changeSet, state.clock_minutes]
  );
  const interactionId = `interaction:${partyId}:${turnNumber}`;
  await tx.query(
    `INSERT INTO party_runtime.party_actor_npc_interactions
     (interaction_id,party_id,actor_id,npc_id,interaction_kind,
      activity_execution_id,started_at,ended_at,location_ref,outcome,
      terminal_change_set_id,terminal_evidence_kind,terminal_evidence_ref,
      interaction_policy_ref,canonical_digest)
     VALUES ($1,$2,$3,$4,'conversation',$5,$6::jsonb,$7::jsonb,$8::jsonb,
      'completed',$9,'terminal_attempt',$10::jsonb,$11::jsonb,$12)`,
    [interactionId, partyId, state.player.id, state.npc.id, executionId,
      json({ minute: state.clock_minutes - 5 }), json({ minute: state.clock_minutes }),
      json({ position: state.location }), changeSet,
      json({ activity_execution_id: executionId, attempt_ordinal: 0 }),
      json(ref('interaction_policy', 'conversation_terminal_projection_v1')),
      hash(`${interactionId}:${state.npc.name}`)]
  );
  for (const [scope, subjectKind, subjectId, text] of [
    ['player_journal', 'player_character', state.player.id,
      `Разговор с рыбаком ${state.npc.name} о сезонной работе и непроверенной воде.`],
    ['npc_memory', 'npc', state.npc.id,
      `${state.npc.name} запомнил встречу с лодочником.`]
  ]) {
    await tx.query(
      `INSERT INTO party_runtime.party_actor_npc_interaction_summaries
       (summary_id,interaction_id,summary_scope,remembering_subject_kind,
        remembering_subject_id,summary_text,salience,source_message_digest,
        state_version,created_change_set_id)
       VALUES ($1,$2,$3,$4,$5,$6,1,$7,1,$8)`,
      [`summary:${interactionId}:${scope}`, interactionId, scope, subjectKind,
        subjectId, text, hash(text), changeSet]
    );
  }
}
