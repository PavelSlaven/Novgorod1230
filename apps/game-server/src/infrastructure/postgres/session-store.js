export function createPostgresSessionStore({ pool, verifyPartyCatalogPin = null } = {}) {
  requirePool(pool);
  if (verifyPartyCatalogPin != null && typeof verifyPartyCatalogPin !== 'function') {
    throw new TypeError('verifyPartyCatalogPin must be a function when provided.');
  }
  return Object.freeze({
    async load(partyId) {
      const id = key(partyId);
      const { rows } = await pool.query(`SELECT p.schema_version, s.request_id, s.stage26_result, s.delivery_attempt,
          s.delivery_ack_result, s.screen, s.turn_number, s.last_turn_id, s.updated_at
        FROM party_runtime.parties p
        LEFT JOIN party_runtime.party_server_sessions s ON s.party_id = p.party_id
        WHERE p.party_id = $1`, [id]);
      if (rows.length === 0) return null;
      if (Number(rows[0].schema_version) !== 2) throw storeError('LEGACY_PARTY_RUNTIME_REJECTED', `Party ${id} is not party_runtime_v2.`);
      await verifyPartyCatalogPin?.(id);
      if (rows[0].request_id == null) return null;
      return structuredClone({ version: 2, schema: 'game_server_session_v2', party_id: id, request_id: rows[0].request_id, stage26_result: rows[0].stage26_result, delivery_attempt: rows[0].delivery_attempt, delivery_ack_result: rows[0].delivery_ack_result, screen: rows[0].screen, turn_number: Number(rows[0].turn_number), last_turn_id: rows[0].last_turn_id, updated_at: rows[0].updated_at instanceof Date ? rows[0].updated_at.toISOString() : rows[0].updated_at });
    },
    async save(partyId, value) {
      const id = key(partyId);
      if (value?.party_id !== id || !value.request_id || !value.screen || !Number.isInteger(value.turn_number) || value.turn_number < 0) throw storeError('PARTY_SERVER_SESSION_INVALID', 'Normalized v2 server session fields are incomplete.');
      const version = await pool.query('SELECT schema_version FROM party_runtime.parties WHERE party_id = $1', [id]);
      if (version.rows.length === 0) throw storeError('PARTY_RUNTIME_V2_NOT_COMMITTED', `Party ${id} must be committed by Stage 25 before server session save.`);
      if (Number(version.rows[0].schema_version) !== 2) throw storeError('LEGACY_PARTY_RUNTIME_REJECTED', `Party ${id} is not party_runtime_v2.`);
      await pool.query(`INSERT INTO party_runtime.party_server_sessions
        (party_id, request_id, stage26_result, delivery_attempt, delivery_ack_result, screen, turn_number, last_turn_id, updated_at)
        VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, NOW())
        ON CONFLICT (party_id) DO UPDATE SET request_id = EXCLUDED.request_id, stage26_result = EXCLUDED.stage26_result,
          delivery_attempt = EXCLUDED.delivery_attempt, delivery_ack_result = EXCLUDED.delivery_ack_result,
          screen = EXCLUDED.screen, turn_number = EXCLUDED.turn_number, last_turn_id = EXCLUDED.last_turn_id, updated_at = NOW()`,
      [id, value.request_id, json(value.stage26_result), json(value.delivery_attempt), json(value.delivery_ack_result), json(value.screen), value.turn_number, value.last_turn_id ?? null]);
      return structuredClone({ ...value, version: 2, schema: 'game_server_session_v2' });
    },
    async delete(partyId) {
      const result = await pool.query('DELETE FROM party_runtime.party_server_sessions WHERE party_id = $1', [key(partyId)]);
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
function json(value) { return value == null ? null : JSON.stringify(value); }
function storeError(code, message) { return Object.assign(new Error(message), { code }); }
