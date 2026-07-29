import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import pg from 'pg';
import { sha256 } from '@rus/kernel';
import {
  MATERIALIZER_VERSION,
  RNG_VERSION
} from '@rus/materialization';
import {
  createLowerDvinaTracePhase1ARepository
} from '@rus/party-store/internal/lower-dvina-trace-phase-1a';
import {
  createLowerDvinaTracePhase1APostcommitProjector,
  loadLowerDvinaTraceMaterializationBundle,
  materializeLowerDvinaTraceParty
} from '../../apps/game-server/src/internal/lower-dvina-trace-phase-1a.js';
import { createPostgresStage25Ports } from '../../apps/game-server/src/infrastructure/postgres/stage25.js';
import {
  loadPartyDomainPin
} from '../../apps/game-server/src/infrastructure/postgres/party-store-runtime-catalog.js';
import {
  lowerDvinaTracePhase1ADomainPin
} from '../fixtures/lower-dvina-trace-phase-1a-domain-pin.mjs';
import {
  runPartyRuntimeCatalogMigration
} from '../../tools/runtime-catalog-activation/src/forward-migrations.js';

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 45_000 });

test('Phase 1A commits atomically, replays, rehydrates and isolates hidden truth', async (t) => {
  if (docker(['version']).status !== 0) {
    t.skip('Docker is required for isolated Phase 1A PostgreSQL integration');
    return;
  }
  const name = `lower-dvina-phase-1a-${process.pid}`;
  let pool;
  t.after(async () => {
    if (pool) await pool.end();
    docker(['rm', '-f', name]);
  });
  const started = docker([
    'run', '-d', '--name', name, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=local_only',
    '-e', 'POSTGRES_USER=phase1a',
    '-e', 'POSTGRES_DB=phase1a',
    'postgres:16-alpine'
  ]);
  assert.equal(started.status, 0, started.stderr);
  await waitForPostgres(name);
  await new Promise((resolve) => setTimeout(resolve, 700));
  const port = Number(docker(['port', name, '5432']).stdout.match(/:(\d+)\s*$/u)?.[1]);
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'phase1a', password: 'local_only', database: 'phase1a', max: 6 });
  await pool.query('SELECT 1');
  for (const file of (await readdir('schemas/party-db')).filter((value) => /^\d+.*\.sql$/u.test(value)).sort()) {
    try {
      await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
    } catch (error) {
      error.message = `${file}: ${error.message}`;
      throw error;
    }
  }
  assert.equal((await runPartyRuntimeCatalogMigration(pool)).status, 'applied');
  const schema = await readSchemaSnapshot(pool);
  const world = worldSnapshot();
  const bundle = await loadLowerDvinaTraceMaterializationBundle();
  const domainCatalogPin = lowerDvinaTracePhase1ADomainPin(bundle);
  const domainCatalogPinLoader = async (identity) => {
    assert.deepEqual(identity, {
      catalog_scope: domainCatalogPin.catalog_scope,
      world_revision_id: domainCatalogPin.compatible_world_revision_id,
      world_catalog_digest: domainCatalogPin.compatible_world_catalog_digest
    });
    return domainCatalogPin;
  };

  const repository = createLowerDvinaTracePhase1ARepository({ query: pool.query.bind(pool) });
  const ports = createPostgresStage25Ports({
    pool,
    postcommitProjector: createLowerDvinaTracePhase1APostcommitProjector({ repository })
  });
  const request = phase1ARequest(bundle, 'trace-phase-1a-postgres');
  const [first, concurrentReplay] = await Promise.all([
    materializeLowerDvinaTraceParty({ request, domainCatalogPinLoader, partyDatabaseSchema: schema, worldBaseReferenceSnapshot: world, repository, stage25Ports: ports }),
    materializeLowerDvinaTraceParty({ request: structuredClone(request), domainCatalogPinLoader, partyDatabaseSchema: schema, worldBaseReferenceSnapshot: world, repository, stage25Ports: ports })
  ]);
  assert.equal(first.status, 'committed');
  assert.equal(concurrentReplay.status, 'replayed');
  assert.deepEqual(first.instance, concurrentReplay.instance);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM party_runtime.party_materialization_runs WHERE party_id=$1', [request.party_id])).rows[0].count, 1);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM party_runtime.party_player_characters WHERE party_id=$1', [request.party_id])).rows[0].count, 1);
  assert.equal(first.instance.player.dossier.identity.name, 'Микула');
  assert.equal(first.instance.hidden_truth.culprit_ref, 'zhdanko_storehouse_controller');
  assert.equal(first.instance.timestamp.whole_minutes, '333060');
  assert.deepEqual(
    await loadPartyDomainPin({ query: pool.query.bind(pool) }, request.party_id),
    domainCatalogPin
  );
  assert.equal((await pool.query(
    'SELECT count(*)::int AS count FROM party_runtime.party_materialization_run_catalog_pins WHERE party_id=$1',
    [request.party_id]
  )).rows[0].count, 1);

  const recreated = createLowerDvinaTracePhase1ARepository({ query: pool.query.bind(pool) });
  const rehydrated = await recreated.loadInternal(request.party_id);
  assert.equal(rehydrated.player.instance_id, first.instance.player.instance_id);
  assert.deepEqual(rehydrated.request_identity, first.instance.request_identity);
  assert.deepEqual(rehydrated.sealed_selections, first.instance.sealed_selections);
  assert.deepEqual(rehydrated.policy_profile_pins, first.instance.policy_profile_pins);
  assert.equal(rehydrated.hidden_truth.digest, first.instance.hidden_truth.digest);
  assert.equal(rehydrated.initial_snapshot_identity.state_digest, first.instance.initial_snapshot_identity.state_digest);
  const visible = await recreated.loadVisible(request.party_id);
  const visibleJson = JSON.stringify(visible);
  for (const forbidden of ['hidden_truth', 'culprit', 'motive', 'hidden_sequence', 'sealed_selections', 'lies_and_statements']) assert.doesNotMatch(visibleJson, new RegExp(forbidden, 'u'));

  const integrityClient = await pool.connect();
  try {
    await integrityClient.query('BEGIN');
    await integrityClient.query(
      'DELETE FROM party_runtime.party_actor_active_conditions WHERE party_id=$1',
      [request.party_id]
    );
    const incompleteRepository = createLowerDvinaTracePhase1ARepository({
      query: integrityClient.query.bind(integrityClient)
    });
    await assert.rejects(
      () => incompleteRepository.loadInternal(request.party_id),
      { code: 'LOWER_DVINA_TRACE_REHYDRATE_INCOMPLETE' }
    );
  } finally {
    await integrityClient.query('ROLLBACK');
    integrityClient.release();
  }

  for (const mutation of [
    {
      label: 'player dossier',
      sql: `UPDATE party_runtime.party_player_characters
               SET profile=jsonb_set(profile,'{identity,name}','"Подменённый профиль"'::jsonb)
             WHERE party_id=$1`
    },
    {
      label: 'player skills',
      sql: `UPDATE party_runtime.party_actor_profile_bindings
               SET skill_profile_snapshot=jsonb_set(skill_profile_snapshot,'{athletics,bonus}','99'::jsonb)
             WHERE party_id=$1 AND actor_kind='player_character'`
    },
    {
      label: 'body state',
      sql: `UPDATE party_runtime.party_actor_body_states
               SET health=health+1
             WHERE party_id=$1 AND actor_kind='player_character'`
    },
    {
      label: 'item/property state',
      sql: `UPDATE party_runtime.party_items
               SET quantity=quantity+1
             WHERE party_id=$1`
    },
    {
      label: 'spatial anchor',
      sql: `UPDATE party_runtime.party_g5_anchors
               SET item_capacity=item_capacity+1
             WHERE party_id=$1`
    },
    {
      label: 'party clock',
      sql: `UPDATE party_runtime.party_clocks
               SET whole_minutes=whole_minutes+1,
                   state_version=state_version+1
             WHERE party_id=$1`
    }
  ]) {
    await assertNormalizedMutationRejected(pool, request.party_id, mutation);
  }
  await assertSnapshotEnvelopeMutationRejected(pool, request.party_id);
  for (const mutation of [
    {
      label: 'run seed digest',
      sql: `UPDATE party_runtime.party_materialization_runs
               SET seed_digest=$2
             WHERE party_id=$1`,
      value: '0'.repeat(64)
    },
    {
      label: 'run trace',
      sql: `UPDATE party_runtime.party_materialization_runs
               SET trace=jsonb_set(trace,'{rng_draw_count}','999'::jsonb)
             WHERE party_id=$1`
    },
    {
      label: 'choice candidate set digest',
      sql: `UPDATE party_runtime.party_materialization_choices
               SET candidate_set_digest=$2
             WHERE party_id=$1 AND choice_ordinal=0`,
      value: '0'.repeat(64)
    },
    {
      label: 'choice candidate ids',
      sql: `UPDATE party_runtime.party_materialization_choices
               SET candidate_ids='["forged_candidate"]'::jsonb
             WHERE party_id=$1 AND choice_ordinal=0`
    },
    {
      label: 'choice rng draw',
      sql: `UPDATE party_runtime.party_materialization_choices
               SET rng_draw=rng_draw+1
             WHERE party_id=$1 AND choice_ordinal=0`
    }
  ]) {
    await assertNormalizedMutationRejected(pool, request.party_id, mutation);
  }

  for (const rejected of [
    {
      label: 'missing domain pin loader',
      loader: undefined,
      code: 'TRACE_PHASE_1A_DOMAIN_CATALOG_PIN_MISSING'
    },
    {
      label: 'forged domain pin',
      loader: async () => ({ ...domainCatalogPin, activation_event_id: '' }),
      code: 'TRACE_DOMAIN_CATALOG_PIN_INVALID'
    },
    {
      label: 'incompatible domain pin',
      loader: async () => ({ ...domainCatalogPin, compatible_world_revision_id: 'other-world' }),
      code: 'TRACE_DOMAIN_CATALOG_PIN_INVALID'
    }
  ]) {
    const rejectedRequest = phase1ARequest(bundle, `trace-phase-1a-${rejected.label.replaceAll(' ', '-')}`);
    await assert.rejects(
      () => materializeLowerDvinaTraceParty({
        request: rejectedRequest,
        domainCatalogPinLoader: rejected.loader,
        partyDatabaseSchema: schema,
        worldBaseReferenceSnapshot: world,
        repository,
        stage25Ports: ports
      }),
      { code: rejected.code },
      rejected.label
    );
    assert.equal((await pool.query(
      'SELECT count(*)::int AS count FROM party_runtime.parties WHERE party_id=$1',
      [rejectedRequest.party_id]
    )).rows[0].count, 0);
  }

  const replay = await materializeLowerDvinaTraceParty({
    request,
    domainCatalogPinLoader,
    partyDatabaseSchema: schema,
    worldBaseReferenceSnapshot: world,
    repository: recreated,
    stage25Ports: ports,
    rootDir: 'C:/definitely-not-a-scenario-fixture'
  });
  assert.equal(replay.status, 'replayed');
  assert.deepEqual(replay.instance, rehydrated);
  await assert.rejects(() => materializeLowerDvinaTraceParty({
    request: { ...request, seed_context: 'incompatible-seed' },
    domainCatalogPinLoader,
    partyDatabaseSchema: schema,
    worldBaseReferenceSnapshot: world,
    repository: recreated,
    stage25Ports: ports
  }), { code: 'TRACE_PHASE_1A_REPLAY_CONFLICT' });

  const postcommitRequest = phase1ARequest(bundle, 'trace-phase-1a-postcommit-recovery');
  const postcommitRepository = createLowerDvinaTracePhase1ARepository({ query: pool.query.bind(pool) });
  const postcommitBasePorts = createPostgresStage25Ports({
    pool,
    postcommitProjector: createLowerDvinaTracePhase1APostcommitProjector({ repository: postcommitRepository })
  });
  const postcommitFailurePorts = {
    ...postcommitBasePorts,
    postcommitReader: async () => {
      throw new Error('injected postcommit read failure');
    }
  };
  const recoveredCommit = await materializeLowerDvinaTraceParty({
    request: postcommitRequest,
    domainCatalogPinLoader,
    partyDatabaseSchema: schema,
    worldBaseReferenceSnapshot: world,
    repository: postcommitRepository,
    stage25Ports: postcommitFailurePorts
  });
  assert.equal(recoveredCommit.status, 'committed_recovered');
  assert.equal((await postcommitRepository.loadIdempotency(postcommitRequest.idempotency_key)).status, 'committed');
  assert.deepEqual(
    (await postcommitRepository.loadInternal(postcommitRequest.party_id)).request_identity,
    { ...postcommitRequest, domain_catalog_pin: domainCatalogPin }
  );

  const sharedKeyLeft = phase1ARequest(bundle, 'trace-phase-1a-key-left');
  const sharedKeyRight = phase1ARequest(bundle, 'trace-phase-1a-key-right');
  sharedKeyLeft.idempotency_key = 'trace-phase-1a-shared-idempotency-key';
  sharedKeyRight.idempotency_key = sharedKeyLeft.idempotency_key;
  const sharedRepository = createLowerDvinaTracePhase1ARepository({ query: pool.query.bind(pool) });
  const sharedPorts = createPostgresStage25Ports({
    pool,
    postcommitProjector: createLowerDvinaTracePhase1APostcommitProjector({ repository: sharedRepository })
  });
  const sharedResults = await Promise.allSettled([
    materializeLowerDvinaTraceParty({ request: sharedKeyLeft, domainCatalogPinLoader, partyDatabaseSchema: schema, worldBaseReferenceSnapshot: world, repository: sharedRepository, stage25Ports: sharedPorts }),
    materializeLowerDvinaTraceParty({ request: sharedKeyRight, domainCatalogPinLoader, partyDatabaseSchema: schema, worldBaseReferenceSnapshot: world, repository: sharedRepository, stage25Ports: sharedPorts })
  ]);
  assert.equal(sharedResults.filter((result) => result.status === 'fulfilled').length, 1);
  const sharedRejection = sharedResults.find((result) => result.status === 'rejected');
  assert.equal(sharedRejection.reason.code, 'TRACE_PHASE_1A_IDEMPOTENCY_CONFLICT');
  assert.equal((await pool.query(
    'SELECT count(*)::int AS count FROM party_runtime.parties WHERE party_id=ANY($1::text[])',
    [[sharedKeyLeft.party_id, sharedKeyRight.party_id]]
  )).rows[0].count, 1);

  const rollbackRequest = phase1ARequest(bundle, 'trace-phase-1a-rollback');
  const rollbackRepository = createLowerDvinaTracePhase1ARepository({ query: pool.query.bind(pool) });
  const rollbackBasePorts = createPostgresStage25Ports({
    pool,
    postcommitProjector: createLowerDvinaTracePhase1APostcommitProjector({ repository: rollbackRepository })
  });
  const rollbackPorts = {
    ...rollbackBasePorts,
    transactionExecutor: (input) => {
      const mutated = structuredClone(input);
      const bodyBatch = mutated.physical_write_plan.write_batches.find((batch) => batch.target_table === 'party_actor_body_states');
      bodyBatch.records[0].health = -1;
      return rollbackBasePorts.transactionExecutor(mutated);
    }
  };
  await assert.rejects(() => materializeLowerDvinaTraceParty({
    request: rollbackRequest,
    domainCatalogPinLoader,
    partyDatabaseSchema: schema,
    worldBaseReferenceSnapshot: world,
    repository: rollbackRepository,
    stage25Ports: rollbackPorts
  }), { code: 'TRACE_PHASE_1A_COMMIT_FAILED' });
  for (const table of [
    'parties',
    'party_catalog_pins',
    'party_materialization_runs',
    'party_materialization_run_catalog_pins',
    'party_materialization_choices',
    'party_player_characters',
    'party_g5_nodes',
    'party_items',
    'party_actor_body_states',
    'party_clocks',
    'party_state_snapshots'
  ]) {
    assert.equal((await pool.query(`SELECT count(*)::int AS count FROM party_runtime.${table} WHERE party_id=$1`, [rollbackRequest.party_id])).rows[0].count, 0, table);
  }
});

