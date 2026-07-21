import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { P28_APPENDIX_D_ITEMS, computeP28ManifestDigest } from '../../tools/spatial-v3/p28-activation-gate.mjs';
import {
  inspectP28SigningPayloadsFromRepository,
  prepareP28SigningPayloads
} from '../../tools/spatial-v3/p28-signing-payloads.mjs';

const execFile = promisify(execFileCallback);
const MANIFEST_PATH = 'docs/migration/spatial-v3/release-evidence.v1.json';
const TRUST_STORE_PATH = 'docs/migration/spatial-v3/activation-trust-store.v1.json';
const EVIDENCE = {
  appendix: 'docs/migration/spatial-v3/appendix-evidence.json',
  p12: 'docs/migration/spatial-v3/p12-evidence.json',
  p27: 'docs/migration/spatial-v3/p27-evidence.json',
  fresh: 'docs/migration/spatial-v3/fresh-evidence.json'
};
const ROLES = ['p27_critic', 'fresh_checkout_attestor', 'p28_release_authority'];
const digest = (value) => createHash('sha256').update(value).digest('hex');

async function git(cwd, ...args) {
  const { stdout } = await execFile('git', [
    '-c', 'commit.gpgSign=false', '-c', `core.hooksPath=${join(cwd, '.disabled-hooks')}`, ...args
  ], { cwd, windowsHide: true, encoding: 'utf8', timeout: 15_000, killSignal: 'SIGKILL' });
  return stdout.trim();
}

async function put(root, path, bytes) {
  const absolute = join(root, ...path.split('/'));
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, bytes);
}

function encodedSignature(privateKey, payload) {
  return { algorithm: 'ed25519', value: sign(null, Buffer.from(payload, 'utf8'), privateKey).toString('base64') };
}

function signIndependentEvidence(manifest, keys) {
  manifest.p27_independent_critic.signature = encodedSignature(keys.p27_critic.privateKey,
    `p27:${manifest.release_id}:${manifest.activation_candidate_commit}:${manifest.p27_independent_critic.sha256}`);
  const fresh = manifest.p28_fresh_checkout.evidence[0];
  fresh.signature = encodedSignature(keys.fresh_checkout_attestor.privateKey,
    `p28:fresh-checkout:${manifest.release_id}:${manifest.activation_candidate_commit}:${fresh.sha256}`);
}

async function createRepositoryFixture({ signatures = 'valid', mutateTrust, mutateManifest } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'p28-signing-payloads-'));
  await git(root, 'init', '--quiet');
  await git(root, 'config', 'user.email', 'p28-test@example.invalid');
  await git(root, 'config', 'user.name', 'P28 Test');
  const keys = Object.fromEntries(ROLES.map((role) => [role, generateKeyPairSync('ed25519')]));
  const trust = {
    schema: 'rus.spatial-v3.activation-trust-store.v1', version: 1,
    keys: ROLES.map((role) => ({
      role, key_id: `${role}-test-key`, public_key_path: `docs/migration/spatial-v3/${role}.pem`, revoked: false
    }))
  };
  if (mutateTrust) mutateTrust(trust, keys);
  await put(root, TRUST_STORE_PATH, `${JSON.stringify(trust, null, 2)}\n`);
  for (const entry of trust.keys) {
    const sourceRole = entry.test_public_key_role ?? entry.role;
    await put(root, entry.public_key_path, keys[sourceRole].publicKey.export({ type: 'spki', format: 'pem' }));
    delete entry.test_public_key_role;
  }
  // Re-write after removing the test-only routing field so only the contract is committed.
  await put(root, TRUST_STORE_PATH, `${JSON.stringify(trust, null, 2)}\n`);
  const evidenceBytes = Object.fromEntries(Object.entries(EVIDENCE).map(([name]) => [name, Buffer.from(`${name}-approved-evidence\n`)]));
  for (const [name, path] of Object.entries(EVIDENCE)) await put(root, path, evidenceBytes[name]);
  await git(root, 'add', '.');
  await git(root, 'commit', '--quiet', '-m', 'candidate');
  const candidate = await git(root, 'rev-parse', 'HEAD');
  const manifest = {
    schema: 'rus.spatial-v3.release-evidence.v1', version: 1, release_id: 'p28-offline-test',
    activation_candidate_commit: candidate,
    appendix_d_items: P28_APPENDIX_D_ITEMS.map((id) => ({
      id, status: 'passed', evidence: [{ path: EVIDENCE.appendix, sha256: digest(evidenceBytes.appendix) }]
    })),
    p12_authoring_gaps: [
      ['CANONICAL_G5_INVENTORY_DATA_GAP', 'novgorod:g4-inventory:195'],
      ['DIRECTIONAL_EXIT_READINESS_DATA_GAP', 'novgorod:physical-edge-inventory:358'],
      ['ROUTE_BINDING_DATA_GAP', 'novgorod:graph-edge-inventory:600'],
      ['APPROVED_PROFILE_DATA_GAP', 'novgorod:g4-scene-profiles']
    ].map(([code, subject_ref]) => ({
      code, subject_ref, status: 'resolved', resolution_evidence: [{ path: EVIDENCE.p12, sha256: digest(evidenceBytes.p12) }]
    })),
    p27_independent_critic: {
      status: 'passed', verdict: 'PASS', activation_candidate_commit: candidate,
      path: EVIDENCE.p27, sha256: digest(evidenceBytes.p27),
      signer: { role: 'p27_critic', key_id: trust.keys.find((entry) => entry.role === 'p27_critic').key_id }, signature: null
    },
    p28_fresh_checkout: {
      status: 'passed', activation_candidate_commit: candidate,
      evidence: [{
        path: EVIDENCE.fresh, sha256: digest(evidenceBytes.fresh),
        signer: { role: 'fresh_checkout_attestor', key_id: trust.keys.find((entry) => entry.role === 'fresh_checkout_attestor').key_id }, signature: null
      }]
    },
    manifest_signer: {
      role: 'p28_release_authority', key_id: trust.keys.find((entry) => entry.role === 'p28_release_authority').key_id
    },
    manifest_sha256: 'PENDING_EXTERNAL_RELEASE_SIGNING', manifest_signature: null
  };
  if (mutateManifest) mutateManifest(manifest);
  if (signatures === 'valid') signIndependentEvidence(manifest, keys);
  if (signatures === 'placeholder') {
    manifest.p27_independent_critic.signature = { algorithm: 'ed25519', value: 'AA==' };
    manifest.p28_fresh_checkout.evidence[0].signature = { algorithm: 'ed25519', value: 'AA==' };
  }
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  await put(root, MANIFEST_PATH, manifestBytes);
  await git(root, 'add', MANIFEST_PATH);
  await git(root, 'commit', '--quiet', '-m', 'evidence');
  return { root, manifest, manifestBytes, trust, keys, evidenceBytes };
}

