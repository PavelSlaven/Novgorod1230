import { serverError } from '../../errors.js';

export function backgroundNpcPlanMatchesEnvelope(plan, envelope, state) {
  const identity = plan.causal_identity;
  const matches = (envelope.loop_trace?.step_traces ?? []).filter((trace) => {
    const request = trace?.plan_request;
    const actorRef = request?.actor?.actor_id ?? request?.actor?.actor_ref;
    return request?.request_id === identity.request_id
      && request?.root_turn_id === identity.root_turn_id
      && request?.step_index === identity.step_index
      && actorRef === identity.actor_ref;
  });
  return matches.length === 1
    && identity.root_turn_id === envelope.root_turn_id
    && identity.actor_ref === state.actor_id;
}

export function projectBackgroundNpcRemainder({ visibleContext, remainder }) {
  if (remainder == null) return visibleContext;
  return {
    ...structuredClone(visibleContext),
    visible_npc: (visibleContext.visible_npc ?? []).map((entry) =>
      entry?.entity_ref?.entity_kind === 'npc'
        && entry.entity_ref.entity_id === remainder.npc_ref ? {
          ...structuredClone(entry),
          observable_cues: {
            ...structuredClone(entry.observable_cues ?? {}),
            ordinary_remainder: {
              ordinary_descriptor: remainder.ordinary_descriptor,
              ordinary_activity: remainder.ordinary_activity
            }
          }
        } : structuredClone(entry))
  };
}

export function applyS1LocalPositionTransition({ snapshot, state, transition }) {
  if (transition == null) return;
  if (transition.owner !== '@rus/movement-routes'
      || transition.actor_id !== state.actor_id
      || transition.from_position_ref !== state.position?.position_id
      || typeof transition.to_position_ref !== 'string'
      || !state.journey_location?.id
      || state.journey_location.scene_position_id
        !== transition.from_position_ref
      || !Number.isSafeInteger(Number(state.journey_location.state_version))) {
    throw serverError('TRACE_S1_MOVEMENT_TRANSITION_INVALID',
      'S1 local movement transition failed its committed position binding.',
      { status: 409 });
  }
  snapshot.position = {
    ...snapshot.position, position_id: transition.to_position_ref
  };
}
