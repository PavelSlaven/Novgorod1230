import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';

export async function loadPhase2JourneyLocation(partyPool, partyId, actorId) {
  const journey = await partyPool.query(
    `SELECT id,scene_position_id,state_version FROM party_runtime.party_journey_locations
      WHERE party_id=$1 AND owner_kind='actor' AND owner_id=$2`,
    [partyId, actorId]);
  return normalizeJourneyLocationRows(journey.rows);
}

export function normalizeJourneyLocation(row) {
  if (row == null || typeof row !== 'object'
      || !text(row.id) || !text(row.scene_position_id)) throw phase2IntegrityError();
  const stateVersion = typeof row.state_version === 'number'
    ? row.state_version
    : typeof row.state_version === 'string'
      && /^(?:0|[1-9][0-9]*)$/u.test(row.state_version)
      ? Number(row.state_version) : null;
  if (!Number.isSafeInteger(stateVersion) || stateVersion < 0) {
    throw phase2IntegrityError();
  }
  return { id: row.id, scene_position_id: row.scene_position_id,
    state_version: stateVersion };
}

export function normalizeJourneyLocationRows(rows) {
  if (!Array.isArray(rows) || rows.length > 1) throw phase2IntegrityError();
  return rows.length === 0 ? null : normalizeJourneyLocation(rows[0]);
}

function text(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}
