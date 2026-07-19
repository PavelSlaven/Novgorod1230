import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateP12TargetMaterializationApproval } from '../../tools/spatial-v3/p12-target-materialization-approval.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const INDEX_RELATIVE = 'data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/index.json';
async function copyIntakeRoot() {
  const root = await mkdtemp(join(tmpdir(), 'p12-target-materialization-approval-'));
  const index = JSON.parse(await readFile(join(ROOT, INDEX_RELATIVE), 'utf8'));
  const indexPath = join(root, INDEX_RELATIVE);
  await mkdir(join(indexPath, '..'), { recursive: true });
  await writeFile(indexPath, JSON.stringify(index));
  const zipPath = join(root, index.package_path);
  await mkdir(join(zipPath, '..'), { recursive: true });
  await cp(join(ROOT, index.package_path), zipPath);
  const sourceIndexPath = join(root, 'data/world-catalogs/novgorod/spatial-v3/source-approval/index.json');
  await mkdir(join(sourceIndexPath, '..'), { recursive: true });
  await cp(join(ROOT, 'data/world-catalogs/novgorod/spatial-v3/source-approval/index.json'), sourceIndexPath);
  return { root, indexPath, zipPath };
}
test('P12 approval intake proves the POSIX/Windows manifest-order split and remains fail-closed on its recorded blockers', async () => {
  const result = await validateP12TargetMaterializationApproval({ root: ROOT });
  assert.equal(result.ok, true);
  assert.equal(result.materialization_authorized, false);
  assert.equal(result.p12_operational_gaps_closed, false);
  assert.deepEqual(result.blockers, ['P12_APPROVAL_UPSTREAM_MANIFEST_ORDER_MISMATCH', 'P12_APPROVAL_BRANCH_HEAD_UNBOUND']);
  assert.deepEqual(result.platform_self_checks, {
    windows: 'P12_APPROVAL_UPSTREAM_MANIFEST_ORDER_MISMATCH',
    posix: 'P12_APPROVAL_MANIFEST_ORDER_COMPATIBLE'
  });
  const { ordering_profiles: ordering } = result.upstream_evidence.manifest;
  assert.equal(ordering.posix.files_equal, true);
  assert.equal(ordering.posix.first_mismatch, null);
  assert.equal(ordering.windows.files_equal, false);
  assert.ok(ordering.windows.first_mismatch.actual);
  assert.ok(ordering.windows.first_mismatch.expected);
  if (result.upstream_evidence.runtime_platform === 'windows') {
    assert.equal(result.upstream_evidence.run_all_checks.exit_code, 1);
    assert.match(result.upstream_evidence.run_all_checks.stdout, /FAIL manifest mismatch/);
    assert.equal(result.upstream_evidence.manifest.run.exit_code, 1);
  } else {
    assert.equal(result.upstream_evidence.run_all_checks.exit_code, 0);
    assert.match(result.upstream_evidence.run_all_checks.stdout, /PASS run_all_checks/);
    assert.equal(result.upstream_evidence.manifest.run.exit_code, 0);
  }
  assert.equal(result.upstream_evidence.manifest.files_equal, result.upstream_evidence.runtime_platform !== 'windows');
  assert.equal(result.upstream_evidence.branch_binding.run.exit_code, 2);
  assert.equal(result.upstream_evidence.branch_binding.exact_branch_head_binding, false);
});
test('P12 approval intake fails on immutable ZIP replacement', async () => {
  const fixture = await copyIntakeRoot();
  try {
    await writeFile(fixture.zipPath, 'replaced-approval');
    const result = await validateP12TargetMaterializationApproval({ root: fixture.root });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.code === 'P12_APPROVAL_DIGEST_MISMATCH'));
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});
test('P12 approval intake rejects an attempt to erase the manifest or branch blockers', async () => {
  const fixture = await copyIntakeRoot();
  try {
    const index = JSON.parse(await readFile(fixture.indexPath, 'utf8'));
    index.blockers = [];
    index.materialization_authorized = true;
    await writeFile(fixture.indexPath, JSON.stringify(index));
    const result = await validateP12TargetMaterializationApproval({ root: fixture.root });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.code === 'P12_APPROVAL_BLOCKER_LEDGER_INVALID'));
    assert.ok(result.errors.some((error) => error.code === 'P12_APPROVAL_BOUNDARY_INVALID'));
  } finally { await rm(fixture.root, { recursive: true, force: true }); }
});
