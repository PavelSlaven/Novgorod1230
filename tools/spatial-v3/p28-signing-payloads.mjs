import { createHash } from 'node:crypto';
import { readFile, realpath as realpathFs } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  P28_APPENDIX_D_ITEMS,
  P28_P12_GAPS,
  computeP28ManifestDigest,
  loadP28TrustStore,
  readP28GitRaw,
  resolveSafeRepositoryPath,
  validateP28HashedEvidence,
  validateP28P12GapIdentities,
  validateP28RoleSignature,
  verifyP28EvidenceCommitBinding
} from './p28-activation-gate.mjs';

const MANIFEST_PATH = 'docs/migration/spatial-v3/release-evidence.v1.json';
const TRUST_STORE_PATH = 'docs/migration/spatial-v3/activation-trust-store.v1.json';
const COMMIT = /^[a-f0-9]{40}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const freeze = Object.freeze;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const issue = (code, details = {}) => freeze({ code, ...details });
const signer = (value, role, trustedRoleKeys) => value?.role === role && value?.key_id === trustedRoleKeys.get(role);
const evidenceRef = (value) => typeof value?.path === 'string' && value.path.length > 0 && DIGEST.test(value?.sha256);

function payload(role, value) {
  return freeze({ role, payload: value, payload_sha256: sha256(value) });
}

function validateAppendix(manifest, structuralErrors, unresolved) {
  const items = manifest.appendix_d_items;
  if (!Array.isArray(items) || items.length !== P28_APPENDIX_D_ITEMS.length
    || new Set(items.map((item) => item?.id)).size !== P28_APPENDIX_D_ITEMS.length
    || P28_APPENDIX_D_ITEMS.some((id) => !items.some((item) => item?.id === id))) {
    structuralErrors.push(issue('appendix_d_evidence_coverage_invalid'));
    return;
  }
  for (const item of items) {
    if (item.status !== 'passed') unresolved.push(issue('appendix_d_item_unchecked', { item_id: item.id, status: item.status ?? 'missing' }));
    else if (!Array.isArray(item.evidence) || item.evidence.length === 0 || item.evidence.some((entry) => !evidenceRef(entry))) {
      structuralErrors.push(issue('appendix_d_item_evidence_invalid', { item_id: item.id }));
    }
  }
}

function validateP12(manifest, structuralErrors, unresolved) {
  const identityErrors = validateP28P12GapIdentities(manifest.p12_authoring_gaps);
  structuralErrors.push(...identityErrors.map(({ code, ...details }) => issue(code, details)));
  if (identityErrors.some((entry) => entry.code === 'p12_gap_evidence_coverage_invalid')) return;
  const invalidCodes = new Set(identityErrors.map((entry) => entry.gap_code).filter(Boolean));
  for (const { code } of P28_P12_GAPS) {
    const gap = manifest.p12_authoring_gaps.find((entry) => entry?.code === code);
    if (invalidCodes.has(code)) continue;
    if (gap.status !== 'resolved') unresolved.push(issue('spatial_candidate_gap', { gap_code: gap.code, status: gap.status ?? 'missing' }));
    else if (!Array.isArray(gap.resolution_evidence) || gap.resolution_evidence.length === 0 || gap.resolution_evidence.some((entry) => !evidenceRef(entry))) {
      structuralErrors.push(issue('p12_gap_resolution_evidence_invalid', { gap_code: gap.code }));
    }
  }
}

