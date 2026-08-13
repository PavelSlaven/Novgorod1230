import { canonicalDigest } from '@rus/materialization';
import { row } from './first-playable/plan-shared.js';
import { ref, same, semanticFail } from './lower-dvina-trace-phase-4-semantic-write-shared.js';

export function appendSurrenderSemantics({
  inserts,
  updates,
  appends,
  state,
  next,
  factual,
  partyId,
  turnNumber,
  changeSetId,
  idemId,
  contracts,
  activityId
}) {
  const negotiation = factual.consequence.negotiation;
  const ratsha = next.npcs.find(
    ({ participant_slot_ref: ref }) => ref === 'ratsha_storehouse_helper'
  );
  if (ratsha?.machine_state?.surrender_state
      !== 'surrendered_without_further_harm'
      || ratsha.semantic_state?.surrender_fact
        !== 'ratsha_surrender_without_further_harm_committed') {
    throw new Error('TRACE_PHASE_4_RATSHA_SURRENDER_STATE_INVALID');
  }
  updates.push(row('party_npcs', ratsha.instance_id, {
    party_id: partyId,
    npc_id: ratsha.instance_id,
    machine_state: ratsha.machine_state,
    semantic_state: ratsha.semantic_state
  }));
  appends.push(row(
    'party_npc_runtime_transitions',
    `npc-transition:${partyId}:trace-phase4:${turnNumber}:surrender`,
    {
      transition_id:
        `npc-transition:${partyId}:trace-phase4:${turnNumber}:surrender`,
      party_id: partyId,
      npc_id: ratsha.instance_id,
      transition_kind: 'surrendered_without_further_harm',
      event_id: null,
      change_set_id: changeSetId,
      idempotency_record_id: idemId,
      occurred_at_whole_minutes: next.clock.whole_minutes,
      occurred_at_subminute_numerator: next.clock.subminute_numerator,
      occurred_at_subminute_denominator: next.clock.subminute_denominator,
      trace: {
        decision_request_id: negotiation.npc_decision.trace.request_id,
        fact_id: 'ratsha_surrender_without_further_harm_committed'
      }
    }
  ));
  insertKnowledge(inserts, state, partyId, {
    fact_id: 'promise_activation_basis_committed',
    evidence: [negotiation.npc_decision.trace.request_id]
  });
  if (negotiation.confession) {
    appendConfession({
      appends,
      state,
      factual,
      partyId,
      turnNumber,
      changeSetId,
      contracts,
      activityId,
      confession: negotiation.confession,
      decisionTrace: negotiation.npc_decision.trace
    });
  }
}

export function appendConfession({
  appends,
  state,
  factual,
  partyId,
  turnNumber,
  changeSetId,
  contracts,
  activityId,
  confession,
  decisionTrace
}) {
  const interactionId =
    `interaction:${partyId}:trace-phase4:${turnNumber}:confession`;
  const audienceIds = [
    state.actor_id,
    ...confession.required_audience_ids
  ];
  appends.push(row('party_actor_npc_interactions', interactionId, {
    interaction_id: interactionId,
    party_id: partyId,
    actor_id: state.actor_id,
    npc_id: contracts.actors.ratsha_storehouse_helper.instance_id,
    interaction_kind: 'conversation',
    activity_execution_id: activityId,
    started_at: factual.time_update.clock_before,
    ended_at: factual.time_update.clock_after,
    location_ref: structuredClone(state.position),
    outcome: 'completed',
    terminal_change_set_id: changeSetId,
    terminal_evidence_kind: 'terminal_attempt',
    terminal_evidence_ref: {
      statement_ref: confession.statement_ref,
      assertion: confession.assertion,
      audience_ids: audienceIds,
      truth_projection: 'forbidden',
      requires_independent_confirmation:
        confession.requires_independent_confirmation
    },
    interaction_policy_ref: {
      entity_kind: 'statement_effect_contract',
      entity_id: confession.effect_contract_ref
    },
    canonical_digest: canonicalDigest({
      statement_ref: confession.statement_ref,
      assertion: confession.assertion,
      audience_ids: audienceIds,
      decision_trace: decisionTrace
    })
  }));
  for (const [scope, kind, id] of [
    ['npc_memory', 'npc',
      contracts.actors.ratsha_storehouse_helper.instance_id],
    ['player_journal', 'player_character', state.actor_id]
  ]) {
    appends.push(row(
      'party_actor_npc_interaction_summaries',
      `summary:${interactionId}:${scope}`,
      {
        summary_id: `summary:${interactionId}:${scope}`,
        interaction_id: interactionId,
        summary_scope: scope,
        remembering_subject_kind: kind,
        remembering_subject_id: id,
        summary_text: confession.content_scope,
        salience: 1,
        source_message_digest: canonicalDigest({
          statement_ref: confession.statement_ref,
          assertion: confession.assertion
        }),
        state_version: 1,
        created_change_set_id: changeSetId
      }
    ));
  }
}

export function appendSemanticConfession({ inserts, appends, state, factual,
  partyId, turnNumber, changeSetId, contracts, activityId, semantic }) {
  if (semantic.confession === null) return;
  appendConfession({ appends, state, factual, partyId, turnNumber,
    changeSetId, contracts, activityId, confession: semantic.confession,
    decisionTrace: {
      request_id: semantic.decision_request?.request_id
        ?? semantic.resumed_npc_execution?.decision_trace_ref?.entity_id,
      source_statement_ref: semantic.confession.source_statement_ref
    } });
  insertKnowledge(inserts, state, partyId, {
    fact_id: 'trace_ld_v1_evidence_ratsha_confession',
    evidence: [semantic.confession.source_statement_ref.entity_id]
  });
}

function insertKnowledge(inserts, state, partyId, { fact_id, evidence }) {
  if ((state.knowledge ?? []).some(({ fact_id: id }) => id === fact_id)) {
    return;
  }
  inserts.push(row('party_character_knowledge',
    `${state.actor_id}:${fact_id}`, {
      party_id: partyId,
      character_id: state.actor_id,
      fact_id,
      knowledge_state: 'known_from_committed_source',
      evidence
    }));
}
