import { classifyOrdinaryConversationPlan } from
  './lower-dvina-trace-m2-conversation-plans.js';
import { fail, sameRef } from
  './lower-dvina-trace-m2-conversation-shared.js';
import { playerSafeHeardNpcIntroduction } from
  './lower-dvina-trace-player-safe-npc-details.js';

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
  const resolved = context.resolveNpcConversationContext?.({
    context,
    target_ref: structuredClone(targetRef),
    target_actor: structuredClone(targetActor)
  });
  if (resolved != null) {
    return { ...context, ...resolved, targetRef, targetActor };
  }
  if (sameRef(targetRef, context.targetRef)) {
    return { ...context, targetRef, targetActor };
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

export function npcConversationDecisionCapability(context) {
  const actor = context.targetActor;
  const machine = actor?.machine_state ?? {};
  if (!actor
      || ['unconscious', 'incapacitated', 'dead'].includes(machine.status)
      || ['sleeping', 'unavailable'].includes(machine.runtime_status)
      || machine.speech_capability === 'none') {
    return false;
  }
  const actorLocation = actor.location_ref ?? actor.location_profile_ref;
  const playerLocation = context.state.position?.location_ref;
  const actorAnchor = actor.g5_anchor_id ?? actor.anchor_id;
  const playerAnchor = context.state.position?.g5_anchor_id
    ?? context.state.position?.anchor_id;
  if (actorAnchor != null && playerAnchor != null) {
    return actorAnchor === playerAnchor;
  }
  return actorLocation == null || playerLocation == null
    || actorLocation === playerLocation;
}

export function npcPresentationContext(context, latestContribution) {
  if (context.contracts.neutral_conversation === true
      || context.phase !== 'phase_3'
      || context.targetActor?.ref !== context.contracts.ids?.eremeyRef) {
    return {};
  }
  const name = context.targetActor?.identity_state?.canonical_name;
  const greeted = latestContribution?.speaker_ref?.entity_kind
      === 'player_character'
    && latestContribution.interaction_tags?.includes('greeting')
    && latestContribution.intended_addressee_refs?.some((reference) =>
      sameRef(reference, context.targetRef));
  const heardName = greeted && typeof name === 'string' && name.trim()
    ? playerSafeHeardNpcIntroduction({
        committedNpcs: context.state.npcs,
        conversationStatements: context.state.conversation_contributions
          ?? context.state.conversation_statements,
        receivedMessages: context.state.received_messages,
        playerId: context.state.actor_id,
        npcId: context.targetRef.entity_id
      })
    : null;
  return {
    ...(greeted && typeof name === 'string' && name.trim() && heardName === null
      ? { first_contact_introduction: { canonical_name: name.trim() } } : {}),
    npc_behavior: {
      current_stance: context.evidencePresented ? 'cooperation_enabled' : 'guarded',
      goals: structuredClone(context.contracts.npcPolicy.goals),
      fears: structuredClone(context.contracts.npcPolicy.fears),
      ...(context.evidencePresented ? {} : {
        required_interaction_tag: 'withhold'
      })
    }
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
