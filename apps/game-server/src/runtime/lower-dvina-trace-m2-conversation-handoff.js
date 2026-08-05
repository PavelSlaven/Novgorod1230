export function conversationHandoffProjection(semanticExchange) {
  return {
    handoff: structuredClone(semanticExchange.handoff),
    actor_step_handoff: structuredClone(semanticExchange.action_handoff),
    combat_handoff: structuredClone(semanticExchange.combat_handoff)
  };
}