test('P28 offline workflow emits release payload only after real Ed25519 verification in a two-commit repository', async (t) => {
  const fixture = await createRepositoryFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const result = await inspectP28SigningPayloadsFromRepository({ root: fixture.root });
  const manifestDigest = computeP28ManifestDigest(fixture.manifest);
  assert.equal(result.ready_for_offline_signing, true);
  assert.equal(result.manifest_digest, manifestDigest);
  assert.equal(result.payloads.p28_release_authority.payload,
    `p28:${fixture.manifest.release_id}:${fixture.manifest.activation_candidate_commit}:${manifestDigest}`);
  assert.deepEqual(result.structural_errors, []);
  assert.deepEqual(result.unresolved_evidence, []);
  assert.deepEqual(result.chain_blockers, []);
  assert.equal(result.mutated_files, 0);
  assert.equal(result.private_keys_accessed, 0);
  assert.equal(result.signatures_created, 0);
  assert.equal(result.production_writes, 0);
});

test('P28 offline workflow stages independent payloads but withholds release payload before signatures exist', async (t) => {
  const fixture = await createRepositoryFixture({ signatures: 'missing' });
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const result = await inspectP28SigningPayloadsFromRepository({ root: fixture.root });
  assert(result.payloads.p27_critic.payload.startsWith('p27:'));
  assert.equal(result.payloads.fresh_checkout_attestor.length, 1);
  assert.equal(result.payloads.p28_release_authority, null);
  assert(result.unresolved_evidence.some((entry) => entry.code === 'p27_signature_missing'));
  assert(result.unresolved_evidence.some((entry) => entry.code === 'fresh_checkout_signature_missing'));
});

test('P28 offline workflow rejects placeholder signatures instead of exposing release payload', async (t) => {
  const fixture = await createRepositoryFixture({ signatures: 'placeholder' });
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const result = await inspectP28SigningPayloadsFromRepository({ root: fixture.root });
  assert.equal(result.ready_for_offline_signing, false);
  assert.equal(result.payloads, null);
  assert(result.structural_errors.some((entry) => entry.code === 'p27_signature_invalid'));
  assert(result.structural_errors.some((entry) => entry.code === 'fresh_checkout_signature_invalid'));
});

