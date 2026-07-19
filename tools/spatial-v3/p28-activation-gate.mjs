import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFile, realpath as realpathFs } from 'node:fs/promises';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { posix, relative, resolve, win32 } from 'node:path';
import { pathToFileURL } from 'node:url';

const FREEZE = (value) => Object.freeze(value);
const MANIFEST_PATH = 'docs/migration/spatial-v3/release-evidence.v1.json';
const TRUST_STORE_PATH = 'docs/migration/spatial-v3/activation-trust-store.v1.json';
const execFile = promisify(execFileCallback);
const BLOCKING_GAP_CODES = FREEZE([
  'CANONICAL_G5_INVENTORY_DATA_GAP',
  'DIRECTIONAL_EXIT_READINESS_DATA_GAP',
  'ROUTE_BINDING_DATA_GAP',
  'APPROVED_PROFILE_DATA_GAP'
]);

const APPENDIX_D_ITEMS = FREEZE([
  'D1.github_main_fixed', 'D1.root_agents_read', 'D1.github_agents_read', 'D1.conditional_documents_read', 'D1.navigation_and_catalog_read', 'D1.rag_and_graphify_recorded', 'D1.norm_conflicts_empty',
  'D2.public_contracts_single_declaration', 'D2.contract_types_resolve', 'D2.no_placeholder_or_unresolved_branch', 'D2.versioned_authoring_refs', 'D2.contract_schema_dto_ddl_match', 'D2.plural_relations_normalized', 'D2.schema_reference_ddl_digest', 'D2.route_endpoint_context_validators', 'D2.capacity_proof', 'D2.regional_g5_and_exits_complete', 'D2.empty_candidate_sets_hard_block',
  'D3.one_production_owner_writer', 'D3.preparation_before_activation', 'D3.frontier_no_move_or_time', 'D3.separate_executor_contracts', 'D3.failed_retry_lineage', 'D3.no_open_interval_result', 'D3.rational_time_slice_independent', 'D3.boundary_zero_time_context', 'D3.carrier_root_projection', 'D3.mode_transition_new_plan', 'D3.stranded_save_load_rescue', 'D3.player_projection_no_hidden_topology', 'D3.knowledge_token_pinned_resolution', 'D3.portal_state_exhaustive', 'D3.blocker_capacity_deterministic_locks', 'D3.journey_exact_handoff_snapshot',
  'D4.partial_unique_predicates', 'D4.global_lock_order', 'D4.idempotency_identical_result', 'D4.idempotency_digest_rejected', 'D4.clock_matching_committed_result', 'D4.frontier_capacity_concurrency', 'D4.branch_committed_exhaustion', 'D4.movement_topology_no_free_move', 'D4.journey_reload_no_latest_catalog',
  'D5.full_v2_inventory_mapping', 'D5.ambiguous_hard_block', 'D5.no_dual_write', 'D5.postgres_import_lifecycle', 'D5.new_game_existing_save_e2e', 'D5.docs_catalogs_ownership_sync', 'D5.readme_checks_critic_cycles',
  'D6.contract_unit_tests', 'D6.negative_invariant_tests', 'D6.property_time_route_tests', 'D6.targeted_package_tests', 'D6.full_project_tests', 'D6.postgres_integration', 'D6.generated_artifacts_reproduced', 'D6.independent_critic_accepted'
]);

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isDigest(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

/**
 * Trust identity is the encoded SubjectPublicKeyInfo, never the source PEM.
 * A PEM is just a transport encoding: two differently wrapped PEM strings can
 * represent the same key.  Canonical DER therefore prevents one Ed25519 key
 * from being registered under more than one release role.
 */
function canonicalEd25519PublicKey(publicKeyPem) {
  const key = createPublicKey(publicKeyPem);
  if (key.type !== 'public' || key.asymmetricKeyType !== 'ed25519') {
    throw new Error('trusted key must be an Ed25519 public key');
  }
  return FREEZE({
    publicKey: key,
    spkiSha256: sha256(key.export({ type: 'spki', format: 'der' }))
  });
}

async function safePath(root, evidencePath, realpath = realpathFs) {
  // Evidence paths are canonical repository-relative POSIX paths.  Rejecting
  // alternate spellings is intentional: it prevents drive/UNC ambiguity and
  // makes a manifest byte-for-byte portable between Windows and POSIX.
  if (typeof evidencePath !== 'string' || evidencePath.length === 0 || evidencePath.includes('\0')
    || win32.isAbsolute(evidencePath) || posix.isAbsolute(evidencePath)
    || /^[a-z]:/iu.test(evidencePath) || /^[\\/]{2}/u.test(evidencePath)
    || evidencePath.includes('\\')) return null;
  const segments = evidencePath.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')
    || posix.normalize(evidencePath) !== evidencePath) return null;
  try {
    const [rootReal, targetReal] = await Promise.all([realpath(root), realpath(resolve(root, evidencePath))]);
    const rel = relative(rootReal, targetReal);
    return rel && !rel.startsWith('..') && !win32.isAbsolute(rel) && !posix.isAbsolute(rel) ? targetReal : null;
  } catch {
    return null;
  }
}

