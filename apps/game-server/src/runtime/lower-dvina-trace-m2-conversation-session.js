import { compareRefs, ref, refKey } from
  './lower-dvina-trace-m2-conversation-shared.js';

export function initialConversationParticipantRefs(context) {
  return canonicalRefs(context.activeSession?.active_participant_refs ?? [
    ref('player_character', context.state.actor_id)
  ]);
}

export function addContributionParticipants(
  working,
  contribution,
  audience = null
) {
  const intendedKeys = new Set(
    contribution.intended_addressee_refs?.map(refKey) ?? []
  );
  const perceivedIntendedRefs = audience?.actual_listener_refs?.filter(
    (listenerRef) => intendedKeys.has(refKey(listenerRef))
  ) ?? [];
  return withParticipants(working, [
    contribution.speaker_ref,
    ...perceivedIntendedRefs
  ]);
}

export function removeConversationParticipant(working, participantRef) {
  return {
    ...working,
    active_participant_refs: canonicalRefs(
      working.active_participant_refs.filter(
        (reference) => refKey(reference) !== refKey(participantRef)
      )
    )
  };
}

export function retireTerminalConversationParticipants(working, outcomes) {
  return outcomes.reduce(
    (next, { npc_ref: npcRef }) => removeConversationParticipant(next, npcRef),
    working
  );
}

export function npcConversationSessionStatus(working) {
  return working.active_participant_refs.some(
    ({ entity_kind: entityKind }) => entityKind === 'npc'
  ) ? 'active' : 'ended';
}

function withParticipants(working, participants) {
  return {
    ...working,
    active_participant_refs: canonicalRefs([
      ...working.active_participant_refs,
      ...participants
    ])
  };
}

function canonicalRefs(values) {
  return [...new Map(values.map((reference) => [
    refKey(reference), structuredClone(reference)
  ])).values()].sort(compareRefs);
}
