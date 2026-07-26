import { serverError } from '../../../errors.js';
import {
  NPC_PROFILE_SET, choose, hash, json, ref, resolveNpcProfile
} from '../../../runtime/first-playable/shared.js';

export async function ensureLandingMaterialized(tx, { state, changeSet }) {
  const partyId = state.party_id;
  const npcId = `npc:${partyId}:fisher`;
  const runId = `run:${partyId}:baseline`;
  const landingPosition = `position:${partyId}:landing`;
  const exists = await tx.query(
    'SELECT 1 FROM party_runtime.party_npcs WHERE party_id=$1 AND npc_id=$2',
    [partyId, npcId]
  );
  if (exists.rows.length > 0) return;
  await tx.query(
    `INSERT INTO party_runtime.party_npcs
     (party_id,npc_id,run_id,profile_set_id,profile_level,identity_state,
      machine_state,semantic_state)
     VALUES ($1,$2,$3,'scene_fisher','background',
       '{"identity":"not_yet_enriched"}'::jsonb,
       '{"activity":"net_work"}'::jsonb,
       '{"reason_for_presence":"late_summer_seasonal_net_work"}'::jsonb)`,
    [partyId, npcId, runId]
  );
  const netAllocation =
    state.npc.equipment_profile.initial_item_allocations[0];
  const netId = `item:${partyId}:${netAllocation.slot_id}`;
  await tx.query(
    `INSERT INTO party_runtime.party_items
     (party_id,item_id,run_id,template_id,profile_id,category_id,quantity,
      condition_state,legal_status,state)
     VALUES ($1,$2,$3,$4,'first_playable',
       $5,$6,'serviceable','owned','{}'::jsonb)`,
    [
      partyId,
      netId,
      runId,
      netAllocation.template_id,
      netAllocation.category_id,
      netAllocation.resolved_quantity.quantity
    ]
  );
  await tx.query(
    `INSERT INTO party_runtime.entity_placements
     (party_id,entity_kind,entity_id,placement_kind,position_node_id,
      occupies_capacity_units,state_version,updated_change_set_id)
     VALUES ($1,'item',$2,'scene_position',$3,1,1,$4)`,
    [partyId, netId, landingPosition, changeSet]
  );
  const npcRef = ref('npc', npcId);
  await tx.query(
    `INSERT INTO party_runtime.party_entity_controls
     (party_id,entity_kind,entity_id,owner_ref,holder_ref,controller_ref,
      access_profile_ref,capacity_units,state_version,updated_change_set_id)
     VALUES ($1,'item',$2,$3::jsonb,$3::jsonb,$3::jsonb,$4::jsonb,1,1,$5)`,
    [partyId, netId, json(npcRef), json(ref('access_profile', 'owner_direct')), changeSet]
  );
  const basketAllocation =
    state.npc.equipment_profile.initial_container_allocations[0];
  const basketId = `container:${partyId}:${basketAllocation.slot_id}`;
  await tx.query(
    `INSERT INTO party_runtime.party_containers
     (party_id,container_id,run_id,template_id,holder_npc_id,
      physical_position,condition_state,closure_state,state)
     VALUES ($1,$2,$3,$4,$5,
       NULL,'serviceable','open','{}'::jsonb)`,
    [partyId, basketId, runId, basketAllocation.template_id, npcId]
  );
  await tx.query(
    `INSERT INTO party_runtime.entity_placements
     (party_id,entity_kind,entity_id,placement_kind,position_node_id,
      occupies_capacity_units,state_version,updated_change_set_id)
     VALUES ($1,'container',$2,'scene_position',$3,1,1,$4)`,
    [partyId, basketId, landingPosition, changeSet]
  );
  await tx.query(
    `INSERT INTO party_runtime.party_entity_controls
     (party_id,entity_kind,entity_id,owner_ref,holder_ref,controller_ref,
      access_profile_ref,capacity_units,state_version,updated_change_set_id)
     VALUES ($1,'container',$2,$3::jsonb,$3::jsonb,$3::jsonb,$4::jsonb,1,1,$5)`,
    [partyId, basketId, json(npcRef),
      json(ref('access_profile', 'owner_direct')), changeSet]
  );
  await tx.query(
    `INSERT INTO party_runtime.party_resource_nodes
     (resource_node_id,party_id,source_resource_ref,position_node_id,
      quantity_numerator,quantity_denominator,quantity_unit_ref,quality_ref,
      access_policy_ref,state_version,created_change_set_id,updated_change_set_id)
     VALUES ($1,$2,$3::jsonb,$4,100000,1,$5::jsonb,$6::jsonb,$7::jsonb,1,$8,$8)`,
    [`resource:${partyId}:surface-water`, partyId, json(ref('resource', 'surface_water')),
      landingPosition, json(ref('quantity_unit', 'millilitre')),
      json(ref('quality', 'untested_surface_water')),
      json(ref('access_policy', 'shoreline_direct_access_v1')), changeSet]
  );
}

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
      json({ name_id: state.npc.name_id, display_name: state.npc.name }),
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
