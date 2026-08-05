import { refKey, uniqueRefs } from
  './lower-dvina-trace-conversation-state-validation.js';

export function projectActiveConversationParticipantRefs({
  existing,
  contributions,
  audiences,
  terminalOutcomes
}) {
  const participants = new Map(
    (existing?.active_participant_refs ?? []).map((reference) => [
      refKey(reference), structuredClone(reference)
    ])
  );
  const audiencesByStatement = new Map(audiences.map((audience) => [
    audience.statement_ref.entity_id, audience
  ]));
  for (const contribution of contributions) {
    const speakerKey = refKey(contribution.speaker_ref);
    if (contribution.schema === 'conversation_non_statement_contribution_v1'
        && contribution.contribution_kind === 'leave_conversation'
        && contribution.speaker_ref.entity_kind === 'npc') {
      participants.delete(speakerKey);
      continue;
    }
    participants.set(speakerKey, structuredClone(contribution.speaker_ref));
    if (contribution.schema !== 'conversation_statement_event_v1') continue;
    const intendedKeys = new Set(
      contribution.intended_addressee_refs.map(refKey)
    );
    for (const listenerRef of audiencesByStatement.get(
      contribution.statement_id)?.actual_listener_refs ?? []) {
      if (intendedKeys.has(refKey(listenerRef))) {
        participants.set(refKey(listenerRef), structuredClone(listenerRef));
      }
    }
  }
  for (const { npc_ref: npcRef } of terminalOutcomes) {
    participants.delete(refKey(npcRef));
  }
  return uniqueRefs([...participants.values()]);
}
