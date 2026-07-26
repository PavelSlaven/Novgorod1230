import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import registry from '../../data/runtime-catalog/item-container-record-registry.v1.json' with { type: 'json' };
import { createRuntimeCatalogLoader } from '@rus/runtime-catalog';
import {
  computeDependencyAssertionAuditDigest
} from '@rus/runtime-catalog/ledger-digests';
import {
  RUNTIME_CATALOG_CONTRACT_DIGEST
} from '@rus/runtime-catalog/runtime-contract';
import {
  PARTY_RUNTIME_CATALOG_MIGRATION,
  WORLD_RUNTIME_CATALOG_MIGRATION,
  runPartyRuntimeCatalogMigration,
  runWorldRuntimeCatalogMigration
} from '../../tools/runtime-catalog-activation/src/forward-migrations.js';
import {
  buildActivationRequest,
  buildBaseWorldCompatibilityManifest,
  buildBaselineRegistrationRequest,
  buildImportLedger,
  buildOperatorBaselineSnapshotManifest,
  buildPartyPreflight,
  digestEnvelope
} from '../../tools/runtime-catalog-activation/src/artifact-contracts.js';
import {
  activateApprovedCatalog,
  importApprovedCatalog,
  registerCatalogBaseline
} from '../../tools/runtime-catalog-activation/src/operator-executors.js';
import {
  compileOverlaySemanticPayload
} from '../../tools/runtime-catalog-activation/src/overlay-compiler.js';
import { makeStage24Fixture } from '../fixtures/stage24-fixtures.mjs';
import { buildPartyRuntimeV2WritePlan } from '@rus/new-game/stages/stage-24/compat';
import { materializeStage25PhysicalPlan } from '@rus/new-game/stages/stage-25/compat';
import {
  createPostgresPartyStore,
  createPostgresStage25Ports,
  createRuntimeCatalogCoordinator
} from '@rus/game-server/production-v2-migration-source';
import { materializeWorldInstances } from '@rus/materialization';

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 45_000 });

