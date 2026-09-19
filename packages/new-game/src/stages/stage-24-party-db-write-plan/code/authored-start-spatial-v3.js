export function addAuthoredStartSpatialV3Batches({ batches, result, partyId,
  playerId, changeSetId, sourceTrace, addBatch }) {
  const spatial = result.initial_spatial_v3;
  if (result.schema !== 'rus.authored_start_party_materialization_result.v1') {
    return null;
  }
  if (!valid(spatial)) fail();
  const node = result.immediate.spatial.node;
  const ids = { g5: `g5:${spatial.node_id}`,
    baseline: `baseline:${spatial.node_id}`, g6: `g6:${spatial.anchor_id}`,
    position: `position:${spatial.anchor_id}`,
    journey: `journey-location:${partyId}:${playerId}` };
  addBatch(batches, 'party_g5_sites', [{ id: ids.g5, party_id: partyId,
    origin: 'canonical', parent_g4_id: node.parent_g4_id,
    canonical_g5_ref: ref(spatial.canonical_g5_ref), status: 'active',
    state_version: 1, created_change_set_id: changeSetId,
    updated_change_set_id: changeSetId }],
  ['parties', 'party_v3_change_sets'], sourceTrace);
  addBatch(batches, 'party_scene_baselines', [{ id: ids.baseline,
    party_id: partyId, host_kind: 'g5_site', host_id: ids.g5,
    source_kind: 'canonical_template',
    scene_template_ref: structuredClone(spatial.scene_template_ref),
    materialization_trace_id: result.run_id,
    materializer_version: result.trace.materializer_version,
    catalog_digest: result.trace.catalog_digest, status: 'active',
    state_version: 1, created_change_set_id: changeSetId,
    updated_change_set_id: changeSetId }], ['party_g5_sites'], sourceTrace);
  addBatch(batches, 'party_g6_instances', [{ id: ids.g6, party_id: partyId,
    scene_baseline_id: ids.baseline,
    source_scene_template_ref: structuredClone(spatial.scene_template_ref),
    scene_slot_key: spatial.g6.scene_slot_key,
    enclosing_stable_structure_id: null, host_kind: 'g5_site', host_id: ids.g5,
    physical_class_id: spatial.g6.physical_class_id,
    primary_scene_role_id: spatial.g6.primary_scene_role_id,
    vertical_context_id: spatial.g6.vertical_context_id,
    overhead_cover_id: spatial.g6.overhead_cover_id,
    intra_g6_visibility_mode: spatial.g6.intra_g6_visibility_mode,
    default_visibility_distance_band: spatial.g6.default_visibility_distance_band,
    acoustic_uniformity: spatial.g6.acoustic_uniformity, status: 'active',
    state_version: 1, created_change_set_id: changeSetId,
    updated_change_set_id: changeSetId }], ['party_scene_baselines'], sourceTrace);
  addBatch(batches, 'g6_acoustic_profiles', [{ party_id: partyId,
    g6_instance_id: ids.g6, ambient_noise: 0,
    acoustic_uniformity: spatial.g6.acoustic_uniformity, state_version: 1,
    updated_change_set_id: changeSetId }], ['party_g6_instances'], sourceTrace);
  addBatch(batches, 'scene_position_nodes', [{ id: ids.position,
    party_id: partyId, g6_instance_id: ids.g6,
    position_type_id: spatial.position.position_type_id,
    template_slot_key: spatial.position.position_slot_key,
    template_instance_ordinal: 0, stable_basis_ref: null,
    capacity: spatial.position.capacity,
    access_class_id: spatial.position.access_class_id,
    light_profile_ref: null, hazard_profile_ref: null, status: 'active',
    state_version: 1, created_change_set_id: changeSetId,
    updated_change_set_id: changeSetId }], ['party_g6_instances'], sourceTrace);
  addBatch(batches, 'party_journey_locations', [{ id: ids.journey,
    party_id: partyId, owner_kind: 'actor', owner_id: playerId,
    location_kind: 'scene', scene_position_id: ids.position,
    transit_anchor_id: null, travel_state_id: null, state_version: 1,
    updated_change_set_id: changeSetId }],
  ['scene_position_nodes', 'party_player_characters'], sourceTrace);
  return { ...ids };
}

function valid(value) {
  const g6 = value?.g6, position = value?.position;
  return text(value?.node_id) && text(value?.anchor_id)
    && dbRef(value?.canonical_g5_ref, 'canonical_spatial_node')
    && dbRef(value?.materialization_profile_ref,
      'scene_materialization_profile')
    && value?.scene_template_ref?.entity_ref?.entity_kind === 'scene_template'
    && text(value.scene_template_ref.entity_ref.entity_id)
    && text(value.scene_template_ref.authoring_version)
    && ['scene_slot_key','physical_class_id','primary_scene_role_id',
      'vertical_context_id','overhead_cover_id','intra_g6_visibility_mode',
      'default_visibility_distance_band','acoustic_uniformity']
      .every((key) => text(g6?.[key]))
    && text(position?.position_slot_key)
    && position.g6_scene_slot_key === g6.scene_slot_key
    && text(position.position_type_id) && Number.isSafeInteger(position.capacity)
    && position.capacity >= 0 && text(position.access_class_id);
}
function ref(value) { return { entity_ref: { entity_kind: value.entity_kind,
  entity_id: value.entity_id }, authoring_version: value.authoring_version }; }
function dbRef(value, kind) { return value?.entity_kind === kind
  && text(value.entity_id) && text(value.authoring_version); }
function text(value) { return typeof value === 'string'
  && value.length > 0 && value.trim() === value; }
function fail() { const error = new Error('Authored start spatial-v3 state is incomplete.');
  error.code = 'AUTHORED_START_SPATIAL_V3_INVALID'; throw error; }
