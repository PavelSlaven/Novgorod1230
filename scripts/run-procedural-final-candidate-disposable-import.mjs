import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import registry from '../data/runtime-catalog/item-container-record-registry.v1.json'
  with { type: 'json' };
import { generateProceduralFinalCandidatePack } from
  './generate-procedural-final-candidate-pack.mjs';
import {
  buildBaselineRegistrationId, buildBaselineRegistrationRequest,
  buildImportLedger, buildOperatorBaselineSnapshotManifest, digestEnvelope
} from '../tools/runtime-catalog-activation/src/artifact-contracts.js';
import { runWorldRuntimeCatalogMigration, WORLD_RUNTIME_CATALOG_MIGRATION } from
  '../tools/runtime-catalog-activation/src/forward-migrations.js';
import { buildProceduralFinalCandidateImportLedger,
  importProceduralFinalCandidatePack } from
  '../tools/runtime-catalog-activation/src/procedural-v6-import.js';
import { importApprovedCatalog, registerCatalogBaseline } from
  '../tools/runtime-catalog-activation/src/operator-executors.js';
import { RECORD_ADAPTERS } from
  '../tools/runtime-catalog-activation/src/record-adapters.generated.js';
import { RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST } from
  '../packages/runtime-catalog/src/runtime-contract.js';
import { computeCanonicalRecordDigest, projectCanonicalRecord } from
  '../packages/runtime-catalog/src/canonical-records.js';
import { buildS1AuthoringV6ImportSql } from
  '../tools/spatial-v3/s1-authoring-v5-importer.mjs';
import { buildLowerDvinaV2ImportSql } from
  '../tools/spatial-v3/lower-dvina-v2-importer.mjs';
import { buildLowerDvinaBoundaryV1ImportSql } from
  '../tools/spatial-v3/lower-dvina-boundary-v1-importer.mjs';
import { buildCharacterAppearanceV1ImportSql } from
  '../tools/spatial-v3/character-appearance-v1-importer.mjs';

const OUTPUT =
  'data/world-catalogs/novgorod/procedural-scene-v2/final-candidate-pack-v1/disposable-import-result.json';

if (!process.argv.includes('--execute')) {
  throw new Error('DISPOSABLE_IMPORT_EXPLICIT_EXECUTE_REQUIRED');
}

const root = resolve(process.cwd());
const dataDir = await mkdtemp(join(tmpdir(), 'novgorod-final-import-'));
const port = await availablePort();
const database = 'pr17_procedural_final_candidate';
const password = 'local_only';
const embedded = new EmbeddedPostgres({ databaseDir: dataDir, port,
  user: 'postgres', password, persistent: false,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog() {}, onError() {} });
