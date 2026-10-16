import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import { loadGate1SeedClosureArtifacts,
  validateGate1SeedClosureAttestation,
  validatePendingGate1SeedClosure } from
  '../../../scripts/generate-gate1-seed-closure-request.mjs';

const root = 'data/world-catalogs/novgorod/runtime-catalog/'
  + 'gate1-owner-data-v1/seed-closure-v1';

test('Gate1 pending request validates exact full 30-table closure',
  async () => {
    const generated = await loadGate1SeedClosureArtifacts();
    const checkedIn = {
      candidate: JSON.parse(await readFile(`${root}/candidate.json`, 'utf8')),
      request: JSON.parse(await readFile(`${root}/request.json`, 'utf8'))
    };
    assert.deepEqual(generated, checkedIn);
    assert.equal(generated.candidate.derived_outputs.table_count, 30);
    assert.equal(generated.candidate.derived_outputs.total_row_count, 42577);
    assert.equal(generated.candidate.derived_outputs.table_closure.length, 30);
    assert.ok(generated.candidate.derived_outputs.table_closure.every(
      ({ payload_sha256: digest }) => /^[a-f0-9]{64}$/u.test(digest)));
    assert.ok(generated.candidate.derived_outputs.table_closure.every(
      ({ order_columns: orderColumns, excluded_mutable_columns: excluded }) =>
        orderColumns.length > 0 && excluded.every((column) =>
          ['created_at', 'updated_at'].includes(column))));
    assert.equal(generated.candidate.derivation_inputs
      .deterministic_generated_at, '2026-07-06T00:00:00Z');
  });

test('pending seed closure grants no import or runtime authority', async () => {
  const artifacts = await loadGate1SeedClosureArtifacts();
  assert.equal(validatePendingGate1SeedClosure(artifacts), true);
  for (const artifact of Object.values(artifacts)) {
    assert.deepEqual(Object.values(artifact.authority),
      Object.values(artifact.authority).map(() => false));
  }
  const widened = structuredClone(artifacts);
  widened.request.authority.import_authorized = true;
  assert.throws(() => validatePendingGate1SeedClosure(widened),
    /GATE1_SEED_CLOSURE_AUTHORITY_FORBIDDEN/u);
});

test('seed closure attestation approves exact import/readback only',
  async () => {
    const artifacts = await loadGate1SeedClosureArtifacts();
    const attestation = JSON.parse(await readFile(
      `${root}/authoring-approval-attestation.json`, 'utf8'));
    assert.equal(validateGate1SeedClosureAttestation({
      ...artifacts, attestation
    }), true);
    for (const field of ['activation_authorized', 'production_authorized',
      'existing_party_migration_authorized',
      'old_save_rematerialization_authorized',
      'authoring_only_functional_allocation_runtime_selection',
      'runtime_item_creation_authorized']) {
      assert.equal(attestation.authority[field], false);
      const widened = structuredClone(attestation);
      widened.authority[field] = true;
      assert.throws(() => validateGate1SeedClosureAttestation({
        ...artifacts, attestation: widened
      }), /GATE1_SEED_CLOSURE_ATTESTATION_INVALID/u);
    }
    assert.throws(() => validateGate1SeedClosureAttestation({
      ...artifacts, attestation: null
    }), /GATE1_SEED_CLOSURE_ATTESTATION_INVALID/u);
    const tampered = structuredClone(attestation);
    tampered.approved_scope.table_closure_digest = '0'.repeat(64);
    assert.throws(() => validateGate1SeedClosureAttestation({
      ...artifacts, attestation: tampered
    }), /GATE1_SEED_CLOSURE_ATTESTATION_INVALID/u);
  });

test('Stage3C rejects seed attestation path override', () => {
  const result = spawnSync(process.execPath,
    ['scripts/run-pr17-item-container-stage3c.mjs', '--mode', 'dry-run',
      '--seed-closure-attestation', 'forbidden.json'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 30_000
    });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr,
    /PR17_STAGE3C_ARGUMENT_FORBIDDEN:--seed-closure-attestation/u);
});

test('dry-run ignores lifecycle test data root for seed attestation',
  async (t) => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'gate1-local-play-root-'));
    t.after(() => rm(dataRoot, { recursive: true, force: true }));
    const redirected = join(dataRoot,
      'data/world-catalogs/novgorod/runtime-catalog/gate1-owner-data-v1/'
      + 'seed-closure-v1/authoring-approval-attestation.json');
    await mkdir(dirname(redirected), { recursive: true });
    await writeFile(redirected, '{}');
    const result = spawnSync(process.execPath,
      ['scripts/run-pr17-item-container-stage3c.mjs', '--mode', 'dry-run'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 30_000,
        env: { ...process.env, PR17_TEST_DATA_ROOT: dataRoot }
      });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).pass, true);
  });
