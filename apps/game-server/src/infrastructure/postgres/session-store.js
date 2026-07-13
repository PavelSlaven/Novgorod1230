export function createPostgresSessionStore({ pool } = {}) {
  requirePool(pool);
  return Object.freeze({
    async load(partyId) {
      const id = key(partyId);
      const { rows } = await pool.query('SELECT session FROM party_runtime.game_sessions WHERE party_id = $1', [id]);
      return rows[0]?.session == null ? null : structuredClone(rows[0].session);
    },
    async save(partyId, value) {
      const id = key(partyId);
      await pool.query(`INSERT INTO party_runtime.game_sessions (party_id, session, updated_at)
        VALUES ($1, $2::jsonb, NOW())
        ON CONFLICT (party_id) DO UPDATE SET session = EXCLUDED.session, updated_at = NOW()`, [id, JSON.stringify(value)]);
      return structuredClone(value);
    },
    async delete(partyId) {
      const result = await pool.query('DELETE FROM party_runtime.game_sessions WHERE party_id = $1', [key(partyId)]);
      return result.rowCount > 0;
    }
  });
}

export function createPostgresDeliveryStore({ pool } = {}) {
  requirePool(pool);
  return Object.freeze({
    async recordAttempt(attempt) {
      await pool.query(`INSERT INTO party_runtime.delivery_attempts (delivery_attempt_id, party_id, attempt)
        VALUES ($1, $2, $3::jsonb)
        ON CONFLICT (delivery_attempt_id) DO UPDATE SET attempt = EXCLUDED.attempt`, [attempt.delivery_attempt_id, attempt.party_id, JSON.stringify(attempt)]);
      return structuredClone(attempt);
    },
    async commitAcknowledgement(result) {
      await pool.query(`INSERT INTO party_runtime.delivery_acknowledgements (message_id, party_id, result, acknowledged_at)
        VALUES ($1, $2, $3::jsonb, $4::timestamptz)
        ON CONFLICT (message_id) DO UPDATE SET result = EXCLUDED.result, acknowledged_at = EXCLUDED.acknowledged_at`, [result.message_id, result.party_id, JSON.stringify(result), result.acknowledgement?.acknowledged_at ?? new Date().toISOString()]);
      return structuredClone(result);
    }
  });
}

function requirePool(pool) { if (!pool || typeof pool.query !== 'function') throw new TypeError('PostgreSQL pool is required.'); }
function key(value) { const id = String(value ?? '').trim(); if (!id) throw new TypeError('partyId is required.'); return id; }
