import { normalizeSpatialSemanticEnvelope } from
  '@rus/materialization/internal/lower-dvina-trace-s1';

export async function loadSpatialSemanticCommittedState(pool, partyId) {
  const [envelopes, resolutions] = await Promise.all([
    pool.query(`SELECT envelope,capacity_total,consumed_count,state_version,status
      FROM party_runtime.party_spatial_semantic_envelopes WHERE party_id=$1 ORDER BY envelope_ref`, [partyId]),
    pool.query(`SELECT request_id,local_ref,envelope_ref,position_ref,root_turn_id,step_index,semantics,
      from_party_state_version,to_party_state_version,p16_change_set_id
      FROM party_runtime.party_spatial_semantic_resolutions WHERE party_id=$1 ORDER BY request_id`, [partyId])
  ]);
  const byEnvelope = new Map();
  for (const resolution of resolutions.rows) {
    const current = byEnvelope.get(resolution.envelope_ref) ?? [];
    current.push(structuredClone(resolution));
    byEnvelope.set(resolution.envelope_ref, current);
  }
  return Object.freeze(envelopes.rows.map((row) => {
    let envelope;
    try { envelope = normalizeSpatialSemanticEnvelope(row.envelope); } catch { throw invalid(); }
    if (row.status !== 'committed' || Number(row.capacity_total) !== envelope.capacity_total
        || Number(row.consumed_count) !== envelope.consumed_count
        || Number(row.state_version) !== envelope.state_version) throw invalid();
    const resolved = byEnvelope.get(envelope.envelope_ref) ?? [];
    return Object.freeze({ envelope: structuredClone(envelope), capacity_total: envelope.capacity_total,
      consumed_count: envelope.consumed_count, state_version: envelope.state_version,
      status: row.status, resolutions: Object.freeze(resolved),
      resolution: resolved.length === 1 ? resolved[0] : null });
  }));
}

export async function withSpatialSemanticCommittedState(pool, partyId, state) {
  return { ...state, spatial_semantic: await loadSpatialSemanticCommittedState(pool, partyId) };
}
function invalid() { return Object.assign(new Error('S1_SPATIAL_READBACK_INVALID'), { code: 'S1_SPATIAL_READBACK_INVALID' }); }
