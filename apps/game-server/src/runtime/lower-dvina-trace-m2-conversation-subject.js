import { projectNpcConversationSubject } from '@rus/npc-runtime';
import { currentSceneObservationProjection } from
  './lower-dvina-trace-m2-conversation-projections.js';
import { fail, plainRecord, sameRef } from
  './lower-dvina-trace-m2-conversation-shared.js';

const NO_ACTIVITY = Object.freeze({
  activity_ref: null, summary: null, status: 'none',
  can_continue_automatically: false
});

function policyEntries(values, refKey) {
  return (values ?? []).flatMap((value) => (typeof value === 'string'
    && value.length > 0 ? [{ [refKey]: value, summary: value }] : []));
}

export function npcConversationSubject({
  actor,
  npcRef,
  state,
  currentObservations = currentSceneObservationProjection(state),
  character = null
}) {
  if (!plainRecord(actor.identity_state) || !plainRecord(actor.machine_state)) {
    fail(
      'TRACE_M2_NPC_SUBJECTIVE_STATE_GAP',
      'The NPC own identity and subjective machine state are required.'
    );
  }
  return projectNpcConversationSubject({
    npc_ref: npcRef,
    npc_snapshot: character === null ? actor : {
      ...actor,
      goals: policyEntries(character.goals, 'goal_ref'),
      fears: policyEntries(character.fears, 'fear_ref')
    },
    current_activity_snapshot: NO_ACTIVITY,
    relationship_snapshots: character === null ? [] : [{
      actor_ref: state.actor_id, relation: null, status: character.stance
    }],
    resource_snapshots: [...(state.containers ?? []), ...(state.items ?? [])],
    current_observations: currentObservations,
    received_messages: (state.received_messages ?? []).filter(
      ({ listener_ref: listenerRef }) => sameRef(listenerRef, npcRef)
    )
  });
}
