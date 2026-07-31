import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import {
  createFirstPlayablePublicRuntime
} from '../../apps/game-server/src/runtime/first-playable-public-runtime.js';
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
  loadLowerDvinaTraceMaterializationBundle
} from '../../apps/game-server/src/internal/lower-dvina-trace-phase-1a.js';
import {
  lowerDvinaTracePhase1ADomainPin
} from '../fixtures/lower-dvina-trace-phase-1a-domain-pin.mjs';
import {
  runPartyRuntimeCatalogMigration
} from '../../tools/runtime-catalog-activation/src/forward-migrations.js';

const docker = (args) => spawnSync(
  'docker',
  args,
  { encoding: 'utf8', timeout: 45_000 }
);
const productionWorld = Object.freeze({
  revision:
    'novgorod_spatial_v3_production_v3_candidate_001',
  digest:
    '1cf914ed9a19801f94b8b1463a717dbb0be7f1d51ea2351e6d1d5a51c492215e'
});

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
    '-e', 'POSTGRES_DB=phase1b',
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
    database: 'phase1b',
    max: 8
  });
  await pool.query('SELECT 1');
  const partyFiles = (await readdir('schemas/party-db'))
    .filter((value) => /^\d+.*\.sql$/u.test(value)).sort();
  for (const file of partyFiles.filter((value) =>
    !value.startsWith('012_') && !value.startsWith('013_')
      && !value.startsWith('014_'))) {
    await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  }
  assert.equal(
    (await runPartyRuntimeCatalogMigration(pool)).status,
    'applied'
  );
  await pool.query(await readFile(
    'schemas/party-db/012_party_runtime_external_ownership.sql',
    'utf8'
  ));
  await pool.query(await readFile(
    'schemas/party-db/013_party_runtime_obligations.sql',
    'utf8'
  ));
  await pool.query(await readFile(
    'schemas/party-db/014_party_runtime_activity_resume_terminal.sql',
    'utf8'
  ));
  await installWorldLineage(pool);
  const schemaSnapshot = await readPartyDatabaseSchemaSnapshot(pool);
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

  const bundle = await loadLowerDvinaTraceMaterializationBundle();
  const sourcePin = lowerDvinaTracePhase1ADomainPin(bundle);
  const runtimeCatalogPin = Object.freeze({
    ...sourcePin,
    compatible_world_revision_id: productionWorld.revision,
    compatible_world_catalog_digest: productionWorld.digest,
    compatible_world_pin_manifest_digest:
      '593ccb341084f7433ec4ae9d7d0b2ea8b1dea07833636ef385550ba5a295ecea'
  });
  const release = Object.freeze({
    release_id: 'phase-1b-postgres-release',
    world_revision_id: productionWorld.revision,
    world_catalog_digest: productionWorld.digest,
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
      runtime: createFirstPlayablePublicRuntime({
        partyPool: pool,
        committer: { commit: async () => ({ ok: true }) },
        release,
        runtimeCatalogPin,
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
  assert.deepEqual(
    catalog.data.scenarios.map(({ scenario_id: id }) => id),
    [
      'lower_dvina_late_summer_open_water_v1',
      'lower_dvina_trace_v1'
    ]
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

  const legacyInput = {
    start_text: 'Начать старую партию',
    player_name: 'Старый путник',
    request_id: 'phase-1b-legacy-start-text'
  };
  const legacyStarted =
    await restarted.runtime.startNewGame(legacyInput);
  const legacySnapshot = (await pool.query(
    `SELECT state_payload
       FROM party_runtime.party_state_snapshots
      WHERE party_id=$1 AND state_version=0`,
    [legacyStarted.party_id]
  )).rows[0].state_payload;
  delete legacySnapshot.creation_identity;
  await pool.query(
    `UPDATE party_runtime.party_state_snapshots
        SET state_payload=$2::jsonb,state_digest=$3
      WHERE party_id=$1 AND state_version=0`,
    [
      legacyStarted.party_id,
      JSON.stringify(legacySnapshot),
      createHash('sha256')
        .update(JSON.stringify(legacySnapshot))
        .digest('hex')
    ]
  );
  const legacyBeforeReplay = (await pool.query(
    `SELECT updated_at
       FROM party_runtime.party_server_sessions
      WHERE party_id=$1`,
    [legacyStarted.party_id]
  )).rows[0];
  const legacyRunCount = await count(
    pool,
    'party_runtime.party_materialization_runs',
    legacyStarted.party_id
  );
  const legacyReplayed =
    await restarted.runtime.startNewGame(legacyInput);
  assert.equal(legacyReplayed.party_id, legacyStarted.party_id);
  assert.deepEqual(legacyReplayed.screen, legacyStarted.screen);
  assert.equal(
    await count(pool, 'party_runtime.party_materialization_runs',
      legacyStarted.party_id),
    legacyRunCount
  );
  assert.equal(
    await count(pool, 'party_runtime.party_server_sessions',
      legacyStarted.party_id),
    1
  );
  assert.equal(
    (await pool.query(
      `SELECT updated_at
         FROM party_runtime.party_server_sessions
        WHERE party_id=$1`,
      [legacyStarted.party_id]
    )).rows[0].updated_at.toISOString(),
    legacyBeforeReplay.updated_at.toISOString()
  );
  await assert.rejects(
    () => restarted.runtime.startNewGame({
      scenario_id: 'lower_dvina_late_summer_open_water_v1',
      request_id: legacyInput.request_id
    }),
    { code: 'NEW_GAME_CREATION_IDENTITY_CONFLICT' }
  );
  await assert.rejects(
    () => restarted.runtime.startNewGame({
      ...legacyInput,
      player_name: 'Другой старый путник'
    }),
    { code: 'NEW_GAME_CREATION_IDENTITY_CONFLICT' }
  );

  for (const [firstScenario, secondScenario] of [
    [
      'lower_dvina_trace_v1',
      'lower_dvina_late_summer_open_water_v1'
    ],
    [
      'lower_dvina_late_summer_open_water_v1',
      'lower_dvina_trace_v1'
    ]
  ]) {
    const requestId = `phase-1b-cross-${firstScenario}`;
    const firstParty = await restarted.runtime.startNewGame({
      scenario_id: firstScenario,
      request_id: requestId
    });
    const exactReplay = await restarted.runtime.startNewGame({
      scenario_id: firstScenario,
      request_id: requestId
    });
    assert.deepEqual(exactReplay.screen, firstParty.screen);
    await assert.rejects(
      () => restarted.runtime.startNewGame({
        scenario_id: secondScenario,
        request_id: requestId
      }),
      { code: 'NEW_GAME_CREATION_IDENTITY_CONFLICT' }
    );
    assert.equal(
      await count(pool, 'party_runtime.parties', firstParty.party_id),
      1
    );
  }
});

async function installWorldLineage(pool) {
  await pool.query('CREATE SCHEMA IF NOT EXISTS world_base');
  await pool.query(`
    CREATE TABLE world_base.spatial_v3_world_revisions (
      id text PRIMARY KEY,
      parent_revision_id text REFERENCES world_base.spatial_v3_world_revisions(id),
      catalog_digest text NOT NULL,
      status text NOT NULL
    )`);
  await pool.query(
    `INSERT INTO world_base.spatial_v3_world_revisions
       (id,parent_revision_id,catalog_digest,status)
     VALUES
       ('novgorod_spatial_v3_target_contract_approval_001',NULL,
        '0ed3a9388930b0245fecdf6ec8adfa08d74d5fe88d5458bd452bee20de16fb1e','approved'),
       ('novgorod_spatial_v3_production_v2_candidate_001',
        'novgorod_spatial_v3_target_contract_approval_001',
        'fd75d9cb1ad0e949ff3b0bb5ef044e510f340a967f43867e9c4d41c16ba9f255','approved'),
       ('novgorod_spatial_v3_production_v3_candidate_001',
        'novgorod_spatial_v3_production_v2_candidate_001',
        '1cf914ed9a19801f94b8b1463a717dbb0be7f1d51ea2351e6d1d5a51c492215e','approved')`
  );
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
      'exec', name, 'pg_isready', '-U', 'phase1b', '-d', 'phase1b'
    ]).status === 0) return;
  }
  assert.fail('PostgreSQL container did not become ready');
}