test('runtime catalog forward migrations are exact, additive, immutable and idempotent', async (t) => {
  if (docker(['version']).status !== 0) {
    t.skip('Docker is required for isolated runtime catalog migration test');
    return;
  }
  const name = `runtime-catalog-migrations-${process.pid}`;
  let pool;
  t.after(async () => {
    if (pool) await pool.end();
    docker(['rm', '-f', name]);
  });
  const started = docker([
    'run', '-d', '--name', name, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=local_only',
    '-e', 'POSTGRES_USER=runtime_migration',
    '-e', 'POSTGRES_DB=runtime_migration',
    'postgres:16-alpine'
  ]);
  assert.equal(started.status, 0, started.stderr);

  let ready = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    if (docker([
      'exec', name, 'pg_isready', '-U', 'runtime_migration', '-d', 'runtime_migration'
    ]).status === 0) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (docker([
        'exec', name, 'pg_isready', '-U', 'runtime_migration', '-d', 'runtime_migration'
      ]).status === 0) {
        ready = true;
        break;
      }
    }
  }
  assert.equal(ready, true);
  const portOutput = docker(['port', name, '5432']).stdout;
  const port = Number(portOutput.match(/:(\d+)\s*$/u)?.[1]);
  assert.ok(Number.isInteger(port));

  pool = new pg.Pool({
    host: '127.0.0.1',
    port,
    user: 'runtime_migration',
    password: 'local_only',
    database: 'runtime_migration',
    max: 2
  });

  const worldFiles = (await readdir(new URL('../../infra/world-base/schema/', import.meta.url)))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of worldFiles) {
    await pool.query(await readFile(
      new URL(`../../infra/world-base/schema/${file}`, import.meta.url),
      'utf8'
    ));
  }
  const partyFiles = (await readdir(new URL('../../schemas/party-db/', import.meta.url)))
    .filter((file) => /^\d+.*\.sql$/u.test(file))
    .sort();
  for (const file of partyFiles) {
    await pool.query(await readFile(
      new URL(`../../schemas/party-db/${file}`, import.meta.url),
      'utf8'
    ));
  }
  await pool.query(
    `INSERT INTO party_runtime.parties
       (party_id, schema_version, world_revision_id, world_catalog_digest,
        materializer_version, rng_version, command_catalog_digest, profile_bundle_digest)
     VALUES ('legacy-party', 2, 'legacy-world', $1, 'v2', 'v2', $1, $1)`,
    ['a'.repeat(64)]
  );

  const applied = await Promise.all([
    runWorldRuntimeCatalogMigration(pool),
    runPartyRuntimeCatalogMigration(pool)
  ]);
  assert.deepEqual(applied.map(({ status }) => status), ['applied', 'applied']);
  assert.equal(applied[0].schema_fingerprint, WORLD_RUNTIME_CATALOG_MIGRATION.target_schema_fingerprint);
  assert.equal(applied[1].schema_fingerprint, PARTY_RUNTIME_CATALOG_MIGRATION.target_schema_fingerprint);

  const repeated = await Promise.all([
    runWorldRuntimeCatalogMigration(pool),
    runPartyRuntimeCatalogMigration(pool)
  ]);
  assert.deepEqual(repeated.map(({ status }) => status), ['already_applied', 'already_applied']);
  await pool.query(
    'GRANT UPDATE ON world_base.catalog_imports TO runtime_catalog_importer'
  );
  await assert.rejects(
    () => runWorldRuntimeCatalogMigration(pool),
    (error) => error?.code === 'MIGRATION_SCHEMA_FINGERPRINT_UNKNOWN',
    'target security privilege drift must invalidate the exact fingerprint'
  );
  await pool.query(
    'REVOKE UPDATE ON world_base.catalog_imports FROM runtime_catalog_importer'
  );
  assert.equal(
    (await runWorldRuntimeCatalogMigration(pool)).status,
    'already_applied',
    'restoring the exact security state must restore target idempotency'
  );
  assert.equal((await pool.query(
    `SELECT
       (SELECT count(*)::int FROM world_base.schema_migrations)
       + (SELECT count(*)::int FROM party_runtime.schema_migrations) AS count`
  )).rows[0].count, 2);
  const privileges = (await pool.query(
    `SELECT
       has_table_privilege('world_reader',
         'world_base.runtime_catalog_activation_events','SELECT') AS runtime_select,
       has_table_privilege('runtime_catalog_importer',
         'world_base.quantity_unit_definitions','INSERT') AS importer_insert,
       has_table_privilege('runtime_catalog_importer',
         'world_base.catalog_imports','UPDATE') AS importer_update,
       has_table_privilege('runtime_catalog_activator',
         'world_base.runtime_catalog_activation_events','INSERT') AS activator_insert,
       has_table_privilege('runtime_catalog_activator',
         'world_base.runtime_catalog_activation_events','DELETE') AS activator_delete`
  )).rows[0];
  assert.deepEqual(privileges, {
    runtime_select: true,
    importer_insert: true,
    importer_update: false,
    activator_insert: true,
    activator_delete: false
  });
  assert.equal((await pool.query(
    'SELECT count(*)::int AS count FROM party_runtime.party_catalog_pins'
  )).rows[0].count, 0, 'migration must not backfill existing parties');

  await assert.rejects(
    () => pool.query(
      `UPDATE world_base.schema_migrations
       SET migration_digest = $1
       WHERE migration_id = $2`,
      ['f'.repeat(64), WORLD_RUNTIME_CATALOG_MIGRATION.migration_id]
    ),
    /append-only/u
  );
  await pool.query("DELETE FROM party_runtime.parties WHERE party_id = 'legacy-party'");
  const immutableClient = await pool.connect();
  try {
    await immutableClient.query('BEGIN');
    await immutableClient.query(
      `INSERT INTO party_runtime.parties
         (party_id,schema_version,world_revision_id,world_catalog_digest,
          materializer_version,rng_version,command_catalog_digest,profile_bundle_digest)
       VALUES ('immutable-party',2,'world-v1',$1,'v2','v2',$1,$1)`,
      ['a'.repeat(64)]
    );
    await immutableClient.query(
      `INSERT INTO party_runtime.party_catalog_pins
         (party_id, catalog_scope, catalog_revision_id, catalog_digest, import_id,
          import_audit_digest, record_registry_digest, runtime_contract_digest,
          compatible_world_revision_id, compatible_world_catalog_digest,
          compatible_world_pin_manifest_digest, activation_event_id)
       VALUES
         ('immutable-party', 'item_container_materialization_v2', 'catalog-v2', $1,
          'import-v2', $1, $1, $1, 'world-v1', $1, $1, 'activation-v2')`,
      ['a'.repeat(64)]
    );
    await assert.rejects(
      () => immutableClient.query(
        `UPDATE party_runtime.party_catalog_pins
         SET catalog_digest = $1
         WHERE party_id = 'immutable-party'`,
        ['f'.repeat(64)]
      ),
      /immutable/u
    );
  } finally {
    await immutableClient.query('ROLLBACK').catch(() => {});
    immutableClient.release();
  }

  await pool.query("INSERT INTO world_base.regions(id) VALUES ('novgorod-runtime-test')");
  for (let index = 0; index < 9; index += 1) {
    await pool.query(
      `INSERT INTO world_base.graph_nodes
         (id,region_id,node_type,scale_level,status)
       VALUES ($1,'novgorod-runtime-test','location','G4','approved')`,
      [`g4-runtime-${index}`]
    );
  }
  const graphRows = (await pool.query(
    "SELECT * FROM world_base.graph_nodes WHERE id LIKE 'g4-runtime-%' ORDER BY id"
  )).rows;
  const baselineManifest = buildOperatorBaselineSnapshotManifest({
    schemaFingerprint: WORLD_RUNTIME_CATALOG_MIGRATION.target_schema_fingerprint,
    registry,
    rowsByTable: { graph_nodes: graphRows }
  });
  const compatibilityManifest = buildBaseWorldCompatibilityManifest({
    compatibleWorldRevisionId: 'world-compatible-v1',
    compatibleWorldCatalogDigest: 'b'.repeat(64),
    sourceRuntimeConfigurationDigest: 'd'.repeat(64),
    sourceArtifactPaths: ['test/runtime-world-configuration.json'],
    sourceCommitSha: 'e'.repeat(40),
    validationContractVersion: 'base_world_compatibility_v1'
  });
  const compatibleWorldTuple = {
    compatible_world_revision_id: 'world-compatible-v1',
    compatible_world_catalog_digest: 'b'.repeat(64),
    compatible_world_pin_manifest_digest:
      compatibilityManifest.compatible_world_pin_manifest_digest
  };
  await pool.query(
    `INSERT INTO world_base.world_revisions
       (id,parent_revision_id,title,catalog_digest,status,approved_at)
     VALUES ($1,NULL,$2,$3,'approved',now())`,
    [
      compatibleWorldTuple.compatible_world_revision_id,
      'Compatible runtime world',
      compatibleWorldTuple.compatible_world_catalog_digest
    ]
  );
  const baselineRequest = buildBaselineRegistrationRequest({
    parentRevisionId: 'world-runtime-v1',
    parentCatalogDigest: baselineManifest.records_aggregate_digest,
    baselineManifest,
    compatibleWorldTuple
  });
  const baselineAttestationPayload = {
    schema: 'rus.baseline_registration_attestation.v2',
    registration_request_digest: baselineRequest.registration_request_digest,
    parent_tuple: {
      parent_revision_id: baselineRequest.parent_revision_id,
      parent_catalog_digest: baselineRequest.parent_catalog_digest,
      parent_snapshot_manifest_digest: baselineRequest.parent_snapshot_manifest_digest
    },
    compatible_world_tuple: compatibleWorldTuple,
    decision: 'approve_register_baseline',
    action: 'register_baseline',
    attested_by: 'runtime_migration'
  };
  const baselineAttestation = {
    ...baselineAttestationPayload,
    attestation_digest: digestEnvelope(baselineAttestationPayload)
  };
  const baselineRegistration = await registerCatalogBaseline({
    pool,
    request: baselineRequest,
    attestation: baselineAttestation,
    baselineManifest,
    compatibilityManifest,
    runtimeConfigurationTuple: {
      compatible_world_revision_id:
        compatibilityManifest.compatible_world_revision_id,
      compatible_world_catalog_digest:
        compatibilityManifest.compatible_world_catalog_digest,
      source_runtime_configuration_digest:
        compatibilityManifest.source_runtime_configuration_digest
    }
  });
  assert.equal(baselineRegistration.status, 'registered');

  const compiled = compileOverlaySemanticPayload({
    registry,
    parentTuple: {
      parent_revision_id: baselineRequest.parent_revision_id,
      parent_catalog_digest: baselineRequest.parent_catalog_digest,
      parent_snapshot_manifest_digest: baselineRequest.parent_snapshot_manifest_digest
    },
    compatibleWorldTuple,
    targetRevisionId: 'domain-runtime-v2',
    parentRowsByTable: { graph_nodes: graphRows },
    candidateRowsByTable: {
      quantity_unit_definitions: [{
        id: 'runtime-test-count',
        dimension: 'count',
        canonical_unit: 'piece',
        conversion_policy: { kind: 'identity' },
        status: 'approved'
      }]
    },
    dependencyLinks: [],
    g4Transitions: graphRows.map((row) => ({
      graph_node_id: row.id,
      asserted_status: 'approved',
      source_transition_semantic_digest: 'd'.repeat(64),
      historical_approval_basis_digest: 'e'.repeat(64)
    }))
  });
  const approvalRequestDigest = '1'.repeat(64);
  const overlayAttestationPayload = {
    schema: 'rus.item_container_overlay_approval_attestation.v2',
    approval_request_digest: approvalRequestDigest,
    decision: 'approve_overlay_import',
    activation_authorized: false,
    attested_by: 'runtime_migration'
  };
  const overlayAttestation = {
    ...overlayAttestationPayload,
    attestation_digest: digestEnvelope(overlayAttestationPayload)
  };
  const assertions = compiled.dependency_assertions.map((assertion) => {
    const enriched = {
      ...assertion,
      import_id: 'import-runtime-v2',
      overlay_approval_request_digest: approvalRequestDigest,
      overlay_approval_attestation_digest: overlayAttestation.attestation_digest
    };
    return {
      ...enriched,
      assertion_audit_digest: computeDependencyAssertionAuditDigest(enriched)
    };
  });
  const records = compiled.record_operations_by_table.flatMap(({ records }) =>
    records.map((record) => ({ ...record, import_id: 'import-runtime-v2' })));
  const tables = compiled.record_operations_by_table.map((table) => ({
    table_name: table.table_name,
    dependency_order: table.dependency_order,
    insert_count: table.insert_count,
    assert_existing_count: table.assert_existing_count,
    record_count: table.record_count,
    payload_digest: table.records_digest
  }));
  const ledger = buildImportLedger({
    importId: 'import-runtime-v2',
    rootFields: {
      catalog_scope: 'item_container_materialization_v2',
      parent_revision_id: baselineRequest.parent_revision_id,
      parent_catalog_digest: baselineRequest.parent_catalog_digest,
      parent_snapshot_manifest_digest: baselineRequest.parent_snapshot_manifest_digest,
      ...compatibleWorldTuple,
      target_revision_id: 'domain-runtime-v2',
      target_catalog_digest: compiled.target_catalog_digest,
      record_registry_digest: compiled.record_registry_digest,
      promotion_manifest_digest: '2'.repeat(64),
      approval_request_digest: approvalRequestDigest,
      approval_attestation_digest: overlayAttestation.attestation_digest,
      schema_migration_digest: WORLD_RUNTIME_CATALOG_MIGRATION.migration_digest
    },
    tables,
    records,
    dependencyAssertions: assertions,
    importedBy: 'runtime_migration'
  });
  const domainRevision = {
    parent_registration_id: baselineRegistration.registration_id,
    runtime_contract_digest: RUNTIME_CATALOG_CONTRACT_DIGEST
  };
  assert.equal((await importApprovedCatalog({
    pool,
    ledger,
    domainRevision,
    approvalAttestation: overlayAttestation
  })).status, 'applied');
  assert.equal((await importApprovedCatalog({
    pool,
    ledger,
    domainRevision,
    approvalAttestation: overlayAttestation
  })).status, 'already_applied');

  const preflight = buildPartyPreflight({
    partyCount: 0,
    pinnedPartyCount: 0,
    missingDomainPinCount: 0,
    inflightStage24Stage25Count: 0,
    runtimeReleaseId: '3'.repeat(64),
    runtimeContractDigest: RUNTIME_CATALOG_CONTRACT_DIGEST
  });
  const activationRequest = buildActivationRequest({
    fields: {
      parent_revision_id: baselineRequest.parent_revision_id,
      parent_catalog_digest: baselineRequest.parent_catalog_digest,
      parent_snapshot_manifest_digest: baselineRequest.parent_snapshot_manifest_digest,
      ...compatibleWorldTuple,
      target_revision_id: ledger.root.target_revision_id,
      target_catalog_digest: ledger.root.target_catalog_digest,
      record_registry_digest: ledger.root.record_registry_digest,
      runtime_contract_digest: RUNTIME_CATALOG_CONTRACT_DIGEST,
      import_id: ledger.root.import_id,
      import_audit_digest: ledger.root.import_audit_digest,
      promotion_manifest_digest: ledger.root.promotion_manifest_digest,
      approval_request_digest: ledger.root.approval_request_digest,
      approval_attestation_digest: ledger.root.approval_attestation_digest,
      expected_previous_event_id: null,
      runtime_release_id: '3'.repeat(64)
    },
    partyPreflight: preflight
  });
  const activationAttestationPayload = {
    schema: 'rus.runtime_catalog_activation_attestation.v2',
    activation_request_digest: activationRequest.activation_request_digest,
    catalog_scope: activationRequest.catalog_scope,
    target_revision_id: activationRequest.target_revision_id,
    target_catalog_digest: activationRequest.target_catalog_digest,
    import_id: activationRequest.import_id,
    import_audit_digest: activationRequest.import_audit_digest,
    runtime_contract_digest: activationRequest.runtime_contract_digest,
    runtime_release_id: activationRequest.runtime_release_id,
    decision: 'approve_activation',
    attested_by: 'runtime_migration'
  };
  const activationAttestation = {
    ...activationAttestationPayload,
    attestation_digest: digestEnvelope(activationAttestationPayload)
  };
  assert.equal((await activateApprovedCatalog({
    worldPool: pool,
    partyPool: pool,
    request: activationRequest,
    attestation: activationAttestation
  })).status, 'activated');
  assert.equal((await activateApprovedCatalog({
    worldPool: pool,
    partyPool: pool,
    request: activationRequest,
    attestation: activationAttestation
  })).status, 'already_active');

  const loader = createRuntimeCatalogLoader({
    worldBaseReader: { read: (sql, parameters) => pool.query(sql, parameters) },
    supportedRuntimeContractDigests: [RUNTIME_CATALOG_CONTRACT_DIGEST]
  });
  const activePin = await loader.loadActivePin({
    catalogScope: 'item_container_materialization_v2'
  });
  assert.equal(activePin.import_id, ledger.root.import_id);
  assert.equal((await loader.loadApprovedItemCatalog({ pin: activePin })).verified, true);

  const fixture = makeStage24Fixture();
  fixture.input.party_creation_context.party_id = 'party-runtime-catalog-v2';
  fixture.input.party_creation_context.idempotency_key = 'idem-runtime-catalog-v2';
  fixture.input.party_creation_context.version_pins.world_revision_id =
    compatibleWorldTuple.compatible_world_revision_id;
  fixture.input.party_creation_context.version_pins.world_catalog_digest =
    compatibleWorldTuple.compatible_world_catalog_digest;
  fixture.input.party_creation_context.domain_catalog_pin = activePin;
  fixture.input.approved_pipeline_outputs.g5_scene_graph.materialization_run.seed_context.party_id =
    fixture.input.party_creation_context.party_id;
  fixture.input.approved_pipeline_outputs.g5_scene_graph.materialization_run.world_revision_id =
    compatibleWorldTuple.compatible_world_revision_id;
  fixture.input.approved_pipeline_outputs.g5_scene_graph.materialization_run.catalog_digest =
    activePin.catalog_digest;
  const logicalPlan = buildPartyRuntimeV2WritePlan(fixture.input);
  const partyDatabaseSchema = {
    version: 1,
    schema: 'party_database_schema_snapshot',
    schema_version: 'party_runtime_v2',
    readonly_checksum: 'runtime-catalog-postgres-v2',
    allowed_operations: ['insert_only'],
    tables: logicalPlan.write_batches.map((batch) => ({
      name: batch.target_table,
      allowed_operations: ['insert_only'],
      columns: [...new Set(batch.records.flatMap((record) => Object.keys(record)))]
        .map((name) => ({ name, nullable: true }))
    })),
    foreign_keys: [],
    unique_constraints: [],
    check_constraints: [],
    enum_definitions: [],
    indexes: []
  };
  const physical = materializeStage25PhysicalPlan({
    logical_plan: logicalPlan,
    party_database_schema: partyDatabaseSchema,
    world_base_reference_snapshot: {}
  });
  const stage25 = createPostgresStage25Ports({
    pool,
    postcommitProjector: async () => ({})
  });
  const committed = await stage25.transactionExecutor({
    request_id: fixture.input.request_id,
    physical_write_plan: physical.physical_write_plan,
    physical_write_plan_digest: physical.physical_write_plan_digest,
    party_creation_context: {
      ...fixture.input.party_creation_context,
      payload_hash: 'runtime-catalog-stage25-payload'
    },
    postconditions: logicalPlan.postconditions
  });
  assert.equal(committed.pass, true, committed.rollback?.reason);
  assert.equal((await pool.query(
    `SELECT count(*)::int AS count
     FROM party_runtime.party_materialization_run_catalog_pins
     WHERE party_id = 'party-runtime-catalog-v2'`
  )).rows[0].count, 1);
  const coordinator = createRuntimeCatalogCoordinator({
    worldBaseReader: { read: (sql, parameters) => pool.query(sql, parameters) },
    partyPool: pool,
    supportedRuntimeContractDigests: [RUNTIME_CATALOG_CONTRACT_DIGEST]
  });
  const persisted = await coordinator.loadPartyContext({
    partyId: 'party-runtime-catalog-v2'
  });
  assert.equal(persisted.pin.activation_event_id, activePin.activation_event_id);
  assert.equal((await coordinator.assertMaterializationRunPin({
    partyId: 'party-runtime-catalog-v2',
    runId: fixture.input.approved_pipeline_outputs.g5_scene_graph.materialization_run.run_id,
    expectedPin: activePin
  })).pass, true);

  const applicable = {
    status: 'approved',
    world_revision_id: compatibleWorldTuple.compatible_world_revision_id,
    region_id: 'novgorod',
    valid_from_year: 1200,
    valid_to_year: 1300,
    allowed_seasons: ['spring']
  };
  const firstEntryCatalogBundle = {
    player_start_anchor_slot_key: 'entry',
    rules: [
      { ...applicable, rule_id: 'first-entry-node', slot_key: 'main', domain: 'g5_node', min_count: 1, max_count: 1, candidate_ids: ['first-entry-node'] },
      { ...applicable, rule_id: 'first-entry-anchor', slot_key: 'entry', domain: 'g5_anchor', min_count: 1, max_count: 1, candidate_ids: ['first-entry-anchor'] }
    ],
    candidates: [
      { ...applicable, candidate_id: 'first-entry-node', domain: 'g5_node', template_id: 'node-template', weight: 1, attributes: { access_state: { access: 'open' }, visibility_state: { visibility: 'visible' }, state: { state_version: 1 } } },
      { ...applicable, candidate_id: 'first-entry-anchor', domain: 'g5_anchor', template_id: 'anchor-template', weight: 1, attributes: { g5_node_slot_key: 'main', entry_role: 'start_and_exit', npc_capacity: 1, item_capacity: 1, container_capacity: 1, access_state: { access: 'open' }, visibility_state: { visibility: 'visible' }, state: { state_version: 1 } } }
    ]
  };
  const store = createPostgresPartyStore({
    pool,
    catalogBundleLoader: async ({ domain_catalog_pin: pin }) => {
      assert.equal(pin.import_id, activePin.import_id);
      return {
        world_revision_id: compatibleWorldTuple.compatible_world_revision_id,
        catalog_digest: activePin.catalog_digest,
        region_id: 'novgorod',
        g1_id: 'g1-novgorod',
        historical_frame: { calendar: { year: 1230, season: 'spring' } },
        catalog_bundle: firstEntryCatalogBundle
      };
    }
  });
  const firstEntry = await store.transact(async (transaction) => {
    const request = await store.buildMaterializationRequest({
      partyId: 'party-runtime-catalog-v2',
      g4Id: 'g4-runtime-first-entry',
      trigger: 'first_entry',
      transaction
    });
    const materialization = materializeWorldInstances(request);
    const commit = await store.commitMaterializationAndMovement({
      partyId: request.party_id,
      g4Id: request.g4_id,
      materialization,
      writePlan: {},
      idempotencyKey: 'runtime-catalog-first-entry'
    }, { transaction });
    return { request, materialization, commit };
  });
  assert.equal(firstEntry.request.catalog_digest, activePin.catalog_digest);
  assert.notEqual(firstEntry.request.catalog_bundle_digest, activePin.catalog_digest);
  assert.equal(firstEntry.commit.materialized, true);
  assert.equal((await coordinator.assertMaterializationRunPin({
    partyId: 'party-runtime-catalog-v2',
    runId: firstEntry.materialization.run_id,
    expectedPin: activePin
  })).pass, true);
});
