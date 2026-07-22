import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { canonicalJsonBytes, manifestDigest, validateCanonicalEntries } from './p12-canonical-manifest.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const INDEX_PATH = 'data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/index.v1_1.json';
const CLOSURE_BINDING_PATH = 'data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/dependency-closure/v1/subject-commit-binding.json';
const packageId = 'P12_TARGET_MATERIALIZATION_APPROVAL_V1_1';
const HISTORICAL_BINDING_COMMIT = '99938a6dc90a0f12a2ecb07872ca8fde4c48a5cb';
const HISTORICAL_SUBJECT_COMMIT = 'e6be7c06cbd6c37c375658af6f2fe529d4f64353';
const HISTORICAL_BINDING_BLOB = '3b7e8593543145f7fd3764e372c720858c6b9146';
const execFile = promisify(execFileCallback);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const issue = (code, subject_ref) => Object.freeze({ code, subject_ref });
const inside = (root, candidate) => {
  const path = relative(root, candidate);
  return Boolean(path) && path !== '..' && !path.startsWith(`..${sep}`) && !path.includes(':');
};

async function git(projectRoot, args) {
  const { stdout } = await execFile('git', args, { cwd: projectRoot, encoding: 'utf8', windowsHide: true });
  return stdout.trim();
}

async function gitBytes(projectRoot, args) {
  // Subject evidence intentionally includes immutable ZIP payloads larger than
  // execFile's 1 MiB default.  Keep this bounded rather than treating a valid
  // large blob as a missing Git path.
  const { stdout } = await execFile('git', args, {
    cwd: projectRoot,
    encoding: 'buffer',
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true
  });
  return Buffer.from(stdout);
}

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const sha = (value) => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
const safeRepositoryPath = (value) => typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.includes('\\') && !value.split('/').some((part) => !part || part === '.' || part === '..' || part.includes(':'));

