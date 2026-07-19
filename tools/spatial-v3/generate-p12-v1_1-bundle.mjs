import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { canonicalJsonBytes, createCanonicalManifest, manifestDigest } from './p12-canonical-manifest.mjs';

const run = promisify(execFile);
const ROOT = resolve(import.meta.dirname, '../..');
const oldZip = resolve(ROOT, 'data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/P12_TARGET_MATERIALIZATION_APPROVAL_V1.zip');
const destination = resolve(ROOT, 'data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/P12_TARGET_MATERIALIZATION_APPROVAL_V1_1.zip');
const sourcePackage = 'P12_TARGET_MATERIALIZATION_APPROVAL_V1';
const packageId = 'P12_TARGET_MATERIALIZATION_APPROVAL_V1_1';
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const python = String.raw`
import sys, zipfile
archive, output, source, target = sys.argv[1:]
with zipfile.ZipFile(archive) as z:
    for member in z.infolist():
        name = member.filename
        if not name.startswith(source + '/'):
            raise SystemExit('unexpected root')
        data = z.read(member)
        rewritten = target + name[len(source):]
        if rewritten.endswith('manifest.json') or rewritten.endswith('manifest.sha256'):
            continue
        with zipfile.ZipFile(output, 'a', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as out:
            info = zipfile.ZipInfo(rewritten, date_time=(1980,1,1,0,0,0))
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            out.writestr(info, data)
`;

async function writeDeterministicZip(sourceRoot) {
  const output = `${destination}.tmp`;
  await rm(output, { force: true });
  const files = await createCanonicalManifest(sourceRoot, { excluded: [] });
  const script = String.raw`
import sys, zipfile
root, output, files = sys.argv[1], sys.argv[2], sys.argv[3].split('|')
with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
  for rel in files:
    data = open(root + '/' + rel.replace('/', __import__('os').sep), 'rb').read()
    info = zipfile.ZipInfo('${packageId}/' + rel, date_time=(1980,1,1,0,0,0))
    info.external_attr = 0o100644 << 16
    info.compress_type = zipfile.ZIP_DEFLATED
    z.writestr(info, data)
`;
  await run('python', ['-c', script, sourceRoot, output, files.map((file) => file.path).join('|')], { windowsHide: true });
  await rm(destination, { force: true });
  await cp(output, destination);
  await rm(output, { force: true });
}

const work = join(tmpdir(), `p12-v1_1-${process.pid}`);
await rm(work, { recursive: true, force: true });
await mkdir(work, { recursive: true });
try {
  await run('python', ['-c', python, oldZip, join(work, 'seed.zip'), sourcePackage, packageId], { windowsHide: true });
  const packageRoot = join(work, packageId);
  await run('python', ['-c', String.raw`import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); z.extractall(sys.argv[2])`, join(work, 'seed.zip'), work], { windowsHide: true });
  const approval = JSON.parse(await readFile(join(packageRoot, 'APPROVAL_DECISION.json'), 'utf8'));
  approval.package_id = packageId;
  approval.approval_revision = 'V1_1_CANONICAL_MANIFEST_UNBOUND';
  await writeFile(join(packageRoot, 'APPROVAL_DECISION.json'), canonicalJsonBytes(approval));
  const binding = {
    schema_version: 'rus.p12_repository_branch_binding.v1_1', status: 'UNBOUND_SUBJECT_COMMIT_REQUIRED', repository: 'PavelSlaven/Novgorod1230', pr_number: null, branch_name: null, subject_commit: null,
    base_main_sha: '9f2a8c1477793e3baac376d558a64b1b2272cc4a', approval_manifest_sha256: null,
    source_approval_zip_sha256: 'e3342beac492ff6433a03ecbf7c32dbffdc9dafce8e7ebd623af826b33d7bbbe', target_contract_spec_zip_sha256: '1833b383e5ee2568330ab88ae40c7d5b9d057dbde81aa4f43641c48ecd3eb6f3',
    required_repository_paths: ['data/world-catalogs/novgorod/spatial-v3/source-approval/', 'data/world-catalogs/novgorod/spatial-v3/target-contract-spec/', 'data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/']
  };
  await writeFile(join(packageRoot, 'templates', 'repository-branch-binding.template.json'), canonicalJsonBytes(binding));
  const manifest = { schema_version: 'rus.package_manifest.v1_1', package_id: packageId, canonicalization: { path: 'relative-posix-nfc', path_sort: 'utf8-byte', json: 'utf8-lf-canonical', symlinks: 'rejected', case_collisions: 'rejected', excluded_control_files: ['manifest.json', 'manifest.sha256'] }, files: await createCanonicalManifest(packageRoot) };
  await writeFile(join(packageRoot, 'manifest.json'), canonicalJsonBytes(manifest));
  await writeFile(join(packageRoot, 'manifest.sha256'), `${manifestDigest(manifest)}\n`, 'utf8');
  await writeDeterministicZip(packageRoot);
  process.stdout.write(`${JSON.stringify({ package_id: packageId, package_path: destination.replace(ROOT + '\\', '').replaceAll('\\', '/'), sha256: sha256(await readFile(destination)), manifest_sha256: manifestDigest(manifest) })}\n`);
} finally { await rm(work, { recursive: true, force: true }); }
