import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import {
  createLowerDvinaTracePublicRuntime
} from '../../apps/game-server/src/runtime/lower-dvina-trace-public-runtime.js';
import {
  createLowerDvinaTracePhase1BProductionAdapter,
  readPartyDatabaseSchemaSnapshot
} from '../../apps/game-server/src/infrastructure/postgres/lower-dvina-trace-phase-1b.js';
import {
  createFirstPlayablePartyRepository
} from '../../apps/game-server/src/infrastructure/postgres/first-playable/repository.js';
import {
  createHttpHandler
} from '../../apps/game-server/src/http/handler.js';
import {
  loadActiveRuntimeCatalogPin
} from '../../apps/game-server/src/infrastructure/postgres/runtime-catalog-pin-loader.js';
import {
  runPartyRuntimeCatalogMigration,
  runWorldRuntimeCatalogMigration
} from '../../tools/runtime-catalog-activation/src/forward-migrations.js';
import {
  applyFirstPlayableV2ActivationBundle,
  buildFirstPlayableV2ActivationBundle
} from '../../tools/runtime-catalog-activation/src/first-playable-v2-activation.js';
import {
  applyLowerDvinaBoundaryV3ActivationBundle,
  buildLowerDvinaBoundaryV3ActivationBundle
} from '../../tools/runtime-catalog-activation/src/lower-dvina-boundary-v3-activation.js';
import {
  applySpatialV3ProductionV12ActivationBundle,
  buildSpatialV3ProductionV12ActivationBundle
} from '../../tools/runtime-catalog-activation/src/spatial-v3-production-v12-activation.js';
import { buildLowerDvinaBoundaryV1ImportSql } from
  '../../tools/spatial-v3/lower-dvina-boundary-v1-importer.mjs';
import { buildLowerDvinaV2ImportSql } from
  '../../tools/spatial-v3/lower-dvina-v2-importer.mjs';
import { buildCharacterAppearanceV1ImportSql } from
  '../../tools/spatial-v3/character-appearance-v1-importer.mjs';
import { buildS1AuthoringV6ImportSql } from
  '../../tools/spatial-v3/s1-authoring-v5-importer.mjs';
import { TRACE_REVISION32_PHASE_1A_MANIFEST_DIGEST } from
  '../../apps/game-server/src/internal/lower-dvina-trace-revision-32-publication.js';

