import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { buildP12TargetImportPlan } from '../../tools/spatial-v3/p12-target-import.mjs';

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 45_000 });
const port = 57900 + (process.pid % 300);
const name = `p12-target-import-${process.pid}`;

test('P12 target bundle applies closure and V1.1 projection atomically in an isolated PostgreSQL database', async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required for isolated P12 PostgreSQL test');
  t.after(() => docker(['rm', '-f', name]));
  assert.equal(docker(['run', '-d', '--name', name, '-p', `${port}:5432`, '-e', 'POSTGRES_PASSWORD=p12', '-e', 'POSTGRES_USER=p12', '-e', 'POSTGRES_DB=p12', 'postgres:16-alpine']).status, 0);
  const pool = new pg.Pool({ host: '127.0.0.1', port, user: 'p12', password: 'p12', database: 'p12' });
  t.after(() => pool.end());
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { await pool.query('SELECT 1'); break; }
    catch { await new Promise((done) => setTimeout(done, 200)); if (attempt === 49) throw new Error('postgres unavailable'); }
  }
  const schemaEntrypoint = await readFile('infra/world-base/schema.sql', 'utf8');
  const schemaParts = [...schemaEntrypoint.matchAll(/^\\ir\s+schema\/([^\s]+\.sql)\s*$/gmu)].map((match) => match[1]);
  assert.ok(schemaParts.length > 0, 'schema.sql must declare ordered schema parts');
  for (const part of schemaParts) await pool.query(await readFile(`infra/world-base/schema/${part}`, 'utf8'));
  const plan = await buildP12TargetImportPlan();
  await pool.query(plan.sql);
  const counts = await pool.query(`SELECT
    (SELECT count(*) FROM world_base.spatial_v3_nodes)::int AS nodes,
    (SELECT count(*) FROM world_base.spatial_v3_approved_physical_source_pairs)::int AS source_pairs,
    (SELECT count(*) FROM world_base.spatial_v3_world_routes)::int AS routes,
    (SELECT count(*) FROM world_base.spatial_v3_world_route_segments)::int AS segments,
    (SELECT count(*) FROM world_base.spatial_v3_world_route_endpoint_bindings)::int AS endpoints,
    (SELECT count(*) FROM world_base.spatial_v3_authoring_dependency_edges)::int AS dependencies`);
  assert.deepEqual(counts.rows[0], { nodes: 276, source_pairs: 358, routes: 86, segments: 86, endpoints: 172, dependencies: 3249 });
});
