import { normalizeSpatialSemanticEnvelope } from
  '@rus/materialization/internal/lower-dvina-trace-s1';

export function createSpatialSemanticAuthorityRepository({ pool } = {}) {
  if (!pool?.query) throw new TypeError('S1 authority repository requires pg pool.');
  return Object.freeze({
    loadPreModel: async ({ party_id, envelope_ref }) => {
      if (!text(party_id) || !text(envelope_ref)) fail('S1_SPATIAL_AUTHORITY_INVALID');
      const result = await pool.query(`SELECT envelope,capacity_total,consumed_count,state_version,status
        FROM party_runtime.party_spatial_semantic_envelopes
        WHERE party_id=$1 AND envelope_ref=$2`, [party_id, envelope_ref]);
      if (result.rowCount !== 1) fail('S1_SPATIAL_AUTHORITY_MISSING');
      return snapshot(result.rows[0], party_id);
    },
    loadPreModelAtPosition: async ({ party_id, position_ref }) => {
      if (!text(party_id) || !text(position_ref)) fail('S1_SPATIAL_AUTHORITY_INVALID');
      const result = await pool.query(`SELECT envelope,capacity_total,consumed_count,state_version,status
        FROM party_runtime.party_spatial_semantic_envelopes
        WHERE party_id=$1 AND envelope->>'position_ref'=$2 AND status='committed'
          AND consumed_count < capacity_total
        LIMIT 2`, [party_id, position_ref]);
      if (result.rowCount === 0) fail('S1_SPATIAL_AUTHORITY_MISSING');
      if (result.rowCount > 1) fail('S1_SPATIAL_AUTHORITY_CONFLICT');
      return snapshot(result.rows[0], party_id);
    },
    findCommittedResolution: async ({ party_id, request_id = null, local_ref = null }) => {
      if (!text(party_id) || (request_id != null && !text(request_id))
          || (local_ref != null && !text(local_ref))
          || (request_id == null && local_ref == null)) fail('S1_SPATIAL_RESOLUTION_INVALID');
      const result = await pool.query(`SELECT request_id,local_ref,envelope_ref,position_ref,root_turn_id,step_index,semantics,formal_spatial_refs,
        from_party_state_version,to_party_state_version,p16_change_set_id
        FROM party_runtime.party_spatial_semantic_resolutions
        WHERE party_id=$1 AND ${local_ref == null ? 'request_id=$2' : 'local_ref=$2'}`,
      [party_id, local_ref ?? request_id]);
      if (result.rowCount > 1) fail('S1_SPATIAL_RESOLUTION_CONFLICT');
      return result.rowCount === 0 ? null : Object.freeze(structuredClone(result.rows[0]));
    },
    findLocalMovementEdge: async ({ party_id, from_position_ref,
      to_position_ref, movement_edge_refs }) => {
      if (!text(party_id) || !text(from_position_ref) || !text(to_position_ref)
          || !Array.isArray(movement_edge_refs) || movement_edge_refs.length !== 2
          || new Set(movement_edge_refs).size !== 2
          || !movement_edge_refs.every(text)) fail('S1_SPATIAL_MOVEMENT_EDGE_INVALID');
      const result = await pool.query(`SELECT e.id AS edge_id,e.reverse_edge_id,
          e.from_position_id AS from_position_ref,e.to_position_id AS to_position_ref,
          e.cost_kind,e.action_units,e.base_minutes,e.capacity AS edge_capacity,
          e.transition_environment_profile_ref,e.movement_orientation_profile_ref,
          e.baseline_movement_method_id,e.movement_method_cost_profile_ref,
          e.dynamic_recheck_policy_ref,e.state_version AS edge_state_version,
          reverse.state_version AS reverse_edge_state_version,
          source.state_version AS source_node_state_version,
          destination.state_version AS destination_node_state_version,
          destination.capacity AS destination_capacity,
          (SELECT COUNT(*)::int FROM party_runtime.party_journey_locations occupancy
            WHERE occupancy.party_id=e.party_id AND occupancy.location_kind='scene'
              AND occupancy.scene_position_id=e.to_position_id)
          + COALESCE((SELECT SUM(occupies_capacity_units) FROM party_runtime.entity_placements occupancy
            WHERE occupancy.party_id=e.party_id AND occupancy.position_node_id=e.to_position_id),0)::int
            AS destination_occupancy
        FROM party_runtime.scene_movement_edges e
        JOIN party_runtime.scene_movement_edges reverse
          ON reverse.party_id=e.party_id AND reverse.id=e.reverse_edge_id
        JOIN party_runtime.scene_position_nodes source
          ON source.party_id=e.party_id AND source.id=e.from_position_id
        JOIN party_runtime.scene_position_nodes destination
          ON destination.party_id=e.party_id AND destination.id=e.to_position_id
        WHERE e.party_id=$1 AND e.from_position_id=$2 AND e.to_position_id=$3
          AND e.id = ANY($4::text[]) AND e.status='active'
          AND reverse.status='active' AND reverse.from_position_id=e.to_position_id
          AND reverse.to_position_id=e.from_position_id AND reverse.reverse_edge_id=e.id
          AND source.status='active' AND destination.status='active'
        ORDER BY e.id`, [party_id, from_position_ref, to_position_ref,
        movement_edge_refs]);
      const edge = result.rows[0];
      if (result.rowCount !== 1 || !validEdge(edge)
          || !movement_edge_refs.includes(edge.edge_id)
          || edge.destination_occupancy + 1 > edge.destination_capacity) {
        fail('S1_SPATIAL_MOVEMENT_EDGE_INVALID');
      }
      return Object.freeze(sceneEdgeSnapshot(edge));
    }
  });
}

