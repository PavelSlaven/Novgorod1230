import test from 'node:test';
import assert from 'node:assert/strict';
import { newDb, DataType } from 'pg-mem';
import {
  runPartyRuntimeMigrations,
  createPostgresSessionStore,
  createPostgresDeliveryStore
} from '@rus/game-server/production-v2-migration-source';

function createPool() {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({ name: 'current_database', returns: DataType.text, implementation: () => 'rus_restore' });
  db.public.registerFunction({ name: 'current_user', returns: DataType.text, implementation: () => 'rus_restore_user' });
  const { Pool } = db.adapters.createPg();
  return new Pool();
}

async function snapshotRuntime(pool) {
  const tables = ['parties', 'party_server_sessions', 'delivery_attempts', 'delivery_acknowledgements', 'commit_idempotency'];
  const snapshot = {};
  for (const table of tables) {
    const { rows } = await pool.query(`SELECT * FROM party_runtime.${table}`);
    snapshot[table] = rows;
  }
  return snapshot;
}

async function restoreRuntime(pool, snapshot) {
  for (const row of snapshot.parties) {
    await pool.query(
      `INSERT INTO party_runtime.parties
       (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest,state_version,status,created_at,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [row.party_id,row.schema_version,row.world_revision_id,row.world_catalog_digest,row.materializer_version,row.rng_version,row.command_catalog_digest,row.profile_bundle_digest,row.state_version,row.status,row.created_at,row.updated_at]
    );
  }
  for (const row of snapshot.party_server_sessions) {
    await pool.query(
      `INSERT INTO party_runtime.party_server_sessions
       (party_id,request_id,stage26_result,delivery_attempt,delivery_ack_result,screen,turn_number,last_turn_id,updated_at)
       VALUES ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8,$9)`,
      [row.party_id,row.request_id,JSON.stringify(row.stage26_result),JSON.stringify(row.delivery_attempt),JSON.stringify(row.delivery_ack_result),JSON.stringify(row.screen),row.turn_number,row.last_turn_id,row.updated_at]
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

  await source.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest,status)
    VALUES ('party-restore-1',2,'revision-1','catalog-1','code_materializer_v2','mulberry32_v1','commands-1','profiles-1','active')`);
  await sessions.save('party-restore-1', {
    version: 2,
    schema: 'game_server_session_v2',
    party_id: 'party-restore-1',
    request_id: 'request-restore-1',
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
