import { canonicalDigest } from '@rus/materialization';
import { buildNpcSemanticDecisionTrace } from '@rus/npc-runtime';
import { row } from './first-playable/plan-shared.js';

export function appendNpcDecisionTraceWrites({
  appends,
  decisionRecords,
  partyId,
  changeSetId,
  rootTurnId,
  workingRevision
}) {
  for (const decision of decisionRecords) {
    const { request, boundary, orderedSignals } = decision;
    const plan = decision.proposal.plan;
    const trace = buildNpcSemanticDecisionTrace({
      request,
      plan,
      root_turn_id: rootTurnId,
      working_revision: workingRevision,
      applied_change_set_id: changeSetId,
      status: 'committed'
    });
    const canonicalInputDigest = canonicalDigest({
      schema: 'npc_semantic_decision_input_v1',
      request,
      boundary,
      signal_records: orderedSignals
    });
    const persistedTrace = {
      trace,
      request_snapshot: request,
      boundary_snapshot: boundary,
      signal_records: orderedSignals,
      canonical_input_digest: canonicalInputDigest
    };
    appends.push(row('party_npc_decision_traces', request.request_id, {
      request_id: request.request_id,
      party_id: partyId,
      npc_id: request.npc_ref.entity_id,
      state_version: request.state_version,
      option_id: null,
      command_token: null,
      options_digest: null,
      status: 'committed',
      validated_at_whole_minutes: boundary.scheduled_at.whole_minutes,
      validated_at_subminute_numerator:
        boundary.scheduled_at.subminute_numerator,
      validated_at_subminute_denominator:
        boundary.scheduled_at.subminute_denominator,
      idempotency_key: boundary.idempotency_key,
      change_set_id: changeSetId,
      trace_digest: canonicalDigest(persistedTrace),
      boundary_id: boundary.boundary_id,
      decision_mode: boundary.decision_mode,
      root_turn_id: rootTurnId,
      working_revision: workingRevision,
      signal_refs: boundary.signal_refs,
      decision_categories: boundary.categories,
      aggregate_significance: boundary.significance,
      same_time_batch_ref: boundary.same_time_batch_ref,
      semantic_request: request,
      boundary_snapshot: boundary,
      signal_records: orderedSignals,
      semantic_plan: plan,
      canonical_input_digest: canonicalInputDigest,
      semantic_trace_schema: trace.schema
    }));
  }
}