export async function provisionSpatialSemanticEnvelope({ client, partyId, envelope, changeSetId }) {
  if (!client?.query || !text(partyId) || !text(changeSetId)) fail('S1_SPATIAL_AUTHORITY_INVALID');
  let normalized;
  try { normalized = normalizeSpatialSemanticEnvelope(envelope); }
  catch { fail('S1_SPATIAL_AUTHORITY_INVALID'); }
  const existing = await client.query(`SELECT envelope,capacity_total,consumed_count,state_version,status
    FROM party_runtime.party_spatial_semantic_envelopes WHERE party_id=$1 AND envelope_ref=$2 FOR UPDATE`, [partyId, normalized.envelope_ref]);
  if (existing.rowCount === 1) {
    const row = snapshot(existing.rows[0], partyId);
    if (JSON.stringify(row.envelope) !== JSON.stringify(normalized)) fail('S1_SPATIAL_AUTHORITY_CONFLICT');
    return row;
  }
  await client.query(`INSERT INTO party_runtime.party_spatial_semantic_envelopes
    (party_id,envelope_ref,envelope,capacity_total,consumed_count,state_version,status,created_change_set_id)
    VALUES ($1,$2,$3::jsonb,$4,$5,$6,'committed',$7)`, [partyId, normalized.envelope_ref,
    JSON.stringify(normalized), normalized.capacity_total, normalized.consumed_count,
    normalized.state_version, changeSetId]);
  return snapshot({ envelope: normalized, capacity_total: normalized.capacity_total,
    consumed_count: normalized.consumed_count, state_version: normalized.state_version,
    status: 'committed' }, partyId);
}

function snapshot(row, partyId) {
  let envelope;
  try { envelope = normalizeSpatialSemanticEnvelope(row.envelope); }
  catch { fail('S1_SPATIAL_AUTHORITY_STALE'); }
  if (row.status !== 'committed' || Number(row.capacity_total) !== envelope.capacity_total
      || Number(row.consumed_count) !== envelope.consumed_count
      || Number(row.state_version) !== envelope.state_version) fail('S1_SPATIAL_AUTHORITY_STALE');
  return Object.freeze({ party_id: partyId, envelope: structuredClone(envelope),
    envelope_ref: envelope.envelope_ref, capacity_total: envelope.capacity_total,
    consumed_count: envelope.consumed_count, state_version: envelope.state_version,
    status: 'committed' });
}
function text(value) { return typeof value === 'string' && value.length > 0; }
function integer(value) { return Number.isSafeInteger(Number(value)) && Number(value) >= 0; }
function validEdge(value) {
  return text(value?.edge_id) && text(value.reverse_edge_id)
    && text(value.from_position_ref) && text(value.to_position_ref)
    && value.cost_kind === 'action' && Number.isSafeInteger(Number(value.action_units))
    && Number(value.action_units) > 0 && value.base_minutes === null
    && Number.isSafeInteger(Number(value.edge_capacity)) && Number(value.edge_capacity) > 0
    && Number.isSafeInteger(Number(value.destination_capacity)) && Number(value.destination_capacity) > 0
    && integer(value.edge_state_version) && integer(value.reverse_edge_state_version)
    && integer(value.source_node_state_version)
    && integer(value.destination_node_state_version)
    && Number.isSafeInteger(Number(value.destination_occupancy));
}
function sceneEdgeSnapshot(value) {
  return { ...structuredClone(value), action_units: Number(value.action_units),
    edge_capacity: Number(value.edge_capacity), destination_capacity: Number(value.destination_capacity),
    transition_footprint_units: 1, destination_occupancy: Number(value.destination_occupancy),
    edge_state_version: Number(value.edge_state_version),
    reverse_edge_state_version: Number(value.reverse_edge_state_version),
    source_node_state_version: Number(value.source_node_state_version),
    destination_node_state_version: Number(value.destination_node_state_version) };
}
function fail(code) { const error = new Error(code); error.code = code; throw error; }
