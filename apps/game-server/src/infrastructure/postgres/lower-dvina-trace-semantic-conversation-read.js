
import { canonicalDigest } from '@rus/materialization';
import {
  buildNpcSemanticDecisionTrace,
  validateConversationContributionPlan,
  validateConversationSession,
  validateConversationStatementEvent,
  validateNpcConversationResponseRequest,
  validateNpcDecisionBoundary,
  validateNpcDecisionSignal,
  validateNpcSemanticDecisionTrace
} from '@rus/npc-runtime';
import {
  assertChangeSetLineage,
  assertDecisions,
  assertSessions,
  assertStatementsAndAudiences
} from './lower-dvina-trace-semantic-conversation-read-rows.js';
import { assertContributions } from
  './lower-dvina-trace-semantic-conversation-read-contributions.js';
import { assertMessages } from './lower-dvina-trace-semantic-conversation-read-messages.js';
import { assertSupportingOperationPerceptions } from
  './lower-dvina-trace-semantic-conversation-read-supporting-perceptions.js';

export function isLowerDvinaTraceSemanticRevision(payload) {
  return [14, 15, 16, 17, 18].includes(Number(payload?.materialization_trace?.seed_context
    ?.scenario_definition_revision));
}

export async function assertLowerDvinaTraceSemanticConversationRows(
  pool,
  payload,
  { replayInputs = null } = {}
) {
  if (!isLowerDvinaTraceSemanticRevision(payload)) return [];
  const partyId = payload.party_id;
  const [contributions, sessions, statements, decisions, messages,
    supportingPerceptions] = await Promise.all([
    pool.query(
      `SELECT c.contribution_id,c.conversation_id,c.exchange_id,
              c.party_state_version::text,
              c.session_state_version::text,c.contribution_index::text,
              c.contribution_schema,c.contribution_payload,c.change_set_id,
              c.idempotency_key,c.canonical_digest
         FROM party_runtime.party_conversation_contributions c
        WHERE c.party_id=$1
        ORDER BY c.party_state_version,c.contribution_index,c.conversation_id`,
      [partyId]
    ),
    pool.query(
      `SELECT conversation_id,state_version::text,status,started_at,
              location_ref,initiator_ref,active_participant_refs,
              last_contribution_ref,topic_refs,status_reason,
              updated_change_set_id,canonical_digest,session_schema
         FROM party_runtime.party_conversation_sessions
        WHERE party_id=$1 ORDER BY conversation_id`,
      [partyId]
    ),
    pool.query(
      `SELECT statement_id,conversation_id,exchange_id,speaker_ref,
              intended_addressee_refs,utterance_text,dominant_act,
              interaction_tags,topic_refs,claims,message_completeness,
              spoken_at,duration,social_delivery_result,source_plan_ref,
              change_set_id,statement_schema,idempotency_key,
              canonical_digest,audience_projection,audience_digest
         FROM party_runtime.party_conversation_statements
        WHERE party_id=$1 ORDER BY statement_id`,
      [partyId]
    ),
    pool.query(
      `SELECT request_id,npc_id,state_version::text,status,change_set_id,
              trace_digest,boundary_id,decision_mode,root_turn_id,
              working_revision::text,signal_refs,decision_categories,
              aggregate_significance,same_time_batch_ref,semantic_request,
              boundary_snapshot,signal_records,semantic_plan,
              canonical_input_digest,semantic_trace_schema
         FROM party_runtime.party_npc_decision_traces
        WHERE party_id=$1
          AND semantic_trace_schema='npc_semantic_decision_trace_v1'
        ORDER BY request_id`,
      [partyId]
    ),
    pool.query(
      `SELECT p.perception_id,p.event_id,p.perceiver_kind,p.perceiver_id,
              p.result_kind,p.perceived_at_whole_minutes::text,
              p.perceived_at_subminute_numerator::text,
              p.perceived_at_subminute_denominator::text,
              p.recognition_policy_ref,p.visibility_policy_ref,
              p.canonical_digest AS perception_digest,p.signal_refs,
              p.knowledge_update_refs,p.change_set_id,
              p.idempotency_record_id,
              e.event_kind,e.status AS event_status,
              e.scheduled_at_whole_minutes::text,
              e.scheduled_at_subminute_numerator::text,
              e.scheduled_at_subminute_denominator::text,e.rule_ref,
              e.policy_ref,e.preconditions_digest,e.idempotency_key,
              e.change_set_id AS event_change_set_id,
              e.terminal_change_set_id,e.state_version::text AS event_version,
              w.witness_kind,w.witness_id,
              r.canonical_input_digest,r.perception_digest AS replay_digest,
              r.expected_state_versions_digest,r.dependency_pins_digest,
              r.policy_versions_digest,r.idempotency_key AS replay_idempotency_key,
              r.canonical_digest AS replay_canonical_digest,
              r.change_set_id AS replay_change_set_id
         FROM party_runtime.party_perception_records p
         JOIN party_runtime.party_temporal_events e ON e.event_id=p.event_id
         JOIN party_runtime.party_perception_witnesses w
           ON w.perception_id=p.perception_id
         JOIN party_runtime.party_perception_replay_evidence r
           ON r.party_id=p.party_id AND r.perception_id=p.perception_id
        WHERE p.party_id=$1
          AND e.event_kind='conversation_message_received'
        ORDER BY p.perception_id,w.witness_kind,w.witness_id`,
      [partyId]
    ),
    pool.query(
      `SELECT p.perception_id,p.event_id,p.perceiver_kind,p.perceiver_id,
              p.result_kind,p.perceived_at_whole_minutes::text,
              p.perceived_at_subminute_numerator::text,
              p.perceived_at_subminute_denominator::text,
              p.recognition_policy_ref,p.visibility_policy_ref,
              p.canonical_digest AS perception_digest,p.signal_refs,
              p.knowledge_update_refs,p.change_set_id,
              p.idempotency_record_id,
              e.event_kind,e.status AS event_status,
              e.scheduled_at_whole_minutes::text,
              e.scheduled_at_subminute_numerator::text,
              e.scheduled_at_subminute_denominator::text,e.rule_ref,
              e.policy_ref,e.preconditions_digest,e.idempotency_key,
              e.change_set_id AS event_change_set_id,
              e.terminal_change_set_id,e.state_version::text AS event_version,
              w.witness_kind,w.witness_id,
              r.canonical_input_digest,r.perception_digest AS replay_digest,
              r.expected_state_versions_digest,r.dependency_pins_digest,
              r.policy_versions_digest,
              r.idempotency_key AS replay_idempotency_key,
              r.canonical_digest AS replay_canonical_digest,
              r.change_set_id AS replay_change_set_id
         FROM party_runtime.party_perception_records p
         JOIN party_runtime.party_temporal_events e ON e.event_id=p.event_id
         LEFT JOIN party_runtime.party_perception_witnesses w
           ON w.perception_id=p.perception_id
         JOIN party_runtime.party_perception_replay_evidence r
           ON r.party_id=p.party_id AND r.perception_id=p.perception_id
        WHERE p.party_id=$1
          AND e.event_kind='conversation_supporting_operation'
        ORDER BY p.perception_id,w.witness_kind,w.witness_id`,
      [partyId]
    )
  ]);

  const sessionRows = assertSessions(payload, sessions.rows);
  const statementRows = assertStatementsAndAudiences(payload, statements.rows);
  const contributionRows = assertContributions(payload, contributions.rows);
  const decisionProof = assertDecisions(payload, decisions.rows);
  const conversationDecisionRows = decisionProof.rows.filter(
    ({ semantic_request: request }) =>
      request?.schema === 'npc_conversation_response_request_v1'
  );
  assertChangeSetLineage(
    sessionRows,
    statementRows,
    conversationDecisionRows,
    contributionRows
  );
  assertMessages({
    partyId,
    payload,
    sessions: sessionRows,
    statements: statementRows,
    decisions: conversationDecisionRows,
    contributions: contributionRows,
    rows: messages.rows
  });
  assertSupportingOperationPerceptions({
    payload,
    rows: supportingPerceptions.rows,
    contributions: contributionRows
  });
  if (replayInputs !== null) {
    replayInputs.push(...structuredClone(decisionProof.replayInputs));
  }
  return decisionProof.traces;
}
