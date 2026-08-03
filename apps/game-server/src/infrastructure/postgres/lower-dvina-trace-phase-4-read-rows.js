import { loadPhase5ArrivalResourceRows } from './lower-dvina-trace-phase-4-arrival-resource-proof.js';

export async function loadPhase4ReadRows(pool, partyId, payload) {
  const [traversals, activities, checks, decisions, obligations, transitions,
    knife, visible, perceptions, perceptionWitnesses, perceptionReplay,
    npcTransitions, interactions, summaries, knowledge,
    phase5Resources] = await Promise.all([
      pool.query(
      `SELECT p.id AS plan_id,e.id AS execution_id,t.id AS travel_state_id,
              r.id AS interval_id,p.option_id,p.planning_state_version,
              e.status,t.status AS travel_status,t.closed_result,r.result_kind,
              r.actual_time_numerator::text,r.actual_time_denominator::text
         FROM party_runtime.party_route_plans p
         JOIN party_runtime.party_route_plan_executions e ON e.route_plan_id=p.id
         JOIN party_runtime.traveller_travel_states t ON t.route_plan_execution_id=e.id
         JOIN party_runtime.party_traversal_interval_results r ON r.route_plan_execution_id=e.id
        WHERE p.party_id=$1 AND left(p.id,length($2))=$2
        ORDER BY p.created_at_turn`,
      [partyId, `route-plan:${partyId}:trace-phase4:`]),
    pool.query(
      `SELECT e.id,e.activity_snapshot,e.original_total_minutes::text,e.status,
              e.activity_series_id,e.series_ordinal,a.attempt_ordinal,
              a.actual_time_numerator::text,a.result_kind,a.result_code,
              e.started_at_whole_minutes::text AS execution_started_whole_minutes,
              e.started_at_subminute_numerator::text AS execution_started_subminute_numerator,
              e.started_at_subminute_denominator::text AS execution_started_subminute_denominator,
              e.last_processed_at_whole_minutes::text AS execution_ended_whole_minutes,
              e.last_processed_at_subminute_numerator::text AS execution_ended_subminute_numerator,
              e.last_processed_at_subminute_denominator::text AS execution_ended_subminute_denominator,
              a.started_at_whole_minutes::text AS attempt_started_whole_minutes,
              a.started_at_subminute_numerator::text AS attempt_started_subminute_numerator,
              a.started_at_subminute_denominator::text AS attempt_started_subminute_denominator,
              a.ended_at_whole_minutes::text AS attempt_ended_whole_minutes,
              a.ended_at_subminute_numerator::text AS attempt_ended_subminute_numerator,
              a.ended_at_subminute_denominator::text AS attempt_ended_subminute_denominator
         FROM party_runtime.party_timed_activity_executions e
         JOIN party_runtime.party_timed_activity_attempts a ON a.activity_execution_id=e.id
        WHERE left(e.id,length($1))=$1
        ORDER BY a.occurred_at_turn,e.series_ordinal,a.attempt_ordinal`,
      [`activity:${partyId}:trace-phase4:`]),
    pool.query(
      `SELECT check_resolution_id,check_scope_key,
              deterministic_roll_input_digest,r.result_kind,r.canonical_digest
         FROM party_runtime.party_check_resolutions r
         JOIN party_runtime.party_v3_change_sets c
           ON c.party_id=r.party_id AND c.id=r.result_change_set_id
        WHERE r.party_id=$1 AND left(r.check_resolution_id,length($2))=$2
        ORDER BY c.committed_at_turn,r.check_resolution_id`,
      [partyId, `check:${partyId}:trace-phase4:`]),
    pool.query(
      `SELECT request_id,npc_id,option_id,options_digest,trace_digest,status
         FROM party_runtime.party_npc_decision_traces
        WHERE party_id=$1
        ORDER BY request_id`, [partyId]),
    pool.query(
      `SELECT obligation_id,policy_ref,policy_version,promisor_ref,
              beneficiary_ref,witness_refs,scope_snapshot,
              current_state,current_state_fact,state_version,
              created_change_set_id,last_change_set_id
         FROM party_runtime.party_obligations
        WHERE party_id=$1 ORDER BY obligation_id`, [partyId]),
    pool.query(
      `SELECT obligation_id,transition_ordinal,from_state,to_state,
              transition_kind,check_resolution_id,npc_decision_request_id,
              causal_basis,witness_snapshot
         FROM party_runtime.party_obligation_transitions
        WHERE party_id=$1 ORDER BY obligation_id,transition_ordinal`, [partyId]),
    pool.query(
      `SELECT i.state,p.holder_npc_id,p.holder_character_id,p.physical_position,
              o.owner_npc_id,o.owner_character_id,
              o.controller_npc_id,o.controller_character_id
         FROM party_runtime.party_items i
         JOIN party_runtime.party_item_placements p ON p.party_id=i.party_id AND p.item_id=i.item_id
         JOIN party_runtime.party_ownership o ON o.party_id=i.party_id AND o.item_id=i.item_id
        WHERE i.party_id=$1 AND i.template_id='trace_ld_v1_item_ratsha_knife'`, [partyId]),
    pool.query(
      `SELECT package_id,package_digest,visible_payload,presentation_status,
              committed_state_version::text,change_set_id
         FROM party_runtime.party_visible_packages WHERE package_id=$1`,
      [payload.last_turn?.visible_package?.package_id ?? '']),
    pool.query(
      `SELECT p.perception_id,p.event_id,p.perceiver_kind,p.perceiver_id,
              p.result_kind,p.perceived_at_whole_minutes::text,
              p.perceived_at_subminute_numerator::text,
              p.perceived_at_subminute_denominator::text,
              p.recognition_policy_ref,p.visibility_policy_ref,
              p.knowledge_update_refs,p.signal_refs,p.canonical_digest,
              p.change_set_id,p.idempotency_record_id,
              e.rule_ref,e.policy_ref,e.event_kind,e.status,
              e.change_set_id AS event_change_set_id,
              e.terminal_change_set_id,e.state_version::text AS event_version
         FROM party_runtime.party_perception_records p
         JOIN party_runtime.party_temporal_events e ON e.event_id=p.event_id
        WHERE p.party_id=$1 AND left(p.perception_id,length($2))=$2
        ORDER BY p.perception_id`,
      [partyId, `perception:${partyId}:trace-phase4:`]),
    pool.query(
      `SELECT w.perception_id,w.witness_kind,w.witness_id
         FROM party_runtime.party_perception_witnesses w
         JOIN party_runtime.party_perception_records p
           ON p.perception_id=w.perception_id
        WHERE p.party_id=$1 AND left(p.perception_id,length($2))=$2
        ORDER BY w.perception_id,w.witness_kind,w.witness_id`,
      [partyId, `perception:${partyId}:trace-phase4:`]),
    pool.query(
      `SELECT perception_id,party_id,canonical_input_digest,
              perception_digest,expected_state_versions_digest,
              dependency_pins_digest,policy_versions_digest,
              idempotency_key,canonical_digest,change_set_id
         FROM party_runtime.party_perception_replay_evidence
        WHERE party_id=$1 AND left(perception_id,length($2))=$2
        ORDER BY perception_id`,
      [partyId, `perception:${partyId}:trace-phase4:`]),
    pool.query(
      `SELECT t.transition_id,t.npc_id,t.transition_kind,t.trace,
              n.machine_state,n.semantic_state
         FROM party_runtime.party_npc_runtime_transitions t
         JOIN party_runtime.party_npcs n
           ON n.party_id=t.party_id AND n.npc_id=t.npc_id
        WHERE t.party_id=$1 AND left(t.transition_id,length($2))=$2
        ORDER BY t.transition_id`,
      [partyId, `npc-transition:${partyId}:trace-phase4:`]),
    pool.query(
      `SELECT interaction_id,npc_id,terminal_evidence_ref,
              interaction_policy_ref,canonical_digest
         FROM party_runtime.party_actor_npc_interactions
        WHERE party_id=$1 AND left(interaction_id,length($2))=$2
        ORDER BY interaction_id`,
      [partyId, `interaction:${partyId}:trace-phase4:`]),
    pool.query(
      `SELECT s.summary_id,s.interaction_id,s.summary_scope,
              s.remembering_subject_kind,s.remembering_subject_id,
              s.summary_text,s.source_message_digest
         FROM party_runtime.party_actor_npc_interaction_summaries s
         JOIN party_runtime.party_actor_npc_interactions i
           ON i.interaction_id=s.interaction_id
        WHERE i.party_id=$1 AND left(i.interaction_id,length($2))=$2
        ORDER BY s.summary_id`,
      [partyId, `interaction:${partyId}:trace-phase4:`]),
    pool.query(
      `SELECT fact_id,knowledge_state,evidence
         FROM party_runtime.party_character_knowledge
        WHERE party_id=$1 AND character_id=$2
        ORDER BY fact_id`,
      [partyId, payload.actor_id])
    , loadPhase5ArrivalResourceRows(pool, partyId)
  ]);
  return {
    traversals, activities, checks, decisions, obligations, transitions,
    knife, visible, perceptions, perceptionWitnesses, perceptionReplay,
    npcTransitions, interactions, summaries, knowledge, phase5Resources
  };
}
