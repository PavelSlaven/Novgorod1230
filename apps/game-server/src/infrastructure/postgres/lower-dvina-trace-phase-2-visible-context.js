import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';
import { phase2VisibleContextFromPayload } from './lower-dvina-trace-phase-2-projection.js';
import { requirePhase2CurrentVisibleContext } from './lower-dvina-trace-phase-2-current-visible.js';
import { withTurnDeadlineQueryPool } from './query-with-turn-deadline.js';

export async function loadPhase2VisibleContext(partyPool, { commit, turnBudget = null }) {
  const result = await withTurnDeadlineQueryPool(partyPool, turnBudget).query({
    text: `SELECT visible_payload,package_digest,committed_state_version
       FROM party_runtime.party_visible_packages
      WHERE package_id=$1 AND package_digest=$2`,
    values: [commit.package_id, commit.package_digest]
  });
  const payload = result.rows[0]?.visible_payload;
  if (result.rowCount !== 1
      || result.rows[0].package_digest
        !== computeSpatialV3CanonicalDigest(payload)) throw phase2IntegrityError();
  return requirePhase2CurrentVisibleContext(phase2VisibleContextFromPayload(payload));
}
