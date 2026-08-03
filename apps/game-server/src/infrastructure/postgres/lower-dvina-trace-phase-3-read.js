import { assertPhase3SemanticRows } from './lower-dvina-trace-phase-3-read-semantic.js';
import { assertPhase3ReadRows } from './lower-dvina-trace-phase-3-read-validation.js';
export async function assertPhase3NormalizedRows(pool, payload) {
  const { semanticRevision, decisionTraces } =
    await assertPhase3SemanticRows(pool, payload);
  const [
    clock,
    position,
    activities,
    interactions,
    summaries,
    decisions,
    checks,
    knowledge,
    npcs,
    clueItems,
    traversals
  ] =
    await Promise.all([
      pool.query(
        `SELECT whole_minutes::text,subminute_numerator::text,
                subminute_denominator::text
           FROM party_runtime.party_clocks WHERE party_id=$1`,
        [payload.party_id]
      ),
      pool.query(
        `SELECT g4_id,g5_node_id,g5_anchor_id
           FROM party_runtime.party_positions WHERE party_id=$1`,
        [payload.party_id]
      ),
      pool.query(
        `SELECT e.id,e.activity_snapshot,e.original_total_minutes::text,
                e.status,e.execution_context_snapshot,
                e.started_at_whole_minutes::text,
                e.started_at_subminute_numerator::text,
                e.started_at_subminute_denominator::text,
                e.last_processed_at_whole_minutes::text,
                e.last_processed_at_subminute_numerator::text,
                e.last_processed_at_subminute_denominator::text,
                a.actual_time_numerator::text,
                a.actual_time_denominator::text,
                a.result_kind,a.trace
           FROM party_runtime.party_timed_activity_executions e
           JOIN party_runtime.party_timed_activity_attempts a
             ON a.activity_execution_id=e.id
          WHERE left(e.id,length($1))=$1
          ORDER BY e.id,a.attempt_ordinal`,
        [`activity:${payload.party_id}:trace-phase3:`]
      ),
      pool.query(
        `SELECT interaction_id,npc_id,terminal_evidence_ref
           FROM party_runtime.party_actor_npc_interactions
          WHERE party_id=$1 ORDER BY interaction_id`,
        [payload.party_id]
      ),
      pool.query(
        `SELECT s.summary_id,s.interaction_id,s.summary_scope,
                s.remembering_subject_id,s.summary_text
           FROM party_runtime.party_actor_npc_interaction_summaries s
           JOIN party_runtime.party_actor_npc_interactions i
             ON i.interaction_id=s.interaction_id
          WHERE i.party_id=$1 ORDER BY s.summary_id`,
        [payload.party_id]
      ),
      pool.query(
        `SELECT request_id,npc_id,option_id,options_digest,trace_digest
           FROM party_runtime.party_npc_decision_traces
          WHERE party_id=$1 ORDER BY request_id`,
        [payload.party_id]
      ),
      pool.query(
        `SELECT check_resolution_id,check_scope_kind,check_scope_key,
                check_policy_ref,deterministic_roll_input_digest,
                roll_value,modifier_snapshot,target_value,result_kind,
                consequence_policy_ref,result_change_set_id,
                canonical_digest
           FROM party_runtime.party_check_resolutions
          WHERE party_id=$1
            AND left(check_resolution_id,length($2))=$2
          ORDER BY check_resolution_id`,
        [payload.party_id, `check:${payload.party_id}:trace-phase3:`]
      ),
      pool.query(
        `SELECT fact_id,knowledge_state,evidence
           FROM party_runtime.party_character_knowledge
          WHERE party_id=$1 AND character_id=$2 ORDER BY fact_id`,
        [payload.party_id, payload.actor_id]
      ),
      pool.query(
        `SELECT npc_id,profile_level,anchor_id,semantic_state
           FROM party_runtime.party_npcs
          WHERE party_id=$1 ORDER BY npc_id`,
        [payload.party_id]
      ),
      pool.query(
        `SELECT i.item_id,i.template_id,i.profile_id,i.quantity,i.state,
                p.anchor_id,p.container_id,p.holder_npc_id,
                p.holder_character_id,p.physical_position,
                p.equipment_slot_category_id,
                o.owner_external_ref,o.owner_character_id,
                o.controller_character_id,o.claim_state
           FROM party_runtime.party_items i
           JOIN party_runtime.party_item_placements p
             ON p.party_id=i.party_id AND p.item_id=i.item_id
           JOIN party_runtime.party_ownership o
             ON o.party_id=i.party_id AND o.item_id=i.item_id
          WHERE i.party_id=$1
            AND i.template_id='trace_ld_v1_item_blue_wool_fragment'
          ORDER BY i.item_id`,
        [payload.party_id]
      ),
      pool.query(
        `SELECT p.id AS plan_id,p.option_id,p.planning_state_version,
                e.id AS execution_id,e.status,
                t.id AS travel_state_id,t.segment_progress_ppm,
                t.cumulative_actual_time_numerator::text,
                t.cumulative_actual_time_denominator::text,
                r.id AS interval_id,r.actual_time_numerator::text,
                r.actual_time_denominator::text,r.result_kind,
                r.dynamic_snapshot,
                (SELECT count(*)::int
                   FROM party_runtime.party_route_plan_execution_events v
                  WHERE v.execution_id=e.id) AS lifecycle_event_count
           FROM party_runtime.party_route_plans p
           JOIN party_runtime.party_route_plan_executions e
             ON e.route_plan_id=p.id
           JOIN party_runtime.traveller_travel_states t
             ON t.route_plan_execution_id=e.id
           JOIN party_runtime.party_traversal_interval_results r
             ON r.route_plan_execution_id=e.id
          WHERE p.party_id=$1
            AND left(p.id,length($2))=$2
          ORDER BY p.created_at_turn`,
        [payload.party_id, `route-plan:${payload.party_id}:trace-phase3:`]
      )
    ]);
  assertPhase3ReadRows({
    payload,
    semanticRevision,
    results: {
      clock,
      position,
      activities,
      interactions,
      summaries,
      decisions,
      checks,
      knowledge,
      npcs,
      clueItems,
      traversals
    }
  });
  return decisionTraces;
}
