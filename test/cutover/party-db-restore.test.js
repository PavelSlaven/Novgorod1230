import test from 'node:test';
import assert from 'node:assert/strict';
import { newDb, DataType } from 'pg-mem';
import {
  runPartyRuntimeMigrations,
  createPostgresSessionStore,
  createPostgresDeliveryStore
} from '@rus/game-server/production';

function createPool() {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({ name: 'current_database', returns: DataType.text, implementation: () => 'rus_restore' });
  db.public.registerFunction({ name: 'current_user', returns: DataType.text, implementation: () => 'rus_restore_user' });
  const { Pool } = db.adapters.createPg();
  return new Pool();
}

async function snapshotRuntime(pool) {
  const tables = ['game_sessions', 'delivery_attempts', 'delivery_acknowledgements', 'commit_idempotency'];
  const snapshot = {};
  for (const table of tables) {
    const { rows } = await pool.query(`SELECT * FROM party_runtime.${table}`);
    snapshot[table] = rows;
  }
  return snapshot;
}

async function restoreRuntime(pool, snapshot) {
  for (const row of snapshot.game_sessions) {
    await pool.query(
      'INSERT INTO party_runtime.game_sessions (party_id, session, updated_at) VALUES ($1, $2::jsonb, $3)',
      [row.party_id, JSON.stringify(row.session), row.updated_at]
    );
  }
  for (const row of snapshot.delivery_attempts) {
    await pool.query(
      'INSERT INTO party_runtime.delivery_attempts (delivery_attempt_id, party_id, attempt, created_at) VALUES ($1, $2, $3::jsonb, $4)',
      [row.delivery_attempt_id, row.party_id, JSON.stringify(row.attempt), row.created_at]
    );
  }
  for (const row of snapshot.delivery_acknowledgements) {
    await pool.query(
      'INSERT INTO party_runtime.delivery_acknowledgements (message_id, party_id, result, acknowledged_at) VALUES ($1, $2, $3::jsonb, $4)',
      [row.message_id, row.party_id, JSON.stringify(row.result), row.acknowledged_at]
    );
  }
  for (const row of snapshot.commit_idempotency) {
    await pool.query(
      `INSERT INTO party_runtime.commit_idempotency
       (idempotency_key, request_id, payload_hash, physical_plan_digest, status, committed_result, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [row.idempotency_key, row.request_id, row.payload_hash, row.physical_plan_digest, row.status,
        row.committed_result == null ? null : JSON.stringify(row.committed_result), row.updated_at]
    );
  }
}

test('party runtime snapshot restores sessions, delivery state, and idempotency records', async () => {
  const source = createPool();
  await runPartyRuntimeMigrations(source);
  const sessions = createPostgresSessionStore({ pool: source });
  const deliveries = createPostgresDeliveryStore({ pool: source });

  await sessions.save('party-restore-1', {
    version: 1,
    party_id: 'party-restore-1',
    turn_number: 3,
    screen: { schema: 'turn_screen', version: 1 }
  });
  await deliveries.recordAttempt({
    delivery_attempt_id: 'delivery-restore-1',
    party_id: 'party-restore-1',
    message_id: 'message-restore-1'
  });
  await deliveries.commitAcknowledgement({
    message_id: 'message-restore-1',
    party_id: 'party-restore-1',
    acknowledgement: { acknowledged_at: '2026-07-12T12:00:00.000Z' }
  });
  await source.query(
    `INSERT INTO party_runtime.commit_idempotency
     (idempotency_key, request_id, payload_hash, physical_plan_digest, status, committed_result)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    ['idem-restore-1', 'request-restore-1', 'sha256:payload', 'sha256:plan', 'committed', JSON.stringify({ commit_status: 'committed' })]
  );

  const snapshot = await snapshotRuntime(source);
  const restored = createPool();
  await runPartyRuntimeMigrations(restored);
  await restoreRuntime(restored, snapshot);

  const restoredSessions = createPostgresSessionStore({ pool: restored });
  const session = await restoredSessions.load('party-restore-1');
  assert.equal(session.turn_number, 3);
  assert.equal(session.screen.schema, 'turn_screen');
  assert.equal((await restored.query('SELECT count(*)::int AS count FROM party_runtime.delivery_attempts')).rows[0].count, 1);
  assert.equal((await restored.query('SELECT count(*)::int AS count FROM party_runtime.delivery_acknowledgements')).rows[0].count, 1);
  const idempotency = await restored.query(
    'SELECT status, committed_result FROM party_runtime.commit_idempotency WHERE idempotency_key = $1',
    ['idem-restore-1']
  );
  assert.equal(idempotency.rows[0].status, 'committed');
  assert.equal(idempotency.rows[0].committed_result.commit_status, 'committed');

  await source.end();
  await restored.end();
});
