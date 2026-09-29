import { encodePresenceRulePeriodNumber } from '@rus/materialization';
import { serverError } from '../errors.js';

/**
 * Calendar for presence rules at a G5 site.
 * Start placement (state_version 0): committed initial environment at authorship.
 * Later first arrivals (state_version ≥ 1): current party clock in the arrival transaction.
 */
export async function readTargetPartyPresenceCalendar({
  transaction,
  partyId,
  factualContext,
}) {
  const lifecycle = await transaction.query(
    `SELECT state_version FROM party_runtime.parties WHERE party_id=$1`,
    [partyId],
  );
  const stateVersion = Number(lifecycle.rows[0]?.state_version);
  let environment;
  if (stateVersion === 0) {
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