function immutablePayload(manifest) {
  const { manifest_sha256: _digest, manifest_signature: _signature, ...payload } = manifest;
  return payload;
}

/**
 * P28 is deliberately a release gate, not an activation switch. Permission is
 * derived only from a versioned, hash-bound and signed evidence manifest.
 */
export async function assessSpatialV3Activation({ root = process.cwd(), read = readFile, realpath = realpathFs } = {}) {
  const blockers = [];
  const add = (code, evidence = MANIFEST_PATH, details = {}) => blockers.push(FREEZE({ code, evidence, ...details }));
  let manifest;
  let trust;
  try {
    manifest = JSON.parse(await read(resolve(root, MANIFEST_PATH), 'utf8'));
  } catch {
    add('release_evidence_manifest_missing');
    return result(blockers);
  }
  try {
    trust = await loadTrustStore({ root, read, realpath, add });
  } catch {
    // loadTrustStore records a typed blocker. This catch only preserves the
    // fail-closed property if an injected reader itself throws unexpectedly.
    add('release_evidence_trust_store_invalid', TRUST_STORE_PATH);
  }

  if (manifest.schema !== 'rus.spatial-v3.release-evidence.v1' || manifest.version !== 1) add('release_evidence_manifest_schema_invalid');
  const calculatedManifestDigest = sha256(stableJson(immutablePayload(manifest)));
  if (manifest.manifest_sha256 !== calculatedManifestDigest) add('release_evidence_manifest_digest_mismatch');
  await validateRoleSignature({ trust, role: 'p28_release_authority', signer: manifest.manifest_signer,
    signature: manifest.manifest_signature, payload: `p28:${manifest.release_id}:${manifest.activation_candidate_commit}:${calculatedManifestDigest}`,
    add, code: 'release_evidence_manifest_signature_invalid' });

  const currentHeadCommit = await currentHead(root);
  if (!isCommit(manifest.activation_candidate_commit) || !currentHeadCommit || manifest.activation_candidate_commit !== currentHeadCommit) {
    add('activation_candidate_commit_current_head_mismatch');
  }

  const items = manifest.appendix_d_items;
  if (!Array.isArray(items) || items.length !== APPENDIX_D_ITEMS.length || new Set(items.map((item) => item?.id)).size !== APPENDIX_D_ITEMS.length
    || APPENDIX_D_ITEMS.some((id) => !items.some((item) => item?.id === id))) {
    add('appendix_d_evidence_coverage_invalid');
  } else {
    for (const item of items) await validateChecklistItem({ root, read, realpath, item, add });
  }

  await validateP12Gaps({ root, read, gaps: manifest.p12_authoring_gaps, add });
  await validateP27Critic({ root, read, realpath, releaseId: manifest.release_id, candidateCommit: manifest.activation_candidate_commit,
    report: manifest.p27_independent_critic, trust, add });
  if (manifest.p28_fresh_checkout?.status !== 'passed' || manifest.p28_fresh_checkout.activation_candidate_commit !== manifest.activation_candidate_commit
    || !Array.isArray(manifest.p28_fresh_checkout?.evidence) || manifest.p28_fresh_checkout.evidence.length === 0) {
    add('p28_fresh_checkout_evidence_missing');
  } else {
    for (const evidence of manifest.p28_fresh_checkout.evidence) {
      const digest = await validateHashedEvidence({ root, read, realpath, evidence, add, code: 'p28_fresh_checkout_evidence_invalid' });
      if (digest) await validateRoleSignature({ trust, role: 'fresh_checkout_attestor', signer: evidence.signer, signature: evidence.signature,
        payload: `p28:fresh-checkout:${manifest.release_id}:${manifest.activation_candidate_commit}:${digest}`, add,
        code: 'p28_fresh_checkout_signature_invalid' });
    }
  }
  return result(blockers);
}