export async function prepareP28SigningPayloads({
  root = process.cwd(), manifestPath = MANIFEST_PATH, manifest, manifestBytes,
  protectedPaths = [], read = readFile, realpath = realpathFs, gitText, gitRaw
} = {}) {
  const structuralErrors = [];
  const unresolved = [];
  const addStructural = (code, evidence = manifestPath, details = {}) => structuralErrors.push(issue(code, { evidence, ...details }));
  const committedBlobCache = new Map();
  const baseGitRaw = gitRaw ?? readP28GitRaw;
  const readGitRaw = async (gitRoot, args) => {
    const key = `${gitRoot}\0${args.join('\0')}`;
    if (!committedBlobCache.has(key)) committedBlobCache.set(key, await baseGitRaw(gitRoot, args));
    return committedBlobCache.get(key);
  };
  let trust = null;
  try {
    trust = await loadP28TrustStore({
      root, read, realpath, gitRaw: readGitRaw,
      add: (code, evidence, details) => addStructural(code === 'release_evidence_trust_store_invalid'
        ? 'activation_trust_store_invalid' : code, evidence, details)
    });
  } catch {
    addStructural('activation_trust_store_invalid', TRUST_STORE_PATH);
  }
  const trustedRoleKeys = new Map([...(trust?.keys?.entries() ?? [])].map(([role, entry]) => [role, entry.key_id]));
  const candidateProtectedPaths = [...new Set([...(trust?.protectedPaths ?? [TRUST_STORE_PATH]), ...protectedPaths])];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) structuralErrors.push(issue('release_evidence_manifest_schema_invalid'));
  if (manifest?.schema !== 'rus.spatial-v3.release-evidence.v1' || manifest?.version !== 1
    || typeof manifest?.release_id !== 'string' || manifest.release_id.length === 0) structuralErrors.push(issue('release_evidence_manifest_schema_invalid'));
  if (!COMMIT.test(manifest?.activation_candidate_commit ?? '')) structuralErrors.push(issue('activation_candidate_commit_invalid'));
  validateAppendix(manifest ?? {}, structuralErrors, unresolved);
  validateP12(manifest ?? {}, structuralErrors, unresolved);

  const validateEvidence = async (entry, code, details = {}) => evidenceRef(entry)
    ? validateP28HashedEvidence({
      root, read, realpath, gitRaw: readGitRaw, evidence: entry,
      add: (errorCode, evidence, errorDetails) => addStructural(errorCode, evidence, errorDetails), code, details
    })
    : null;
  if (Array.isArray(manifest?.appendix_d_items)) {
    for (const item of manifest.appendix_d_items) for (const entry of item?.evidence ?? []) {
      await validateEvidence(entry, 'appendix_d_evidence_hash_mismatch', { item_id: item?.id });
    }
  }
  if (Array.isArray(manifest?.p12_authoring_gaps)) {
    for (const gap of manifest.p12_authoring_gaps) for (const entry of gap?.resolution_evidence ?? []) {
      await validateEvidence(entry, 'p12_gap_resolution_evidence_invalid', { gap_code: gap?.code });
    }
  }

  const critic = manifest?.p27_independent_critic;
  let p27PayloadReady = false;
  if (!critic || critic.status !== 'passed' || !['PASS', 'PASS WITH NOTES'].includes(critic.verdict)) {
    unresolved.push(issue('p27_independent_critic_evidence_missing'));
  } else {
    if (critic.activation_candidate_commit !== manifest.activation_candidate_commit) structuralErrors.push(issue('p27_candidate_commit_mismatch'));
    const criticDigest = await validateEvidence(critic, 'p27_independent_critic_hash_mismatch');
    if (!criticDigest || !signer(critic.signer, 'p27_critic', trustedRoleKeys)) structuralErrors.push(issue('p27_critic_signing_input_invalid'));
    else p27PayloadReady = true;
    if (critic.signature == null) unresolved.push(issue('p27_signature_missing'));
    else if (criticDigest && !await validateP28RoleSignature({
      trust, role: 'p27_critic', signer: critic.signer, signature: critic.signature,
      payload: `p27:${manifest.release_id}:${manifest.activation_candidate_commit}:${criticDigest}`,
      add: () => structuralErrors.push(issue('p27_signature_invalid')), code: 'p27_signature_invalid'
    })) p27PayloadReady = false;
  }

  const checkout = manifest?.p28_fresh_checkout;
  let freshPayloadReady = false;
  if (!checkout || checkout.status !== 'passed' || !Array.isArray(checkout.evidence) || checkout.evidence.length === 0) {
    unresolved.push(issue('p28_fresh_checkout_evidence_missing'));
  } else {
    if (checkout.activation_candidate_commit !== manifest.activation_candidate_commit) structuralErrors.push(issue('fresh_checkout_candidate_commit_mismatch'));
    if (checkout.evidence.some((entry) => !evidenceRef(entry) || !signer(entry.signer, 'fresh_checkout_attestor', trustedRoleKeys))) {
      structuralErrors.push(issue('fresh_checkout_signer_invalid'));
    } else freshPayloadReady = true;
    for (const [index, entry] of checkout.evidence.entries()) {
      const digest = await validateEvidence(entry, 'p28_fresh_checkout_evidence_invalid', { evidence_index: index });
      if (!digest) freshPayloadReady = false;
      if (entry.signature == null) unresolved.push(issue('fresh_checkout_signature_missing', { evidence_index: index }));
      else if (digest && !await validateP28RoleSignature({
        trust, role: 'fresh_checkout_attestor', signer: entry.signer, signature: entry.signature,
        payload: `p28:fresh-checkout:${manifest.release_id}:${manifest.activation_candidate_commit}:${digest}`,
        add: () => structuralErrors.push(issue('fresh_checkout_signature_invalid', { evidence_index: index })),
        code: 'fresh_checkout_signature_invalid'
      })) freshPayloadReady = false;
    }
  }
  if (manifest?.manifest_signer == null) unresolved.push(issue('release_authority_signer_missing'));
  else if (!signer(manifest.manifest_signer, 'p28_release_authority', trustedRoleKeys)) structuralErrors.push(issue('release_authority_signer_invalid'));

  let chainBlockers = [];
  if (structuralErrors.length === 0) {
    chainBlockers = await verifyP28EvidenceCommitBinding({
      root, manifestPath, manifest, manifestBytes, protectedPaths: candidateProtectedPaths,
      ...(gitText ? { gitText } : {}), gitRaw: readGitRaw
    });
  }
  const chainReady = structuralErrors.length === 0 && chainBlockers.length === 0;
  const ready = chainReady && unresolved.length === 0;
  let payloads = null;
  let manifestDigest = null;
  if (chainReady) {
    if (ready) manifestDigest = computeP28ManifestDigest(manifest);
    payloads = freeze({
      p27_critic: p27PayloadReady ? payload('p27_critic', `p27:${manifest.release_id}:${manifest.activation_candidate_commit}:${critic.sha256}`) : null,
      fresh_checkout_attestor: freeze(freshPayloadReady ? checkout.evidence.map((entry) => payload('fresh_checkout_attestor',
        `p28:fresh-checkout:${manifest.release_id}:${manifest.activation_candidate_commit}:${entry.sha256}`)) : []),
      p28_release_authority: ready ? payload('p28_release_authority',
        `p28:${manifest.release_id}:${manifest.activation_candidate_commit}:${manifestDigest}`) : null
    });
  }
  return freeze({
    schema: 'rus.spatial-v3.p28-signing-payloads.v1',
    ready_for_offline_signing: ready,
    manifest_path: manifestPath,
    activation_candidate_commit: manifest?.activation_candidate_commit ?? null,
    manifest_digest: manifestDigest,
    payloads,
    structural_errors: freeze(structuralErrors),
    unresolved_evidence: freeze(unresolved),
    chain_blockers: freeze(chainBlockers),
    mutated_files: 0,
    private_keys_accessed: 0,
    signatures_created: 0,
    production_writes: 0,
    composition_changed: false
  });
}

