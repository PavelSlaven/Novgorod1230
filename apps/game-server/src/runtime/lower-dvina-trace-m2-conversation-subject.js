import { projectNpcConversationSubject } from '@rus/npc-runtime';
import { currentSceneObservationProjection } from
  './lower-dvina-trace-m2-conversation-projections.js';
import { fail, plainRecord, sameRef } from
  './lower-dvina-trace-m2-conversation-shared.js';

const NO_ACTIVITY = Object.freeze({
  activity_ref: null, summary: null, status: 'none',
  can_continue_automatically: false
});

export function npcConversationSubject({
  actor,
  npcRef,
  state,
  currentObservations = currentSceneObservationProjection(state)
}) {
  if (!plainRecord(actor.identity_state) || !plainRecord(actor.machine_state)) {
    fail(
      'TRACE_M2_NPC_SUBJECTIVE_STATE_GAP',
      'The NPC own identity and subjective machine state are required.'
    );
  }
  // Fail closed on a missing scope although its content is deliberately kept out of the request.
  if (!plainRecord(actor.knowledge_profile_snapshot)) {
    fail(
      'TRACE_M2_NPC_KNOWLEDGE_GAP',
      'The NPC own knowledge profile snapshot is required.'
    );
  }
  return projectNpcConversationSubject({
    npc_ref: npcRef,
    npc_snapshot: actor,
    current_activity_snapshot: NO_ACTIVITY,
    relationship_snapshots: actor.relationships ?? [],
    resource_snapshots: [...(state.containers ?? []), ...(state.items ?? [])],
    current_observations: currentObservations,
    received_messages: (state.received_messages ?? []).filter(
      ({ listener_ref: listenerRef }) => sameRef(listenerRef, npcRef)
    )
  });
}
