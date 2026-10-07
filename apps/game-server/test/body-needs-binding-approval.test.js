import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { loadTargetBodyNeedsProfile } from '../src/internal/target-runtime-profiles.js';

const worldRevisionId = 'novgorod_spatial_v3_target_contract_approval_001';
const bindingPath = 'data/world-catalogs/novgorod/live-world-runtime-v17/body-needs-binding.v1.json';
const datasetPath = 'data/world-catalogs/novgorod/temporal-v4/datasets/body_time_effect_profiles_thresholds.json';
const sourceApprovalPath = 'data/world-catalogs/novgorod/temporal-v4/approvals/body_time_effect_profiles_thresholds.json';
const attestationDirectory = 'data/world-catalogs/novgorod/live-world-runtime-v17';
const fixturePath = new URL('./fixtures/body-needs-binding.v1.approval-attestation.json', import.meta.url);
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));

async function isolatedRoot() {
  const root = await mkdtemp(join(tmpdir(), 'body-needs-binding-approval-'));
  for (const path of [bindingPath, datasetPath, sourceApprovalPath]) {
    const target = resolve(root, path);
    await mkdir(join(target, '..'), { recursive: true });
    await copyFile(resolve(process.cwd(), path), target);
  }
  await mkdir(resolve(root, attestationDirectory), { recursive: true });
  return root;
}

async function withRoot(run) {
  const root = await isolatedRoot();
  try { await run(root); }
  finally { await rm(root, { recursive: true, force: true }); }
}

async function writeAttestation(root, name, value = fixture) {
  await writeFile(resolve(root, attestationDirectory, name), `${JSON.stringify(value, null, 2)}\n`);
}

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

test('without an attestation, the profile remains unapproved and has no attestation pin', async () => {
  await withRoot(async (root) => {
    const profile = await loadTargetBodyNeedsProfile({ rootDir: root, worldRevisionId });
    assert.equal(profile.status, 'candidate_only_pending_review');
    assert.equal(profile.approved, false);
    assert.equal(profile.import_authorized, false);
    assert.equal(profile.activation_authorized, false);
    assert.equal(profile.approval_attestation, null);
  });
});

test('one exact valid fixture attestation supplies explicit authorization flags and its byte pin', async () => {
  await withRoot(async (root) => {
    const name = 'body-needs-binding.v1.approval-attestation.json';
    await copyFile(fixturePath, resolve(root, attestationDirectory, name));
    const attestationBytes = await readFile(resolve(root, attestationDirectory, name));
    const profile = await loadTargetBodyNeedsProfile({ rootDir: root, worldRevisionId });
    assert.equal(profile.status, 'candidate_only_pending_review');
    assert.deepEqual([profile.approved, profile.import_authorized, profile.activation_authorized],
      [true, true, true]);
    assert.deepEqual(profile.approval_attestation, {
      path: `${attestationDirectory}/${name}`,
      sha256: sha256(attestationBytes),
      verdict: 'APPROVE'
    });
  });
});

test('a candidate path with a mismatched candidate SHA is a typed hard block', async () => {
  await withRoot(async (root) => {
    await writeAttestation(root, 'body-needs-binding.v1.approval-attestation.json', {
      ...fixture, candidate_sha256: '0'.repeat(64)
    });
    await assert.rejects(loadTargetBodyNeedsProfile({ rootDir: root, worldRevisionId }),
      (error) => error.code === 'SPATIAL_V3_TARGET_BODY_NEEDS_APPROVAL_ATTESTATION_INVALID'
        && error.status === 503 && error.details?.severity === 'hard_block');
  });
});

test('matching candidate attestations reject bad schema, verdict, types, and required review text', async () => {
  const invalid = [
    { schema: 'wrong.schema' },
    { verdict: 'REJECT' },
    { approved: 'true' },
    { import_authorized: null },
    { activation_authorized: 1 },
    { auditor_ref: '  ' },
    { independence_basis: '' },
    { reviewed_repository_head: null },
    { approval: '\t' }
  ];
  for (const override of invalid) {
    await withRoot(async (root) => {
      await writeAttestation(root, 'body-needs-binding.v1.approval-attestation.json', {
        ...fixture, ...override
      });
      await assert.rejects(loadTargetBodyNeedsProfile({ rootDir: root, worldRevisionId }),
        (error) => error.code === 'SPATIAL_V3_TARGET_BODY_NEEDS_APPROVAL_ATTESTATION_INVALID'
          && error.status === 503 && error.details?.severity === 'hard_block');
    });
  }
});

test('two exact candidate attestations are ambiguous', async () => {
  await withRoot(async (root) => {
    await writeAttestation(root, 'body-needs-binding.v1.approval-attestation.json');
    await writeAttestation(root, 'body-needs-binding.v1.approval-attestation-copy.json');
    await assert.rejects(loadTargetBodyNeedsProfile({ rootDir: root, worldRevisionId }),
      (error) => error.code === 'SPATIAL_V3_TARGET_BODY_NEEDS_APPROVAL_ATTESTATION_AMBIGUOUS'
        && error.status === 503 && error.details?.severity === 'hard_block');
  });
});
