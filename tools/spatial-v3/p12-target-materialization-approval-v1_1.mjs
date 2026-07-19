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

export async function validateP12TargetMaterializationApprovalV11({ root = ROOT, indexPath = INDEX_PATH } = {}) {
  const projectRoot = resolve(root); const errors = [];
  let index;
  try { index = JSON.parse(await readFile(resolve(projectRoot, indexPath), 'utf8')); }
  catch { return Object.freeze({ ok: false, materialization_authorized: false, errors: Object.freeze([issue('P12_V11_INDEX_MISSING', indexPath)]) }); }
  if (index.package_id !== packageId || index.intake_status !== 'subject_commit_binding_pending') errors.push(issue('P12_V11_IDENTITY_MISMATCH', indexPath));
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
      const bindingValid = binding.status === 'BOUND_FOR_REPOSITORY_APPLY' && binding.repository === 'PavelSlaven/Novgorod1230' && binding.branch_name === branch && /^[0-9a-f]{40}$/.test(binding.subject_commit ?? '') && binding.approval_manifest_sha256 === index.manifest_sha256;
      if (!bindingValid) errors.push(issue('P12_V11_SUBJECT_COMMIT_BINDING_INVALID', index.binding_path));
      else {
        await execFile('git', ['merge-base', '--is-ancestor', binding.subject_commit, head], { cwd: projectRoot, windowsHide: true });
      }
    } catch { errors.push(issue('P12_V11_SUBJECT_COMMIT_NOT_REACHABLE', index.binding_path)); }
  }
  return Object.freeze({ ok: errors.length === 0, package_id: packageId, materialization_authorized: errors.length === 0, p12_operational_gaps_closed: false, p28_activation: 'not_authorized', errors: Object.freeze(errors) });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await validateP12TargetMaterializationApprovalV11();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}
