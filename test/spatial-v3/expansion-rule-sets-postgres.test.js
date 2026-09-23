import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 45_000 });

test('expansion rule-set schema applies, replays and binds all three profile rules', async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  const name = `m2c-rule-ddl-${process.pid}`;
  let pool;
  t.after(async () => { await pool?.end(); docker(['rm', '-f', '-v', name]); });
  assert.equal(docker(['run', '-d', '-p', '127.0.0.1::5432', '--name', name,
    '-e', 'POSTGRES_PASSWORD=m2c', '-e', 'POSTGRES_USER=m2c', '-e', 'POSTGRES_DB=m2c',
    'postgres:16-alpine']).status, 0);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (docker(['exec', name, 'pg_isready', '-U', 'm2c']).status === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  const port = Number(docker(['port', name, '5432']).stdout.match(/:(\d+)/)[1]);
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'm2c', password: 'm2c', database: 'm2c' });
  const entrypoint = await readFile('infra/world-base/schema.sql', 'utf8');
  const parts = [...entrypoint.matchAll(/^\\ir\s+schema\/([^\s]+\.sql)\s*$/gmu)].map((match) => match[1]);
  for (const part of parts) await pool.query(await readFile(`infra/world-base/schema/${part}`, 'utf8'));
  await pool.query(await readFile('infra/world-base/schema/22.sql', 'utf8'));
  const result = await pool.query(`SELECT conname FROM pg_constraint WHERE conname LIKE
    'spatial_v3_expansion_%_rule_fk' ORDER BY conname`);
  assert.deepEqual(result.rows.map((row) => row.conname), [
    'spatial_v3_expansion_adjacency_rule_fk',
    'spatial_v3_expansion_connectivity_rule_fk',
    'spatial_v3_expansion_seed_rule_fk'
  ]);
});