async function validateChecklistItem({ root, read, realpath, item, add }) {
  if (item.status !== 'passed') {
    add('appendix_d_item_unchecked', MANIFEST_PATH, { item_id: item.id, status: item.status ?? 'missing' });
    return;
  }
  if (!Array.isArray(item.evidence) || item.evidence.length === 0) {
    add('appendix_d_item_evidence_missing', MANIFEST_PATH, { item_id: item.id });
    return;
  }
  for (const evidence of item.evidence) await validateHashedEvidence({ root, read, realpath, evidence, add, code: 'appendix_d_evidence_hash_mismatch', details: { item_id: item.id } });
}

async function validateP12Gaps({ root, read, gaps, add }) {
  const expected = new Map([
    ['CANONICAL_G5_INVENTORY_DATA_GAP', 'novgorod:g4-inventory:195'],
    ['DIRECTIONAL_EXIT_READINESS_DATA_GAP', 'novgorod:physical-edge-inventory:358'],
    ['ROUTE_BINDING_DATA_GAP', 'novgorod:graph-edge-inventory:600'],
    ['APPROVED_PROFILE_DATA_GAP', 'novgorod:g4-scene-profiles']
  ]);
  if (!Array.isArray(gaps) || gaps.length !== expected.size || new Set(gaps.map((gap) => gap?.code)).size !== expected.size) {
    add('p12_gap_evidence_coverage_invalid');
    return;
  }
  for (const [code, subject_ref] of expected) {
    const gap = gaps.find((entry) => entry?.code === code);
    if (!gap || gap.subject_ref !== subject_ref) {
      add('p12_gap_identity_or_quantity_mismatch', MANIFEST_PATH, { gap_code: code, subject_ref });
      continue;
    }
    if (gap.status !== 'resolved' || !Array.isArray(gap.resolution_evidence) || gap.resolution_evidence.length === 0) {
      add('spatial_candidate_gap', MANIFEST_PATH, { gap_code: code, subject_ref, resolution_status: gap.status ?? 'missing' });
      continue;
    }
    for (const evidence of gap.resolution_evidence) await validateHashedEvidence({ root, read, evidence, add, code: 'p12_gap_resolution_evidence_invalid', details: { gap_code: code, subject_ref } });
  }
}

async function validateP27Critic({ root, read, realpath, releaseId, candidateCommit, report, trust, add }) {
  if (!report || report.status !== 'passed' || !['PASS', 'PASS WITH NOTES'].includes(report.verdict)
    || report.activation_candidate_commit !== candidateCommit || !report.signer || !report.signature?.value) {
    add('p27_independent_critic_evidence_missing');
    return;
  }
  const reportDigest = await validateHashedEvidence({ root, read, realpath, evidence: report, add, code: 'p27_independent_critic_hash_mismatch' });
  if (reportDigest) await validateRoleSignature({ trust, role: 'p27_critic', signer: report.signer, signature: report.signature,
    payload: `p27:${releaseId}:${candidateCommit}:${reportDigest}`, add, code: 'p27_independent_critic_signature_invalid' });
}

async function validateHashedEvidence({ root, read, realpath, evidence, add, code, details = {} }) {
  const absolute = await safePath(root, evidence?.path, realpath);
  if (!absolute || !isDigest(evidence?.sha256)) {
    add(code, MANIFEST_PATH, details);
    return null;
  }
  try {
    const actual = sha256(await read(absolute));
    if (actual !== evidence.sha256) {
      add(code, evidence.path, details);
      return null;
    }
    return actual;
  } catch {
    add(code, evidence.path, details);
    return null;
  }
}

