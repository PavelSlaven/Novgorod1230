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
    findCommittedResolution: async ({ party_id, request_id, local_ref = null }) => {
      if (!text(party_id) || !text(request_id) || (local_ref != null && !text(local_ref))) fail('S1_SPATIAL_RESOLUTION_INVALID');
      const result = await pool.query(`SELECT request_id,local_ref,envelope_ref,position_ref,root_turn_id,step_index,semantics,
        from_party_state_version,to_party_state_version,p16_change_set_id
        FROM party_runtime.party_spatial_semantic_resolutions
        WHERE party_id=$1 AND (request_id=$2 OR ($3::text IS NOT NULL AND local_ref=$3))`, [party_id, request_id, local_ref]);
      if (result.rowCount > 1) fail('S1_SPATIAL_RESOLUTION_CONFLICT');
      return result.rowCount === 0 ? null : Object.freeze(structuredClone(result.rows[0]));
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
function fail(code) { const error = new Error(code); error.code = code; throw error; }
