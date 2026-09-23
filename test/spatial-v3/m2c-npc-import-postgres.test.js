import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { compileGeneratedNpcBindings } from '@rus/materialization';
import { binding, bundle, environment } from '../../packages/materialization/test/fixtures/approved-procedural-npc.js';
import { createSpatialV3WorldBaseReader } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-world-base-reader.js';
import { buildTransactionalImportSql, validateAuthoringBundle } from '../../tools/spatial-v3/p12-authoring-importer.mjs';

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 120000 });
const base = 'data/world-catalogs/novgorod/';
const expansion = `${base}spatial-v3/candidates/m2c-g4-expansion-v1/import-manifest.json`;
const manifest = `${base}m2c-npc-import-manifest.json`;
const canonicalManifest = `${base}m2c-npc-canonical-import-manifest.json`;

test('approved NPC dataset imports through P12 and actual PG reader closures feed the compiler', async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  const validation = await validateAuthoringBundle({ root: process.cwd(), manifestPath: manifest });
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  const header = JSON.parse(await readFile(manifest, 'utf8'));
  assert.equal(header.status, 'approved', 'independent import data approval required');
  const name = `m2c-npc-import-${process.pid}`;
  let pool;
  t.after(async () => { await pool?.end(); docker(['rm', '-fv', name]); });
  assert.equal(docker(['run', '-d', '--name', name, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=npc', '-e', 'POSTGRES_USER=npc', '-e', 'POSTGRES_DB=npc', 'postgres:16-alpine']).status, 0);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (docker(['exec', name, 'pg_isready', '-U', 'npc']).status === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await new Promise((resolve) => setTimeout(resolve, 600));
  const port = Number(docker(['port', name, '5432']).stdout.match(/:(\d+)/)[1]);
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'npc', password: 'npc', database: 'npc' });
  const schema = await readFile('infra/world-base/schema.sql', 'utf8');
  for (const [, part] of schema.matchAll(/^\\ir\s+schema\/([^\s]+\.sql)\s*$/gmu)) {
    await pool.query(await readFile(`infra/world-base/schema/${part}`, 'utf8'));
  }
  await pool.query(await buildTransactionalImportSql({ root: process.cwd(), manifestPath: expansion }));
  await pool.query(await buildTransactionalImportSql({ root: process.cwd(), manifestPath: manifest }));
  const reader = createSpatialV3WorldBaseReader({ query: (sql, params) => pool.query(sql, params) });
  const rows = (await pool.query(`SELECT c.*, n.canonical_digest AS g4_digest,
    t.canonical_digest AS template_digest FROM world_base.spatial_v3_g4_npc_composition_bindings c
    JOIN world_base.spatial_v3_nodes n ON n.id=c.g4_id AND n.version=c.g4_version
    JOIN world_base.spatial_v3_g5_generation_templates t ON t.id=c.generation_template_id
      AND t.version=c.generation_template_version ORDER BY c.id`)).rows;
  assert.equal(rows.length, 32);
  let materializedCount = 0;
  for (const row of rows) {
    const readClosure = () => reader.readPinnedG4NpcCompositionClosure({
      g4: { id: row.g4_id, version: row.g4_version, world_revision_id: row.world_revision_id, canonical_digest: row.g4_digest },
      generation_template: { id: row.generation_template_id, version: row.generation_template_version,
        world_revision_id: row.world_revision_id, canonical_digest: row.template_digest } });
    const closure = await readClosure();
    assert.equal(closure.ok, true, JSON.stringify(closure));
    assert.deepEqual(await readClosure(), closure, 'stable exact database closure after reload');
    const scene = { party_id: 'p', site_id: `test:${row.id}`, rows: [
      { target_table: 'party_g6_instances', id: 'g6', record: { party_id: 'p', status: 'active', host_kind: 'g5_site', physical_class_id: 'spatial.g6.open' } },
      ...['focus', 'departure'].map((slot) => ({ target_table: 'scene_position_nodes', id: slot,
        record: { party_id: 'p', status: 'active', g6_instance_id: 'g6', template_slot_key: slot, capacity: 1 } }))] };
    const compiled = compileGeneratedNpcBindings({ party_id: 'p', run_id: 'r', scene, closure: closure.value,
      approved_bundle: bundle, environment, equipment_activation: { status: 'active' },
      actor_base_attributes_runtime_profile: binding.actor_base_attributes_runtime_profile,
      world_catalog_digest: 'c'.repeat(64), equipment_catalog_digest: 'e'.repeat(64) });
    materializedCount += compiled.npc_inputs.length;
    assert.ok(compiled.npc_inputs.every((input) => input.binding.body_profile.status === 'approved'
      && input.binding.body_profile.values.health === 100));
  }
  assert.ok(materializedCount > 0, 'nonzero imported bindings exercised');
  const canonicalHeader = JSON.parse(await readFile(canonicalManifest, 'utf8'));
  assert.equal(canonicalHeader.status, 'approved', 'canonical data requires its own independent approval');
  await pool.query(await buildTransactionalImportSql({ root: process.cwd(), manifestPath: canonicalManifest }));
  const canonicalRows = (await pool.query(`SELECT c.*, n.canonical_digest AS g4_digest,
    g.canonical_digest AS site_digest FROM world_base.spatial_v3_g4_npc_composition_bindings c
    JOIN world_base.spatial_v3_nodes n ON n.id=c.g4_id AND n.version=c.g4_version
    JOIN world_base.spatial_v3_nodes g ON g.id=c.canonical_g5_id AND g.version=c.canonical_g5_version
    WHERE c.canonical_g5_id IS NOT NULL`)).rows;
  assert.equal(canonicalRows.length, 1);
  const canonicalRow = canonicalRows[0];
  const canonicalClosure = await reader.readPinnedG4NpcCompositionClosure({
    g4: { id: canonicalRow.g4_id, version: canonicalRow.g4_version,
      world_revision_id: canonicalRow.world_revision_id, canonical_digest: canonicalRow.g4_digest },
    canonical_g5: { id: canonicalRow.canonical_g5_id, version: canonicalRow.canonical_g5_version,
      world_revision_id: canonicalRow.world_revision_id, canonical_digest: canonicalRow.site_digest } });
  assert.equal(canonicalClosure.ok, true, JSON.stringify(canonicalClosure));
  assert.equal(canonicalClosure.value.runtime_profiles.filter((row) => row.profile_kind === 'npc_binding').length, 3);
  const scene = { party_id: 'p', site_id: 'initial', rows: [
    { target_table: 'party_g6_instances', id: 'g6', record: { party_id: 'p', status: 'active', host_kind: 'g5_site', physical_class_id: 'spatial.g6.open' } },
    ...['focus', 'departure'].map((slot) => ({ target_table: 'scene_position_nodes', id: slot,
      record: { party_id: 'p', status: 'active', g6_instance_id: 'g6', template_slot_key: slot, capacity: 1 } }))] };
  let selected = 0;
  for (let ordinal = 0; ordinal < 8; ordinal += 1) {
    const compiled = compileGeneratedNpcBindings({ party_id: 'p', run_id: `initial:${ordinal}`, scene,
      closure: canonicalClosure.value, approved_bundle: bundle, environment,
      equipment_activation: { status: 'active' }, world_catalog_digest: 'c'.repeat(64), equipment_catalog_digest: 'e'.repeat(64),
      actor_base_attributes_runtime_profile: binding.actor_base_attributes_runtime_profile });
    for (const input of compiled.npc_inputs) {
      selected += 1;
      assert.equal(input.binding.canonical_g5_ref.id, canonicalRow.canonical_g5_id);
      assert.equal(input.binding.generation_template_ref, undefined);
      assert.equal(input.binding.regional_context_ref.id, 'm2c_npc_regional_novgorod_canonical_initial_v1');
    }
  }
  assert.ok(selected > 0, 'canonical nonempty authored alternatives exercised');
  assert.equal((await pool.query(`SELECT count(*)::int AS count FROM world_base.spatial_v3_g4_npc_composition_bindings
    WHERE generation_template_id IS NOT NULL`)).rows[0].count, 32, 'canonical import preserves every generated binding');
});