async function loadTrustStore({ root, read, realpath, add }) {
  let store;
  try {
    store = JSON.parse(await read(resolve(root, TRUST_STORE_PATH), 'utf8'));
  } catch {
    add('release_evidence_trust_store_invalid', TRUST_STORE_PATH);
    return null;
  }
  if (store.schema !== 'rus.spatial-v3.activation-trust-store.v1' || store.version !== 1 || !Array.isArray(store.keys)) {
    add('release_evidence_trust_store_invalid', TRUST_STORE_PATH);
    return null;
  }
  const required = ['p27_critic', 'fresh_checkout_attestor', 'p28_release_authority'];
  const requiredRoles = new Set(required);
  if (store.keys.length !== required.length
    || new Set(store.keys.map((key) => key?.role)).size !== required.length
    || store.keys.some((key) => !requiredRoles.has(key?.role))) {
    add('release_evidence_trust_store_invalid', TRUST_STORE_PATH);
    return null;
  }
  const keys = new Map();
  for (const role of required) {
    const matches = store.keys.filter((key) => key?.role === role);
    const entry = matches[0];
    if (matches.length !== 1 || typeof entry.key_id !== 'string' || !entry.key_id || typeof entry.public_key_path !== 'string') {
      add('release_evidence_trust_store_invalid', TRUST_STORE_PATH, { role });
      continue;
    }
    const absolute = await safePath(root, entry.public_key_path, realpath);
    try {
      const sourcePem = absolute ? await read(absolute, 'utf8') : null;
      if (!sourcePem) throw new Error('trusted public key is unavailable');
      const canonical = canonicalEd25519PublicKey(sourcePem);
      keys.set(role, { ...entry, ...canonical });
    } catch {
      add('release_evidence_trust_store_invalid', TRUST_STORE_PATH, { role });
    }
  }
  if (keys.size !== required.length
    || new Set([...keys.values()].map((key) => key.key_id)).size !== required.length
    || new Set([...keys.values()].map((key) => key.spkiSha256)).size !== required.length) {
    add('release_evidence_trust_store_invalid', TRUST_STORE_PATH);
    return null;
  }
  return keys;
}

async function validateRoleSignature({ trust, role, signer, signature, payload, add, code }) {
  const key = trust?.get(role);
  try {
    if (!key || key.revoked === true || signer?.role !== role || signer?.key_id !== key.key_id
      || signature?.algorithm !== 'ed25519' || typeof signature?.value !== 'string' || !key.publicKey
      || !verify(null, Buffer.from(payload, 'utf8'), key.publicKey, Buffer.from(signature.value, 'base64'))) add(code);
  } catch {
    add(code);
  }
}

function isCommit(value) {
  return typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
}

async function currentHead(root) {
  try {
    const { stdout } = await execFile('git', ['rev-parse', 'HEAD'], { cwd: root, windowsHide: true });
    const head = stdout.trim().toLowerCase();
    return isCommit(head) ? head : null;
  } catch {
    return null;
  }
}

function result(blockers) {
  return FREEZE({
    schema: 'rus.spatial-v3.p28-activation-assessment.v2',
    activation_permitted: blockers.length === 0,
    production_writes: 0,
    composition_changed: false,
    blockers: FREEZE(blockers),
    activation_patch_must_update: FREEZE(['ADR status', 'normative conflict register', 'target/active documentation', 'production composition']),
    required_action: blockers.length === 0 ? 'apply_atomic_activation_patch' : 'reopen_owner_phase_and_keep_v2_production'
  });
}

/** Caller-supplied approval objects are never trusted: this always revalidates disk evidence. */
export async function requireSpatialV3Activation(options = {}) {
  const assessment = await assessSpatialV3Activation(options && typeof options === 'object' && !('activation_permitted' in options) ? options : {});
  if (assessment.activation_permitted) return assessment;
  const error = Object.assign(new Error('P28 activation is blocked by mandatory release evidence.'), { code: 'spatial_v3_activation_blocked', assessment });
  throw error;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const assessment = await assessSpatialV3Activation();
  console.log(JSON.stringify(assessment, null, 2));
  if (!assessment.activation_permitted) process.exitCode = 1;
}