export async function inspectP28SigningPayloadsFromRepository({
  root = process.cwd(), manifestPath = MANIFEST_PATH, read = readFile, realpath = realpathFs,
  gitText, gitRaw
} = {}) {
  const absolute = await resolveSafeRepositoryPath(root, manifestPath, realpath);
  if (!absolute) throw Object.assign(new Error('manifest path must be an existing canonical repository-relative POSIX path'), { code: 'operator_manifest_path_invalid' });
  const manifestBytes = await read(absolute);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  return prepareP28SigningPayloads({ root, manifestPath, manifest, manifestBytes, read, realpath,
    ...(gitText ? { gitText } : {}), ...(gitRaw ? { gitRaw } : {}) });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const manifestArg = process.argv.indexOf('--manifest');
  const manifestPath = manifestArg >= 0 ? process.argv[manifestArg + 1] : MANIFEST_PATH;
  try {
    if (manifestArg >= 0 && (!manifestPath || manifestPath.startsWith('--'))) {
      throw Object.assign(new Error('--manifest requires a repository-relative POSIX path'), { code: 'operator_manifest_path_invalid' });
    }
    const result = await inspectP28SigningPayloadsFromRepository({ manifestPath });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ready_for_offline_signing) process.exitCode = 2;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      schema: 'rus.spatial-v3.p28-signing-payloads.v1', ready_for_offline_signing: false,
      structural_errors: [issue(error.code ?? 'operator_input_unreadable', { message: error.message })],
      mutated_files: 0, private_keys_accessed: 0, signatures_created: 0, production_writes: 0, composition_changed: false
    }, null, 2)}\n`);
    process.exitCode = 2;
  }
}