let pool;
let result;
const cleanup = { database_stopped: false, temporary_cluster_removed: false };
try {
  await embedded.initialise();
  await embedded.start();
  await embedded.createDatabase(database);
  const url = `postgresql://postgres:${password}@127.0.0.1:${port}/${database}`;
  const promoted = spawnSync(process.execPath,
    ['scripts/run-pr17-item-container-stage3c.mjs', '--mode', 'lifecycle'], {
      cwd: root, encoding: 'utf8', timeout: 180_000,
      env: { ...process.env, PR17_TEST_DATABASE_URL: url }
    });
  if (promoted.status !== 0) throw new Error(
    `DISPOSABLE_V5_IMPORT_FAILED:${promoted.stderr}`);
  const promotion = JSON.parse(promoted.stdout);
  pool = new pg.Pool({ connectionString: url, max: 2 });
  for (const file of ['18.sql', '19.sql', '20.sql', '21.sql'])
    await pool.query(await readFile(resolve(root,
      `infra/world-base/schema/${file}`), 'utf8'));
  await pool.query(await buildLowerDvinaV2ImportSql({ root }));
  await pool.query(await buildLowerDvinaBoundaryV1ImportSql({ root }));
  await pool.query(await buildCharacterAppearanceV1ImportSql({ root }));
  await seedSpatialV5Revision(pool, root);
  await pool.query(await buildS1AuthoringV6ImportSql({ root }));
  await runWorldRuntimeCatalogMigration(pool);

  const pack = await generateProceduralFinalCandidatePack(root);
  const v5Readback = await verifyAssertExistingRows(pool, pack);
  const rowsByTable = {};
  for (const entry of registry.entries) rowsByTable[entry.table_name] =
    (await pool.query(RECORD_ADAPTERS[entry.table_name].select_all_sql)).rows
      .map(normalizeRow);
  delete rowsByTable.world_revisions;
  const baselineManifest = buildOperatorBaselineSnapshotManifest({
    schemaFingerprint: WORLD_RUNTIME_CATALOG_MIGRATION.target_schema_fingerprint,
    registry, rowsByTable
  });
  const compatibilityManifest = pack.compatibility_manifest;
  const request = buildBaselineRegistrationRequest({
    parentRevisionId: 'procedural_final_disposable_baseline_001',
    parentCatalogDigest: baselineManifest.records_aggregate_digest,
    baselineManifest,
    compatibleWorldTuple: compatibilityManifest
  });
  const baselineAttestation = seal({
    schema: 'rus.baseline_registration_attestation.v2',
    registration_request_digest: request.registration_request_digest,
    decision: 'approve_register_baseline',
    parent_tuple: {
      parent_revision_id: request.parent_revision_id,
      parent_catalog_digest: request.parent_catalog_digest,
      parent_snapshot_manifest_digest: request.parent_snapshot_manifest_digest
    },
    compatible_world_tuple: {
      compatible_world_revision_id: request.compatible_world_revision_id,
      compatible_world_catalog_digest:
        request.compatible_world_catalog_digest,
      compatible_world_pin_manifest_digest:
        request.compatible_world_pin_manifest_digest
    },
    action: 'register_baseline',
    attested_by: 'independent_final_candidate_auditor:disposable-workflow'
  });
  const baseline = { request, attestation: baselineAttestation,
    baselineManifest, compatibilityManifest,
    runtimeConfigurationTuple: {
      compatible_world_revision_id:
        compatibilityManifest.compatible_world_revision_id,
      compatible_world_catalog_digest:
        compatibilityManifest.compatible_world_catalog_digest,
      source_runtime_configuration_digest:
        compatibilityManifest.source_runtime_configuration_digest
    }, registrationId: buildBaselineRegistrationId(request) };
  await registerCatalogBaseline({ pool, ...baseline });
  const rollbackProbe = await verifyFinalImportRollback({ pool, baseline,
    pack });
  const imported = await importProceduralFinalCandidatePack({ pool,
    baseline,
    pack,
    runtimeContractDigest: RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST
  });
  const compiledRows = (await pool.query(
    `SELECT record_id,version,record_kind,family_candidate_ref,payload,
            payload_digest,source_pack_digest,status
       FROM world_base.procedural_scene_compiled_records
      WHERE source_pack_digest=$1 ORDER BY record_id,version`,
    [pack.source_pack_digest])).rows.map(normalizeRow);
  result = {
    schema: 'rus.procedural_final_candidate_disposable_import_result.v1',
    status: 'PASS',
    environment: 'fresh_disposable_embedded_postgresql',
    database_name: database,
    credentials_persisted: false,
    v5_prerequisite: {
      lifecycle_applied: promotion.applied === true,
      rollback_probe: promotion.rollback,
      target_revision_id:
        'world_revision_novgorod_1230_item_container_approved_001',
      target_catalog_digest:
        'a24fe55497a8aca018fa28a43ab1f54e26e2f30a5c74931ed2570ab69bc07a87',
      asserted_table_count: v5Readback.table_count,
      asserted_record_count: v5Readback.record_count,
      records_digest: v5Readback.records_digest
    },
    final_import: {
      candidate_digest: pack.candidate_digest,
      independent_attestation_digest:
        pack.independent_attestation.attestation_digest,
      import_id: imported.ledger.root.import_id,
      import_audit_digest: imported.ledger.root.import_audit_digest,
      target_revision_id: pack.target_revision_id,
      target_catalog_digest: pack.target_catalog_digest,
      ledger_record_count: imported.readback.ledger_record_count,
      compiled_record_count: imported.readback.compiled_record_count,
      compiled_rows_digest: digestEnvelope(compiledRows),
      activation_event_count: imported.readback.activation_event_count,
      rollback_probe: rollbackProbe
    },
    cleanup,
    production_mutated: false,
    runtime_activation_performed: false
  };
} finally {
  await pool?.end();
  await embedded.stop();
  cleanup.database_stopped = true;
  await rm(dataDir, { recursive: true, force: true });
  cleanup.temporary_cluster_removed = true;
}

