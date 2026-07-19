import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { assessSpatialV3Activation, requireSpatialV3Activation } from '../../tools/spatial-v3/p28-activation-gate.mjs';

const execFile = promisify(execFileCallback);

test('P28 refuses an atomic activation while regional authoring and release evidence are incomplete', async () => {
  const assessment = await assessSpatialV3Activation();
  assert.equal(assessment.activation_permitted, false);
  assert.equal(assessment.production_writes, 0);
  assert.equal(assessment.composition_changed, false);
  assert.equal(assessment.required_action, 'reopen_owner_phase_and_keep_v2_production');
  assert(assessment.blockers.some((entry) => entry.code === 'p28_fresh_checkout_evidence_missing'));
  assert.deepEqual(assessment.blockers.filter((entry) => entry.code === 'spatial_candidate_gap').map((entry) => entry.gap_code).sort(), [
    'APPROVED_PROFILE_DATA_GAP', 'CANONICAL_G5_INVENTORY_DATA_GAP', 'DIRECTIONAL_EXIT_READINESS_DATA_GAP', 'ROUTE_BINDING_DATA_GAP'
  ]);
  await assert.rejects(() => requireSpatialV3Activation(), { code: 'spatial_v3_activation_blocked' });
});

test('P28 rejects caller-crafted activation approval and revalidates immutable release evidence', async () => {
  const accepted = Object.freeze({ activation_permitted: true, production_writes: 0, composition_changed: false });
  await assert.rejects(() => requireSpatialV3Activation(accepted), {
    code: 'spatial_v3_activation_blocked'
  });
});

test('P28 rejects hash-mismatched and missing Appendix D evidence', async () => {
  const originalManifest = JSON.parse(await readFile('docs/migration/spatial-v3/release-evidence.v1.json', 'utf8'));
  const mismatched = structuredClone(originalManifest);
  mismatched.appendix_d_items[0] = {
    ...mismatched.appendix_d_items[0],
    status: 'passed',
    evidence: [{ path: 'docs/migration/spatial-v3/README.md', sha256: '0'.repeat(64) }]
  };
  const missing = structuredClone(originalManifest);
  missing.appendix_d_items[1] = { ...missing.appendix_d_items[1], status: 'passed', evidence: [] };
  for (const [manifest, expectedCode] of [[mismatched, 'appendix_d_evidence_hash_mismatch'], [missing, 'appendix_d_item_evidence_missing']]) {
    const assessment = await assessSpatialV3Activation({
      read: async (path, encoding) => path.endsWith('release-evidence.v1.json') ? JSON.stringify(manifest) : readFile(path, encoding)
    });
    assert(assessment.blockers.some((entry) => entry.code === expectedCode), `${expectedCode} must block activation`);
  }
});

test('P28 manifest pins all four P12 gaps with their exact quantities and requires resolution evidence', async () => {
  const assessment = await assessSpatialV3Activation();
  const gaps = assessment.blockers.filter((entry) => entry.code === 'spatial_candidate_gap');
  assert.deepEqual(gaps.map((entry) => [entry.gap_code, entry.subject_ref]).sort(), [
    ['APPROVED_PROFILE_DATA_GAP', 'novgorod:g4-scene-profiles'],
    ['CANONICAL_G5_INVENTORY_DATA_GAP', 'novgorod:g4-inventory:195'],
    ['DIRECTIONAL_EXIT_READINESS_DATA_GAP', 'novgorod:physical-edge-inventory:358'],
    ['ROUTE_BINDING_DATA_GAP', 'novgorod:graph-edge-inventory:600']
  ]);
});

test('P28 command exits nonzero rather than silently applying an incomplete activation', async () => {
  await assert.rejects(
    execFile(process.execPath, ['tools/spatial-v3/p28-activation-gate.mjs'], { cwd: process.cwd() }),
    (error) => error.code === 1 && String(error.stdout).includes('"activation_permitted": false')
  );
});
