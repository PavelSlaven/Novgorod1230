import { canonicalDigest } from '@rus/materialization';
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';

export function assertPhase4StatementRows({
  partyId,
  payload,
  negotiationHistory,
  interactions,
  summaries
}) {
  const confessions = negotiationHistory.filter(
    ({ consequence: c }) => c.negotiation.confession != null
  );
  const threats = negotiationHistory.filter(
    ({ consequence: c }) => c.negotiation.threat != null
  );
  if (interactions.length !== confessions.length + threats.length
      || summaries.length !== confessions.length * 2) fail();
  for (const entry of confessions) {
    const confession = entry.consequence.negotiation.confession;
    const interactionId =
      `interaction:${partyId}:trace-phase4:${entry.turn_number}:confession`;
    const interaction = interactions.find(
      ({ interaction_id: id }) => id === interactionId
    );
    const audience = interaction?.terminal_evidence_ref?.audience_ids;
    if (interaction?.terminal_evidence_ref?.statement_ref
        !== confession.statement_ref
        || interaction.terminal_evidence_ref?.assertion?.assertion_id
          !== confession.assertion.assertion_id
        || interaction.terminal_evidence_ref?.truth_projection !== 'forbidden'
        || canonicalDigest(audience) !== canonicalDigest([
          payload.actor_id,
          ...confession.required_audience_ids
        ])
        || summaries.filter(
          ({ interaction_id: id }) => id === interactionId
        ).some(({ summary_text: text }) => text !== confession.content_scope)) {
      fail();
    }
  }
  for (const entry of threats) {
    const threat = entry.consequence.negotiation.threat;
    const interactionId =
      `interaction:${partyId}:trace-phase4:${entry.turn_number}:threat`;
    const interaction = interactions.find(
      ({ interaction_id: id }) => id === interactionId
    );
    const evidence = interaction?.terminal_evidence_ref;
    if (evidence?.statement_template_ref !== null
        || evidence?.source_rule !== threat.source_rule
        || evidence?.audience_rule !== threat.audience_rule
        || evidence?.immediate_threat !== true
        || evidence?.truth_projection !== 'forbidden'
        || canonicalDigest(evidence?.audience_ids)
          !== canonicalDigest([
            payload.actor_id,
            ...threat.required_audience_ids
          ])) {
      fail();
    }
  }
}

export function assertPhase4AttackRows({
  partyId,
  payload,
  negotiationHistory,
  npcTransitions,
  knowledge,
  activities
}) {
  const attacks = negotiationHistory.filter(
    ({ consequence: c }) => c.negotiation.attack_facts?.length > 0
  );
  const actualTransitions = npcTransitions.filter(
    ({ transition_kind: kind }) =>
      kind === 'attack_attempt_player_response_required'
  );
  if (actualTransitions.length !== attacks.length) fail();
  for (const entry of attacks) {
    const facts = entry.consequence.negotiation.attack_facts;
    const transitionId =
      `npc-transition:${partyId}:trace-phase4:${entry.turn_number}:attack-boundary`;
    const transition = actualTransitions.find(
      ({ transition_id: id }) => id === transitionId
    );
    const responseActivityId =
      `activity:${partyId}:trace-phase4:${entry.turn_number}:response`;
    const response = activities.find(({ id }) => id === responseActivityId);
    if (!transition
        || canonicalDigest(transition.trace?.committed_fact_ids)
          !== canonicalDigest(facts)
        || transition.trace?.automatic_harm !== false
        || transition.trace?.automatic_escape !== false
        || response?.status !== 'completed'
        || response?.actual_time_numerator !== '2'
        || response?.result_kind !== 'completed'
        || !facts.every((factId) =>
          knowledge.some(({ fact_id: id }) => id === factId))
        || payload.player_response_boundary?.status
          !== 'player_response_required') {
      fail();
    }
  }
}

function fail() { throw phase2IntegrityError(); }
