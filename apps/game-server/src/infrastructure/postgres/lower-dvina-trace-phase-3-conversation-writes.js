import { canonicalDigest } from '@rus/materialization';
import { row } from './first-playable/plan-shared.js';

export function appendConversation(input) {
  const {
    appends, inserts, state, next, factual, partyId, turnNumber,
    changeSetId, inputDigest
  } = input;
  const c = factual.consequence.conversation;
  const activityId = `activity:${partyId}:trace-phase3:${turnNumber}`;
  const interactionId =
    `interaction:${partyId}:trace-phase3:${turnNumber}`;
  appends.push(row('party_npc_decision_traces',
    c.decision.trace.request_id, {
      request_id: c.decision.trace.request_id,
      party_id: partyId,
      npc_id: c.npc_id,
      state_version: Math.max(1, Number(c.decision.trace.state_version)),
      option_id: c.decision.trace.option_id,
      command_token: c.decision.trace.command_token,
      options_digest: c.decision.trace.options_digest,
      status: 'committed',
      validated_at_whole_minutes:
        c.decision.trace.validated_at.whole_minutes,
      validated_at_subminute_numerator:
        c.decision.trace.validated_at.subminute_numerator,
      validated_at_subminute_denominator:
        c.decision.trace.validated_at.subminute_denominator,
      idempotency_key: c.decision.trace.idempotency_key,
      change_set_id: changeSetId,
      trace_digest: c.decision.trace.trace_digest
    }));
  appends.push(row('party_actor_npc_interactions', interactionId, {
    interaction_id: interactionId,
    party_id: partyId,
    actor_id: state.actor_id,
    npc_id: c.npc_id,
    interaction_kind: 'conversation',
    activity_execution_id: activityId,
    started_at: factual.time_update.clock_before,
    ended_at: factual.time_update.clock_after,
    location_ref: structuredClone(state.position),
    outcome: 'completed',
    terminal_change_set_id: changeSetId,
    terminal_evidence_kind: 'terminal_attempt',
    terminal_evidence_ref: {
      activity_execution_id: activityId,
      attempt_ordinal: 0,
      statement_ref: c.statement_ref,
      consequence_ref: c.consequence_ref
    },
    interaction_policy_ref: {
      entity_kind: 'interaction_mapping',
      entity_id: c.mapping_ref,
      statement_ref: c.statement_ref
    },
    canonical_digest: canonicalDigest({
      interaction_id: interactionId,
      statement_ref: c.statement_ref,
      decision_trace: c.decision.trace
    })
  }));
  if (c.statement_is_new) {
    for (const [scope, kind, id, text] of [
      ['player_journal', 'player_character', state.actor_id,
        c.journal_text],
      ['npc_memory', 'npc', c.npc_id, c.memory_text]
    ]) {
      appends.push(row('party_actor_npc_interaction_summaries',
        `summary:${interactionId}:${scope}`, {
          summary_id: `summary:${interactionId}:${scope}`,
          interaction_id: interactionId,
          summary_scope: scope,
          remembering_subject_kind: kind,
          remembering_subject_id: id,
          summary_text: text,
          salience: 1,
          source_message_digest: canonicalDigest({
            statement_ref: c.statement_ref,
            text
          }),
          state_version: 1,
          created_change_set_id: changeSetId
        }));
    }
  }
  if (c.route_knowledge_ref) {
    appendKnowledge(inserts, state, partyId, c.route_knowledge_ref,
      [c.statement_ref]);
    appendKnowledge(inserts, state, partyId, c.statement_ref,
      [c.testimonial_evidence_ref]);
  }
  if (c.check_result) {
    appends.push(row('party_check_resolutions',
      `check:${partyId}:trace-phase3:${turnNumber}`, {
        check_resolution_id:
          `check:${partyId}:trace-phase3:${turnNumber}`,
        party_id: partyId,
        check_scope_kind: 'immediate_action',
        check_scope_key: {
          request_id: factual.player_input.request_id,
          option_id: factual.mode_resolution.option_id
        },
        check_policy_ref: {
          entity_kind: 'check_policy',
          entity_id: factual.availability.check_requests[0].check_id,
          authoring_version: '1'
        },
        deterministic_roll_input_digest: canonicalDigest({
          input_digest: inputDigest,
          audit: c.check_result.audit
        }),
        roll_value: c.check_result.roll,
        modifier_snapshot: c.check_result.modifiers,
        target_value: c.check_result.difficulty,
        result_kind: c.check_result.outcome.success ? 'success' : 'failure',
        consequence_policy_ref: {
          entity_kind: 'consequence_policy',
          entity_id: c.consequence_ref,
          authoring_version: '1'
        },
        result_change_set_id: changeSetId,
        canonical_digest: canonicalDigest(c.check_result)
      }));
  }
}

export function appendKnowledge(inserts, state, partyId, factId, evidence) {
  if ((state.knowledge ?? []).some(({ fact_id: id }) => id === factId)) return;
  inserts.push(row('party_character_knowledge',
    `${state.actor_id}:${factId}`, {
      party_id: partyId,
      character_id: state.actor_id,
      fact_id: factId,
      knowledge_state: 'known_from_committed_source',
      evidence
    }));
}
