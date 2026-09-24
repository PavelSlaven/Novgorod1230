import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import pg from 'pg';

import { bootstrapV17Imports } from '../../scripts/bootstrap-live-world-v17.mjs';
import { digestEnvelope } from '../../tools/runtime-catalog-activation/src/artifact-contracts.js';
import { ensureLocalPostgres, LOCAL_POSTGRES } from '../../tools/local-play/local-postgres.js';

test('v17 bootstrap imports schema, Gate1, P12 and appearance into a fresh isolated pair',
  { timeout: 1_200_000 }, async (t) => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'novgorod-v17-bootstrap-test-'));
    const settings = { ...LOCAL_POSTGRES,
      worldDatabase: 'pr17_bootstrap_old_world',
      partyDatabase: 'pr17_bootstrap_old_party' };
    const managed = await ensureLocalPostgres({ dataRoot, settings });
    t.after(async () => {
      await managed.close();
      await rm(dataRoot, { recursive: true, force: true });
    });
    const adminUrl = new URL(managed.worldUrl);
    adminUrl.username = 'postgres';
    adminUrl.pathname = '/postgres';
    const fixtureApproval = (payload) => {
      const value = { ...payload, attested_by: 'isolated-postgres-test-fixture' };
      return { ...value, attestation_digest: digestEnvelope(value) };
    };
    const result = await bootstrapV17Imports({ adminUrl: adminUrl.href,
      onRequest: async ({ stage, request }) => {
        if (process.env.V17_BOOTSTRAP_REQUEST_DIR) {
          await mkdir(process.env.V17_BOOTSTRAP_REQUEST_DIR, { recursive: true });
          await writeFile(join(process.env.V17_BOOTSTRAP_REQUEST_DIR, `${stage}.json`),
            `${JSON.stringify(request, null, 2)}\n`);
        }
      },
      attest: ({ stage, request }) => {
        if (stage === 'item_baseline') return fixtureApproval({
          schema: 'rus.baseline_registration_attestation.v2',
          registration_request_digest: request.registration_request_digest,
          parent_tuple: { parent_revision_id: request.parent_revision_id,
            parent_catalog_digest: request.parent_catalog_digest,
            parent_snapshot_manifest_digest: request.parent_snapshot_manifest_digest },
          compatible_world_tuple: {
            compatible_world_revision_id: request.compatible_world_revision_id,
            compatible_world_catalog_digest: request.compatible_world_catalog_digest,
            compatible_world_pin_manifest_digest: request.compatible_world_pin_manifest_digest },
          decision: 'approve_register_baseline', action: 'register_baseline'
        });
        if (stage === 'item_import') return fixtureApproval({
          schema: 'rus.item_container_overlay_approval_attestation.v2',
          approval_request_digest: request.approval_request_digest,
          decision: 'approve_overlay_import', activation_authorized: false
        });
        if (stage === 'item_activation') return fixtureApproval({
          schema: 'rus.runtime_catalog_activation_attestation.v2',
          activation_request_digest: request.activation_request_digest,
          catalog_scope: request.catalog_scope,
          target_revision_id: request.target_revision_id,
          target_catalog_digest: request.target_catalog_digest,
          import_id: request.import_id,
          import_audit_digest: request.import_audit_digest,
          runtime_contract_digest: request.runtime_contract_digest,
          runtime_release_id: request.runtime_release_id,
          decision: 'approve_activation'
        });
        if (stage === 'actor_import') return fixtureApproval({
          schema: 'rus.actor_base_attributes_successor_import_attestation.v1',
          request_digest: request.request_digest,
          decision: 'approve_exact_actor_base_attributes_successor_import',
          reviewed_repository_head: request.subject_commit,
          independence_basis: 'Test-only approval fixture',
          database_mutated: false,
          authority: { import_authorized: true, activation_authorized: false,
            production_authorized: false, existing_party_migration_authorized: false,
            old_save_rematerialization_authorized: false }
        });
        throw new Error(`UNEXPECTED_ATTESTATION_STAGE:${stage}`);
      } });
    assert.equal(result.schema.world_tables, 208);
    assert.equal(result.schema.party_migrations, 36);
    assert.equal(result.gate1.status, 'imported_exact_readback_verified');
    assert.equal(result.p12.inserted_rows, 12359);
    assert.equal(result.appearance_v3.inserted_rows, 129);
    assert.equal(result.item_import.verified, true);
    assert.equal(result.item_activation.status, 'activated');
    assert.equal(result.actor_import.status, 'imported_exact_readback_verified');
    assert.equal(result.activation_performed, false);
    const admin = new pg.Pool({ connectionString: adminUrl.href, max: 1 });
    try {
      const rows = (await admin.query(`SELECT datname FROM pg_database
        WHERE datname LIKE 'pr17_bootstrap_old_%' ORDER BY datname`)).rows;
      assert.deepEqual(rows.map(({ datname }) => datname),
        ['pr17_bootstrap_old_party', 'pr17_bootstrap_old_world']);
    } finally { await admin.end(); }
  });