function phase1ARequest(bundle, partyId) {
  return {
    party_id: partyId,
    scenario_id: 'lower_dvina_trace_v1',
    scenario_definition_revision: 5,
    scenario_manifest_digest: bundle.manifest_digest,
    world_revision_id: bundle.location_topology_set.spatial_source_ref.world_revision_id,
    world_catalog_digest: bundle.location_topology_set.spatial_source_ref.world_revision_catalog_digest,
    materializer_version: MATERIALIZER_VERSION,
    rng_algorithm_id: RNG_VERSION,
    seed_context: 'lower_dvina_trace_phase_1a_mikula_v1',
    idempotency_key: `idempotency-${partyId}`,
    trigger: 'new_game',
    occurrence: 0,
    existing_party_state: { baseline_exists: false }
  };
}

async function assertNormalizedMutationRejected(pool, partyId, { label, sql, value }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const changed = await client.query(sql, value === undefined ? [partyId] : [partyId, value]);
    assert.ok(changed.rowCount > 0, `${label} mutation changed no rows`);
    const repository = createLowerDvinaTracePhase1ARepository({
      query: client.query.bind(client)
    });
    await assert.rejects(
      () => repository.loadInternal(partyId),
      { code: 'LOWER_DVINA_TRACE_REHYDRATE_INCOMPLETE' },
      `${label} mutation must fail closed`
    );
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

async function assertSnapshotEnvelopeMutationRejected(pool, partyId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const snapshot = (await client.query(
      `SELECT state_payload
         FROM party_runtime.party_state_snapshots
        WHERE party_id=$1 AND state_version=0`,
      [partyId]
    )).rows[0].state_payload;
    snapshot.immediate.body.values.health += 1;
    await client.query(
      `UPDATE party_runtime.party_state_snapshots
          SET state_payload=$2::jsonb,state_digest=$3
        WHERE party_id=$1 AND state_version=0`,
      [partyId, JSON.stringify(snapshot), sha256(snapshot)]
    );
    const repository = createLowerDvinaTracePhase1ARepository({
      query: client.query.bind(client)
    });
    await assert.rejects(
      () => repository.loadInternal(partyId),
      { code: 'LOWER_DVINA_TRACE_REHYDRATE_INCOMPLETE' },
      'covered materialization envelope mutation must fail closed'
    );
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

async function waitForPostgres(name) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (docker(['exec', name, 'pg_isready', '-U', 'phase1a', '-d', 'phase1a']).status === 0) return;
  }
  assert.fail('PostgreSQL container did not become ready');
}

