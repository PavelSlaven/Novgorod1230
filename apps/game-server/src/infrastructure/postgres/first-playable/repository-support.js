import { serverError } from '../../../errors.js';

export async function loadSession(pool, partyId) {
  const result = await pool.query(
    `SELECT request_id,screen,turn_number
     FROM party_runtime.party_server_sessions
     WHERE party_id=$1`,
    [partyId]
  );
  if (result.rows.length === 0) {
    throw serverError(
      'PARTY_NOT_FOUND',
      'Party session was not found.',
      { status: 404 }
    );
  }
  return {
    request_id: result.rows[0].request_id,
    screen: result.rows[0].screen,
    turn_number: Number(result.rows[0].turn_number)
  };
}

export async function tableExists(tx, name) {
  const result = await tx.query(
    'SELECT to_regclass($1) IS NOT NULL AS present',
    [name]
  );
  return result.rows[0]?.present === true;
}

export async function transaction(pool, work) {
  const tx = await pool.connect();
  try {
    await tx.query('BEGIN');
    await tx.query('SET CONSTRAINTS ALL DEFERRED');
    const result = await work(tx);
    await tx.query('COMMIT');
    return result;
  } catch (error) {
    await tx.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    tx.release();
  }
}
