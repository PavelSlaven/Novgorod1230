import { conversationNpcContext, npcConversationDecisionCapability } from
  './lower-dvina-trace-m2-conversation-participants.js';
import { sameTimeBatchKey } from
  './lower-dvina-trace-m2-conversation-shared.js';

export function workingConversationContext(context, working) {
  const state = {
    ...context.state,
    ...structuredClone(working.world_state ?? {}),
    clock: structuredClone(working.clock)
  };
  const stateActors = new Map((state.npcs ?? []).map(
    (actor) => [actor.instance_id, actor]
  ));
  const actualNpcActors = context.actualNpcActors.map((actor) => {
    const current = stateActors.get(actor.instance_id) ?? {};
    return {
      ...current,
      ...actor,
      machine_state: structuredClone(
        current.machine_state ?? actor.machine_state
      ),
      anchor_id: current.anchor_id ?? actor.anchor_id,
      g5_anchor_id: current.g5_anchor_id ?? actor.g5_anchor_id,
      location_ref: current.location_ref ?? actor.location_ref,
      location_profile_ref:
        current.location_profile_ref ?? actor.location_profile_ref,
      zone_ref: current.zone_ref ?? actor.zone_ref
    };
  });
  return { ...context, state, actualNpcActors,
    batchKey: sameTimeBatchKey(state.party_id, state.clock) };
}

export function revalidatePendingNpcContribution(context, working, plan) {
  return npcConversationDecisionCapability(conversationNpcContext(
    workingConversationContext(context, working), plan.speaker_ref
  ));
}
