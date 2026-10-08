import { encodePresenceRulePeriodNumber } from '@rus/materialization';
import { serverError } from '../../errors.js';
import { isInitialPartyState } from './party-state-lifecycle.js';

/**
 * Calendar for presence rules at a G5 site.
 * Before a server session at state_version 0: committed initial environment at authorship.
 * Otherwise: current party clock in the arrival transaction.
 */
export async function readTargetPartyPresenceCalendar({
  transaction,
  partyId,
  factualContext,
}) {
  const lifecycle = await transaction.query(
    `SELECT p.state_version,s.party_id AS session_party_id
       FROM party_runtime.parties p LEFT JOIN party_runtime.party_server_sessions s
         ON s.party_id=p.party_id WHERE p.party_id=$1`,
    [partyId],
  );
  let environment;
  if (isInitialPartyState(lifecycle.rows[0])) {
    const player = await transaction.query(
      `SELECT character_id FROM party_runtime.party_player_characters WHERE party_id=$1`,
      [partyId],
    );
    const actorId = player.rows[0]?.character_id;
    if (!actorId) {
      throw serverError('SPATIAL_V3_PARTY_CALENDAR_REQUIRED',
        'Committed party actor is required for initial presence resolution.');
    }
    environment = await factualContext.readInitialEnvironment({
      transaction, partyId, actorId,
    });
  } else {
    environment = await factualContext.readCurrentEnvironment({ transaction, partyId });
  }
  const season = environment?.season;
  const year = Number(environment?.calendar_date?.year);
  if (!season || !Number.isInteger(year) || year < 1) {
    throw serverError('SPATIAL_V3_PARTY_CALENDAR_REQUIRED',
      'Committed party calendar season and year are required for presence resolution.');
  }
  return Object.freeze({
    season,
    periodNumber: encodePresenceRulePeriodNumber({ year, season }),
  });
}
