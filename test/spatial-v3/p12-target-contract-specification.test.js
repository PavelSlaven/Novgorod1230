import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { validateP12TargetContractSpecification } from '../../tools/spatial-v3/p12-target-contract-specification.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

test('P12 target specification is byte-pinned and cannot authorize activation', async () => {
  const result = await validateP12TargetContractSpecification({ root: ROOT });
  assert.equal(result.ok, true);
  assert.equal(result.activation, 'not_authorized');
  assert.equal(result.compilation, 'blocked_pending_branch_owned_approved_inputs');
});

test('P12 target specification fails closed on a replaced immutable ZIP', async () => {
  const copyRoot = await mkdtemp(join(tmpdir(), 'p12-target-spec-'));
  try {
    const sourceIndex = join(ROOT, 'data/world-catalogs/novgorod/spatial-v3/source-approval/index.json');
    const index = JSON.parse(await readFile(sourceIndex, 'utf8'));
    const indexPath = join(copyRoot, 'data/world-catalogs/novgorod/spatial-v3/source-approval/index.json');
    await mkdir(join(indexPath, '..'), { recursive: true });
    await writeFile(indexPath, JSON.stringify(index));
    const zipPath = join(copyRoot, index.target_contract_specification.package_path);
    await mkdir(join(zipPath, '..'), { recursive: true });
    await cp(join(ROOT, index.target_contract_specification.package_path), zipPath);
    await writeFile(zipPath, Buffer.from('replaced-editorial-specification'));
    const result = await validateP12TargetContractSpecification({ root: copyRoot });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.code === 'P12_TARGET_SPEC_DIGEST_MISMATCH'));
  } finally { await rm(copyRoot, { recursive: true, force: true }); }
});
