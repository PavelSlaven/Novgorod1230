import { canonicalDigest } from '@rus/materialization';
import { row } from './first-playable/plan-shared.js';

export function appendHostileSemantics({
  inserts,
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
  if (negotiation.threat) {
    appendThreatStatement({
      appends,
      state,
      factual,
      partyId,
      turnNumber,
      changeSetId,
      contracts,
      activityId
    });
    return;
  }
  if (canonicalDigest(negotiation.attack_facts) !== canonicalDigest([
    'ratsha_attack_attempt_committed',
    'ratsha_attack_player_response_required'
  ]) || negotiation.player_response_boundary?.status
      !== 'player_response_required') {
    throw new Error('TRACE_PHASE_4_HOSTILE_EFFECT_INVALID');
  }
  for (const factId of negotiation.attack_facts) {
    insertPlayerKnowledge(inserts, state, partyId, {
      fact_id: factId,
      evidence: [negotiation.npc_decision.trace.request_id]
    });
  }
  const transitionId =
    `npc-transition:${partyId}:trace-phase4:${turnNumber}:attack-boundary`;
  appends.push(row('party_npc_runtime_transitions', transitionId, {
    transition_id: transitionId,
    party_id: partyId,
    npc_id: contracts.actors.ratsha_storehouse_helper.instance_id,
    transition_kind: 'attack_attempt_player_response_required',
    event_id: null,
    change_set_id: changeSetId,
    idempotency_record_id: idemId,
    occurred_at_whole_minutes: next.clock.whole_minutes,
    occurred_at_subminute_numerator: next.clock.subminute_numerator,
    occurred_at_subminute_denominator: next.clock.subminute_denominator,
    trace: {
      execution_binding_id:
        negotiation.npc_decision.execution.execution_binding_id,
      committed_fact_ids: structuredClone(negotiation.attack_facts),
      automatic_harm: false,
      automatic_escape: false
    }
  }));
}

function appendThreatStatement({
  appends,
  state,
  factual,
  partyId,
  turnNumber,
  changeSetId,
  contracts,
  activityId
}) {
  const threat = factual.consequence.negotiation.threat;
  const interactionId =
    `interaction:${partyId}:trace-phase4:${turnNumber}:threat`;
  const audienceIds = [state.actor_id, ...threat.required_audience_ids];
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
      statement_template_ref: null,
      source_rule: threat.source_rule,
      audience_rule: threat.audience_rule,
      audience_ids: audienceIds,
      immediate_threat: true,
      truth_projection: 'forbidden'
    },
    interaction_policy_ref: {
      entity_kind: 'statement_effect_contract',
      entity_id: threat.effect_contract_ref
    },
    canonical_digest: canonicalDigest({
      source_rule: threat.source_rule,
      audience_rule: threat.audience_rule,
      audience_ids: audienceIds,
      decision_trace:
        factual.consequence.negotiation.npc_decision.trace
    })
  }));
}

function insertPlayerKnowledge(inserts, state, partyId, { fact_id, evidence }) {
  if ((state.knowledge ?? []).some(({ fact_id: id }) => id === fact_id)) return;
  inserts.push(row('party_character_knowledge',
    `${state.actor_id}:${fact_id}`, {
      party_id: partyId,
      character_id: state.actor_id,
      fact_id,
      knowledge_state: 'known_from_committed_source',
      evidence
    }));
}
