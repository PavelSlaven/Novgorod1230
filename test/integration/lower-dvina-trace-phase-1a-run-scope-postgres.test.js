import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { MATERIALIZER_VERSION, RNG_VERSION } from '@rus/materialization';
import { createLowerDvinaTracePhase1ARepository } from
  '@rus/party-store/internal/lower-dvina-trace-phase-1a';
import {
  createLowerDvinaTracePhase1APostcommitProjector,
  loadLowerDvinaTraceMaterializationBundle,
  materializeLowerDvinaTraceParty
} from '../../apps/game-server/src/internal/lower-dvina-trace-phase-1a.js';
import { createPostgresStage25Ports } from
  '../../apps/game-server/src/infrastructure/postgres/stage25.js';
import { runPartyRuntimeCatalogMigration } from
  '../../tools/runtime-catalog-activation/src/forward-migrations.js';
import { lowerDvinaTracePhase1ADomainPin } from
  '../fixtures/lower-dvina-trace-phase-1a-domain-pin.mjs';
import { createPostgresTestBackend } from '../fixtures/postgres-test-backend.js';

test('Phase 1A rehydration scopes normalized rows to its baseline run', async (t) => {
  const backend = await createPostgresTestBackend('phase1a_run_scope');
  if (!backend) return t.skip('PostgreSQL test backend unavailable');
  const pool = new pg.Pool({ connectionString: backend.partyUrl, max: 4 });
  t.after(async () => {
    await pool.end();
    await backend.close();
  });
  await installPartySchema(pool);

  const bundle = await loadLowerDvinaTraceMaterializationBundle();
  const domainCatalogPin = lowerDvinaTracePhase1ADomainPin(bundle);
  const repository = createLowerDvinaTracePhase1ARepository({ query: pool.query.bind(pool) });
  const ports = createPostgresStage25Ports({ pool,
    postcommitProjector: createLowerDvinaTracePhase1APostcommitProjector({ repository }) });
  const partyId = 'phase1a-run-scope-party';
  const request = {
    party_id: partyId,
    scenario_id: 'lower_dvina_trace_v1',
    scenario_definition_revision: 7,
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
  const committed = await materializeLowerDvinaTraceParty({
    request,
    domainCatalogPinLoader: async () => domainCatalogPin,
    partyDatabaseSchema: await readSchemaSnapshot(pool),
    worldBaseReferenceSnapshot: worldSnapshot(),
    repository,
    stage25Ports: ports
  });
  assert.equal(committed.status, 'committed');
  const baseline = await repository.loadInternal(partyId);
  assert.ok(baseline);

  const baselineRun = (await pool.query(
    `SELECT run_id,g4_id,seed_digest,input_digest,catalog_digest,
            materializer_version,rng_version,result_digest
       FROM party_runtime.party_materialization_runs
      WHERE party_id=$1 AND run_kind='baseline' AND status='committed'`, [partyId]
  )).rows[0];
  const baselineAnchorId = baseline.position.g5_anchor_id;
  const expansionRunId = 'test-expansion-run';
  await pool.query(
    `INSERT INTO party_runtime.party_materialization_runs
      (party_id,run_id,g4_id,run_kind,occurrence,seed_digest,input_digest,
       catalog_digest,materializer_version,rng_version,result_digest,idempotency_key,
       status,created_refs)
     VALUES ($1,$2,$3,'expansion',1,$4,$5,$6,$7,$8,$9,$10,'committed',$11::jsonb)`,
    [partyId, expansionRunId, baselineRun.g4_id, baselineRun.seed_digest,
      baselineRun.input_digest, baselineRun.catalog_digest, baselineRun.materializer_version,
      baselineRun.rng_version, baselineRun.result_digest, `idempotency-${expansionRunId}`,
      JSON.stringify([
        { table: 'party_g5_nodes', id: 'foreign-expansion-node' },
        { table: 'party_items', id: 'foreign-expansion-item' }
      ])]
  );
  await pool.query(
    `INSERT INTO party_runtime.party_g5_nodes
      (party_id,g5_node_id,run_id,parent_g4_id,template_id,slot_key,state)
     VALUES ($1,'foreign-expansion-node',$2,$3,'foreign-template','foreign-slot','{}'::jsonb)`,
    [partyId, expansionRunId, baselineRun.g4_id]
  );
  await pool.query(
    `INSERT INTO party_runtime.party_g5_anchors
      (party_id,anchor_id,g5_node_id,template_id,slot_key,state)
     VALUES ($1,'foreign-expansion-anchor','foreign-expansion-node',
             'foreign-anchor-template','foreign-anchor-slot','{}'::jsonb)`,
    [partyId]
  );
  await pool.query(
    `INSERT INTO party_runtime.party_items
      (party_id,item_id,run_id,template_id,profile_id,category_id,quantity,
       condition_state,legal_status,state)
     VALUES ($1,'foreign-expansion-item',$2,'foreign-template','foreign-profile',
             'foreign-category',1,'intact','ordinary','{}'::jsonb)`,
    [partyId, expansionRunId]
  );
  await pool.query(
    `INSERT INTO party_runtime.party_item_placements
      (party_id,item_id,anchor_id)
     VALUES ($1,'foreign-expansion-item',$2)`, [partyId, baselineAnchorId]
  );
  await pool.query(
    `INSERT INTO party_runtime.party_ownership
      (party_id,ownership_id,item_id,owner_party,claim_state)
     VALUES ($1,'foreign-expansion-item-ownership','foreign-expansion-item',true,'unclaimed')`,
    [partyId]
  );

  let expansionState;
  let expansionLoadError;
  try {
    expansionState = await repository.loadInternal(partyId);
  } catch (error) {
    expansionLoadError = error;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE party_runtime.party_g5_nodes
          SET slot_key='corrupted-baseline-slot'
        WHERE party_id=$1 AND run_id=$2`, [partyId, baselineRun.run_id]
    );
    const baselineReader = createLowerDvinaTracePhase1ARepository({
      query: client.query.bind(client)
    });
    await assert.rejects(() => baselineReader.loadInternal(partyId), {
      code: 'LOWER_DVINA_TRACE_REHYDRATE_INCOMPLETE'
    }, 'corruption in baseline-owned row must still fail closed');
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
  assert.equal(expansionLoadError, undefined,
    'committed expansion-owned rows must not break baseline rehydration');
  assert.deepEqual(expansionState, baseline);
});

async function installPartySchema(pool) {
  const files = (await readdir('schemas/party-db'))
    .filter((file) => /^\d+.*\.sql$/u.test(file)).sort();
  const catalogMigrationIndex = files.findIndex((file) => file.startsWith('012_'));
  assert.equal(catalogMigrationIndex, 11);
  for (const file of files.slice(0, catalogMigrationIndex)) {
    await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  }
  assert.equal((await runPartyRuntimeCatalogMigration(pool)).status, 'applied');
  for (const file of files.slice(catalogMigrationIndex)) {
    await pool.query(await readFile(`schemas/party-db/${file}`, 'utf8'));
  }
}

async function readSchemaSnapshot(pool) {
  const tableNames = [
    'parties', 'party_catalog_pins', 'party_v3_change_sets',
    'party_materialization_runs', 'party_materialization_run_catalog_pins',
    'party_materialization_choices', 'party_g5_nodes', 'party_g5_anchors',
    'party_npcs', 'party_positions', 'party_player_characters',
    'party_actor_profile_bindings', 'party_actor_body_states',
    'party_actor_active_conditions', 'party_items', 'party_item_placements',
    'party_ownership', 'party_clocks', 'party_state_snapshots'
  ];
  const { rows } = await pool.query(
    `SELECT table_name,column_name,data_type,is_nullable,column_default
       FROM information_schema.columns
      WHERE table_schema='party_runtime' AND table_name=ANY($1::text[])
      ORDER BY table_name,ordinal_position`, [tableNames]
  );
  return {
    version: 1, schema: 'party_database_schema_snapshot',
    schema_version: 'party_runtime_v2',
    readonly_checksum: 'postgres-information-schema-phase-1a',
    tables: tableNames.map((name) => ({
      name, allowed_operations: ['insert_only'],
      columns: rows.filter((row) => row.table_name === name).map((row) => ({
        name: row.column_name, data_type: row.data_type,
        nullable: row.is_nullable === 'YES', default: row.column_default
      }))
    })),
    columns: [], foreign_keys: [], unique_constraints: [], check_constraints: [],
    enum_definitions: [], indexes: [], allowed_operations: ['insert_only']
  };
}

function worldSnapshot() {
  return {
    version: 1, schema: 'world_base_reference_snapshot',
    readonly_checksum: 'phase-1a-world-pin',
    allowed_region_ids: [], allowed_graph_node_ids: [], allowed_graph_edge_ids: [],
    allowed_place_template_ids: [], allowed_npc_candidate_ids: [],
    allowed_item_profile_ids: [], allowed_container_profile_ids: [],
    allowed_property_rule_ids: [], allowed_source_ids: []
  };
}
