import { row } from './first-playable/plan-shared.js';
import { canonicalDigest } from '@rus/materialization';
import { appendNpcSemanticConversationWrites, buildNpcSemanticConversationWriteInput } from './npc-semantic-conversation-writes.js';

export function appendConversation({ inserts, updates, appends, partyId, state, next, factual, changeSetId, idemId }) {
  const semantic = factual.consequence.phase9.semantic_exchange;
  if (semantic.exchange.applied_contribution_count === 0 && semantic.exchange.stop_reason !== 'npc_unavailable') return;
  const input = buildNpcSemanticConversationWriteInput({
    state,
    next,
    semanticExchange: semantic,
  });
  appendNpcSemanticConversationWrites({
    inserts,
    updates,
    appends,
    partyId,
    changeSetId,
    idempotencyRecordId: idemId,
    rootTurnId: factual.mode_resolution.turn_id,
    workingRevision: factual.mode_resolution.decision_trace?.working_revision ?? 1,
    sessionWrite: input.sessionWrite,
    semanticExchange: input.semanticExchange,
    signalRecords: input.signalRecords,
    actualMessageEvidence: input.actualMessageEvidence,
    persistedMessageStatements: input.persistedMessageStatements,
    persistedMessageAudiences: input.persistedMessageAudiences,
    supportingOperationEvidence: input.supportingOperationEvidence,
    partyStateVersion: input.partyStateVersion,
    sameTimeBatchRef: input.sameTimeBatchRef,
    contributions: input.contributions,
  });
}

export function appendBody(updates, appends, { partyId, state, next, changeSetId, idemId, turnNumber }) {
  if (canonicalDigest(state.body_state) === canonicalDigest(next.body_state)) {
    return;
  }
  updates.push(
    row('party_actor_body_states', state.actor_id, {
      party_id: partyId,
      actor_kind: 'player_character',
      actor_id: state.actor_id,
      body_state: next.body_state,
      updated_change_set_id: changeSetId,
    }),
  );
  appends.push(
    row('party_actor_body_state_history', `body-history:${partyId}:trace-phase9:${turnNumber}`, {
      party_id: partyId,
      actor_kind: 'player_character',
      actor_id: state.actor_id,
      state_before: state.body_state,
      state_after: next.body_state,
      source_kind: 'activity_effect',
      change_set_id: changeSetId,
      idempotency_record_id: idemId,
    }),
  );
}
export function appendKnowledge({ inserts, partyId, state, next, changeSetId }) {
  const prior = new Set((state.knowledge ?? []).map(({ fact_id: id }) => id));
  for (const fact of (next.knowledge ?? []).filter(({ fact_id: id }) => !prior.has(id)))
    inserts.push(
      row('party_character_knowledge', `${state.actor_id}:${fact.fact_id}`, {
        party_id: partyId,
        character_id: state.actor_id,
        fact_id: fact.fact_id,
        knowledge_state: fact.knowledge_state,
        evidence: fact.evidence_refs ?? [changeSetId],
      }),
    );
}
