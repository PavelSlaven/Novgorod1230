import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { compileApprovedActorAppearanceEntries } from '@rus/materialization';
import { buildTargetAppearanceTransferCandidate, buildTargetAppearanceTransferImportArtifacts } from '../src/target-appearance-transfer.js';

test('target appearance transfer preserves approved option semantics and creates only new target IDs', async () => {
  const candidate = await buildTargetAppearanceTransferCandidate();
  const path = 'data/world-catalogs/novgorod/live-world-runtime-v17/appearance-transfer-v2-candidate.json';
  assert.equal(await readFile(path, 'utf8'), `${JSON.stringify(candidate, null, 2)}\n`);
  const source = {};
  for (const pin of candidate.source_tables) source[pin.table] = JSON.parse(await readFile(`${candidate.source_directory}/${pin.table}.json`, 'utf8'));
  for (const [table, rows] of Object.entries(candidate.proposed_insert_rows)) for (const row of rows) {
    assert.equal(row.status, 'draft');
    if (table === 'world_revisions') {
      assert.equal(row.id, candidate.target_world.world_revision_id);
      assert.equal(row.catalog_digest, candidate.target_world.world_catalog_digest);
      assert.equal(row.parent_revision_id, null);
      assert.equal(candidate.world_registration.import_order[0], 'world_revisions');
      continue;
    }
    assert.ok(!source[table].some((original) => original.id === row.id));
    const original = source[table].find((original) => row.id === `m2c_target__${original.id}`);
    const restored = { ...row, id: original.id, status: original.status };
    if (table === 'region_category_options') restored.world_revision_id = original.world_revision_id;
    else restored.option_id = original.option_id;
    assert.deepEqual(restored, original);
  }
  // Consumer-shape check only; this local object does not authorize import.
  const mapped = { ...candidate.existing_dependencies,
    ...Object.fromEntries(Object.entries(candidate.proposed_insert_rows).map(([table, rows]) =>
      [table, rows.map((row) => ({ ...row, status: 'approved' }))])) };
  const entries = compileApprovedActorAppearanceEntries({ records: mapped,
    demographic_profile_ref: candidate.profile_refs.demographic, appearance_profile_ref: candidate.profile_refs.appearance });
  assert.ok(entries.length > 0);
  assert.ok(entries.every((entry) => entry.entry_id.startsWith('m2c_target__')));
  assert.equal(candidate.import_authorized, false);
  assert.equal(candidate.activation_authorized, false);
});

test('reviewed target appearance mapping promotes only the exact approved candidate rows', async () => {
  const { manifest, datasets } = await buildTargetAppearanceTransferImportArtifacts();
  const base = 'data/world-catalogs/novgorod/live-world-runtime-v17/';
  assert.equal(await readFile(`${base}appearance-transfer-v2-import-manifest.json`, 'utf8'), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const item of manifest.datasets) {
    assert.equal(await readFile(`${base}${item.file}`, 'utf8'), `${JSON.stringify(datasets[item.table], null, 2)}\n`);
    assert.ok(datasets[item.table].every((row) => row.status === 'approved'));
  }
  assert.equal(manifest.production_activation, false);
  assert.equal(manifest.authority.import_approval_required, true);
});
