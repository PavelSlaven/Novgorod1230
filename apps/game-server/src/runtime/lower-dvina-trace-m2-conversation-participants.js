import { classifyOrdinaryConversationPlan } from
  './lower-dvina-trace-m2-conversation-plans.js';
import { fail, sameRef } from
  './lower-dvina-trace-m2-conversation-shared.js';

export function conversationNpcContext(context, targetRef) {
  const targetActor = context.actualNpcActors.find(
    ({ instance_id: instanceId }) => instanceId === targetRef.entity_id
  );
  if (!targetActor) {
    fail(
      'TRACE_M2_CONVERSATION_RESPONDER_NOT_PRESENT',
      'Every NPC responder must be an actual present participant.'
    );
  }
  if (sameRef(targetRef, context.targetRef)) {
    return { ...context, targetRef };
  }
  return {
    ...context,
    targetRef,
    targetActor,
    npcOperationContract: {},
    npcDecisionScope: {
      action_handoff_available: false,
      combat_handoff_available: false
    },
    npcContributionReferencePolicy: {
      entity_refs: [], knowledge_refs: [], combat_target_refs: []
    },
    npcSocialCheckProfile: null,
    classifyNpcPlan: classifyOrdinaryConversationPlan
  };
}

export function playerDecisionSignalRecords({
  context, audience, statement, evidencePerceptionRef, buildRecords
}) {
  return statement.intended_addressee_refs
    .filter(({ entity_kind: entityKind }) => entityKind === 'npc')
    .flatMap((targetRef) => {
      const targetMessage = audience.received_messages.find(
        ({ listener_ref: listenerRef }) => sameRef(listenerRef, targetRef)
      );
      return buildRecords(
        conversationNpcContext(context, targetRef),
        statement,
        targetMessage?.perception_result_ref ?? null,
        sameRef(targetRef, context.targetRef) ? evidencePerceptionRef : null
      );
    });
}

export function conversationPlayerStatement(context, working) {
  const statement = working.statements.find(({ speaker_ref: speaker }) =>
    speaker?.entity_kind === 'player_character')
    ?? (context.state.conversation_statements ?? []).find(
      ({ conversation_id: conversationId, exchange_id: exchangeId,
        speaker_ref: speaker }) => conversationId === context.conversationId
        && exchangeId === context.exchangeId
        && speaker?.entity_kind === 'player_character');
  if (statement == null) {
    fail('TRACE_M2_CONVERSATION_PLAYER_STATEMENT_MISSING',
      'NPC responders require the exact persisted player statement.');
  }
  return statement;
}
