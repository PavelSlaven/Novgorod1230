import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { assessSpatialV3Activation, requireSpatialV3Activation } from '../../tools/spatial-v3/p28-activation-gate.mjs';

const execFile = promisify(execFileCallback);

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function encodedSignature(privateKey, payload) {
  return { algorithm: 'ed25519', value: sign(null, Buffer.from(payload, 'utf8'), privateKey).toString('base64') };
}

function rewrapPem(pem, width = 48) {
  const base64 = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/gu, '');
  return `-----BEGIN PUBLIC KEY-----\n${base64.match(new RegExp(`.{1,${width}}`, 'g')).join('\n')}\n-----END PUBLIC KEY-----\n`;
}

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

test('P28 rejects Windows absolute, UNC, traversal and ambiguous evidence paths before reading them', async () => {
  const originalManifest = JSON.parse(await readFile('docs/migration/spatial-v3/release-evidence.v1.json', 'utf8'));
  const unsafePaths = ['C:\\outside\\evidence.json', '\\\\server\\share\\evidence.json', '../outside.json', './evidence.json', 'docs//migration/evidence.json'];
  for (const unsafePath of unsafePaths) {
    const manifest = structuredClone(originalManifest);
    manifest.p12_authoring_gaps[0] = {
      ...manifest.p12_authoring_gaps[0],
      status: 'resolved',
      resolution_evidence: [{ path: unsafePath, sha256: 'a'.repeat(64) }]
    };
    const assessment = await assessSpatialV3Activation({
      read: async (path, encoding) => path.endsWith('release-evidence.v1.json') ? JSON.stringify(manifest) : readFile(path, encoding)
    });
    assert(assessment.blockers.some((entry) => entry.code === 'p12_gap_resolution_evidence_invalid'), `${unsafePath} must be rejected`);
  }
});

test('P28 rejects a repository-relative evidence path whose realpath escapes through a symlink', async () => {
  const originalManifest = JSON.parse(await readFile('docs/migration/spatial-v3/release-evidence.v1.json', 'utf8'));
  const manifest = structuredClone(originalManifest);
  manifest.p12_authoring_gaps[0] = {
    ...manifest.p12_authoring_gaps[0],
    status: 'resolved',
    resolution_evidence: [{ path: 'docs/migration/spatial-v3/README.md', sha256: 'a'.repeat(64) }]
  };
  const root = process.cwd();
  const assessment = await assessSpatialV3Activation({
    root,
    read: async (path, encoding) => path.endsWith('release-evidence.v1.json') ? JSON.stringify(manifest) : readFile(path, encoding),
    realpath: async (path) => path === root ? root : resolve(root, '..', 'outside-repository')
  });
  assert(assessment.blockers.some((entry) => entry.code === 'p12_gap_resolution_evidence_invalid'));
});

test('P28 requires every role-bound trust-store entry and never accepts a revoked release key', async () => {
  const trust = JSON.parse(await readFile('docs/migration/spatial-v3/activation-trust-store.v1.json', 'utf8'));
  trust.keys.find((entry) => entry.role === 'p28_release_authority').revoked = true;
  const assessment = await assessSpatialV3Activation({
    read: async (path, encoding) => path.endsWith('activation-trust-store.v1.json') ? JSON.stringify(trust) : readFile(path, encoding)
  });
  assert(assessment.blockers.some((entry) => entry.code === 'release_evidence_manifest_signature_invalid'));
  assert.equal(assessment.activation_permitted, false);
});

test('P28 rejects shared, unknown and role-misused trust keys', async () => {
  const original = JSON.parse(await readFile('docs/migration/spatial-v3/activation-trust-store.v1.json', 'utf8'));
  const sharedId = structuredClone(original);
  sharedId.keys[1].key_id = sharedId.keys[0].key_id;
  const sharedPublicKey = structuredClone(original);
  sharedPublicKey.keys[1].public_key_path = sharedPublicKey.keys[0].public_key_path;
  const unknownRole = structuredClone(original);
  unknownRole.keys[2].role = 'untrusted_release_authority';
  for (const trust of [sharedId, sharedPublicKey, unknownRole]) {
    const assessment = await assessSpatialV3Activation({
      read: async (path, encoding) => path.endsWith('activation-trust-store.v1.json') ? JSON.stringify(trust) : readFile(path, encoding)
    });
    assert(assessment.blockers.some((entry) => entry.code === 'release_evidence_trust_store_invalid'));
    assert.equal(assessment.activation_permitted, false);
  }
});

