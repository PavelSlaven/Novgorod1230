import { canonicalDigest } from '@rus/materialization';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';
import { addElapsedTime } from '@rus/time-events-history';
import {
  assertPhase4AttackRows,
  assertPhase4StatementRows
} from './lower-dvina-trace-phase-4-read-semantics.js';
import {
  assertPhase4PromiseAndSurrender
} from './lower-dvina-trace-phase-4-read-obligation.js';
import {
  assertPhase5ArrivalResourceRows,
  loadPhase5ArrivalResourceRows
} from './lower-dvina-trace-phase-4-arrival-resource-proof.js';

/**
 * The snapshot is a cache, never the authority.  On every restart/replay the
 * Phase 4 subset is reconstructed from normalized P16 rows and compared with
 * the snapshot's closed factual history.
 */
export async function assertPhase4NormalizedRows(pool, payload, head) {
  const history = payload.phase4_history;
  if (!Array.isArray(history) || history.length === 0) return;
  const partyId = payload.party_id;
  const [traversals, activities, checks, decisions, obligations, transitions,
    knife, visible, perceptions, npcTransitions, interactions, summaries,
    knowledge, phase5Resources] = await Promise.all([
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
      `SELECT p.perception_id,p.result_kind,p.knowledge_update_refs,
              p.canonical_digest,e.rule_ref,e.status
         FROM party_runtime.party_perception_records p
         JOIN party_runtime.party_temporal_events e ON e.event_id=p.event_id
        WHERE p.party_id=$1 AND left(p.perception_id,length($2))=$2
        ORDER BY p.perception_id`,
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
  const movementHistory = history.filter(({ phase4_kind: kind }) => kind === 'movement');
  const negotiationHistory = history.filter(({ phase4_kind: kind }) => kind === 'negotiation');
  const expectedTraversal = movementHistory.map(({ consequence: c }) => ({
    plan_id: c.movement.traversal.ids.plan_id,
    execution_id: c.movement.traversal.ids.execution_id,
    travel_state_id: c.movement.traversal.ids.travel_state_id,
    interval_id: c.movement.traversal.ids.interval_id,
    option_id: c.movement.route_ref,
    planning_state_version: String(c.movement.traversal.planning_state_version),
    status: 'completed', travel_status: 'closed', closed_result: 'completed',
    result_kind: 'segment_completed',
    actual_time_numerator:
      String(c.movement.traversal.interval_result.actual_time_numerator),
    actual_time_denominator:
      String(c.movement.traversal.interval_result.actual_time_denominator)
  }));
  const actualTraversal = traversals.rows.map((row) => ({ ...row,
    planning_state_version: String(row.planning_state_version) }));
  if (canonicalDigest(actualTraversal) !== canonicalDigest(expectedTraversal)) fail();
  const expectedPerceptions = movementHistory.map(({ turn_number: turn,
    consequence: c }) => ({
    perception_id:
      `perception:${partyId}:trace-phase4:${turn}:arrival`,
    route_execution_id: c.movement.traversal.ids.execution_id
  }));
  if (perceptions.rows.length !== expectedPerceptions.length
      || perceptions.rows.some((entry, index) =>
        entry.perception_id !== expectedPerceptions[index].perception_id
        || entry.result_kind !== 'recognized'
        || entry.status !== 'resolved'
        || entry.rule_ref?.route_execution_id
          !== expectedPerceptions[index].route_execution_id
        || entry.knowledge_update_refs?.[0]?.entity_id
          !== 'onisim_found_alive')) fail();
  for (const { consequence: c } of movementHistory) {
    const reverseKnowledge = knowledge.rows.find(
      ({ fact_id: id }) => id === c.movement.reverse_route_ref
    );
    if (reverseKnowledge?.knowledge_state
          !== 'known_from_committed_traversal'
        || canonicalDigest(reverseKnowledge.evidence)
          !== canonicalDigest([c.movement.traversal.ids.execution_id])) {
      fail();
    }
  }
  assertPhase5ArrivalResourceRows({ payload, movementHistory,
    rows: phase5Resources.rows });

  const expectedActivities = negotiationHistory.flatMap(({ turn_number: turn,
    consequence: c, time_update: timeUpdate }) => {
    let started = timeUpdate?.clock_before;
    if (!started) fail();
    return c.negotiation.activity_roots.map((root) => {
      const activityKind = root.duration_minutes === 10 ? 'negotiation' : 'response';
      const ended = addElapsedTime(started, {
        exact_minutes: {
          numerator: String(root.duration_minutes), denominator: '1'
        }
      });
      const expected = {
        id: `activity:${partyId}:trace-phase4:${turn}:${activityKind}`,
        activity_snapshot: { activity_ref: root.activity_ref, phase4_kind: 'negotiation' },
        original_total_minutes: String(root.duration_minutes),
        status: 'completed',
        activity_series_id: `series:${partyId}:trace-phase4:${turn}:${activityKind}`,
        series_ordinal: root.duration_minutes === 10 ? 0 : 1, attempt_ordinal: 0,
        actual_time_numerator: String(root.duration_minutes),
        result_kind: 'completed',
        result_code: root.activity_ref,
        ...timestampColumns('execution_started', started),
        ...timestampColumns('execution_ended', ended),
        ...timestampColumns('attempt_started', started),
        ...timestampColumns('attempt_ended', ended)
      };
      started = ended;
      return expected;
    });
  });
  if (canonicalDigest(activities.rows) !== canonicalDigest(expectedActivities)) fail();

  const expectedChecks = negotiationHistory.map(({ turn_number: turn, request_id,
    option_id, consequence: c }) => ({
    check_resolution_id: `check:${partyId}:trace-phase4:${turn}`,
    check_scope_key: {
      request_id,
      option_id,
      promise_offer_stage: c.negotiation.offer_stage
    },
    deterministic_roll_input_digest: canonicalDigest({
      audit: c.negotiation.check_result.audit,
      request: c.negotiation.check_request
    }),
    result_kind: c.negotiation.check_result.outcome.success ? 'success' : 'failure',
    canonical_digest: canonicalDigest(c.negotiation.check_result)
  }));
  if (canonicalDigest(checks.rows) !== canonicalDigest(expectedChecks)) fail();

  const expectedDecisions = negotiationHistory.map(({ consequence: c }) => ({
    request_id: c.negotiation.npc_decision.trace.request_id,
    npc_id: payload.npcs.find(({ participant_slot_ref }) => participant_slot_ref === 'ratsha_storehouse_helper')?.instance_id,
    option_id: c.negotiation.npc_decision.trace.option_id,
    options_digest: c.negotiation.npc_decision.trace.options_digest,
    trace_digest: c.negotiation.npc_decision.trace.trace_digest, status: 'committed'
  })).sort((left, right) => left.request_id.localeCompare(right.request_id));
  const actualDecisions = decisions.rows.filter(({ request_id: id }) =>
    expectedDecisions.some(({ request_id }) => request_id === id));
  if (canonicalDigest(actualDecisions) !== canonicalDigest(expectedDecisions)) fail();

  assertPhase4PromiseAndSurrender({
    payload,
    negotiationHistory,
    obligations: obligations.rows,
    transitions: transitions.rows,
    knife,
    npcTransitions: npcTransitions.rows,
    knowledge: knowledge.rows
  });
  assertPhase4StatementRows({
    partyId,
    payload,
    negotiationHistory,
    interactions: interactions.rows,
    summaries: summaries.rows
  });
  assertPhase4AttackRows({
    partyId,
    payload,
    negotiationHistory,
    npcTransitions: npcTransitions.rows,
    knowledge: knowledge.rows,
    activities: activities.rows
  });
  const envelope = visible.rows[0];
  const screenStatus = head.screen?.screen_status;
  if (visible.rowCount !== 1 || envelope.presentation_status !== 'pending'
      || envelope.committed_state_version !== String(payload.party_state.state_version)
      || envelope.change_set_id !== payload.last_turn.change_set_id
      || envelope.package_digest !== computeSpatialV3CanonicalDigest(envelope.visible_payload)
      || envelope.package_digest !== payload.last_turn.visible_package.package_digest
      || !['committed_presentation_pending', 'ready'].includes(screenStatus)
      || head.screen?.current_projection_anchor?.package_id !== envelope.package_id) fail();
}

function fail() { throw phase2IntegrityError(); }

function timestampColumns(prefix, timestamp) {
  return {
    [`${prefix}_whole_minutes`]: String(timestamp.whole_minutes),
    [`${prefix}_subminute_numerator`]: String(timestamp.subminute_numerator),
    [`${prefix}_subminute_denominator`]: String(timestamp.subminute_denominator)
  };
}