async function zipText(zip, member) {
  const { stdout } = await execFile('tar', ['-xOf', zip, member], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  return Buffer.from(stdout);
}

async function verifyCanonicalZipPackage(zip, packageName, expectedManifestDigest) {
  const prefix = `${packageName}/`;
  const { stdout } = await execFile('tar', ['-tf', zip], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  const members = stdout.split(/\r?\n/u).filter(Boolean);
  const seen = new Set();
  for (const member of members) {
    if (!member.startsWith(prefix) || seen.has(member)) throw new Error('unsafe archive member');
    seen.add(member);
    const path = member.slice(prefix.length);
    if (!path || path.includes('\\') || path.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('unsafe archive member');
  }
  const manifest = JSON.parse((await zipText(zip, `${prefix}manifest.json`)).toString('utf8'));
  validateCanonicalEntries(manifest.files);
  if (manifest.package_id !== packageName || manifestDigest(manifest) !== expectedManifestDigest) throw new Error('invalid package manifest');
  const expected = new Map(manifest.files.map((entry) => [entry.path, entry]));
  const actual = new Set(members.map((member) => member.slice(prefix.length)));
  for (const control of ['manifest.json', 'manifest.sha256']) actual.delete(control);
  if (actual.size !== expected.size || [...actual].some((path) => !expected.has(path))) throw new Error('manifest file set mismatch');
  for (const [path, entry] of expected) {
    const bytes = await zipText(zip, `${prefix}${path}`);
    if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) throw new Error(`manifest entry mismatch: ${path}`);
  }
  return manifest;
}

export async function verifyP12HistoricalIntakeBinding({ projectRoot, bindingPath, binding, head, gitText = git, gitRaw = gitBytes }) {
  const errors = [];
  try { binding = JSON.parse((await gitRaw(projectRoot, ['show', `${HISTORICAL_BINDING_COMMIT}:${bindingPath}`])).toString('utf8')); }
  catch { return Object.freeze({ ok: false, dependencyClosureApproved: false, errors: Object.freeze([issue('P12_V11_HISTORICAL_BINDING_BLOB_UNREADABLE', bindingPath)]) }); }
  const expectedPaths = binding.required_subject_tree_paths;
  const subjectCommit = binding.subject_commit;
  if (!sha(head) || subjectCommit !== HISTORICAL_SUBJECT_COMMIT) {
    return Object.freeze({ ok: false, dependencyClosureApproved: false, errors: Object.freeze([issue('P12_V11_SUBJECT_COMMIT_BINDING_INVALID', bindingPath)]) });
  }
  try {
    const bindingBlob = await gitText(projectRoot, ['rev-parse', `${HISTORICAL_BINDING_COMMIT}:${bindingPath}`]);
    if (bindingBlob !== HISTORICAL_BINDING_BLOB) errors.push(issue('P12_V11_HISTORICAL_BINDING_BLOB_MISMATCH', bindingPath));
    const introductions = (await gitText(projectRoot, ['log', '--all', '--format=%H', '--reverse', `--find-object=${bindingBlob}`])).split(/\r?\n/).filter(Boolean);
    if (introductions[0] !== HISTORICAL_BINDING_COMMIT) errors.push(issue('P12_V11_BINDING_NOT_INTRODUCED_BY_EVIDENCE_COMMIT', bindingPath));
    const parents = (await gitText(projectRoot, ['show', '-s', '--format=%P', HISTORICAL_BINDING_COMMIT])).split(/\s+/).filter(Boolean);
    if (parents.length !== 1 || parents[0] !== subjectCommit) errors.push(issue('P12_V11_BINDING_PARENT_NOT_SUBJECT', bindingPath));
    await gitText(projectRoot, ['merge-base', '--is-ancestor', HISTORICAL_BINDING_COMMIT, head]);
  } catch { errors.push(issue('P12_V11_BINDING_COMMIT_UNVERIFIABLE', bindingPath)); }
  if (!Array.isArray(expectedPaths) || expectedPaths.length === 0 || expectedPaths.some((entry) => !entry || typeof entry.path !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256 ?? ''))) {
    errors.push(issue('P12_V11_SUBJECT_TREE_EVIDENCE_INVALID', bindingPath));
  } else {
    for (const entry of expectedPaths) {
      try {
        const content = await gitRaw(projectRoot, ['show', `${HISTORICAL_SUBJECT_COMMIT}:${entry.path}`]);
        if (sha256(content) !== entry.sha256) errors.push(issue('P12_V11_SUBJECT_TREE_DIGEST_MISMATCH', entry.path));
      } catch { errors.push(issue('P12_V11_SUBJECT_TREE_PATH_MISSING', entry.path)); }
    }
  }
  return Object.freeze({ ok: errors.length === 0, dependencyClosureApproved: false, errors: Object.freeze(errors) });
}

export async function verifyP12DependencyClosureBinding({ projectRoot, bindingPath = CLOSURE_BINDING_PATH, binding, head, gitText = git, gitRaw = gitBytes }) {
  const errors = [];
  try { binding = JSON.parse((await gitRaw(projectRoot, ['show', `${head}:${bindingPath}`])).toString('utf8')); }
  catch { return Object.freeze({ ok: false, dependencyClosureApproved: false, errors: Object.freeze([issue('P12_V11_DEPENDENCY_CLOSURE_EVIDENCE_INVALID', bindingPath)]) }); }
  const subjectCommit = binding.closure_subject_commit;
  const expectedPaths = binding.required_subject_tree_paths;
  if (!sha(head) || !sha(subjectCommit) || head === subjectCommit || binding?.status !== 'APPROVED_FOR_P12_DEPENDENCY_CLOSURE') {
    return Object.freeze({ ok: false, dependencyClosureApproved: false, errors: Object.freeze([issue('P12_V11_DEPENDENCY_CLOSURE_EVIDENCE_INVALID', bindingPath)]) });
  }
  try {
    const bindingBlob = await gitText(projectRoot, ['rev-parse', `${head}:${bindingPath}`]);
    const introductions = (await gitText(projectRoot, ['log', '--all', '--format=%H', '--reverse', `--find-object=${bindingBlob}`])).split(/\r?\n/).filter(Boolean);
    if (introductions.length !== 1) errors.push(issue('P12_V11_CLOSURE_BINDING_NOT_INTRODUCED_BY_EVIDENCE_COMMIT', bindingPath));
    const evidenceCommit = introductions[0];
    if (!evidenceCommit) throw new Error('missing evidence commit');
    await gitText(projectRoot, ['merge-base', '--is-ancestor', evidenceCommit, head]);
    const parents = (await gitText(projectRoot, ['show', '-s', '--format=%P', evidenceCommit])).split(/\s+/).filter(Boolean);
    if (parents.length !== 1 || parents[0] !== subjectCommit) errors.push(issue('P12_V11_CLOSURE_BINDING_PARENT_NOT_SUBJECT', bindingPath));
    const allowed = new Set([bindingPath, ...(Array.isArray(binding.allowed_evidence_paths) ? binding.allowed_evidence_paths : [])]);
    const changed = (await gitText(projectRoot, ['diff', '--name-only', `${subjectCommit}..${evidenceCommit}`])).split(/\r?\n/).filter(Boolean);
    if (!changed.includes(bindingPath) || changed.some((path) => !allowed.has(path))) errors.push(issue('P12_V11_CLOSURE_BINDING_COMMIT_SCOPE_INVALID', bindingPath));
  } catch { errors.push(issue('P12_V11_CLOSURE_BINDING_COMMIT_UNVERIFIABLE', bindingPath)); }
  if (!Array.isArray(expectedPaths) || expectedPaths.length === 0 || expectedPaths.some((entry) => !entry || typeof entry.path !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256 ?? ''))) {
    errors.push(issue('P12_V11_CLOSURE_SUBJECT_TREE_EVIDENCE_INVALID', bindingPath));
  } else {
    const paths = expectedPaths.map((entry) => entry.path);
    if (new Set(paths).size !== paths.length || paths.some((path) => !safeRepositoryPath(path))) errors.push(issue('P12_V11_CLOSURE_SUBJECT_TREE_EVIDENCE_INVALID', bindingPath));
    const manifestPath = binding.closure_manifest_path;
    if (!safeRepositoryPath(manifestPath)) errors.push(issue('P12_V11_CLOSURE_SUBJECT_TREE_EVIDENCE_INVALID', bindingPath));
    else {
      try {
        const manifest = JSON.parse((await gitRaw(projectRoot, ['show', `${subjectCommit}:${manifestPath}`])).toString('utf8'));
        const base = manifestPath.slice(0, manifestPath.lastIndexOf('/') + 1);
        const required = new Set([manifestPath, `${base}manifest.sha256`, ...(manifest.files ?? []).map((entry) => `${base}${entry.path}`), ...(binding.declared_content_paths ?? [])]);
        if ([...required].some((path) => !safeRepositoryPath(path)) || required.size !== paths.length || paths.some((path) => !required.has(path))) errors.push(issue('P12_V11_CLOSURE_SUBJECT_TREE_COVERAGE_INCOMPLETE', manifestPath));
      } catch { errors.push(issue('P12_V11_CLOSURE_MANIFEST_UNVERIFIABLE', manifestPath)); }
    }
    for (const entry of expectedPaths) {
      try {
        if (sha256(await gitRaw(projectRoot, ['show', `${subjectCommit}:${entry.path}`])) !== entry.sha256) errors.push(issue('P12_V11_CLOSURE_SUBJECT_TREE_DIGEST_MISMATCH', entry.path));
      } catch { errors.push(issue('P12_V11_CLOSURE_SUBJECT_TREE_PATH_MISSING', entry.path)); }
    }
  }
  return Object.freeze({ ok: errors.length === 0, dependencyClosureApproved: errors.length === 0, errors: Object.freeze(errors) });
}

