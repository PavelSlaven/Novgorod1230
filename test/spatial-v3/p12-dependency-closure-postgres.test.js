import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { buildTransactionalImportSql } from '../../tools/spatial-v3/p12-authoring-importer.mjs';
import { buildP12V11PhysicalProjectionSql, compileP12V11PhysicalRows } from '../../tools/spatial-v3/p12-v1_1-physical-projection.mjs';

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 45_000 });
const port = 57500 + (process.pid % 300);
const name = `p12-closure-${process.pid}`;
const sha = (letter) => letter.repeat(64);

const snapshotImportedTables = async (pool, tables) => {
  const snapshot = {};
  for (const table of tables) {
    const result = await pool.query(
      `SELECT (to_jsonb(row_value) - 'created_at' - 'updated_at') AS row_value
       FROM world_base.${table} AS row_value
       ORDER BY (to_jsonb(row_value) - 'created_at' - 'updated_at')::text`
    );
    snapshot[table] = {
      count: result.rowCount,
      digest: createHash('sha256').update(JSON.stringify(result.rows.map(({ row_value }) => row_value))).digest('hex')
    };
  }
  return snapshot;
};

test('P12 dependency-closure DDL applies fresh/reapplies and enforces selector, applicability and regional-basis FKs', async (t) => {
  if (docker(['version']).status !== 0) t.skip('Docker required');
  t.after(() => docker(['rm', '-f', name]));
  assert.equal(docker(['run', '-d', '--name', name, '-p', `${port}:5432`, '-e', 'POSTGRES_PASSWORD=p12', '-e', 'POSTGRES_USER=p12', '-e', 'POSTGRES_DB=p12', 'postgres:16-alpine']).status, 0);
  const pool = new pg.Pool({ host: '127.0.0.1', port, user: 'p12', password: 'p12', database: 'p12' });
  t.after(() => pool.end());
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { await pool.query('SELECT 1'); break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 200)); if (attempt === 49) throw new Error('postgres unavailable'); }
  }
  for (let part = 1; part <= 16; part += 1) await pool.query(await readFile(`infra/world-base/schema/${String(part).padStart(2, '0')}.sql`, 'utf8'));
  const closureDdl = await readFile('infra/world-base/schema/15.sql', 'utf8');
  await assert.doesNotReject(() => pool.query(closureDdl));
  await pool.query("INSERT INTO world_base.source_records(id,status) VALUES('p12-source','approved')");
  await pool.query("INSERT INTO world_base.spatial_v3_world_revisions(id,catalog_digest,status,provenance_ref) VALUES('p12-revision',$1,'approved','p12-source')", [sha('a')]);
  for (const [kind, id] of [['regional_scene_template_basis', 'basis'], ['scene_selection_rule', 'selector'], ['scene_applicability_rule', 'applicability'], ['scene_template', 'bad']]) {
    await pool.query("INSERT INTO world_base.spatial_v3_authoring_versions(entity_kind,entity_id,version,world_revision_id,canonical_digest,status,provenance_ref) VALUES($1,$2,1,'p12-revision',$3,'approved','p12-source')", [kind, id, sha('b')]);
  }
  await pool.query("INSERT INTO world_base.spatial_v3_regional_scene_template_bases(id,version,world_revision_id,source_profile_family_id,geometry_claim,status,provenance_ref,canonical_digest) VALUES('basis',1,'p12-revision','family','topological_only','approved','p12-source',$1)", [sha('c')]);
  await pool.query("INSERT INTO world_base.spatial_v3_scene_selection_rules(id,version,world_revision_id,rule_kind,status,provenance_ref,canonical_digest) VALUES('selector',1,'p12-revision','single_candidate','approved','p12-source',$1)", [sha('d')]);
  await pool.query("INSERT INTO world_base.spatial_v3_scene_applicability_rules(id,version,world_revision_id,rule_kind,status,provenance_ref,canonical_digest) VALUES('applicability',1,'p12-revision','exact_source_ref','approved','p12-source',$1)", [sha('e')]);
  await pool.query('BEGIN');
  await pool.query("INSERT INTO world_base.spatial_v3_scene_templates(id,version,world_revision_id,regional_template_id,regional_template_version,status,provenance_ref,canonical_digest) VALUES('bad',1,'p12-revision','missing',1,'approved','p12-source',$1)", [sha('1')]);
  await assert.rejects(() => pool.query('SET CONSTRAINTS ALL IMMEDIATE'), /foreign key/u);
  await pool.query('ROLLBACK');
  await assert.rejects(
    () => pool.query("INSERT INTO world_base.spatial_v3_scene_applicability_rules(id,version,world_revision_id,rule_kind,status,provenance_ref,canonical_digest) VALUES('bad-rule',1,'p12-revision','heuristic','approved','p12-source',$1)", [sha('2')]),
    /check constraint/u
  );
});

