import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { validateP12SourceApproval } from '../../tools/spatial-v3/p12-source-approval.mjs';

test('P12 approved Novgorod source package is immutable, complete and never activation evidence', async () => {
  const result = await validateP12SourceApproval();
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.activation, 'not_authorized');
  assert.equal(result.branch_contract_compilation, 'required');
  assert.deepEqual(result.source_resolution, {
    canonical_g5_inventory: 195,
    physical_exit_source_pairs: 358,
    derived_directional_traversals: 716,
    legacy_edge_mapping_bindings: 600,
    scene_profile_families: 17,
    scene_materialization_profiles: 195,
    scene_materialization_candidates: 195
  });
  const approval = JSON.parse(await readFile('data/world-catalogs/novgorod/spatial-v3/source-approval/p12_novgorod_source_approval_001/APPROVAL_RECORD.json', 'utf8'));
  assert.equal(approval.production_activation_allowed, false);
});

async function copiedPackageRoot() {
  const root = await mkdtemp(join(tmpdir(), 'p12-source-approval-'));
  await cp('data/world-catalogs/novgorod/spatial-v3/source-approval', join(root, 'data/world-catalogs/novgorod/spatial-v3/source-approval'), { recursive: true, filter: (source) => !source.includes('.tmp-p12-invalid-copy') });
  return root;
}

test('P12 source approval rejects a manifest mutation even when its declared digest is retained', async () => {
  const root = await copiedPackageRoot();
  const manifestPath = join(root, 'data/world-catalogs/novgorod/spatial-v3/source-approval/p12_novgorod_source_approval_001/manifest.json');
  try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.files[0].size += 1;
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    const result = await validateP12SourceApproval({ root });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(({ code }) => code === 'P12_SOURCE_APPROVAL_CONTENT_DIGEST_MISMATCH'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('P12 source approval rejects an unlisted extra package file', async () => {
  const root = await copiedPackageRoot();
  try {
    await writeFile(join(root, 'data/world-catalogs/novgorod/spatial-v3/source-approval/p12_novgorod_source_approval_001/extra-unapproved.txt'), 'must not be ignored', 'utf8');
    const result = await validateP12SourceApproval({ root });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(({ code }) => code === 'P12_SOURCE_APPROVAL_UNLISTED_FILE'));
  } finally { await rm(root, { recursive: true, force: true }); }
});
