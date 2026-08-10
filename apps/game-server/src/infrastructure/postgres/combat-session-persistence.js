import { canonicalDigest } from '@rus/materialization';
import { validateCombatSession } from '@rus/contracts/combat-v1';
import { row } from './first-playable/plan-shared.js';

export function appendCombatSessionWrite({ inserts, updates, partyId, changeSetId,
  session, previousSession = null, mode } = {}) {
  if (!Array.isArray(inserts) || !Array.isArray(updates) || !text(partyId)
      || !text(changeSetId) || !validateCombatSession(session)
      || !['insert', 'update'].includes(mode)
      || (mode === 'insert' && (previousSession !== null || session.state_version !== '1'))
      || (mode === 'update' && (!validateCombatSession(previousSession)
        || previousSession.combat_id !== session.combat_id
        || Number(session.state_version) !== Number(previousSession.state_version) + 1))) fail();
  const committed = { ...structuredClone(session), last_change_set_ref: {
    entity_kind: 'party_change_set', entity_id: changeSetId } };
  if (!validateCombatSession(committed)) fail();
  (mode === 'insert' ? inserts : updates).push(row('party_combat_sessions', committed.combat_id, {
    combat_id: committed.combat_id, party_id: partyId, state_version: Number(committed.state_version),
    status: committed.status, started_at: committed.started_at, scope_ref: committed.scope_ref,
    participant_refs: committed.participant_refs, participant_states: committed.participant_states,
    exchange_ordinal: committed.exchange_ordinal, last_exchange_ref: committed.last_exchange_ref,
    player_response_required: committed.player_response_required, last_change_set_id: changeSetId,
    canonical_digest: canonicalDigest(committed), session_schema: committed.schema }));
  return committed;
}

export function hydrateCombatSession(record) {
  const session = { schema:record?.session_schema, combat_id:record?.combat_id,
    state_version:String(record?.state_version), status:record?.status, started_at:record?.started_at,
    scope_ref:record?.scope_ref, participant_refs:record?.participant_refs,
    participant_states:record?.participant_states, exchange_ordinal:Number(record?.exchange_ordinal),
    last_exchange_ref:record?.last_exchange_ref, player_response_required:record?.player_response_required,
    last_change_set_ref:{ entity_kind:'party_change_set', entity_id:record?.last_change_set_id } };
  if (!validateCombatSession(session) || record.canonical_digest !== canonicalDigest(session)) fail();
  return structuredClone(session);
}
function text(value) { return typeof value === 'string' && value.length > 0; }
function fail() { throw new Error('COMBAT_SESSION_PERSISTENCE_INVALID'); }
