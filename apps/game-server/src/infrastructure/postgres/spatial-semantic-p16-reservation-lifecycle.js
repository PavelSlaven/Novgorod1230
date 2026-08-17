import { createSpatialSemanticAuthorityRepository } from
  './spatial-semantic-authority-repository.js';
import { error } from './spatial-v3-write-layout.js';
import { validateSpatialV3CombinedWritePlan } from
  './spatial-v3-write-plan-validation.js';

/** Releases a durable pre-model S1 reservation when its common P16 fails. */
export function withSpatialSemanticReservationFailureRelease({
  committer,
  pool
} = {}) {
  if (typeof committer?.commit !== 'function' || !pool?.connect) {
    throw new TypeError('S1 reservation lifecycle requires committer and pool');
  }
  const authority = createSpatialSemanticAuthorityRepository({ pool });
  return Object.freeze({
    async commit(input) {
      const result = await committer.commit(input);
      const spatial = input?.plan?.spatial_semantic_atomic_write_plan;
      if (result?.ok || result?.in_progress || spatial == null
          || !validateSpatialV3CombinedWritePlan(input.plan)) {
        return result;
      }
      try {
        await authority.releaseReservation({
          party_id: spatial.party_id,
          reservation_ref: spatial.reservation_pin.row.reservation_ref
        });
      } catch (cause) {
        return Object.freeze({
          ok: false,
          error: error('state_version_conflict', spatial.party_id, {
            reason: `S1 reservation release failed: ${cause.message}`
          })
        });
      }
      return result;
    }
  });
}
