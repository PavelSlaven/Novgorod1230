import { CONVERSATION_PROGRESS_EFFECT_REF } from
  './lower-dvina-trace-m2-conversation-temporal-effect-owner.js';

export function conversationContributionSlots(
  context,
  pendingPlayerExecution,
  pendingNpcExecution
) {
  const inferred = Math.min(
    context.contracts.conversationBindings.max_contributions_per_exchange,
    pendingNpcExecution === null
      ? 1 + (pendingPlayerExecution?.plan ?? context.playerPlan)
        .intended_addressee_refs.length
      : Math.max(1, pendingNpcExecution.remaining_responder_refs.length
        + (pendingNpcExecution.remaining_minutes > 0 ? 1 : 0))
  );
  return context.conversationTimeContract?.contribution_slots ?? inferred;
}

export function conversationTemporalComposition(context, candidates) {
  const parent = context.conversationTimeContract?.parent_temporal ?? null;
  const registeredEffects = structuredClone(parent?.registered_effects ?? []);
  const registeredIds = new Set(registeredEffects.map(
    ({ candidate }) => candidate.boundary_id));
  return {
    source_candidates: candidates.filter(({ boundary_id: id }) =>
      !registeredIds.has(id)),
    registered_effects: registeredEffects,
    continuous_effects: [{
      effect_ref: CONVERSATION_PROGRESS_EFFECT_REF, input: {}
    }, ...structuredClone(parent?.continuous_effects ?? [])]
  };
}

export function conversationTemporalParentProjection(context, working) {
  if (context.conversationTimeContract?.parent_temporal == null) return {};
  return {
    cumulative_elapsed_minutes:
      working.world_state.cumulative_elapsed_minutes,
    active_npc_actor_steps: structuredClone(
      working.world_state.active_npc_actor_steps)
  };
}

export function conversationTemporalWorld(context, conversationState,
  projection) {
  if (context.conversationTimeContract?.parent_temporal == null) {
    return conversationState.world_state;
  }
  return {
    ...structuredClone(conversationState.world_state),
    cumulative_elapsed_minutes: projection.cumulative_elapsed_minutes,
    active_npc_actor_steps: structuredClone(projection.active_npc_actor_steps)
  };
}