test('P12 imports the complete closure bundle idempotently and rolls back a canonical mismatch without partial writes', async (t) => {
  if (docker(['version']).status !== 0) t.skip('Docker required');
  const isolatedName = `${name}-import`; const isolatedPort = port + 1;
  t.after(() => docker(['rm', '-f', isolatedName]));
  assert.equal(docker(['run', '-d', '--name', isolatedName, '-p', `${isolatedPort}:5432`, '-e', 'POSTGRES_PASSWORD=p12', '-e', 'POSTGRES_USER=p12', '-e', 'POSTGRES_DB=p12', 'postgres:16-alpine']).status, 0);
  const pool = new pg.Pool({ host: '127.0.0.1', port: isolatedPort, user: 'p12', password: 'p12', database: 'p12' }); t.after(() => pool.end());
  for (let attempt = 0; attempt < 50; attempt += 1) { try { await pool.query('SELECT current_database()'); break; } catch { await new Promise((resolve) => setTimeout(resolve, 200)); if (attempt === 49) throw new Error('postgres unavailable'); } }
  assert.equal((await pool.query('SELECT current_database() AS db')).rows[0].db, 'p12');
  for (let part = 1; part <= 16; part += 1) await pool.query(await readFile(`infra/world-base/schema/${String(part).padStart(2, '0')}.sql`, 'utf8'));
  const manifestPath = 'data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/dependency-closure/v1/import-manifest.json';
  const sql = await buildTransactionalImportSql({ manifestPath });
  await pool.query(sql);
  const readback = await pool.query(`SELECT
    (SELECT count(*) FROM world_base.spatial_v3_nodes)::int AS nodes,
    (SELECT count(*) FROM world_base.spatial_v3_authoring_versions)::int AS versions,
    (SELECT count(*) FROM world_base.universal_categories)::int AS categories,
    (SELECT count(*) FROM world_base.spatial_v3_scene_templates)::int AS scenes,
    (SELECT count(*) FROM world_base.spatial_v3_scene_position_templates)::int AS positions,
    (SELECT count(*) FROM world_base.spatial_v3_scene_movement_edge_templates)::int AS edges`);
  assert.deepEqual(readback.rows[0], { nodes: 49, versions: 68, categories: 57, scenes: 17, positions: 51, edges: 68 });
  await pool.query(sql);
  assert.deepEqual((await pool.query('SELECT count(*)::int AS n FROM world_base.spatial_v3_nodes')).rows[0], { n: 49 });
  const projectionRollbackSql = await buildP12V11PhysicalProjectionSql({ rollback: true });
  await pool.query(projectionRollbackSql);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM world_base.spatial_v3_nodes')).rows[0].n, 49, 'rollback rehearsal must persist no V1.1 row');
  const projectionSql = await buildP12V11PhysicalProjectionSql();
  await pool.query(projectionSql);
  const v11 = await pool.query(`SELECT
    (SELECT count(*) FROM world_base.spatial_v3_nodes)::int AS nodes,
    (SELECT count(*) FROM world_base.spatial_v3_scene_materialization_profiles)::int AS profiles,
    (SELECT count(*) FROM world_base.spatial_v3_scene_materialization_candidates)::int AS candidates,
    (SELECT count(*) FROM world_base.spatial_v3_canonical_g5_connection_bindings)::int AS bindings,
    (SELECT count(*) FROM world_base.spatial_v3_topological_direction_contexts)::int AS directions,
    (SELECT count(*) FROM world_base.spatial_v3_world_routes)::int AS routes,
    (SELECT count(*) FROM world_base.spatial_v3_world_route_segments)::int AS segments,
    (SELECT count(*) FROM world_base.spatial_v3_world_route_endpoint_bindings)::int AS endpoints,
    (SELECT count(*) FROM world_base.spatial_v3_authoring_dependency_edges)::int AS dependencies`);
  assert.deepEqual(v11.rows[0], { nodes: 276, profiles: 195, candidates: 195, bindings: 454, directions: 86, routes: 86, segments: 86, endpoints: 172, dependencies: 3249 });
  const compiled = await compileP12V11PhysicalRows();
  const expectedDigest = createHash('sha256').update(JSON.stringify(
    ['spatial_v3_nodes', 'spatial_v3_world_routes', 'spatial_v3_world_route_segments'].flatMap((table) => compiled.rows.get(table).map((row) => [table, row.id, row.canonical_digest])).sort()
  )).digest('hex');
  const readbackDigestRows = [];
  for (const table of ['spatial_v3_nodes', 'spatial_v3_world_routes', 'spatial_v3_world_route_segments']) {
    const result = await pool.query(`SELECT id,canonical_digest FROM world_base.${table} WHERE id LIKE '%v3__%' ORDER BY id`);
    readbackDigestRows.push(...result.rows.map((row) => [table, row.id, row.canonical_digest]));
  }
  assert.equal(createHash('sha256').update(JSON.stringify(readbackDigestRows.sort())).digest('hex'), expectedDigest);
  await pool.query(projectionSql);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const importedTables = manifest.datasets.map(({ table }) => table);
  const deletedSourceId = (JSON.parse(await readFile(
    'data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/dependency-closure/v1/datasets/source_records.json',
    'utf8'
  )))[0].id;
  await pool.query('SET session_replication_role = replica');
  await pool.query('DELETE FROM world_base.source_records WHERE id=$1', [deletedSourceId]);
  await pool.query('SET session_replication_role = origin');
  await pool.query("UPDATE world_base.spatial_v3_nodes SET canonical_digest=$1 WHERE id='region_novgorod_land'", [sha('9')]);
  const beforeRejectedImport = await snapshotImportedTables(pool, importedTables);
  await assert.rejects(() => pool.query(sql), /P12_EXISTING_ROW_MISMATCH/u);
  assert.deepEqual(
    await snapshotImportedTables(pool, importedTables),
    beforeRejectedImport,
    'a source-record insert attempted before the later node mismatch must roll back with every imported table unchanged'
  );
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM world_base.source_records WHERE id=$1', [deletedSourceId])).rows[0].n, 0);
  assert.equal((await pool.query("SELECT canonical_digest FROM world_base.spatial_v3_nodes WHERE id='region_novgorod_land'")).rows[0].canonical_digest, sha('9'));
});
