import { validateCombatExchangeProposal } from '@rus/contracts/combat-v1';

export function validTracePreparedCombatConsequence(consequence,
  { playerResponseBoundary = null } = {}) {
  const combat = consequence?.combat;
  const before = combat?.session_before;
  const after = combat?.session_after;
  const paused = after?.status === 'paused_for_player'
    && after.player_response_required === true;
  const ended = after?.status === 'ended'
    && after.player_response_required === false;
  if (consequence?.combat_kind !== 'exchange' || (!paused && !ended)
      || before?.combat_id !== after?.combat_id
      || (playerResponseBoundary !== null
        && playerResponseBoundary !== paused)) return false;
  const outcomeEvents = combat.outcome_events ?? [];
  const allEventIds = new Set(outcomeEvents.map(({ event_id }) => event_id));
  if (allEventIds.size !== outcomeEvents.length
      || outcomeEvents.some(({ event_id }) =>
        typeof event_id !== 'string' || event_id.length === 0)) return false;
  if (combat.exchange != null) {
    const terminalEvents = outcomeEvents.filter(
      ({ event_kind: kind }) => kind === 'combat_ended');
    const terminalValid = ended
      ? terminalEvents.length === 1
        && terminalEvents[0].combat_id === after.combat_id
        && terminalEvents[0].source_step_ref?.entity_kind === 'combat_exchange'
        && terminalEvents[0].source_step_ref.entity_id
          === combat.exchange.proposal_id
      : terminalEvents.length === 0;
    return validateCombatExchangeProposal(combat.exchange)
      && combat.exchange.combat_id === after.combat_id
      && combat.exchange.exchange_ordinal === before.exchange_ordinal
      && Number.isSafeInteger(consequence.duration_minutes)
      && consequence.duration_minutes > 0
      && after.exchange_ordinal === before.exchange_ordinal + 1
      && terminalValid;
  }
  if (consequence.duration_minutes !== 0
      || after.exchange_ordinal !== before.exchange_ordinal) return false;
  const blockedEvents = outcomeEvents.filter(({ event_kind }) =>
    ['combat_step_blocked', 'combat_intent_invalidated'].includes(event_kind));
  const eventIds = new Set(blockedEvents.map(({ event_id }) => event_id));
  const descriptors = combat.blocked_descriptors ?? [];
  const descriptorIds = new Set(descriptors.map(
    ({ source_event_ref: source }) => source?.entity_id));
  const allowedEventKinds = new Set([
    'combat_step_blocked', 'combat_intent_invalidated', 'combat_ended'
  ]);
  const endedEvents = outcomeEvents.filter(
    ({ event_kind: kind }) => kind === 'combat_ended');
  const terminalCauseValid = !ended || (endedEvents[0]?.combat_id === after.combat_id
    && endedEvents[0].source_step_ref?.entity_kind === 'combat_event'
    && eventIds.has(endedEvents[0].source_step_ref.entity_id));
  return outcomeEvents.every(({ event_kind: kind }) =>
    allowedEventKinds.has(kind))
    && endedEvents.length === (ended ? 1 : 0) && terminalCauseValid
    && blockedEvents.length > 0 && descriptors.length === eventIds.size
    && eventIds.size === blockedEvents.length
    && descriptorIds.size === descriptors.length
    && descriptorIds.size === eventIds.size
    && blockedEvents.every((event) => event.combat_id === after.combat_id
      && event.intent_status === 'invalidated'
      && ['combat_technical_step', 'combat_intent']
        .includes(event.source_step_ref?.entity_kind))
    && descriptors.every(({ source_event_ref: source }) =>
      source?.entity_kind === 'combat_event' && eventIds.has(source.entity_id));
}
