import {
  PROMISE_OPERATION,
  ref,
  sameRef
} from './lower-dvina-trace-m2-conversation-shared.js';

export function fullyPerceivedCurrentOffer(context, perceivedMessage) {
  if (context.phase !== 'phase_4'
      || context.offerStage == null
      || perceivedMessage?.comprehension !== 'full'
      || !sameRef(
        perceivedMessage.speaker_ref,
        ref('player_character', context.state.actor_id)
      )
      || perceivedMessage.source_statement_ref?.entity_id
        !== `statement:${context.inputDigest}:1`) {
    return false;
  }
  return context.playerPlan?.supporting_operations?.some(
    ({ op } = {}) => op === PROMISE_OPERATION
  ) === true;
}
