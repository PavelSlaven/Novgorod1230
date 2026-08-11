import { deepFreeze } from '@rus/kernel';

export function recordCombatBlockedStep({ session, step, intent, occurredAt,
  descriptors, events }) {
  if (intent) invalidateIntent(session, intent);
  const event = blockedEvent({ session, intent, step,
    eventKind: 'combat_step_blocked' });
  events.set(step.proposal_id, event);
  descriptors.push(blockedDescriptor(event, step.actor_ref, occurredAt));
}

export function recordCombatInvalidIntent({ session, intent, occurredAt,
  descriptors, events }) {
  invalidateIntent(session, intent);
  const event = blockedEvent({ session, intent,
    eventKind: 'combat_intent_invalidated' });
  events.push(event);
  descriptors.push(blockedDescriptor(event, intent.actor_ref, occurredAt));
}

function invalidateIntent(session, intent) {
  const participant = session.participant_states.find(({ actor_ref: actor }) =>
    refKey(actor) === refKey(intent.actor_ref));
  if (participant?.current_intent?.intent_id === intent.intent_id) {
    participant.current_intent = { ...participant.current_intent,
      status: 'invalidated' };
  }
}

function blockedEvent({ session, intent, step = null, eventKind }) {
  const identity = step?.proposal_id ?? intent.intent_id;
  return deepFreeze({
    event_id: `combat-event:${session.combat_id}:exchange:${
      session.exchange_ordinal + 1}:${eventKind}:${identity}`,
    event_kind: eventKind, combat_id: session.combat_id,
    actor_ref: structuredClone(step?.actor_ref ?? intent.actor_ref),
    source_step_ref: step
      ? { entity_kind: 'combat_technical_step', entity_id: step.proposal_id }
      : { entity_kind: 'combat_intent', entity_id: intent.intent_id },
    intent_status: 'invalidated'
  });
}

function blockedDescriptor(event, subject_ref, occurred_at) {
  return { category: 'objective', significance: 'material',
    source_event_ref: { entity_kind: 'combat_event',
      entity_id: event.event_id }, subject_ref, occurred_at };
}
const refKey = (ref) => `${ref?.entity_kind ?? ''}\0${ref?.entity_id ?? ''}`;
