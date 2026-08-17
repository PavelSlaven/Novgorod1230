import { canonicalDigest } from '@rus/materialization';
import { validateSpatialSemanticResolution } from
  '@rus/materialization/internal/lower-dvina-trace-s1';

// Read-only runtime projection.  It is intentionally detached and validates
// persisted digests before the player-safe layer can expose a marker.
export async function loadSpatialSemanticCommittedState(pool, partyId) {
  const result = await pool.query(`SELECT envelope,capacity,authority_state_version,authority_digest,status
    FROM party_runtime.party_spatial_semantic_envelopes WHERE party_id=$1 ORDER BY envelope_ref`, [partyId]);
  const resolutions = await pool.query(`SELECT sealed_resolution,resolution_digest
    FROM party_runtime.party_spatial_semantic_resolutions WHERE party_id=$1 ORDER BY request_id`, [partyId]);
  const reservations = await pool.query(`SELECT reservation_ref,envelope_ref,
    reservation_state_version,capacity,reservation_digest,status
    FROM party_runtime.party_spatial_semantic_reservations
    WHERE party_id=$1 AND status='committed_reserved' ORDER BY reservation_ref`,
  [partyId]);
  const resolved = new Map();
  for (const row of resolutions.rows) {
    let sealed;
    try {
      sealed = validateSpatialSemanticResolution(row.sealed_resolution);
    } catch {
      throw invalid();
    }
    if (row.resolution_digest !== sealed.resolution_digest) throw invalid();
    resolved.set(sealed.reservation.envelope.envelope_ref, sealed);
  }
  const pending = new Map();
  for (const row of reservations.rows) {
    if (pending.has(row.envelope_ref)) throw invalid();
    pending.set(row.envelope_ref, row);
  }
  return Object.freeze(result.rows.map((row) => {
    const authority = { party_id: partyId, envelope_ref: row.envelope.envelope_ref,
      envelope: row.envelope, capacity: row.capacity,
      authority_state_version: Number(row.authority_state_version), status: row.status };
    if (row.authority_digest !== `sha256:${canonicalDigest(authority)}`) throw invalid();
    const resolution = resolved.get(row.envelope.envelope_ref) ?? null;
    const reserved = pending.get(row.envelope.envelope_ref) ?? null;
    let pendingReservation = null;
    if (reserved != null) {
      const proof = { reservation_ref: reserved.reservation_ref,
        state_version: Number(reserved.reservation_state_version),
        status: reserved.status, capacity: reserved.capacity,
        envelope: row.envelope };
      if (reserved.reservation_digest !== `sha256:${canonicalDigest(proof)}`
          || canonicalDigest(reserved.capacity) !== canonicalDigest(row.capacity)) {
        throw invalid();
      }
      pendingReservation = { reservation_ref: reserved.reservation_ref,
        state_version: Number(reserved.reservation_state_version),
        status: reserved.status };
    }
    return Object.freeze({ envelope: structuredClone(row.envelope), capacity: structuredClone(row.capacity),
      status: row.status, resolution: resolution == null ? null : structuredClone(resolution),
      pending_reservation: pendingReservation });
  }));
}
function invalid() { return Object.assign(new Error('S1_SPATIAL_READBACK_INVALID'), { code: 'S1_SPATIAL_READBACK_INVALID' }); }
