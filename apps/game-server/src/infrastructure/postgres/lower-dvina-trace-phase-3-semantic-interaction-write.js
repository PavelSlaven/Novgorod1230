import { canonicalDigest } from '@rus/materialization';
import { row } from './first-playable/plan-shared.js';

export function appendPhase3SemanticInteraction({
  appends,
  state,
  factual,
  semanticExchange,
  partyId,
  turnNumber,
  changeSetId
}) {
  if (semanticExchange.exchange.applied_contribution_count < 1) return;
  const interactionId =
    `interaction:${partyId}:trace-phase3:${turnNumber}`;
  const activityId = `activity:${partyId}:trace-phase3:${turnNumber}`;
  const npcRef = semanticExchange.decision_request?.npc_ref ?? {
    entity_kind: 'npc',
    entity_id: factual.consequence.conversation.npc_id
  };
  const npcContributionApplied = semanticExchange.exchange.contributions.some(
    ({ speaker_ref: speaker }) => speaker?.entity_kind === npcRef.entity_kind
      && speaker.entity_id === npcRef.entity_id
  );
  if (!npcContributionApplied) return;
  const finalOutcome = (semanticExchange.npc_outcomes ?? []).filter(
    ({ npc_ref: outcomeNpcRef, applied }) => applied
      && outcomeNpcRef.entity_kind === npcRef.entity_kind
      && outcomeNpcRef.entity_id === npcRef.entity_id).at(-1) ?? null;
  const contributionRef = finalOutcome?.contribution_ref?.entity_id ?? null;
  const npcStatement = semanticExchange.statements.find(
    ({ statement_id: statementId }) =>
      finalOutcome?.contribution_ref?.entity_kind === 'conversation_statement'
        && statementId === finalOutcome.contribution_ref.entity_id
  ) ?? null;
  if (typeof contributionRef !== 'string' || contributionRef.length === 0) {
    return;
  }
  const evidencePresentation = semanticExchange.evidence_presentation ?? null;
  const terminalEvidence = {
    activity_execution_id: activityId,
    attempt_ordinal: 0,
    statement_ref: npcStatement?.statement_id ?? null,
    contribution_ref: contributionRef,
    supporting_operation_event_ref:
      evidencePresentation?.event_id ?? null
  };
  appends.push(row('party_actor_npc_interactions', interactionId, {
    interaction_id: interactionId,
    party_id: partyId,
    actor_id: state.actor_id,
    npc_id: npcRef.entity_id,
    interaction_kind: 'conversation',
    activity_execution_id: activityId,
    started_at: factual.time_update.clock_before,
    ended_at: factual.time_update.clock_after,
    location_ref: structuredClone(state.position),
    outcome: 'completed',
    terminal_change_set_id: changeSetId,
    terminal_evidence_kind: 'terminal_attempt',
    terminal_evidence_ref: terminalEvidence,
    interaction_policy_ref: {
      entity_kind: 'conversation_contract',
      entity_id: 'npc_conversation_mode_v1',
      response_kind: semanticExchange.response_kind
    },
    canonical_digest: canonicalDigest({
      interaction_id: interactionId,
      terminal_evidence_ref: terminalEvidence,
      response_kind: semanticExchange.response_kind
    })
  }));
}
