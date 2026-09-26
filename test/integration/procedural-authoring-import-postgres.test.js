import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import registry from '../../data/runtime-catalog/item-container-record-registry.v1.json'
  with { type: 'json' };
import { generateProceduralAuthoringImportPack } from
  '../../scripts/generate-procedural-authoring-import-pack.mjs';
import {
  buildBaselineRegistrationId,
  buildBaselineRegistrationRequest,
  buildOperatorBaselineSnapshotManifest,
  digestEnvelope
} from '../../tools/runtime-catalog-activation/src/artifact-contracts.js';
import { runWorldRuntimeCatalogMigration } from
  '../../tools/runtime-catalog-activation/src/forward-migrations.js';
import { importProceduralAuthoringPack } from
  '../../tools/runtime-catalog-activation/src/procedural-v6-import.js';
import { RECORD_ADAPTERS } from
  '../../tools/runtime-catalog-activation/src/record-adapters.generated.js';
import { RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST } from
  '../../packages/runtime-catalog/src/runtime-contract.js';
import { createPostgresTestBackend } from
  '../fixtures/postgres-test-backend.js';

test('combined procedural authoring pack imports only into disposable DB',
  async (t) => {
    const backend = await createPostgresTestBackend(
      'pr17_procedural_authoring');
    if (!backend) return t.skip('No supported PostgreSQL test backend');
    let pool;
    t.after(async () => {
      await pool?.end();
      await backend.close();
    });
    const url = backend.worldUrl;
    const promoted = spawnSync(process.execPath,
      ['scripts/run-pr17-item-container-stage3c.mjs', '--mode', 'lifecycle'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 180_000,
        env: { ...process.env, PR17_TEST_DATABASE_URL: url }
      });
    assert.equal(promoted.status, 0, promoted.stderr);
    pool = new pg.Pool({ connectionString: url, max: 2 });
    for (const file of ['18.sql', '19.sql', '20.sql'])
      await pool.query(await readFile(`infra/world-base/schema/${file}`, 'utf8'));
    const expectedV6 = JSON.parse(await readFile(
      'data/world-catalogs/novgorod/spatial-v3/candidates/'
        + 'spatial-v3-production-v6/datasets/world_revisions.json', 'utf8'))
      .find(({ id }) => id ===
        'novgorod_spatial_v3_production_v6_candidate_001');
    const actualV6 = (await pool.query(`SELECT id,parent_revision_id,title,
      to_char(effective_from,'YYYY-MM-DD') AS effective_from,
      to_char(effective_to,'YYYY-MM-DD') AS effective_to,
      catalog_digest,status
      FROM world_base.world_revisions WHERE id=$1`, [expectedV6.id])).rows;
    assert.deepEqual(actualV6, [expectedV6]);
    await runWorldRuntimeCatalogMigration(pool);
    await pool.query(await readFile('infra/world-base/schema/21.sql', 'utf8'));

    const rowsByTable = {};
    for (const entry of registry.entries) rowsByTable[entry.table_name] =
      (await pool.query(RECORD_ADAPTERS[entry.table_name].select_all_sql)).rows
        .map(normalizeRow);
    const baselineManifest = buildOperatorBaselineSnapshotManifest({
      schemaFingerprint: 'a'.repeat(64), registry, rowsByTable
    });
    const pack = await generateProceduralAuthoringImportPack(process.cwd());
    const compatibilityManifest = pack.candidate.compatibility_manifest;
    const request = buildBaselineRegistrationRequest({
      parentRevisionId: 'procedural_authoring_disposable_baseline_001',
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
        parent_snapshot_manifest_digest:
          request.parent_snapshot_manifest_digest
      },
      compatible_world_tuple: {
        compatible_world_revision_id: request.compatible_world_revision_id,
        compatible_world_catalog_digest:
          request.compatible_world_catalog_digest,
        compatible_world_pin_manifest_digest:
          request.compatible_world_pin_manifest_digest
      },
      action: 'register_baseline',
      attested_by: 'disposable PostgreSQL integration'
    });
    const importAttestation = seal({
      schema: 'rus.procedural_authoring_import_approval_attestation.v1',
      approval_request_digest:
        pack.approvalRequest.approval_request_digest,
      decision: 'approve_disposable_local_authoring_import',
      scope: 'disposable_local_pr_candidate_database',
      candidate_digest: pack.candidate.candidate_digest,
      promotion_manifest_digest:
        pack.promotionManifest.promotion_manifest_digest,
      target_revision_id: pack.candidate.target_revision_id,
      target_catalog_digest: pack.candidate.target_catalog_digest,
      activation_authorized: false,
      attested_by: 'independent integration fixture'
    });
    const result = await importProceduralAuthoringPack({
      pool,
      baseline: {
        request,
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
        },
        registrationId: buildBaselineRegistrationId(request)
      },
      pack,
      approvalAttestation: importAttestation,
      runtimeContractDigest: RUNTIME_CATALOG_FIRST_PLAYABLE_CONTRACT_DIGEST
    });
    assert.equal(result.imported.status, 'applied');
    assert.equal(result.readback.activation_event_count, 0);
    assert.deepEqual(result.readback.runtime_capabilities_authorized, []);
    assert.deepEqual(result.readback.candidate_rows_by_table,
      pack.candidate.candidate_rows_by_table);
  });

function normalizeRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key,
    value instanceof Date ? value.toISOString().slice(0, 10) : value]));
}
function seal(payload) {
  return { ...payload, attestation_digest: digestEnvelope(payload) };
}