const docker = (args) => spawnSync(
  'docker',
  args,
  { encoding: 'utf8', timeout: 45_000 }
);
test('Phase 1B public HTTP start commits, attaches, acknowledges and restarts', async (t) => {
  if (docker(['version']).status !== 0) {
    t.skip('Docker is required for isolated Phase 1B PostgreSQL integration');
    return;
  }
  const name = `lower-dvina-phase-1b-${process.pid}`;
  let pool;
  let server;
  t.after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (pool) await pool.end();
    docker(['rm', '-f', name]);
  });
  const started = docker([
    'run', '-d', '--name', name, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=local_only',
    '-e', 'POSTGRES_USER=phase1b',
    '-e', 'POSTGRES_DB=pr17_phase1b',
    'postgres:16-alpine'
  ]);
  assert.equal(started.status, 0, started.stderr);
  await waitForPostgres(name);
  await new Promise((resolve) => setTimeout(resolve, 700));
  const port = Number(
    docker(['port', name, '5432']).stdout.match(/:(\d+)\s*$/u)?.[1]
  );
  pool = new pg.Pool({
    host: '127.0.0.1',
    port,
    user: 'phase1b',
    password: 'local_only',
    database: 'pr17_phase1b',
    max: 8
  });
  await pool.query('SELECT 1');
  const partyFiles = (await readdir('schemas/party-db'))
    .filter((value) => /^\d+.*\.sql$/u.test(value)).sort();
  const catalogMigrationIndex = partyFiles.findIndex((file) =>
    file.startsWith('012_')
  );
  assert.equal(catalogMigrationIndex, 11);
  for (const file of partyFiles.slice(0, catalogMigrationIndex)) {
    await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  }
  assert.equal(
    (await runPartyRuntimeCatalogMigration(pool)).status,
    'applied'
  );
  const runtimeCatalogPin = await installActivatedRuntimeCatalog({
    pool,
    databaseUrl: `postgresql://phase1b:local_only@127.0.0.1:${port}/pr17_phase1b`
  });
  for (const file of partyFiles.slice(catalogMigrationIndex)) {
    await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  }
  const schemaSnapshot = await readPartyDatabaseSchemaSnapshot(pool);
  assert.ok(schemaSnapshot.tables.some(
    ({ name }) => name === 'party_containers'
  ));
  assert.ok(schemaSnapshot.foreign_keys.length > 0);
  assert.ok(schemaSnapshot.unique_constraints.length > 0);
  assert.ok(schemaSnapshot.check_constraints.length > 0);
  assert.ok(schemaSnapshot.indexes.length > 0);
  assert.deepEqual(
    schemaSnapshot.check_constraints.find((constraint) =>
      constraint.name === 'parties_schema_version_check')
      ?.allowed_values,
    [2, 3]
  );
  const incompleteMetadataPool = {
    async query(sql, parameters) {
      const result = await pool.query(sql, parameters);
      if (String(sql).includes("con.contype='c'")) {
        return {
          ...result,
          rows: result.rows.filter((row) =>
            row.name !== 'parties_schema_version_check')
        };
      }
      return result;
    }
  };
  await assert.rejects(
    () => readPartyDatabaseSchemaSnapshot(incompleteMetadataPool),
    { code: 'TRACE_PHASE_1B_PARTY_SCHEMA_INCOMPLETE' }
  );

  const release = Object.freeze({
    release_id: 'phase-1b-postgres-release',
    world_revision_id: runtimeCatalogPin.compatible_world_revision_id,
    world_catalog_digest: runtimeCatalogPin.compatible_world_catalog_digest,
    compatible_world_pin_manifest_digest:
      runtimeCatalogPin.compatible_world_pin_manifest_digest
  });
  const makeRuntime = (partyRepository = null, {
    publicationLoader,
    adapterTransform
  } = {}) => {
    const adapter = createLowerDvinaTracePhase1BProductionAdapter({
      partyPool: pool,
      worldPool: pool,
      release,
      runtimeCatalogPin
    });
    const runtimeAdapter = adapterTransform
      ? adapterTransform(adapter)
      : adapter;
    return {
      runtime: createLowerDvinaTracePublicRuntime({
        partyPool: pool,
        committer: { commit: async () => ({ ok: true }) },
        release,
        runtimeCatalogPin,
        activePhase1AManifestDigest:
          TRACE_REVISION32_PHASE_1A_MANIFEST_DIGEST,
        activeScenarioDefinitionRevision: 32,
        traceStartAdapter: runtimeAdapter,
        partyRepository,
        publicationLoader
      }),
      adapter
    };
  };

  const first = makeRuntime();
  assert.throws(
    () => first.adapter.assertExecutionSupport({
      materializer_version: 'code_materializer_v3',
      rng_algorithm_id: 'future_rng_v2'
    }),
    { code: 'TRACE_PHASE_1B_EXECUTION_VERSION_UNSUPPORTED' }
  );
  server = createServer(createHttpHandler({
    root: first.runtime,
    maxBodyBytes: 1024 * 1024,
    developerMode: true
  }));
  await new Promise((resolve) =>
    server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const catalog = await api(base, '/api/v1/scenarios');
  const scenarioIds = catalog.data.scenarios.map(({ scenario_id: id }) => id);
  assert.deepEqual(
    scenarioIds,
    ['lower_dvina_trace_v1']
  );
  assert.equal(
    scenarioIds.includes('lower_dvina_late_summer_open_water_v1'),
    false
  );
  assert.equal(scenarioIds.includes('lower_dvina_trace_v1'), true);
  await assert.rejects(
    () => api(base, '/api/v1/new-games', {
      scenario_id: 'lower_dvina_late_summer_open_water_v1',
      request_id: 'phase-1b-legacy-public'
    }),
    { code: 'SCENARIO_NOT_SUPPORTED' }
  );
  const publicRequest = {
    scenario_id: 'lower_dvina_trace_v1',
    request_id: 'phase-1b-postgres-public'
  };
  const start = await api(base, '/api/v1/new-games', publicRequest);
  assert.equal(start.status, 201);
  assert.equal(start.data.screen.schema, 'first_game_screen');
  assert.equal(start.data.screen.panels.character.data.name, 'Микула');
  assert.deepEqual(start.data.screen.action_panel.suggested_actions, []);
  assertPublic(start);

  const partyId = start.data.party_id;
  const beforeRestart = await first.adapter.loadInternal(partyId);
  assert.equal(
    (await count(pool, 'party_runtime.parties', partyId)),
    1
  );
  assert.equal(
    (await count(pool, 'party_runtime.party_materialization_runs', partyId)),
    1
  );
  assert.equal(
    (await count(pool, 'party_runtime.party_server_sessions', partyId)),
    1
  );
  const ack = await api(
    base,
    `/api/v1/parties/${encodeURIComponent(partyId)}/opening-ack`,
    { client_ack_id: 'phase-1b-ack' }
  );
  assert.equal(ack.data.delivery_status, 'acknowledged');
  const persistedFirstAck = (await pool.query(
    `SELECT delivery_ack_result,updated_at
       FROM party_runtime.party_server_sessions
      WHERE party_id=$1`,
    [partyId]
  )).rows[0];
  const publicScreen = await api(
    base,
    `/api/v1/parties/${encodeURIComponent(partyId)}/screen`
  );
  assert.deepEqual(publicScreen.data.screen, start.data.screen);

  await new Promise((resolve) => server.close(resolve));
  server = null;
  const restarted = makeRuntime();
  const screen = await restarted.runtime.getPartyScreen(partyId);
  assert.deepEqual(screen.screen, start.data.screen);
  const afterRestart = await restarted.adapter.loadInternal(partyId);
  assert.deepEqual(afterRestart.request_identity, beforeRestart.request_identity);
  assert.deepEqual(afterRestart.sealed_selections, beforeRestart.sealed_selections);
  assert.deepEqual(afterRestart.timestamp, beforeRestart.timestamp);
  assert.deepEqual(
    afterRestart.environment_snapshot,
    beforeRestart.environment_snapshot
  );
  const repeatedAck =
    await restarted.runtime.acknowledgeOpening(partyId, {
      client_ack_id: 'phase-1b-ack'
    });
  assert.equal(repeatedAck.delivery_status, 'acknowledged');
  assert.equal(
    repeatedAck.acknowledged_at,
    ack.data.acknowledged_at
  );
  const persistedRepeatedAck = (await pool.query(
    `SELECT delivery_ack_result,updated_at
       FROM party_runtime.party_server_sessions
      WHERE party_id=$1`,
    [partyId]
  )).rows[0];
  assert.deepEqual(
    persistedRepeatedAck.delivery_ack_result,
    persistedFirstAck.delivery_ack_result
  );
  assert.equal(
    persistedRepeatedAck.updated_at.toISOString(),
    persistedFirstAck.updated_at.toISOString()
  );
  await assert.rejects(
    () => restarted.runtime.acknowledgeOpening(partyId, {
      client_ack_id: 'phase-1b-ack-conflict'
    }),
    { code: 'OPENING_ACK_IDENTITY_CONFLICT' }
  );
  const historicalReplay = makeRuntime(null, {
    publicationLoader: async () => {
      throw Object.assign(
        new Error('current publication changed'),
        { code: 'CURRENT_PUBLICATION_REVISION_CHANGED' }
      );
    },
    adapterTransform: (adapter) => Object.freeze({
      ...adapter,
      async materialize() {
        throw Object.assign(
          new Error('historical party must not rematerialize'),
          { code: 'HISTORICAL_PARTY_MUST_NOT_REMATERIALIZE' }
        );
      }
    })
  });
  const replayedStart =
    await historicalReplay.runtime.startNewGame(publicRequest);
  assert.deepEqual(replayedStart.screen, start.data.screen);
  assert.equal(
    await count(pool, 'party_runtime.party_materialization_runs', partyId),
    1
  );
  assert.equal(
    await count(pool, 'party_runtime.party_server_sessions', partyId),
    1
  );
  assert.equal(
    (await pool.query(
      `SELECT updated_at
         FROM party_runtime.party_server_sessions
        WHERE party_id=$1`,
      [partyId]
    )).rows[0].updated_at.toISOString(),
    persistedRepeatedAck.updated_at.toISOString()
  );
  await assert.rejects(
    () => restarted.runtime.submitTurn(partyId, {
      raw_text: 'Осматриваюсь'
    }),
    { code: 'TRACE_PHASE_2_DEPENDENCY_MISSING' }
  );
  assert.equal(
    (await pool.query(
      `SELECT turn_number,delivery_ack_result->>'client_ack_id' AS ack
         FROM party_runtime.party_server_sessions
        WHERE party_id=$1`,
      [partyId]
    )).rows[0].turn_number,
    0
  );

  const actualRepository =
    createFirstPlayablePartyRepository({ partyPool: pool });
  const existingSession = await actualRepository.loadSession(partyId);
  await assert.rejects(
    () => actualRepository.attachCommittedOpeningSession({
      partyId,
      requestId: 'incompatible-request',
      sessionIdentity: existingSession.stage26_result,
      deliveryAttempt: existingSession.delivery_attempt,
      screen: existingSession.screen
    }),
    { code: 'TRACE_PHASE_1B_SESSION_IDENTITY_CONFLICT' }
  );
  let attachFailures = 1;
  const recoveryRepository = Object.freeze({
    ...actualRepository,
    async attachCommittedOpeningSession(input) {
      if (attachFailures > 0) {
        attachFailures -= 1;
        throw Object.assign(new Error('simulated session outage'), {
          code: 'SIMULATED_SESSION_FAILURE'
        });
      }
      return actualRepository.attachCommittedOpeningSession(input);
    }
  });
  const recovery = makeRuntime(recoveryRepository);
  const recoveryRequest = {
    scenario_id: 'lower_dvina_trace_v1',
    request_id: 'phase-1b-session-recovery'
  };
  await assert.rejects(
    () => recovery.runtime.startNewGame(recoveryRequest),
    { code: 'SIMULATED_SESSION_FAILURE' }
  );
  const recovered = await recovery.runtime.startNewGame(recoveryRequest);
  assert.equal(recovered.screen.panels.character.data.name, 'Микула');
  assert.equal(
    await count(pool, 'party_runtime.party_materialization_runs',
      recovered.party_id),
    1
  );
  assert.equal(
    await count(pool, 'party_runtime.party_player_characters',
      recovered.party_id),
    1
  );
  assert.equal(
    await count(pool, 'party_runtime.party_server_sessions',
      recovered.party_id),
    1
  );

});