// Compatibility export for callers that explicitly test the new closure chain.
export const verifyP12SubjectCommitBinding = verifyP12DependencyClosureBinding;

export async function validateP12TargetMaterializationApprovalV11({ root = ROOT, indexPath = INDEX_PATH } = {}) {
  const projectRoot = resolve(root); const errors = [];
  let index;
  try { index = JSON.parse(await readFile(resolve(projectRoot, indexPath), 'utf8')); }
  catch { return Object.freeze({ ok: false, materialization_authorized: false, errors: Object.freeze([issue('P12_V11_INDEX_MISSING', indexPath)]) }); }
  if (index.package_id !== packageId || index.intake_status !== 'bound_for_repository_apply_pending_dependency_closure' || index.materialization_authorized !== false || index.production_activation !== 'not_authorized') errors.push(issue('P12_V11_IDENTITY_MISMATCH', indexPath));
  const zip = resolve(projectRoot, index.package_path ?? '');
  if (!inside(projectRoot, zip)) errors.push(issue('P12_V11_PATH_ESCAPE', index.package_path ?? 'unknown'));
  let manifest;
  if (!errors.length) {
    try {
      if (digest(await readFile(zip)) !== index.sha256) errors.push(issue('P12_V11_ZIP_DIGEST_MISMATCH', index.package_path));
      manifest = await verifyCanonicalZipPackage(zip, packageId, index.manifest_sha256);
    } catch { errors.push(issue('P12_V11_PACKAGE_MISSING_OR_UNSAFE', index.package_path ?? 'unknown')); }
  }
  try {
      const [branch, head, bindingBytes] = await Promise.all([
        git(projectRoot, ['branch', '--show-current']),
        git(projectRoot, ['rev-parse', 'HEAD']),
        gitBytes(projectRoot, ['show', `${HISTORICAL_BINDING_COMMIT}:${index.binding_path}`])
      ]);
      const binding = JSON.parse(bindingBytes.toString('utf8'));
      const bindingValid = binding.status === 'BOUND_FOR_REPOSITORY_APPLY' && binding.repository === 'PavelSlaven/Novgorod1230' && binding.branch_name === branch && sha(binding.subject_commit) && binding.approval_manifest_sha256 === index.manifest_sha256;
      if (!bindingValid) errors.push(issue('P12_V11_SUBJECT_COMMIT_BINDING_INVALID', index.binding_path));
      else {
        const intake = await verifyP12HistoricalIntakeBinding({ projectRoot, bindingPath: index.binding_path, binding, head });
        errors.push(...intake.errors);
        try {
          const closureEvidence = await verifyP12DependencyClosureBinding({ projectRoot, head });
          if (closureEvidence.errors.length === 1 && closureEvidence.errors[0].code === 'P12_V11_DEPENDENCY_CLOSURE_EVIDENCE_INVALID') errors.push(issue('P12_V11_DEPENDENCY_CLOSURE_EVIDENCE_MISSING', CLOSURE_BINDING_PATH));
          else errors.push(...closureEvidence.errors);
        } catch {
          errors.push(issue('P12_V11_DEPENDENCY_CLOSURE_EVIDENCE_MISSING', CLOSURE_BINDING_PATH));
        }
      }
  } catch { errors.push(issue('P12_V11_SUBJECT_COMMIT_NOT_REACHABLE', index.binding_path)); }
  return Object.freeze({ ok: errors.length === 0, package_id: packageId, materialization_authorized: false, p12_operational_gaps_closed: false, p28_activation: 'not_authorized', errors: Object.freeze(errors) });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await validateP12TargetMaterializationApprovalV11();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
