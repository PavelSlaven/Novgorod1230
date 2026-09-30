import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { runLineWave } from '../../tools/spatial-v3/build-line-wave.mjs';
import { buildTransactionalImportSql, validateAuthoringBundle } from '../../tools/spatial-v3/p12-authoring-importer.mjs';
import { testContainerLabel } from '../helpers/test-containers.js';

// rt-lines a4: the line wave (binding@3, line kind profiles, cost profiles, their versions and edges) imports insert-only on top of the
// active bundle through the P12 importer, twice with the same result; a changed row is refused, not overwritten.
const manifestPath = 'data/world-catalogs/novgorod/m2c-lines-v1-import-manifest.json';
const baseManifestPath = 'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/import-manifest.json';
const dir = 'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-lines-v1/datasets';
const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 120_000 });
const rows = async (table) => JSON.parse(await readFile(`${dir}/${table}.json`, 'utf8'));

test('the line wave imports through P12 on top of the active bundle: idempotent, version 1 and 2 untouched, changed rows refused',
  { timeout: 1_200_000 }, async (t) => {
    await runLineWave({ check: true });
    const validation = await validateAuthoringBundle({ manifestPath });
    assert.equal(validation.ok, true, JSON.stringify(validation.errors));
    if (docker(['version']).status !== 0) return t.skip('Docker required');
    const container = `m2c-lines-import-${process.pid}`;
    let pool;
    t.after(async () => { await pool?.end(); docker(['rm', '-fv', container]); });
    const started = docker(['run', ...testContainerLabel(), '-d', '--name', container, '-p', '127.0.0.1::5432',
      '-e', 'POSTGRES_PASSWORD=m2c', '-e', 'POSTGRES_USER=m2c', '-e', 'POSTGRES_DB=m2c', 'postgres:16-alpine']);
    assert.equal(started.status, 0, started.stderr);
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (docker(['exec', container, 'pg_isready', '-U', 'm2c']).status === 0) { ready = true; break; }
      await new Promise((done) => setTimeout(done, 250));
    }
    assert.equal(ready, true);
    const port = Number(docker(['port', container, '5432']).stdout.match(/:(\d+)/)[1]);
    pool = new pg.Pool({ host: '127.0.0.1', port, user: 'm2c', password: 'm2c', database: 'm2c' });
    const entrypoint = await readFile('infra/world-base/schema.sql', 'utf8');
    for (const match of entrypoint.matchAll(/^\\ir\s+schema\/([^\s]+\.sql)\s*$/gmu)) await pool.query(await readFile(`infra/world-base/schema/${match[1]}`, 'utf8'));
    await pool.query(await buildTransactionalImportSql({ manifestPath: baseManifestPath, temporaryTablePrefix: 'p12e' }));
    const bindingsBefore = (await pool.query(`SELECT version, count(*)::int AS n FROM world_base.spatial_v3_canonical_g5_connection_bindings GROUP BY version ORDER BY version`)).rows;
    assert.deepEqual(bindingsBefore, [{ version: 1, n: 454 }, { version: 2, n: 454 }]);
    const oldRows = (await pool.query(`SELECT to_jsonb(r) AS row FROM world_base.spatial_v3_canonical_g5_connection_bindings r WHERE version IN (1,2) ORDER BY id, version`)).rows;

    const sql = await buildTransactionalImportSql({ manifestPath, temporaryTablePrefix: 'm2c_lines_v1' });
    await pool.query(sql);
    await pool.query(sql); // insert-only: the second run finds the same rows and inserts nothing

    const count = async (sqlText) => Number((await pool.query(sqlText)).rows[0].n);
    assert.equal(await count(`SELECT count(*)::int AS n FROM world_base.spatial_v3_canonical_g5_connection_bindings WHERE version=3`), 454);
    assert.equal(await count(`SELECT count(*)::int AS n FROM world_base.spatial_v3_line_kind_profiles`), 8);
    assert.equal(await count(`SELECT count(*)::int AS n FROM world_base.spatial_v3_line_kind_alternative_methods`), 3);
    assert.equal(await count(`SELECT count(*)::int AS n FROM world_base.spatial_v3_movement_method_cost_options WHERE profile_id LIKE 'cost.line_%'`), 11);
    for (const [table, key] of [['spatial_v3_line_kind_profiles', 'id'], ['spatial_v3_canonical_g5_connection_bindings', 'id']]) {
      const expected = await rows(table);
      const actual = (await pool.query(`SELECT to_jsonb(r) AS row FROM world_base.${table} r ${table.endsWith('bindings') ? 'WHERE version=3' : ''} ORDER BY ${key}`)).rows.map(({ row }) => row);
      // the database row carries every column: columns the dataset row omits are NULL, every other column equals the candidate
      assert.equal(actual.length, expected.length, `${table}: row count`);
      const byId = new Map(actual.map((row) => [row.id, row]));
      for (const row of expected) {
        const stored = byId.get(row.id);
        assert.ok(stored, `${table}: ${row.id} imported`);
        for (const [column, value] of Object.entries(row)) assert.deepEqual(stored[column], value, `${table}: ${row.id}.${column}`);
        for (const [column, value] of Object.entries(stored)) if (!(column in row) && column !== 'entity_kind') assert.equal(value, null, `${table}: ${row.id}.${column} not in the candidate, so NULL`);
      }
    }
    // earlier versions are byte-for-byte what they were
    const oldAfter = (await pool.query(`SELECT to_jsonb(r) AS row FROM world_base.spatial_v3_canonical_g5_connection_bindings r WHERE version IN (1,2) ORDER BY id, version`)).rows;
    assert.deepEqual(oldAfter, oldRows);
    // the authoring versions and edges of the wave are in: 471 versions, 1394 edges, every edge resolves (deferred triggers ran at COMMIT)
    assert.equal(await count(`SELECT count(*)::int AS n FROM world_base.spatial_v3_authoring_versions WHERE provenance_ref='m2c_lines_v1_candidate'`), 471);
    assert.equal(await count(`SELECT count(*)::int AS n FROM world_base.spatial_v3_authoring_dependency_edges WHERE provenance_ref='m2c_lines_v1_candidate'`), 1394);
    // the rules of the norm hold in the database: one name per outgoing place, reverse slots swapped, names shared by a pair
    assert.equal(await count(`SELECT count(*)::int AS n FROM (SELECT from_canonical_g5_id, line_name, coalesce(line_discriminator,''), coalesce(line_direction_id,'') FROM world_base.spatial_v3_canonical_g5_connection_bindings WHERE version=3 GROUP BY 1,2,3,4 HAVING count(*)>1) d`), 0);
    assert.equal(await count(`SELECT count(*)::int AS n FROM world_base.spatial_v3_canonical_g5_connection_bindings b JOIN world_base.spatial_v3_canonical_g5_connection_bindings r ON r.id=b.reverse_binding_id AND r.version=b.reverse_binding_version
      WHERE b.version=3 AND r.from_scene_endpoint_slot_key=b.to_scene_endpoint_slot_key AND r.to_scene_endpoint_slot_key=b.from_scene_endpoint_slot_key AND r.line_name=b.line_name AND r.reverse_binding_id=b.id`), 454);
    // a changed row is refused, not overwritten
    await pool.query(`UPDATE world_base.spatial_v3_line_kind_profiles SET route_kind_id='route.changed' WHERE id='lkp__path'`);
    await assert.rejects(() => pool.query(sql), /P12_EXISTING_ROW_MISMATCH:spatial_v3_line_kind_profiles/u);
    assert.equal(await count(`SELECT count(*)::int AS n FROM world_base.spatial_v3_line_kind_profiles WHERE route_kind_id='route.changed'`), 1, 'the row stays as it was changed: nothing overwrote it');
  });
