import { applyPlayerPlan } from
  './lower-dvina-trace-m2-conversation-statements.js';
import { workingConversationContext } from
  './lower-dvina-trace-m2-conversation-working-state.js';

export function applyPersistedPlayerPlan(context, working, plan) {
  return applyPlayerPlan({
    ...workingConversationContext(context, working),
    playerInput: {
      raw_text: plan.speech?.utterance_text ?? context.playerInput.raw_text
    }
  }, working, plan);
}
