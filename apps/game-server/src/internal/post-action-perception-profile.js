export function validPostActionPerceptionProfile(value) {
  const general = value?.schema
    === 'rus.live_world_runtime.post_action_perception_profile.v1';
  const historical = value?.schema
    === 'rus.lower_dvina_trace_post_action_perception_profile.v1';
  return (general || historical)
    && value.revision === 1
    && value.status === 'approved' && value.owner === '@rus/turn'
    && value.fallback_policy === 'forbidden'
    && value.listener_scope_relation === 'same_scene_position'
    && Array.isArray(value.channels) && value.channels.length > 0
    && Array.isArray(value.runtime_attention?.awake_statuses)
    && Array.isArray(value.runtime_attention?.sleeping_statuses)
    && Array.isArray(value.runtime_attention?.unavailable_statuses)
    && Array.isArray(value.attention?.awake_channels)
    && Array.isArray(value.attention?.sleeping_channels)
    && value.recognition_outcome === 'unidentified'
    && (!general || (value.profile_id === 'live_world_post_action_perception_v1'
      && value.provenance?.transfer_basis
        === 'approved in M22 post-action-perception-profile, generalized by D66'
      && value.provenance?.source_path
        === 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m22-content/post-action-perception-profile.json'
      && !Object.hasOwn(value, 'scenario_id')
      && !Object.hasOwn(value, 'scenario_definition_revision')
      && !Object.hasOwn(value, 'environment')))
    && (!historical || (value.profile_id
      === 'lower_dvina_trace_post_action_perception_v1'
      && value.scenario_id === 'lower_dvina_trace_v1'
      && value.scenario_definition_revision === 34
      && value.environment != null))
    && value.perception_policy?.status === 'approved';
}
