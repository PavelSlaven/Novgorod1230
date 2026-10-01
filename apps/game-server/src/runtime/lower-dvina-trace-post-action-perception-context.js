import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';

export function perceptionContext({ state, npc, source, profile,
  environmentPort, eventTime }) {
  const environment = environmentPort?.({
    committed_environment: structuredClone(state.environment_snapshot),
    event_time: structuredClone(eventTime)
  }) ?? null;
  if (!validEnvironmentSnapshot(environment)) {
    gap('TRACE_POST_ACTION_ENVIRONMENT_STATE_GAP');
  }
  return buildPerceptionContext({ state, npc, source, profile, environment,
    transientModifierDependencyPins:
      environment.transient_modifier_dependency_pins,
    visibilityModifiers: environment.visibility_modifiers });
}

export function buildPerceptionContext({ state, npc, source, profile,
  environment, transientModifierDependencyPins, visibilityModifiers }) {
  const runtimeStatus = npc.machine_state?.runtime_status;
  const sleeping = profile.runtime_attention.sleeping_statuses
    .includes(runtimeStatus);
  if (!sleeping && !profile.runtime_attention.awake_statuses
    .includes(runtimeStatus)) gap('TRACE_POST_ACTION_PERCEPTION_CONTEXT_GAP');
  if (!text(source.g6_instance_id)
      || !Number.isSafeInteger(source.position_state_version)
      || !Number.isSafeInteger(source.acoustic_state_version)
      || ![0, 1, 2].includes(source.ambient_noise)
      || !source.attention_state_ref || !source.knowledge_state_ref) {
    gap('TRACE_POST_ACTION_PERCEPTION_CONTEXT_GAP');
  }
  const policy = profile.perception_policy;
  const pins = seal({ pins: [
    authoringPin('profile', policy.recognition_policy_ref),
    authoringPin('condition', policy.visibility_policy_ref),
    authoringPin('condition', policy.acoustic_policy_ref),
    authoringPin('source_dependency', policy.provenance_ref)
  ] });
  const transientPins = transientModifierDependencyPins ?? pins;
  const modifiers = visibilityModifiers ?? [];
  const scope = { entity_kind: 'canonical_spatial_node',
    entity_id: source.current_position_node_id };
  return { channel: 'acoustic', dependency_pins: pins,
    propagation_snapshot: seal({ source_scope_ref: scope,
      target_scope_ref: scope, edges: [] }),
    environment_snapshot: seal({
      light_state_id: environment.light_state_id,
      environment_state_ref: structuredClone(environment.environment_state_ref),
      environment_state_version: environment.environment_state_version,
      weather_state_ref: environment.weather_state_ref,
      weather_state_version: environment.weather_state_version,
      weather_visibility_result: environment.weather_visibility_result,
      weather_acoustic_loss: environment.weather_acoustic_loss,
      target_acoustic_profile_ref: { entity_kind: 'g6_acoustic_profile',
        entity_id: source.g6_instance_id },
      target_acoustic_profile_state_version: source.acoustic_state_version,
      target_ambient_noise: String(source.ambient_noise),
      transient_visibility_result: environment.transient_visibility_result,
      transient_acoustic_loss: environment.transient_acoustic_loss,
      transient_modifier_dependency_pins:
        structuredClone(transientPins),
      visibility_modifiers: structuredClone(modifiers) }),
    attention_snapshot: seal({
      attention_state_ref: structuredClone(source.attention_state_ref),
      status: sleeping ? 'sleeping' : 'awake',
      attended_channels: structuredClone(sleeping
        ? profile.attention.sleeping_channels : profile.attention.awake_channels),
      observer_position_ref: { endpoint_kind: 'scene_position',
        endpoint_id: source.current_position_node_id },
      observer_position_state_version: source.position_state_version,
      observer_azimuth_mdeg: profile.attention.observer_azimuth_mdeg,
      observer_vertical_direction: profile.attention.observer_vertical_direction,
      visual_capability_level: profile.attention.visual_capability_level,
      acoustic_capability_level: profile.attention.acoustic_capability_level,
      orientation_digest: computeSpatialV3CanonicalDigest({
        azimuth: profile.attention.observer_azimuth_mdeg,
        vertical: profile.attention.observer_vertical_direction }) }),
    recognition_snapshot: seal({
      recognition_state_ref: structuredClone(source.knowledge_state_ref),
      outcome: profile.recognition_outcome }),
    perception_profile: seal(structuredClone(policy)) };
}

function validEnvironmentSnapshot(value) {
  return value?.light_state_id != null
    && value.environment_state_ref?.entity_kind != null
    && value.environment_state_ref?.entity_id != null
    && Number.isSafeInteger(value.environment_state_version)
    && value.weather_state_ref?.entity_kind != null
    && value.weather_state_ref?.entity_id != null
    && Number.isSafeInteger(value.weather_state_version)
    && value.weather_visibility_result != null
    && value.weather_acoustic_loss != null
    && value.transient_visibility_result != null
    && value.transient_acoustic_loss != null
    && value.transient_modifier_dependency_pins != null
    && Array.isArray(value.visibility_modifiers);
}
function seal(value) {
  return { ...value, canonical_digest: computeSpatialV3CanonicalDigest(value) };
}
function authoringPin(dependency_role, reference) {
  return { dependency_role, entity_ref: structuredClone(reference.entity_ref),
    version_pin: { pin_kind: 'authoring_version',
      authoring_version: reference.authoring_version } };
}
function gap(code) { throw Object.assign(new Error(code), { code }); }
function text(value) { return typeof value === 'string' && value.length > 0; }
