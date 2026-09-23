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
      actor_base_attributes_runtime_profile: binding.actor_base_attributes_runtime_profile, world_catalog_digest: 'c'.repeat(64) });
    materializedCount += compiled.npc_inputs.length;
    assert.ok(compiled.npc_inputs.every((input) => input.binding.body_profile.status === 'approved'
      && input.binding.body_profile.values.health === 100));
  }
  assert.ok(materializedCount > 0, 'nonzero imported bindings exercised');
});
