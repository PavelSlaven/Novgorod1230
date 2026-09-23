export function addAuthoredStartSpatialV3Batches({ batches, result, partyId,
  playerId, changeSetId, sourceTrace, addBatch }) {
  const spatial = result.initial_spatial_v3;
  if (!isAuthoredStartMaterializationResult(result)) {
    return null;
  }
  if (!valid(spatial)) fail();
  if (spatial.canonical_scene_proposal != null) return addCanonicalScene({
    batches, result, spatial, partyId, playerId, changeSetId, sourceTrace, addBatch });
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
    updated_change_set_id: changeSetId },
  ...s1Records(spatial, 'party_g6_instances', partyId, changeSetId)],
  ['party_scene_baselines'], sourceTrace);
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
    updated_change_set_id: changeSetId },
  ...s1Records(spatial, 'scene_position_nodes', partyId, changeSetId)],
  ['party_g6_instances'], sourceTrace);
  addS1TopologyBatches({ batches, spatial, partyId, changeSetId, sourceTrace,
    addBatch });
  addBatch(batches, 'party_journey_locations', [{ id: ids.journey,
    party_id: partyId, owner_kind: 'actor', owner_id: playerId,
    location_kind: 'scene', scene_position_id: ids.position,
    transit_anchor_id: null, travel_state_id: null, state_version: 1,
    updated_change_set_id: changeSetId }],
  ['scene_position_nodes', 'party_player_characters'], sourceTrace);
  return { ...ids };
}

function addCanonicalScene({ batches, result, spatial, partyId, playerId,
  changeSetId, sourceTrace, addBatch }) {
  const proposal = spatial.canonical_scene_proposal;
  const tables = ['party_scene_baselines', 'party_g6_instances',
    'g6_acoustic_profiles', 'scene_position_nodes', 'scene_movement_edges'];
  const rows = proposal?.rows;
  if (!Array.isArray(rows) || !Array.isArray(proposal?.endpoints)
    || proposal.party_id !== partyId || proposal.site_id !== `g5:${spatial.node_id}`
    || proposal.baseline_id !== `baseline:${spatial.node_id}`
    || rows.some((row) => !tables.includes(row.target_table)
      || row.record?.party_id !== partyId)
    || spatial.s1_topology != null || (spatial.s1_physical_writes ?? []).length) fail();
  const baselines = rows.filter((row) => row.target_table === 'party_scene_baselines');
  const baseline = baselines[0]?.record;
  const arrivals = proposal.endpoints.filter((row) => ['arrival', 'both'].includes(row.endpoint_role));
  const positions = rows.filter((row) => row.target_table === 'scene_position_nodes'
    && row.id === arrivals[0]?.position_id);
  const g6 = rows.find((row) => row.target_table === 'party_g6_instances'
    && row.id === positions[0]?.record.g6_instance_id);
  if (baselines.length !== 1 || baseline.id !== proposal.baseline_id
    || baseline.host_kind !== 'g5_site' || baseline.host_id !== proposal.site_id
    || baseline.source_kind !== 'canonical_template'
    || baseline.scene_template_ref?.entity_id !== spatial.scene_template_ref.entity_ref.entity_id
    || baseline.scene_template_ref?.authoring_version !== spatial.scene_template_ref.authoring_version
    || baseline.materialization_trace_id !== result.run_id
    || arrivals.length !== 1 || spatial.selected_position_id !== arrivals[0]?.position_id
    || positions.length !== 1
    || !g6 || g6.record.scene_baseline_id !== baseline.id
    || g6.record.host_id !== proposal.site_id || g6.record.host_kind !== 'g5_site') fail();
  const ids = { g5: proposal.site_id, baseline: proposal.baseline_id,
    g6: g6.id, position: positions[0].id,
    journey: `journey-location:${partyId}:${playerId}` };
  addBatch(batches, 'party_g5_sites', [{ id: ids.g5, party_id: partyId,
    origin: 'canonical', parent_g4_id: result.immediate.spatial.node.parent_g4_id,
    canonical_g5_ref: { entity_id: spatial.canonical_g5_ref.entity_id,
      authoring_version: spatial.canonical_g5_ref.authoring_version }, status: 'active',
    state_version: 1, created_change_set_id: changeSetId,
    updated_change_set_id: changeSetId }], ['parties', 'party_v3_change_sets'], sourceTrace);
  for (const table of tables) {
    const records = rows.filter((row) => row.target_table === table).map(({ record }) => ({
      ...structuredClone(record),
      ...('created_change_set_id' in record ? { created_change_set_id: changeSetId } : {}),
      ...('updated_change_set_id' in record ? { updated_change_set_id: changeSetId } : {})
    }));
    addBatch(batches, table, records, ['party_g5_sites', ...tables.slice(0, tables.indexOf(table))], sourceTrace);
  }
  addBatch(batches, 'party_journey_locations', [{ id: ids.journey,
    party_id: partyId, owner_kind: 'actor', owner_id: playerId,
    location_kind: 'scene', scene_position_id: ids.position,
    transit_anchor_id: null, travel_state_id: null, state_version: 1,
    updated_change_set_id: changeSetId }],
  ['scene_position_nodes', 'party_player_characters'], sourceTrace);
  return ids;
}

function addS1TopologyBatches({ batches, spatial, partyId, changeSetId,
  sourceTrace, addBatch }) {
  const writes = spatial.s1_physical_writes ?? [];
  if (spatial.s1_topology == null) {
    if (writes.length !== 0) fail();
    return;
  }
  if (writes.length !== 6) fail();
  addBatch(batches, 'scene_movement_edges', s1Records(spatial,
    'scene_movement_edges', partyId, changeSetId),
    ['scene_position_nodes'], sourceTrace);
  addBatch(batches, 'visibility_links', s1Records(spatial,
    'visibility_links', partyId, changeSetId),
    ['scene_position_nodes'], sourceTrace);
}

function s1Records(spatial, table, partyId, changeSetId) {
  return (spatial.s1_physical_writes ?? [])
    .filter(({ target_table: target }) => target === table)
    .map(({ id, record }) => ({ id, ...structuredClone(record),
      party_id: partyId, created_change_set_id: changeSetId,
      updated_change_set_id: changeSetId, terminal_change_set_id: null }));
}

export function isAuthoredStartMaterializationResult(result) {
  return ['rus.authored_start_party_materialization_result.v1',
    'rus.authored_start_party_materialization_result.v3']
    .includes(result?.schema);
}

export function authoredStartSnapshotSchema(result) {
  if (!isAuthoredStartMaterializationResult(result)) return null;
  return result.schema.endsWith('.v3')
    ? 'rus.authored_start_initial_party_snapshot.v3'
    : 'rus.authored_start_initial_party_snapshot.v1';
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
