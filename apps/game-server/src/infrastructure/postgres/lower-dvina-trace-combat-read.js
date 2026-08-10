import { canonicalDigest } from '@rus/materialization';
import { hydrateCombatSession } from './combat-session-persistence.js';
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';

export async function assertCombatSessionRows(partyPool, payload) {
  const result = await partyPool.query(
    `SELECT combat_id,state_version,status,started_at,scope_ref,
            participant_refs,participant_states,exchange_ordinal,
            last_exchange_ref,player_response_required,last_change_set_id,
            canonical_digest,session_schema
       FROM party_runtime.party_combat_sessions
      WHERE party_id=$1 AND status <> 'ended'
      ORDER BY combat_id`,
    [payload.party_id]
  );
  const persisted = result.rows.map(hydrateCombatSession);
  const snapshot = payload.combat_sessions ?? [];
  if (snapshot.length !== persisted.length
      || snapshot.some((session, index) =>
        canonicalDigest(session) !== canonicalDigest(persisted[index]))) {
    throw phase2IntegrityError();
  }
}
