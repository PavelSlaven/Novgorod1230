import { serverError } from '../../errors.js';
import { withTurnDeadlineQueryPool } from './query-with-turn-deadline.js';

export async function loadPhase2StateVersion(
  partyPool,
  partyId,
  { presentationIdempotencyKey = null, turnBudget = null } = {}
) {
  const result = await withTurnDeadlineQueryPool(partyPool, turnBudget).query(
    `SELECT p.state_version AS party_state_version,s.delivery_ack_result
       FROM party_runtime.parties p
       JOIN party_runtime.party_server_sessions s
         ON s.party_id=p.party_id
      WHERE p.party_id=$1`,
    [partyId]
  );
  if (result.rowCount !== 1) {
    throw serverError(
      'PARTY_NOT_FOUND',
      'Party session was not found.',
      { status: 404 }
    );
  }
  if (result.rows[0].delivery_ack_result?.pass !== true) {
    throw serverError(
      'OPENING_ACK_REQUIRED',
      'Opening screen must be acknowledged before the first trace turn.',
      { status: 409 }
    );
  }
  return Number(result.rows[0].party_state_version);
}
