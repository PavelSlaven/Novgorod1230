import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { newDb, DataType } from 'pg-mem';
import {
  createPostgresPools,
  runPartyRuntimeMigrations,
  createPostgresSessionStore,
  createPostgresWorldBaseReader,
  createPostgresStage25Ports,
  createProductionLlmRoleRunner,
  createProductionCompositionRoot
} from '@rus/game-server/production';

function createMemoryPostgres() {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({ name: 'current_database', returns: DataType.text, implementation: () => 'rus_test' });
  db.public.registerFunction({ name: 'current_user', returns: DataType.text, implementation: () => 'rus_test_user' });
  const { Pool } = db.adapters.createPg();
  return { db, Pool };
}

async function createProviderServer(t) {
  const calls = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    calls.push({ url: request.url, authorization: request.headers.authorization, body: JSON.parse(body) });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }], usage: { total_tokens: 3 } }));
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  t.after(() => server.close());
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, calls };
}

test('production PostgreSQL adapters persist sessions, enforce world read-only, and execute Stage 25 transactions', async () => {
  const { Pool } = createMemoryPostgres();
  const pools = createPostgresPools({
    env: { RUS_WORLD_DATABASE_URL: 'postgres://memory', RUS_PARTY_DATABASE_URL: 'postgres://memory' },
    PoolClass: Pool
  });
  await runPartyRuntimeMigrations(pools.partyPool);
  await pools.worldPool.query('CREATE SCHEMA world_base');
  await pools.worldPool.query('CREATE TABLE world_base.integration_probe (id text primary key, title text not null)');
  await pools.worldPool.query("INSERT INTO world_base.integration_probe (id, title) VALUES ('probe-1', 'Новгород')");
  await pools.partyPool.query('CREATE TABLE party_state (id text primary key, status text not null, audit_state jsonb)');

  const sessions = createPostgresSessionStore({ pool: pools.partyPool });
  await sessions.save('party-1', { version: 1, party_id: 'party-1', screen: { schema: 'first_game_screen' } });
  assert.equal((await sessions.load('party-1')).party_id, 'party-1');

  const world = createPostgresWorldBaseReader({ pool: pools.worldPool });
  const read = await world.read('SELECT id, title FROM world_base.integration_probe WHERE id = $1', ['probe-1']);
  assert.equal(read.rows[0].title, 'Новгород');
  await assert.rejects(() => world.read("UPDATE world_base.integration_probe SET title = 'X'", []), /read-only/u);

  const ports = createPostgresStage25Ports({
    pool: pools.partyPool,
    postcommitProjector: async ({ input }) => ({ version: 1, schema: 'test_postcommit', request_id: input.request_id })
  });
  const physicalPlan = {
    transaction: { transaction_id: 'tx-1', write_order: ['state'] },
    write_batches: [{
      batch_id: 'state', target_table: 'party_state', operation_mode: 'upsert_with_idempotency',
      records: [{ id: 'party-1', status: 'active', audit_state: { current_phase: 'awaiting_player_input' } }]
    }]
  };
  const common = {
    request_id: 'req-1', physical_write_plan: physicalPlan, physical_write_plan_digest: 'sha256:plan',
    party_creation_context: { party_id: 'party-1', idempotency_key: 'idem-1', payload_hash: 'sha256:payload' }
  };
  const dryRun = await ports.dryRunExecutor(common);
  assert.equal(dryRun.pass, true);
  assert.equal(dryRun.rollback_completed, true);
  await pools.partyPool.query('DELETE FROM party_state'); // pg-mem does not model transaction rollback; live PostgreSQL does.
  const committed = await ports.transactionExecutor({ ...common, postconditions: [{ check: 'party_ready' }] });
  assert.equal(committed.commit_status, 'committed');
  assert.equal((await pools.partyPool.query("SELECT status FROM party_state WHERE id = 'party-1'")).rows[0].status, 'active');
  await pools.close();
});

test('production provider adapter uses role runtime transport and exact HTTP payload', async (t) => {
  const provider = await createProviderServer(t);
  const runner = createProductionLlmRoleRunner({
    env: { DEEPSEEK_API_KEY: 'test-key', DEEPSEEK_BASE_URL: provider.baseUrl, TURN_INTENT_ROUTER_MODEL: 'fixture-model' }
  });
  const result = await runner.run({
    scope: 'turn_runtime', role_id: 'intent_router', messages: [{ role: 'user', content: 'route' }], overrides: { maxTokens: 64 }
  });
  assert.deepEqual(result.output, { ok: true });
  assert.equal(provider.calls.length, 1);
  assert.equal(provider.calls[0].url, '/chat/completions');
  assert.equal(provider.calls[0].authorization, 'Bearer test-key');
  assert.equal(provider.calls[0].body.model, 'fixture-model');
  assert.equal(provider.calls[0].body.max_tokens, 64);
});

test('builtin production composition runs with PostgreSQL-backed session and delivery state', async (t) => {
  const { Pool } = createMemoryPostgres();
  const provider = await createProviderServer(t);
  const here = dirname(fileURLToPath(import.meta.url));
  const bindings = resolve(here, '../fixtures/runtime-bindings/production-bindings.js');
  const env = {
    RUS_WORLD_DATABASE_URL: 'postgres://memory',
    RUS_PARTY_DATABASE_URL: 'postgres://memory',
    RUS_RUNTIME_BINDINGS_MODULE: bindings,
    DEEPSEEK_API_KEY: 'test-key',
    DEEPSEEK_BASE_URL: provider.baseUrl
  };
  const root = await createProductionCompositionRoot({
    env,
    PoolClass: Pool,
    config: { runtimeBindingsModule: bindings, runMigrations: true, probeProvider: true },
    now: () => '2026-07-12T12:00:00.000Z'
  });
  t.after(() => root.close());
  const health = root.health();
  assert.equal(health.composition, 'production');
  assert.equal(health.dependencies.world_database.ok, true);
  assert.equal(health.dependencies.provider.ok, true);
  const started = await root.startNewGame({ start_text: 'Начать в Новгороде', request_id: 'req-prod-1' });
  assert.equal(started.screen.schema, 'first_game_screen');
  await root.acknowledgeOpening(started.party_id, { client_ack_id: 'ack-prod-1' });
  const turn = await root.submitTurn(started.party_id, { raw_text: 'Осматриваюсь' });
  assert.equal(turn.screen.schema, 'turn_screen');
  assert.equal((await root.getPartyScreen(started.party_id)).turn_number, 1);
});