await writeFile(resolve(root, OUTPUT), `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

async function verifyAssertExistingRows(pool, pack) {
  const operations = pack.record_operations_by_table.filter(
    ({ table_name: table }) => table !== 'procedural_scene_compiled_records');
  let count = 0;
  for (const operation of operations) {
    const adapter = RECORD_ADAPTERS[operation.table_name];
    for (const record of operation.records) {
      const key = record.canonical_payload.record_key;
      const row = (await pool.query(adapter.select_by_key_sql,
        adapter.primary_key_fields.map((field) => key[field]))).rows[0];
      if (!row) throw new Error('DISPOSABLE_V5_ASSERT_EXISTING_MISSING');
      const entry = registry.entries.find(({ table_name: table }) =>
        table === operation.table_name);
      const actual = projectCanonicalRecord({ registryEntry: entry, row });
      if (computeCanonicalRecordDigest(actual) !== record.record_digest)
        throw Object.assign(new Error('DISPOSABLE_V5_ASSERT_EXISTING_DRIFT'), {
          details: { table_name: operation.table_name,
            record_key: record.record_key,
            expected: record.canonical_payload.canonical_fields,
            actual: actual.canonical_fields }
        });
      count += 1;
    }
  }
  if (operations.length !== 39 || count !== 3248)
    throw new Error('DISPOSABLE_V5_READBACK_COUNT_MISMATCH');
  return { table_count: operations.length, record_count: count,
    records_digest: digestEnvelope(operations.map((operation) => ({
      table_name: operation.table_name,
      records_digest: operation.records_digest
    }))) };
}
async function verifyFinalImportRollback({ pool, baseline, pack }) {
  const correct = buildProceduralFinalCandidateImportLedger({ baseline, pack });
  const records = structuredClone(correct.records);
  records.find(({ operation_kind: kind }) => kind === 'assert_existing')
    .record_digest = '0'.repeat(64);
  const root = correct.root;
  const tampered = buildImportLedger({ importId: root.import_id,
    rootFields: {
      catalog_scope: root.catalog_scope,
      parent_revision_id: root.parent_revision_id,
      parent_catalog_digest: root.parent_catalog_digest,
      parent_snapshot_manifest_digest: root.parent_snapshot_manifest_digest,
      compatible_world_revision_id: root.compatible_world_revision_id,
      compatible_world_catalog_digest: root.compatible_world_catalog_digest,
      compatible_world_pin_manifest_digest:
        root.compatible_world_pin_manifest_digest,
      target_revision_id: root.target_revision_id,
      target_catalog_digest: root.target_catalog_digest,
      record_registry_digest: root.record_registry_digest,
      promotion_manifest_digest: root.promotion_manifest_digest,
      approval_request_digest: root.approval_request_digest,
      approval_attestation_digest: root.approval_attestation_digest,
      schema_migration_digest: root.schema_migration_digest
    }, tables: correct.tables, records, dependencyAssertions: [],
    importedBy: root.imported_by });
  await importApprovedCatalog({ pool, ledger: tampered,
    domainRevision: { parent_registration_id: baseline.registrationId,
      runtime_contract_digest: RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST,
      title: 'Disposable rollback probe',
      readback_mode: 'authoring_only_no_runtime_projection' },
    approvalAttestation: pack.independent_attestation,
    approvalContract: {
      schema: 'rus.procedural_final_candidate_approval_attestation.v1',
      request_digest_field: 'candidate_digest', decision_field: 'verdict',
      decision: 'APPROVE_FOR_DISPOSABLE_IMPORT_READBACK_ONLY'
    } }).then(() => { throw new Error('DISPOSABLE_ROLLBACK_PROBE_DID_NOT_FAIL'); },
  (error) => {
    if (error.code !== 'CATALOG_IMPORT_ASSERT_EXISTING_MISMATCH') throw error;
  });
  const row = (await pool.query(
    `SELECT
       (SELECT count(*)::int FROM world_base.world_revisions WHERE id=$1)
         AS revision_count,
       (SELECT count(*)::int FROM world_base.catalog_imports WHERE id=$2)
         AS import_count,
       (SELECT count(*)::int FROM world_base.procedural_scene_compiled_records)
         AS compiled_count`,
    [pack.target_revision_id, correct.root.import_id])).rows[0];
  if (Number(row.revision_count) !== 0 || Number(row.import_count) !== 0
      || Number(row.compiled_count) !== 0)
    throw new Error('DISPOSABLE_ROLLBACK_PROBE_RESIDUAL_STATE');
  return 'pass';
}
function normalizeRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
    value instanceof Date ? value.toISOString().slice(0, 10) : value]));
}
function seal(payload) {
  return { ...payload, attestation_digest: digestEnvelope(payload) };
}
async function seedSpatialV5Revision(pool, root) {
  const base = resolve(root,
    'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v5/datasets');
  for (const [table, file] of [
    ['source_records', 'source_records.json'],
    ['world_revisions', 'world_revisions.json'],
    ['spatial_v3_world_revisions', 'spatial_v3_world_revisions.json']
  ]) {
    const rows = JSON.parse(await readFile(resolve(base, file), 'utf8'));
    for (const row of rows) {
      const columns = Object.keys(row);
      await pool.query(`INSERT INTO world_base.${table}
        (${columns.join(',')}) VALUES
        (${columns.map((_, index) => `$${index + 1}`).join(',')})
        ON CONFLICT DO NOTHING`, columns.map((column) => row[column]));
    }
  }
}
function availablePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port: selected } = server.address();
      server.close((error) => error ? reject(error) : resolvePort(selected));
    });
  });
}
