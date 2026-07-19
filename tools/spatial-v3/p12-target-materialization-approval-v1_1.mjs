import { createHash } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { manifestDigest, verifyCanonicalManifest } from './p12-canonical-manifest.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const INDEX_PATH = 'data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/index.v1_1.json';
const packageId = 'P12_TARGET_MATERIALIZATION_APPROVAL_V1_1';
const execFile = promisify(execFileCallback);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const issue = (code, subject_ref) => Object.freeze({ code, subject_ref });
const inside = (root, candidate) => {
  const path = relative(root, candidate);
  return Boolean(path) && path !== '..' && !path.startsWith(`..${sep}`) && !path.includes(':');
};

const extract = String.raw`
import sys, zipfile
from pathlib import Path, PurePosixPath
archive, root, package = map(Path, sys.argv[1:])
with zipfile.ZipFile(archive) as z:
  seen = set()
  for info in z.infolist():
    p = PurePosixPath(info.filename)
    if p.is_absolute() or not p.parts or p.parts[0] != package.name or any(x in ('', '.', '..') for x in p.parts) or info.filename in seen or ((info.external_attr >> 16) & 0o170000) == 0o120000:
      raise SystemExit('unsafe archive member')
    seen.add(info.filename)
    output = root.joinpath(*p.parts).resolve()
    if not output.is_relative_to(root.resolve()): raise SystemExit('archive escape')
    if info.is_dir(): output.mkdir(parents=True, exist_ok=True)
    else:
      output.parent.mkdir(parents=True, exist_ok=True)
      output.write_bytes(z.read(info))
`;

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

/**
 * Verifies a two-commit P12 evidence chain without treating a reachable
 * ancestor as current approval.  The binding commit is deliberately required
 * to be HEAD: a later checkout needs a new, explicit evidence commit.
 */
export async function verifyP12SubjectCommitBinding({ projectRoot, bindingPath, binding, head, gitText = git, gitRaw = gitBytes }) {
  const errors = [];
  const expectedPaths = binding?.required_subject_tree_paths;
  // The evidence commit is derived from Git HEAD rather than serialized into
  // the file it creates.  Serializing that SHA would be a circular hash
  // dependency and is therefore not trustworthy evidence.
  const bindingCommit = head;
  const subjectCommit = binding?.subject_commit;
  const closure = binding?.approved_dependency_closure;
  if (!sha(bindingCommit) || !sha(subjectCommit) || bindingCommit === subjectCommit) {
    return Object.freeze({ ok: false, dependencyClosureApproved: false, errors: Object.freeze([issue('P12_V11_SUBJECT_COMMIT_BINDING_INVALID', bindingPath)]) });
  }
  try {
    const parents = (await gitText(projectRoot, ['show', '-s', '--format=%P', bindingCommit])).split(/\s+/).filter(Boolean);
    if (parents.length !== 1 || parents[0] !== subjectCommit) errors.push(issue('P12_V11_BINDING_PARENT_NOT_SUBJECT', bindingPath));
    const bindingBlob = await gitText(projectRoot, ['rev-parse', `${bindingCommit}:${bindingPath}`]);
    const introductions = (await gitText(projectRoot, ['log', '--all', '--format=%H', '--reverse', `--find-object=${bindingBlob}`])).split(/\r?\n/).filter(Boolean);
    if (introductions.length !== 1 || introductions[0] !== bindingCommit) errors.push(issue('P12_V11_BINDING_NOT_INTRODUCED_BY_EVIDENCE_COMMIT', bindingPath));
    const allowed = new Set([bindingPath, ...(Array.isArray(binding.allowed_evidence_paths) ? binding.allowed_evidence_paths : [])]);
    const changed = (await gitText(projectRoot, ['diff', '--name-only', `${subjectCommit}..${bindingCommit}`])).split(/\r?\n/).filter(Boolean);
    if (!changed.includes(bindingPath) || changed.some((path) => !allowed.has(path))) errors.push(issue('P12_V11_BINDING_COMMIT_SCOPE_INVALID', bindingPath));
  } catch { errors.push(issue('P12_V11_BINDING_COMMIT_UNVERIFIABLE', bindingPath)); }
  if (!Array.isArray(expectedPaths) || expectedPaths.length === 0 || expectedPaths.some((entry) => !entry || typeof entry.path !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256 ?? ''))) {
    errors.push(issue('P12_V11_SUBJECT_TREE_EVIDENCE_INVALID', bindingPath));
  } else {
    for (const entry of expectedPaths) {
      try {
        const content = await gitRaw(projectRoot, ['show', `${subjectCommit}:${entry.path}`]);
        if (sha256(content) !== entry.sha256) errors.push(issue('P12_V11_SUBJECT_TREE_DIGEST_MISMATCH', entry.path));
      } catch { errors.push(issue('P12_V11_SUBJECT_TREE_PATH_MISSING', entry.path)); }
    }
  }
  const dependencyClosureApproved = closure?.status === 'APPROVED'
    && closure?.evidence_commit === bindingCommit
    && typeof closure?.evidence_id === 'string' && closure.evidence_id.length > 0;
  if (!dependencyClosureApproved) errors.push(issue('P12_V11_DEPENDENCY_CLOSURE_EVIDENCE_MISSING', bindingPath));
  return Object.freeze({ ok: errors.length === 0, dependencyClosureApproved, errors: Object.freeze(errors) });
}

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
      const extraction = await mkdtemp(join(tmpdir(), 'p12-v1_1-'));
      try {
        await execFile('python', ['-c', extract, zip, extraction, packageId], { windowsHide: true });
        const packageRoot = join(extraction, packageId);
        manifest = JSON.parse(await readFile(join(packageRoot, 'manifest.json'), 'utf8'));
        const verified = await verifyCanonicalManifest(packageRoot, manifest);
        if (!verified.ok || manifest.package_id !== packageId || manifestDigest(manifest) !== index.manifest_sha256) errors.push(issue('P12_V11_CANONICAL_MANIFEST_INVALID', index.package_path));
      } finally { await rm(extraction, { recursive: true, force: true }); }
    } catch { errors.push(issue('P12_V11_PACKAGE_MISSING_OR_UNSAFE', index.package_path ?? 'unknown')); }
  }
  let binding;
  try { binding = JSON.parse(await readFile(resolve(projectRoot, index.binding_path), 'utf8')); }
  catch { errors.push(issue('P12_V11_SUBJECT_COMMIT_BINDING_MISSING', index.binding_path)); }
  if (binding) {
    try {
      const [branch, head] = await Promise.all([git(projectRoot, ['branch', '--show-current']), git(projectRoot, ['rev-parse', 'HEAD'])]);
      const bindingValid = binding.status === 'BOUND_FOR_REPOSITORY_APPLY' && binding.repository === 'PavelSlaven/Novgorod1230' && binding.branch_name === branch && sha(binding.subject_commit) && binding.approval_manifest_sha256 === index.manifest_sha256;
      if (!bindingValid) errors.push(issue('P12_V11_SUBJECT_COMMIT_BINDING_INVALID', index.binding_path));
      else {
        const evidence = await verifyP12SubjectCommitBinding({ projectRoot, bindingPath: index.binding_path, binding, head });
        errors.push(...evidence.errors);
      }
    } catch { errors.push(issue('P12_V11_SUBJECT_COMMIT_NOT_REACHABLE', index.binding_path)); }
  }
  return Object.freeze({ ok: errors.length === 0, package_id: packageId, materialization_authorized: false, p12_operational_gaps_closed: false, p28_activation: 'not_authorized', errors: Object.freeze(errors) });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await validateP12TargetMaterializationApprovalV11();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
