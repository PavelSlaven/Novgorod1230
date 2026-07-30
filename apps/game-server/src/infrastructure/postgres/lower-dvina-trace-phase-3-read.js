import { canonicalDigest } from '@rus/materialization';
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';
import {
  actualPhase3Traversals,
  expectedPhase3Traversals,
  phase3ActivityReadProof,
  phase3ClueOwnershipMatches,
  phase3NpcReadProof
} from './lower-dvina-trace-phase-3-read-proofs.js';

export async function assertPhase3NormalizedRows(pool, payload) {
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
  const expectedInteractions = payload.interactions ?? [];
  const activityProof = phase3ActivityReadProof(payload, activities.rows);
  const actualInteractions = interactions.rows.map((row) => ({
    interaction_id: row.interaction_id,
    npc_id: row.npc_id,
    statement_ref: row.terminal_evidence_ref?.statement_ref,
    consequence_ref: row.terminal_evidence_ref?.consequence_ref ?? null
  }));
  const expectedInteractionProof = expectedInteractions.map((entry) => ({
    interaction_id: entry.interaction_id,
    npc_id: entry.npc_id,
    statement_ref: entry.statement_ref,
    consequence_ref: entry.consequence_ref ?? null
  }));
  const expectedSummaries = expectedInteractions.flatMap((entry) =>
    entry.statement_is_new === false ? [] : [{
      summary_id: `summary:${entry.interaction_id}:npc_memory`,
      interaction_id: entry.interaction_id,
      summary_scope: 'npc_memory',
      remembering_subject_id: entry.npc_id,
      summary_text: entry.memory_text
    }, {
      summary_id: `summary:${entry.interaction_id}:player_journal`,
      interaction_id: entry.interaction_id,
      summary_scope: 'player_journal',
      remembering_subject_id: payload.actor_id,
      summary_text: entry.journal_text
    }]
  ).sort((left, right) => left.summary_id.localeCompare(right.summary_id));
  const actualSummaries = summaries.rows.map((row) => ({
    summary_id: row.summary_id,
    interaction_id: row.interaction_id,
    summary_scope: row.summary_scope,
    remembering_subject_id: row.remembering_subject_id,
    summary_text: row.summary_text
  }));
  const expectedDecisions = expectedInteractions.map((entry) => ({
    request_id: entry.decision_trace.request_id,
    npc_id: entry.npc_id,
    option_id: entry.decision_trace.option_id,
    options_digest: entry.decision_trace.options_digest,
    trace_digest: entry.decision_trace.trace_digest
  })).sort((left, right) => left.request_id.localeCompare(right.request_id));
  const actualDecisions = decisions.rows.map((row) => ({
    request_id: row.request_id,
    npc_id: row.npc_id,
    option_id: row.option_id,
    options_digest: row.options_digest,
    trace_digest: row.trace_digest
  }));
  const expectedChecks = (payload.activity_history ?? [])
    .filter((entry) => entry.execution_result?.check_result)
    .map((entry) => {
      const result = entry.execution_result.check_result;
      const turnNumber = entry.activity_execution_id.split(':').at(-1);
      return {
        check_resolution_id:
          `check:${payload.party_id}:trace-phase3:${turnNumber}`,
        check_scope_kind: 'immediate_action',
        check_scope_key: {
          request_id: entry.request_id,
          option_id: entry.option_id
        },
        check_policy_ref: {
          entity_kind: 'check_policy',
          entity_id: result.check_id,
          authoring_version: '1'
        },
        deterministic_roll_input_digest: canonicalDigest({
          input_digest: entry.input_digest,
          audit: result.audit
        }),
        roll_value: result.roll,
        modifier_snapshot: result.modifiers,
        target_value: result.difficulty,
        result_kind: result.outcome.success ? 'success' : 'failure',
        consequence_policy_ref: {
          entity_kind: 'consequence_policy',
          entity_id: entry.execution_result.consequence_ref,
          authoring_version: '1'
        },
        result_change_set_id: entry.change_set_id,
        canonical_digest: canonicalDigest(result)
      };
    });
  const actualChecks = checks.rows.map((row) => ({
    check_resolution_id: row.check_resolution_id,
    check_scope_kind: row.check_scope_kind,
    check_scope_key: row.check_scope_key,
    check_policy_ref: row.check_policy_ref,
    deterministic_roll_input_digest:
      row.deterministic_roll_input_digest,
    roll_value: row.roll_value,
    modifier_snapshot: row.modifier_snapshot,
    target_value: row.target_value,
    result_kind: row.result_kind,
    consequence_policy_ref: row.consequence_policy_ref,
    result_change_set_id: row.result_change_set_id,
    canonical_digest: row.canonical_digest
  }));
  const actualKnowledge = knowledge.rows.map((row) => ({
    fact_id: row.fact_id,
    knowledge_state: row.knowledge_state,
    evidence_refs: row.evidence
  }));
  const currentPosition = position.rows[0];
  const npcProof = phase3NpcReadProof(payload, npcs.rows);
  const expectedClue = (payload.items ?? []).find((item) =>
    item.template_id === 'trace_ld_v1_item_blue_wool_fragment');
  const actualClue = clueItems.rows[0] ?? null;
  const expectedTraversals = expectedPhase3Traversals(payload);
  const actualTraversals = actualPhase3Traversals(traversals.rows);
  if (clock.rowCount !== 1 || position.rowCount !== 1
      || clock.rows[0].whole_minutes !== payload.clock.whole_minutes
      || clock.rows[0].subminute_numerator
        !== payload.clock.subminute_numerator
      || clock.rows[0].subminute_denominator
        !== payload.clock.subminute_denominator
      || currentPosition.g4_id !== payload.position.g4_id
      || currentPosition.g5_node_id !== payload.position.g5_node_id
      || currentPosition.g5_anchor_id !== payload.position.g5_anchor_id
      || activityProof.valid !== true
      || canonicalDigest(activityProof.actual)
        !== canonicalDigest(activityProof.expected)
      || canonicalDigest(actualTraversals)
        !== canonicalDigest(expectedTraversals)
      || canonicalDigest(actualInteractions)
        !== canonicalDigest(expectedInteractionProof)
      || canonicalDigest(actualSummaries)
        !== canonicalDigest(expectedSummaries)
      || canonicalDigest(actualDecisions)
        !== canonicalDigest(expectedDecisions)
      || canonicalDigest(actualChecks) !== canonicalDigest(expectedChecks)
      || canonicalDigest(actualKnowledge)
        !== canonicalDigest(payload.knowledge ?? [])
      || canonicalDigest(npcProof.actual) !== canonicalDigest(npcProof.expected)
      || Boolean(expectedClue) !== Boolean(actualClue)
      || (expectedClue
        && (clueItems.rowCount !== 1
          || expectedClue.item_id !== actualClue.item_id
          || expectedClue.profile_id !== actualClue.profile_id
          || expectedClue.quantity !== actualClue.quantity
          || canonicalDigest(expectedClue.placement)
            !== canonicalDigest({
              holder_character_id: actualClue.holder_character_id,
              physical_position: actualClue.physical_position
            })
          || !phase3ClueOwnershipMatches(expectedClue, actualClue)
          || canonicalDigest(expectedClue.state)
            !== canonicalDigest(actualClue.state)))) {
    throw phase2IntegrityError();
  }
}
