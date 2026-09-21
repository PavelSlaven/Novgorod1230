import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildGate1SeedClosureArtifacts,
  validatePendingGate1SeedClosure } from
  '../../../scripts/generate-gate1-seed-closure-request.mjs';

const root = 'data/world-catalogs/novgorod/runtime-catalog/'
  + 'gate1-owner-data-v1/seed-closure-v1';

test('Gate1 deterministic seed derivation reproduces full 30-table closure',
  async () => {
    const generated = await buildGate1SeedClosureArtifacts();
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
    assert.equal(generated.candidate.derivation_inputs
      .deterministic_generated_at, '2026-07-06T00:00:00Z');
  });

test('pending seed closure grants no import or runtime authority', async () => {
  const artifacts = await buildGate1SeedClosureArtifacts();
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

test('Stage3C executor fails closed before seed closure attestation', () => {
  const result = spawnSync(process.execPath,
    ['scripts/run-pr17-item-container-stage3c.mjs', '--mode', 'dry-run'], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 30_000
    });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /GATE1_SEED_CLOSURE_ATTESTATION_REQUIRED/u);
});