async function readSchemaSnapshot(pool) {
  const tableNames = [
    'parties',
    'party_catalog_pins',
    'party_v3_change_sets',
    'party_materialization_runs',
    'party_materialization_run_catalog_pins',
    'party_materialization_choices',
    'party_g5_nodes',
    'party_g5_anchors',
    'party_positions',
    'party_player_characters',
    'party_actor_profile_bindings',
    'party_actor_body_states',
    'party_actor_active_conditions',
    'party_items',
    'party_item_placements',
    'party_ownership',
    'party_clocks',
    'party_state_snapshots'
  ];
  const { rows } = await pool.query(
    `SELECT table_name,column_name,data_type,is_nullable,column_default
       FROM information_schema.columns
      WHERE table_schema='party_runtime' AND table_name=ANY($1::text[])
      ORDER BY table_name,ordinal_position`,
    [tableNames]
  );
  return {
    version: 1,
    schema: 'party_database_schema_snapshot',
    schema_version: 'party_runtime_v2',
    readonly_checksum: 'postgres-information-schema-phase-1a',
    tables: tableNames.map((name) => ({
      name,
      allowed_operations: ['insert_only'],
      columns: rows.filter((row) => row.table_name === name).map((row) => ({
        name: row.column_name,
        data_type: row.data_type,
        nullable: row.is_nullable === 'YES',
        default: row.column_default
      }))
    })),
    columns: [],
    foreign_keys: [],
    unique_constraints: [],
    check_constraints: [],
    enum_definitions: [],
    indexes: [],
    allowed_operations: ['insert_only']
  };
}

function worldSnapshot() {
  return {
    version: 1,
    schema: 'world_base_reference_snapshot',
    readonly_checksum: 'phase-1a-world-pin',
    allowed_region_ids: [],
    allowed_graph_node_ids: [],
    allowed_graph_edge_ids: [],
    allowed_place_template_ids: [],
    allowed_npc_candidate_ids: [],
    allowed_item_profile_ids: [],
    allowed_container_profile_ids: [],
    allowed_property_rule_ids: [],
    allowed_source_ids: []
  };
}
