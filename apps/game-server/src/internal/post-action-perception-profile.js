export function validPostActionPerceptionProfile(value, { expectedProfileId } = {}) {
  return value?.schema
      === 'rus.live_world_runtime.post_action_perception_profile.v1'
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
    && typeof value.profile_id === 'string' && value.profile_id.length > 0
    && (expectedProfileId === undefined
      || value.profile_id === expectedProfileId)
    && (value.provenance?.transfer_basis === undefined
      || (typeof value.provenance.transfer_basis === 'string'
        && value.provenance.transfer_basis.trim().length > 0))
      && !Object.hasOwn(value, 'scenario_id')
      && !Object.hasOwn(value, 'scenario_definition_revision')
      && !Object.hasOwn(value, 'environment')
    && value.perception_policy?.status === 'approved';
}
