import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { compileApprovedActorAppearanceEntries } from '@rus/materialization';
import { buildTargetAppearanceTransferImportSql } from '../../spatial-v3/character-appearance-v1-importer.mjs';
import { buildTargetAppearanceTransferCandidate, buildTargetAppearanceTransferImportArtifacts, buildTargetAppearanceTransferV3Candidate } from '../src/target-appearance-transfer.js';

test('v3 carries exact approved v4 dependencies before target options', async () => {
  const candidate = await buildTargetAppearanceTransferV3Candidate();
  const base = 'data/world-catalogs/novgorod/live-world-runtime-v17/';
  assert.equal(await readFile(`${base}appearance-transfer-v3-candidate.json`, 'utf8'), `${JSON.stringify(candidate, null, 2)}\n`);
  assert.deepEqual(candidate.existing_dependencies, {});
  const v2 = await buildTargetAppearanceTransferCandidate();
  const dependencies = ['universal_categories', 'region_demographic_profiles', 'region_appearance_profiles'];
  assert.equal(dependencies.reduce((count, table) => count + candidate.proposed_insert_rows[table].length, 0), 44);
  for (const table of dependencies) {
    const rows = candidate.proposed_insert_rows[table];
    assert.deepEqual(rows, v2.existing_dependencies[table]);
    const refs = candidate.dependency_source_refs[table];
    assert.equal(refs.length, rows.length);
    for (let index = 0; index < rows.length; index++) {
      const ref = refs[index];
      const bytes = await readFile(ref.source_ref.file);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), ref.source_ref.sha256);
      assert.equal(JSON.stringify(JSON.parse(bytes).find((row) => row.id === ref.row_id)), JSON.stringify(rows[index]));
      assert.equal(ref.source_ref.row_id, rows[index].id);
      assert.equal(ref.directness, 'exact_approved_row_transfer');
    }
  }
  for (const table of Object.keys(v2.proposed_insert_rows))
    assert.deepEqual(candidate.proposed_insert_rows[table], v2.proposed_insert_rows[table]);
  const order = candidate.world_registration.import_order;
  assert.ok(dependencies.every((table) => order.indexOf(table) < order.indexOf('region_category_options')));
  const ids = new Set();
  for (const [table, rows] of Object.entries(candidate.proposed_insert_rows)) for (const row of rows) {
    const key = `${table}:${row.id}`;
    assert.ok(!ids.has(key), key);
    ids.add(key);
  }
  const request = JSON.parse(await readFile(`${base}appearance-transfer-v2-v17-import-request.json`, 'utf8'));
  const p12Bytes = await readFile(request.prior_p12_execution.path);
  assert.equal(createHash('sha256').update(p12Bytes).digest('hex'), request.prior_p12_execution.sha256);
  assert.equal(JSON.parse(p12Bytes).status, 'committed_exact_readback_verified');
  assert.equal(request.approved_bundle.candidate_sha256,
    createHash('sha256').update(await readFile(`${base}appearance-transfer-v2-candidate.json`)).digest('hex'));
  assert.equal(request.preflight_at_source_head.candidate_primary_key_collisions, 0);
  assert.equal(request.preflight_at_source_head.required_existing_dependencies_present, 0);
  assert.deepEqual(request.preflight_at_source_head.missing_by_table,
    { region_demographic_profiles: 1, region_appearance_profiles: 1, universal_categories: 42 });
  const categoryIds = new Set(candidate.proposed_insert_rows.universal_categories.map((row) => row.id));
  assert.ok(candidate.proposed_insert_rows.region_category_options.every((row) => categoryIds.has(row.category_id)));
  assert.ok(candidate.proposed_insert_rows.region_demographic_profile_entries.every((row) =>
    candidate.proposed_insert_rows.region_demographic_profiles.some((profile) => profile.id === row.demographic_profile_id)));
  assert.ok(candidate.proposed_insert_rows.region_appearance_profile_entries.every((row) =>
    candidate.proposed_insert_rows.region_appearance_profiles.some((profile) => profile.id === row.appearance_profile_id)));
});

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
  const sql = await buildTargetAppearanceTransferImportSql({ rollback: true });
  assert.match(sql, /INSERT INTO world_base\.world_revisions/);
  assert.match(sql, /ROLLBACK;\n$/);
});