test('P28 canonicalizes SPKI identity and rejects alternate PEM encodings, malformed keys and non-Ed25519 keys', async () => {
  const original = JSON.parse(await readFile('docs/migration/spatial-v3/activation-trust-store.v1.json', 'utf8'));
  const root = process.cwd();
  const firstPath = original.keys[0].public_key_path;
  const firstPem = await readFile(firstPath, 'utf8');
  const sameSpkiDifferentPem = structuredClone(original);
  sameSpkiDifferentPem.keys[1].public_key_path = 'docs/migration/spatial-v3/reencoded-same-key.pem';
  const malformed = structuredClone(original);
  malformed.keys[1].public_key_path = 'docs/migration/spatial-v3/malformed-key.pem';
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const nonEd25519 = structuredClone(original);
  nonEd25519.keys[1].public_key_path = 'docs/migration/spatial-v3/rsa-key.pem';
  const fixtures = [
    [sameSpkiDifferentPem, { 'reencoded-same-key.pem': rewrapPem(firstPem) }],
    [malformed, { 'malformed-key.pem': 'not a PEM key' }],
    [nonEd25519, { 'rsa-key.pem': rsa.publicKey.export({ type: 'spki', format: 'pem' }) }]
  ];
  for (const [trust, extraFiles] of fixtures) {
    const assessment = await assessSpatialV3Activation({
      root,
      read: async (path, encoding) => {
        if (path.endsWith('activation-trust-store.v1.json')) return JSON.stringify(trust);
        const extra = Object.entries(extraFiles).find(([name]) => path.endsWith(name));
        return extra ? extra[1] : readFile(path, encoding);
      }
    });
    assert(assessment.blockers.some((entry) => entry.code === 'release_evidence_trust_store_invalid'));
    assert.equal(assessment.activation_permitted, false);
  }
});

