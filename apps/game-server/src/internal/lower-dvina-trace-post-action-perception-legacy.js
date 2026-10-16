import { buildPerceptionContext } from
  '../runtime/lower-dvina-trace-post-action-perception-context.js';

export function validLegacyPostActionPerceptionProfile(value) {
  const attention = value?.attention;
  const environment = value?.environment;
  const runtime = value?.runtime_attention;
  const policy = value?.perception_policy;
  return value?.schema
      === 'rus.lower_dvina_trace_post_action_perception_profile.v1'
    && value.profile_id === 'lower_dvina_trace_post_action_perception_v1'
    && value.revision === 1 && value.status === 'approved'
    && value.scenario_id === 'lower_dvina_trace_v1'
    && value.scenario_definition_revision === 34
    && value.owner === '@rus/turn' && value.fallback_policy === 'forbidden'
    && same(value.channels, ['acoustic'])
    && value.listener_scope_relation === 'same_scene_position'
    && value.required_schedule_status === 'active'
    && same(value.runtime_attention?.awake_statuses, ['available'])
    && same(value.runtime_attention?.sleeping_statuses, ['sleeping'])
    && same(value.runtime_attention?.unavailable_statuses, ['unavailable'])
    && same(value.attention?.awake_channels, ['acoustic', 'visual'])
    && same(value.attention?.sleeping_channels, [])
    && same(runtime?.awake_statuses, ['available'])
    && same(runtime?.sleeping_statuses, ['sleeping'])
    && same(runtime?.unavailable_statuses, ['unavailable'])
    && same(attention?.awake_channels, ['acoustic', 'visual'])
    && same(attention?.sleeping_channels, [])
    && attention?.observer_azimuth_mdeg === 0
    && attention?.observer_vertical_direction === 'level'
    && attention?.visual_capability_level === 3
    && attention?.acoustic_capability_level === 3
    && environment?.light_state_id === 'bright'
    && environment?.weather_visibility_result === 'clear'
    && environment?.weather_acoustic_loss === '0'
    && environment?.transient_visibility_result === 'clear'
    && environment?.transient_acoustic_loss === '0'
    && value.recognition_outcome === 'unidentified'
    && versioned(policy?.recognition_policy_ref)
    && versioned(policy?.visibility_policy_ref)
    && versioned(policy?.acoustic_policy_ref)
    && versioned(policy?.provenance_ref)
    && policy?.status === 'approved'
    && policy?.darkness_visual_result_cap === 'perceived_partial'
    && same(policy?.sleeping_attention_channels, []);
}

export function legacyPostActionPerceptionContext({ state, npc, source,
  profile }) {
  return buildPerceptionContext({ state, npc, source, profile,
    environment: historicalEnvironment(state, profile) });
}

export const legacyPostActionPerceptionAdapter = Object.freeze({
  validProfile: validLegacyPostActionPerceptionProfile,
  context: legacyPostActionPerceptionContext
});

function historicalEnvironment(state, profile) {
  const environmentProfileId = state?.environment_snapshot
    ?.environment_profile_id;
  const environmentStateVersion = Number(state?.party_state?.state_version);
  if (!text(environmentProfileId)
      || !Number.isSafeInteger(environmentStateVersion)
      || environmentStateVersion < 0) {
    gap('TRACE_POST_ACTION_ENVIRONMENT_STATE_GAP');
  }
  return {
    light_state_id: profile.environment.light_state_id,
    environment_state_ref: { entity_kind: 'environment_overlay_state',
      entity_id: environmentProfileId },
    environment_state_version: environmentStateVersion,
    weather_state_ref: { entity_kind: 'weather_state',
      entity_id: `${profile.profile_id}:weather` },
    weather_state_version: profile.revision,
    weather_visibility_result: profile.environment.weather_visibility_result,
    weather_acoustic_loss: profile.environment.weather_acoustic_loss,
    transient_visibility_result: profile.environment.transient_visibility_result,
    transient_acoustic_loss: profile.environment.transient_acoustic_loss
  };
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
function versioned(value) {
  return text(value?.entity_ref?.entity_kind)
    && text(value?.entity_ref?.entity_id)
    && text(value?.authoring_version);
}
function text(value) {
  return typeof value === 'string' && value.trim() === value
    && value.length > 0;
}
function gap(code) { throw Object.assign(new Error(code), { code }); }
