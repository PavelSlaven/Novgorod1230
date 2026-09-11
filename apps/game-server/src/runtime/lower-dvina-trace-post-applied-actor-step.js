export function createLowerDvinaTracePostAppliedActorStepOwner({
  committedState
} = {}) {
  return async ({ step_index: stepIndex, working_projection: projection,
    factual_events: events }) => {
    if (events.length === 0) return empty(projection);
    const perceivers = nearbyNpcRefs(committedState, events);
    if (perceivers.length > 0) {
      const error = new Error(
        'Pinned Lower-Dvina perception snapshots are required for nearby NPCs.');
      error.code = 'TRACE_POST_ACTION_PERCEPTION_PROFILE_GAP';
      error.details = { perceiver_refs: perceivers,
        event_refs: events.map(({ event_ref: ref }) => ref) };
      throw error;
    }
    const closedAt = projection?.clock_weather_light?.clock
      ?? projection?.clock;
    const windows = events.map(({ event_ref, occurred_at }) => ({
      event_ref: structuredClone(event_ref),
      opened_at: structuredClone(occurred_at),
      closed_at: structuredClone(closedAt ?? occurred_at),
      status: 'completed',
      perceived_actor_refs: [],
      observable_response_event_refs: []
    }));
    return Object.freeze({
      working_projection: structuredClone(projection),
      write_fragments: [],
      consequence_fragment: {
        duration_minutes: 0,
        visible_seed: Object.fromEntries(windows.map((window, index) => [
          `turn_step_post_applied_world_response_${stepIndex}_${index + 1}`,
          {
            kind: 'post_applied_perception_window',
            event_ref: structuredClone(window.event_ref),
            status: window.status,
            observable_response_event_refs:
              structuredClone(window.observable_response_event_refs)
          }
        ])),
        hidden_update: {},
        state_changes: windows.map((window) => ({
          kind: 'post_applied_perception_window', ...window
        })),
        suggested_actions: []
      }
    });
  };
}

function nearbyNpcRefs(state, events) {
  const scopes = new Set(events.map(({ source_scope_ref: ref }) => ref.entity_id));
  const anchor = state?.position?.g5_anchor_id;
  return (state?.npcs ?? []).filter((npc) => {
    const scope = npc.position_ref ?? npc.location_ref;
    return (typeof scope === 'string' && scopes.has(scope))
      || (typeof anchor === 'string' && npc.anchor_id === anchor);
  }).map((npc) => ({ entity_kind: 'npc',
    entity_id: npc.instance_id ?? npc.npc_id })).filter(({ entity_id }) =>
    typeof entity_id === 'string' && entity_id.length > 0);
}

function empty(projection) {
  return Object.freeze({ working_projection: structuredClone(projection),
    write_fragments: [], consequence_fragment: null });
}