test('P28 offline workflow validates committed trust bytes, revocation, key ids and canonical SPKI identity', async (t) => {
  const revoked = await createRepositoryFixture({ mutateTrust: (trust) => { trust.keys[0].revoked = true; } });
  const duplicateId = await createRepositoryFixture({ mutateTrust: (trust) => { trust.keys[1].key_id = trust.keys[0].key_id; } });
  const duplicateIdentity = await createRepositoryFixture({
    mutateTrust: (trust) => { trust.keys[1].test_public_key_role = trust.keys[0].role; }
  });
  t.after(() => Promise.all([revoked, duplicateId, duplicateIdentity].map((fixture) => rm(fixture.root, { recursive: true, force: true }))));
  for (const fixture of [revoked, duplicateId, duplicateIdentity]) {
    const result = await inspectP28SigningPayloadsFromRepository({ root: fixture.root });
    assert(result.structural_errors.some((entry) => entry.code === 'activation_trust_store_invalid'));
    assert.equal(result.payloads, null);
  }

  const valid = await createRepositoryFixture();
  t.after(() => rm(valid.root, { recursive: true, force: true }));
  const dirtyTrust = `${await readFile(join(valid.root, ...TRUST_STORE_PATH.split('/')), 'utf8')} `;
  const trustResult = await prepareP28SigningPayloads({
    root: valid.root, manifestPath: MANIFEST_PATH, manifest: valid.manifest, manifestBytes: valid.manifestBytes,
    read: async (path, encoding) => String(path).endsWith('activation-trust-store.v1.json') ? dirtyTrust : readFile(path, encoding)
  });
  assert(trustResult.structural_errors.some((entry) => entry.code === 'release_evidence_trust_store_not_committed_exactly'));
});

test('P28 offline workflow requires every Appendix, P12, P27 and fresh digest reference to equal the tracked HEAD blob', async (t) => {
  const fixture = await createRepositoryFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  for (const category of ['appendix', 'p12', 'p27', 'fresh']) {
    const manifest = structuredClone(fixture.manifest);
    const dirtyBytes = Buffer.from(`${category}-working-tree-only\n`);
    const dirtyDigest = digest(dirtyBytes);
    if (category === 'appendix') for (const item of manifest.appendix_d_items) item.evidence[0].sha256 = dirtyDigest;
    if (category === 'p12') for (const gap of manifest.p12_authoring_gaps) gap.resolution_evidence[0].sha256 = dirtyDigest;
    if (category === 'p27') manifest.p27_independent_critic.sha256 = dirtyDigest;
    if (category === 'fresh') manifest.p28_fresh_checkout.evidence[0].sha256 = dirtyDigest;
    if (category === 'p27' || category === 'fresh') signIndependentEvidence(manifest, fixture.keys);
    const target = join(fixture.root, ...EVIDENCE[category].split('/'));
    const result = await prepareP28SigningPayloads({
      root: fixture.root, manifestPath: MANIFEST_PATH, manifest,
      manifestBytes: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`),
      read: async (path, encoding) => String(path) === target ? dirtyBytes : readFile(path, encoding)
    });
    assert(result.structural_errors.some((entry) => entry.code === 'release_evidence_path_not_committed_exactly'), category);
    assert.equal(result.payloads, null);
  }
});

test('P28 offline workflow rejects duplicate P12 gap codes and wrong quantity-bound subject refs', async (t) => {
  const duplicate = await createRepositoryFixture({
    mutateManifest: (manifest) => { manifest.p12_authoring_gaps[1].code = manifest.p12_authoring_gaps[0].code; }
  });
  const wrongSubject = await createRepositoryFixture({
    mutateManifest: (manifest) => { manifest.p12_authoring_gaps[2].subject_ref = 'novgorod:graph-edge-inventory:599'; }
  });
  t.after(() => Promise.all([duplicate, wrongSubject].map((fixture) => rm(fixture.root, { recursive: true, force: true }))));
  const duplicateResult = await inspectP28SigningPayloadsFromRepository({ root: duplicate.root });
  assert(duplicateResult.structural_errors.some((entry) => entry.code === 'p12_gap_evidence_coverage_invalid'));
  assert.equal(duplicateResult.payloads, null);
  const wrongSubjectResult = await inspectP28SigningPayloadsFromRepository({ root: wrongSubject.root });
  assert(wrongSubjectResult.structural_errors.some((entry) => entry.code === 'p12_gap_identity_or_quantity_mismatch'));
  assert.equal(wrongSubjectResult.payloads, null);
});

test('P28 operator rejects unsafe or missing manifest paths before reading bytes', async () => {
  const root = process.cwd();
  for (const manifestPath of ['C:/escape.json', '//server/share/escape.json', '../escape.json', 'missing.json']) {
    let reads = 0;
    await assert.rejects(
      () => inspectP28SigningPayloadsFromRepository({ root, manifestPath, read: async () => { reads += 1; } }),
      { code: 'operator_manifest_path_invalid' }
    );
    assert.equal(reads, 0, manifestPath);
  }
  await assert.rejects(
    execFile(process.execPath, ['tools/spatial-v3/p28-signing-payloads.mjs', '--manifest'], {
      cwd: root, windowsHide: true, encoding: 'utf8'
    }),
    (error) => error.code === 2 && String(error.stdout).includes('operator_manifest_path_invalid')
  );
});
