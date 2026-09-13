import { deterministicRef, plain, text } from
  './lower-dvina-trace-turn-step-runtime-common.js';

export function semanticFactualEvents(execution, identity, state, resolved) {
  const utterance = execution.plan?.direct_result_kind === 'player_utterance'
    ? execution.plan.utterance : null;
  const delivery = utterance?.delivery;
  const sourceScope = state.committedState?.position?.position_id
    ?? state.committedState?.position?.g5_anchor_id
    ?? execution.working_projection?.spatial_semantic?.position_ref
    ?? state.committedState?.position?.location_ref;
  const occurredAt = execution.prepared_chain_context?.current_clock
    ?? state.committedState?.clock_weather_light?.clock
    ?? state.committedState?.clock;
  if (!plain(delivery) || !text(sourceScope) || !plain(occurredAt)) return [];
  return [{ version: 1, schema: 'turn_step_factual_event_v1',
    event_ref: { entity_kind: 'sound_event',
      entity_id: deterministicRef('sound-event', identity.activity_id) },
    source_activity_ref: { entity_kind: 'semantic_activity',
      entity_id: identity.activity_id },
    occurred_at: structuredClone(occurredAt),
    source_ref: { entity_kind: 'player_character',
      entity_id: utterance.speaker_ref },
    source_scope_ref: { entity_kind: 'canonical_spatial_node',
      entity_id: sourceScope },
    rule_ref: { entity_kind: 'activity_profile', entity_id: resolved.profile_ref,
      authoring_version: String(resolved.profile_pin.revision) },
    policy_ref: { entity_kind: 'turn_step_owner_profile_set',
      entity_id: resolved.profile_pin.artifact_id,
      authoring_version: String(resolved.profile_pin.revision) },
    profile_pin: structuredClone(resolved.profile_pin),
    perceptible_signal: { channel: 'acoustic',
      emission_strength: delivery.loudness,
      duration_class: delivery.duration_class } }];
}
