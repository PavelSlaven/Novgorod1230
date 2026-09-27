import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';

import { bootstrapV17Imports } from '../../scripts/bootstrap-live-world-v17.mjs';
import { digestEnvelope } from '../../tools/runtime-catalog-activation/src/artifact-contracts.js';
import { testContainerLabel } from '../helpers/test-containers.js';

// Pin 16.14: bootstrap refuses other 16.x cluster identities.
const POSTGRES_IMAGE = 'postgres:16.14-alpine';

test('v17 bootstrap imports and activates item and actor catalogs in a fresh isolated pair',
  { timeout: 1_200_000 }, async (t) => {
    assert.equal(docker(['version']).status, 0, 'Docker is required.');
    const dataRoot = await mkdtemp(join(tmpdir(), 'novgorod-v17-bootstrap-test-'));
    const postgresContainer = `v17-bootstrap-pg-${randomUUID().slice(0, 12)}`;
    startPostgres(postgresContainer);
    t.after(async () => {
      docker(['rm', '-fv', postgresContainer]);
      await rm(dataRoot, { recursive: true, force: true });
    });
    await waitForPostgres(postgresContainer);
    initializeBootstrapRoles(postgresContainer);
    const adminUrl = adminDatabaseUrl(postgresContainer);
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
    const result = await bootstrapV17Imports({ adminUrl,
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
    assert.equal(result.schema.world_tables, 217);
    assert.equal(result.schema.party_migrations, 37);
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
      'rus.g4_natural_baseline_profile.v1': '063c6f53c6c2c4247bcfba3f11e24ef0476a32612221aa5fb516b853b930655e',
      'rus.g4_natural_presentation_profile.v1': '5033151ea6a1fef35714897ca6a842f71eca2989bbb1319c50ae69727820cee8'
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
    const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
    try {
      const rows = (await admin.query(`SELECT datname FROM pg_database
        WHERE datname LIKE 'pr17_bootstrap_old_%' ORDER BY datname`)).rows;
      assert.deepEqual(rows.map(({ datname }) => datname),
        ['pr17_bootstrap_old_party', 'pr17_bootstrap_old_world']);
    } finally { await admin.end(); }
  });

function startPostgres(name) {
  const result = docker([
    'run', ...testContainerLabel(), '-d', '--name', name, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=local_only',
    POSTGRES_IMAGE
  ], { timeout: 90_000 });
  assert.equal(result.status, 0, result.stderr);
}

function initializeBootstrapRoles(container) {
  for (const user of ['world_operator', 'party_operator']) {
    const role = docker([
      'exec', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres',
      '-d', 'postgres', '-c',
      `CREATE ROLE ${user} LOGIN SUPERUSER PASSWORD 'local_only'`
    ]);
    assert.equal(role.status, 0, role.stderr);
  }
  // Leftover pair proves bootstrap does not drop unrelated databases.
  for (const [user, database] of [
    ['world_operator', 'pr17_bootstrap_old_world'],
    ['party_operator', 'pr17_bootstrap_old_party']
  ]) {
    const created = docker([
      'exec', container, 'createdb', '-U', 'postgres', '-O', user, database
    ]);
    assert.equal(created.status, 0, created.stderr);
  }
}

async function waitForPostgres(name) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const logs = docker(['logs', name]);
    const initialized = `${logs.stdout}\n${logs.stderr}`.includes(
      'PostgreSQL init process complete; ready for start up.');
    if (initialized && docker(
      ['exec', name, 'pg_isready', '-U', 'postgres', '-d', 'postgres']
    ).status === 0) return;
  }
  throw new Error(`${name} did not become ready.`);
}

function adminDatabaseUrl(container) {
  const output = docker(['port', container, '5432']).stdout;
  const port = Number(output.match(/:(\d+)\s*$/u)?.[1]);
  assert.ok(Number.isInteger(port));
  return `postgresql://postgres:local_only@127.0.0.1:${port}/postgres`;
}

function docker(args, options = {}) {
  return spawnSync('docker', args, {
    encoding: 'utf8',
    timeout: options.timeout ?? 30_000
  });
}
