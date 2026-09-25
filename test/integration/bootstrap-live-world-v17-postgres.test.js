import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import pg from 'pg';

import { bootstrapV17Imports } from '../../scripts/bootstrap-live-world-v17.mjs';
import { digestEnvelope } from '../../tools/runtime-catalog-activation/src/artifact-contracts.js';
import { ensureLocalPostgres, LOCAL_POSTGRES } from '../../tools/local-play/local-postgres.js';

test('v17 bootstrap imports and activates item and actor catalogs in a fresh isolated pair',
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
    const candidateDir = process.env.V17_BOOTSTRAP_CANDIDATE_DIR;
    if (candidateDir) {
      await mkdir(candidateDir, { recursive: true });
      await writeFile(join(candidateDir, 'UNISSUED.txt'),
        'Candidate bytes for independent review. No authority until separately approved.\n');
    }
    const fixtureApproval = async (stage, payload) => {
      const value = { ...payload, ...(candidateDir ? {
        attested_by: 'gpt-6-sol-high-independent-runtime-authority-review',
        auditor_ref: 'PR-98-M2c-v17-d224bf53-runtime-authority',
        independence_basis: 'Independent read-only review of exact request digests, approved item and actor provenance, v17 bootstrap inputs and active validators; no database mutation.'
      } : { attested_by: 'isolated-postgres-test-fixture' }) };
      const attestation = { ...value, attestation_digest: digestEnvelope(value) };
      if (candidateDir) await writeFile(join(candidateDir, `${stage}.json`),
        `${JSON.stringify(attestation, null, 2)}\n`);
      return attestation;
    };
    const activationApprovalsPath = join(dataRoot, 'v17-activation-approvals.json');
    const result = await bootstrapV17Imports({ adminUrl: adminUrl.href,
      activationApprovalsPath,
      onRequest: async ({ stage, request }) => {
        if (process.env.V17_BOOTSTRAP_REQUEST_DIR) {
          await mkdir(process.env.V17_BOOTSTRAP_REQUEST_DIR, { recursive: true });
          await writeFile(join(process.env.V17_BOOTSTRAP_REQUEST_DIR, `${stage}.json`),
            `${JSON.stringify(request, null, 2)}\n`);
        }
      },
      attest: ({ stage, request }) => {
        if (stage === 'item_baseline') return fixtureApproval(stage, {
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
        if (stage === 'item_import') return fixtureApproval(stage, {
          schema: 'rus.item_container_overlay_approval_attestation.v2',
          approval_request_digest: request.approval_request_digest,
          decision: 'approve_overlay_import', activation_authorized: false
        });
        if (stage === 'item_activation') return fixtureApproval(stage, {
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
        if (stage === 'actor_import') return fixtureApproval(stage, {
          schema: 'rus.actor_base_attributes_successor_import_attestation.v1',
          request_digest: request.request_digest,
          decision: 'approve_exact_actor_base_attributes_successor_import',
          reviewed_source_digest: request.compatible_world.compatible_world_pin_manifest_digest,
          independence_basis: 'Test-only approval fixture',
          database_mutated: false,
          authority: { import_authorized: true, activation_authorized: false,
            production_authorized: false, existing_party_migration_authorized: false,
            old_save_rematerialization_authorized: false }
        });
        if (stage === 'actor_activation') return fixtureApproval(stage, {
          schema: 'rus.actor_base_attributes_successor_activation_attestation.v1',
          request_digest: request.request_digest,
          decision: 'approve_exact_actor_base_attributes_new_production_activation',
          reviewed_source_digest:
            request.import_request.compatible_world.compatible_world_pin_manifest_digest,
          independence_basis: 'Test-only approval fixture',
          database_mutated: false,
          authority: { import_authorized: false, activation_authorized: true,
            production_authorized: true, existing_party_migration_authorized: false,
            old_save_rematerialization_authorized: false }
        });
        throw new Error(`UNEXPECTED_ATTESTATION_STAGE:${stage}`);
      } });
    assert.equal(result.schema.world_tables, 208);
    assert.equal(result.schema.party_migrations, 36);
    assert.equal(result.gate1.status, 'imported_exact_readback_verified');
    assert.equal(result.p12.inserted_rows, 12359);
    assert.deepEqual(result.additional_start_owners,
      { npc: 6, acoustic: 4, authoring: 10, rollback: 'pass', readback: 'exact' });
    assert.equal(result.appearance_v3.inserted_rows, 129);
    assert.equal(result.capacity_v2.manifest_sha256,
      '55b9893171bb8368293857fc2c87e1ca04210c472430d6d5572d2f9ac81e9057');
    assert.deepEqual(result.capacity_v2.runtime_record_digests, {
      spatial_v3_scene_templates: '81ebb3fc57e2e07fb27334c0646e074ad65a145ecfaaeb4398dd9d4bed5723eb',
      spatial_v3_scene_materialization_profiles: 'c258f0d99c65ba3357a16a2a5204683a442851fcbfcb994abbbda2e88f11e55c'
    });
    assert.equal(result.nature_successor.inserted_rows, 64);
    assert.deepEqual(result.nature_successor.runtime_record_digests, {
      'rus.g4_natural_baseline_profile.v1': '451490374c0e3a74deeb3579569f67e82b0785868e4a5aca82a9c6dca6f5eb22',
      'rus.g4_natural_presentation_profile.v1': 'f817d2c6f22645466174037f6d902f033fd6b70d8e0f7e7573fd7d6d37376f79'
    });
    assert.equal(result.item_import.verified, true);
    assert.equal(result.item_activation.status, 'activated');
    assert.equal(result.actor_import.status, 'imported_exact_readback_verified');
    assert.equal(result.actor_activation.status, 'activated_exact_readback_verified');
    assert.equal(result.actor_activation.production_authorized, true);
    assert.equal(result.actor_activation.event_sequence, 1);
    assert.equal(result.activation_performed, true);
    const approvals = JSON.parse(await readFile(activationApprovalsPath, 'utf8'));
    for (const key of ['itemBaselineApproval', 'itemImportApproval', 'itemApproval',
      'actorImportApproval', 'actorApproval']) {
      assert.ok(approvals[key].request);
      assert.ok(approvals[key].attestation);
    }
    const admin = new pg.Pool({ connectionString: adminUrl.href, max: 1 });
    try {
      const rows = (await admin.query(`SELECT datname FROM pg_database
        WHERE datname LIKE 'pr17_bootstrap_old_%' ORDER BY datname`)).rows;
      assert.deepEqual(rows.map(({ datname }) => datname),
        ['pr17_bootstrap_old_party', 'pr17_bootstrap_old_world']);
    } finally { await admin.end(); }
  });