async function installActivatedRuntimeCatalog({ pool, databaseUrl }) {
  const lifecycle = spawnSync(
    process.execPath,
    ['scripts/run-pr17-item-container-stage3c.mjs', '--mode', 'lifecycle'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      timeout: 180_000,
      env: { ...process.env, PR17_TEST_DATABASE_URL: databaseUrl }
    }
  );
  assert.equal(lifecycle.status, 0, lifecycle.stderr);
  assert.equal(JSON.parse(lifecycle.stdout).pass, true);
  for (const file of ['18.sql', '19.sql', '20.sql']) {
    await pool.query(await readFile(`infra/world-base/schema/${file}`, 'utf8'));
  }
  await pool.query(await buildLowerDvinaV2ImportSql());
  assert.equal((await runWorldRuntimeCatalogMigration(pool)).status, 'applied');
  const commitSha = spawnSync('git', ['rev-parse', 'HEAD'], {
    encoding: 'utf8'
  }).stdout.trim();
  assert.match(commitSha, /^[a-f0-9]{40}$/u);
  const activation = async (build, apply) => {
    const bundle = await build({
      worldPool: pool,
      partyPool: pool,
      repositoryRoot: process.cwd(),
      gitCommitSha: commitSha,
      authorizationRef: 'Phase 1B PostgreSQL integration test'
    });
    await apply({ worldPool: pool, partyPool: pool, bundle });
  };
  await activation(
    buildFirstPlayableV2ActivationBundle,
    applyFirstPlayableV2ActivationBundle
  );
  await pool.query(await buildLowerDvinaBoundaryV1ImportSql());
  await activation(
    buildLowerDvinaBoundaryV3ActivationBundle,
    applyLowerDvinaBoundaryV3ActivationBundle
  );
  await pool.query(await readFile('infra/world-base/schema/21.sql', 'utf8'));
  await pool.query(await buildCharacterAppearanceV1ImportSql());
  await pool.query(await buildS1AuthoringV6ImportSql());
  await activation(
    buildSpatialV3ProductionV12ActivationBundle,
    applySpatialV3ProductionV12ActivationBundle
  );
  return loadActiveRuntimeCatalogPin(pool, 'item_container_materialization_v2');
}

async function api(base, path, body = null) {
  const response = await fetch(`${base}${path}`, body == null ? {} : {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const value = await response.json();
  if (!response.ok) {
    throw Object.assign(new Error(value.error?.message), {
      code: value.error?.code,
      status: response.status
    });
  }
  return { status: response.status, ...value };
}

function assertPublic(value) {
  const serialized = JSON.stringify(value);
  for (const forbidden of [
    'hidden_truth',
    'culprit',
    'motive',
    'hidden_sequence',
    'sealed_selections',
    'clue_placements',
    'lies_and_statements',
    'materialization_trace'
  ]) assert.doesNotMatch(serialized, new RegExp(forbidden, 'u'));
}

async function count(pool, table, partyId) {
  return (await pool.query(
    `SELECT count(*)::int AS count FROM ${table} WHERE party_id=$1`,
    [partyId]
  )).rows[0].count;
}

async function waitForPostgres(name) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (docker([
      'exec', name, 'pg_isready', '-U', 'phase1b', '-d', 'pr17_phase1b'
    ]).status === 0) return;
  }
  assert.fail('PostgreSQL container did not become ready');
}