test('P28 accepts only a complete, independently role-signed evidence set', async () => {
  const root = process.cwd();
  const { stdout } = await execFile('git', ['rev-parse', 'HEAD'], { cwd: root });
  const candidateCommit = stdout.trim();
  const evidencePath = 'docs/migration/spatial-v3/README.md';
  const evidenceBytes = await readFile(evidencePath);
  const evidenceDigest = digest(evidenceBytes);
  const roles = ['p27_critic', 'fresh_checkout_attestor', 'p28_release_authority'];
  const keys = Object.fromEntries(roles.map((role) => [role, generateKeyPairSync('ed25519')]));
  const trust = {
    schema: 'rus.spatial-v3.activation-trust-store.v1', version: 1,
    keys: roles.map((role) => ({
      role, key_id: `${role}-test-key`, public_key_path: `docs/migration/spatial-v3/${role}-test.pem`, revoked: false
    }))
  };
  const manifest = {
    schema: 'rus.spatial-v3.release-evidence.v1', version: 1, release_id: 'p28-positive-test', activation_candidate_commit: candidateCommit,
    appendix_d_items: [
      'D1.github_main_fixed', 'D1.root_agents_read', 'D1.github_agents_read', 'D1.conditional_documents_read', 'D1.navigation_and_catalog_read', 'D1.rag_and_graphify_recorded', 'D1.norm_conflicts_empty',
      'D2.public_contracts_single_declaration', 'D2.contract_types_resolve', 'D2.no_placeholder_or_unresolved_branch', 'D2.versioned_authoring_refs', 'D2.contract_schema_dto_ddl_match', 'D2.plural_relations_normalized', 'D2.schema_reference_ddl_digest', 'D2.route_endpoint_context_validators', 'D2.capacity_proof', 'D2.regional_g5_and_exits_complete', 'D2.empty_candidate_sets_hard_block',
      'D3.one_production_owner_writer', 'D3.preparation_before_activation', 'D3.frontier_no_move_or_time', 'D3.separate_executor_contracts', 'D3.failed_retry_lineage', 'D3.no_open_interval_result', 'D3.rational_time_slice_independent', 'D3.boundary_zero_time_context', 'D3.carrier_root_projection', 'D3.mode_transition_new_plan', 'D3.stranded_save_load_rescue', 'D3.player_projection_no_hidden_topology', 'D3.knowledge_token_pinned_resolution', 'D3.portal_state_exhaustive', 'D3.blocker_capacity_deterministic_locks', 'D3.journey_exact_handoff_snapshot',
      'D4.partial_unique_predicates', 'D4.global_lock_order', 'D4.idempotency_identical_result', 'D4.idempotency_digest_rejected', 'D4.clock_matching_committed_result', 'D4.frontier_capacity_concurrency', 'D4.branch_committed_exhaustion', 'D4.movement_topology_no_free_move', 'D4.journey_reload_no_latest_catalog',
      'D5.full_v2_inventory_mapping', 'D5.ambiguous_hard_block', 'D5.no_dual_write', 'D5.postgres_import_lifecycle', 'D5.new_game_existing_save_e2e', 'D5.docs_catalogs_ownership_sync', 'D5.readme_checks_critic_cycles',
      'D6.contract_unit_tests', 'D6.negative_invariant_tests', 'D6.property_time_route_tests', 'D6.targeted_package_tests', 'D6.full_project_tests', 'D6.postgres_integration', 'D6.generated_artifacts_reproduced', 'D6.independent_critic_accepted'
    ].map((id) => ({ id, status: 'passed', evidence: [{ path: evidencePath, sha256: evidenceDigest }] })),
    p12_authoring_gaps: [
      ['CANONICAL_G5_INVENTORY_DATA_GAP', 'novgorod:g4-inventory:195'], ['DIRECTIONAL_EXIT_READINESS_DATA_GAP', 'novgorod:physical-edge-inventory:358'], ['ROUTE_BINDING_DATA_GAP', 'novgorod:graph-edge-inventory:600'], ['APPROVED_PROFILE_DATA_GAP', 'novgorod:g4-scene-profiles']
    ].map(([code, subject_ref]) => ({ code, subject_ref, status: 'resolved', resolution_evidence: [{ path: evidencePath, sha256: evidenceDigest }] })),
    p27_independent_critic: { status: 'passed', verdict: 'PASS', activation_candidate_commit: candidateCommit, path: evidencePath, sha256: evidenceDigest,
      signer: { role: 'p27_critic', key_id: 'p27_critic-test-key' }, signature: null },
    p28_fresh_checkout: { status: 'passed', activation_candidate_commit: candidateCommit, evidence: [{ path: evidencePath, sha256: evidenceDigest,
      signer: { role: 'fresh_checkout_attestor', key_id: 'fresh_checkout_attestor-test-key' }, signature: null }] }
  };
  manifest.p27_independent_critic.signature = encodedSignature(keys.p27_critic.privateKey, `p27:${manifest.release_id}:${candidateCommit}:${evidenceDigest}`);
  manifest.p28_fresh_checkout.evidence[0].signature = encodedSignature(keys.fresh_checkout_attestor.privateKey, `p28:fresh-checkout:${manifest.release_id}:${candidateCommit}:${evidenceDigest}`);
  manifest.manifest_signer = { role: 'p28_release_authority', key_id: 'p28_release_authority-test-key' };
  manifest.manifest_sha256 = digest(stableJson(manifest));
  manifest.manifest_signature = encodedSignature(keys.p28_release_authority.privateKey, `p28:${manifest.release_id}:${candidateCommit}:${manifest.manifest_sha256}`);
  const testRead = (providedManifest = manifest, providedTrust = trust) => async (path, encoding) => {
    if (path.endsWith('release-evidence.v1.json')) return JSON.stringify(providedManifest);
    if (path.endsWith('activation-trust-store.v1.json')) return JSON.stringify(providedTrust);
    const role = roles.find((candidate) => path.endsWith(`${candidate}-test.pem`));
    return role ? keys[role].publicKey.export({ type: 'spki', format: 'pem' }) : readFile(path, encoding);
  };
  const options = { root, realpath: async (path) => path };
  const assessment = await assessSpatialV3Activation({ ...options, read: testRead() });
  assert.deepEqual(assessment.blockers, []);
  assert.equal(assessment.activation_permitted, true);
  assert.equal(assessment.production_writes, 0);
  assert.equal(assessment.composition_changed, false);

  const roleMisused = structuredClone(manifest);
  roleMisused.p28_fresh_checkout.evidence[0].signer = { role: 'p27_critic', key_id: 'p27_critic-test-key' };
  roleMisused.manifest_sha256 = digest(stableJson(roleMisused));
  roleMisused.manifest_signature = encodedSignature(keys.p28_release_authority.privateKey,
    `p28:${roleMisused.release_id}:${candidateCommit}:${roleMisused.manifest_sha256}`);
  const roleMisuseAssessment = await assessSpatialV3Activation({ ...options, read: testRead(roleMisused) });
  assert(roleMisuseAssessment.blockers.some((entry) => entry.code === 'p28_fresh_checkout_signature_invalid'));

  const wrongKey = structuredClone(manifest);
  wrongKey.p28_fresh_checkout.evidence[0].signer = { role: 'fresh_checkout_attestor', key_id: 'p27_critic-test-key' };
  wrongKey.manifest_sha256 = digest(stableJson(wrongKey));
  wrongKey.manifest_signature = encodedSignature(keys.p28_release_authority.privateKey,
    `p28:${wrongKey.release_id}:${candidateCommit}:${wrongKey.manifest_sha256}`);
  const wrongKeyAssessment = await assessSpatialV3Activation({ ...options, read: testRead(wrongKey) });
  assert(wrongKeyAssessment.blockers.some((entry) => entry.code === 'p28_fresh_checkout_signature_invalid'));

  const revokedTrust = structuredClone(trust);
  revokedTrust.keys.find((entry) => entry.role === 'p28_release_authority').revoked = true;
  const revokedAssessment = await assessSpatialV3Activation({ ...options, read: testRead(manifest, revokedTrust) });
  assert(revokedAssessment.blockers.some((entry) => entry.code === 'release_evidence_manifest_signature_invalid'));
});

test('P28 command exits nonzero rather than silently applying an incomplete activation', async () => {
  await assert.rejects(
    execFile(process.execPath, ['tools/spatial-v3/p28-activation-gate.mjs'], { cwd: process.cwd() }),
    (error) => error.code === 1 && String(error.stdout).includes('"activation_permitted": false')
  );
});
