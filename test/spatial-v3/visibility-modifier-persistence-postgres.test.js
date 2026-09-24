import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import pg from 'pg';
import { SPATIAL_V3_TARGET_MIGRATIONS } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';
import { createSpatialV3PartyRepository } from '../../packages/party-store/src/spatial-v3-repository.js';

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 45_000 });

test('committed modifier read distinguishes complete empty set, active row, and missing table', async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  const name = `visibility-modifier-${process.pid}`;
  let pool;
  t.after(async () => { await pool?.end(); docker(['rm', '-fv', name]); });
  const started = docker(['run', '-d', '-p', '127.0.0.1::5432', '--name', name,
    '-e', 'POSTGRES_PASSWORD=visibility', '-e', 'POSTGRES_USER=visibility',
    '-e', 'POSTGRES_DB=visibility', 'postgres:16-alpine']);
  assert.equal(started.status, 0, started.stderr);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    ready = docker(['exec', name, 'psql', '-U', 'visibility', '-d', 'visibility',
      '-c', 'SELECT 1']).status === 0;
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  assert.equal(ready, true);
  const port = Number(docker(['port', name, '5432']).stdout.match(/:(\d+)/)[1]);
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'visibility',
    password: 'visibility', database: 'visibility' });
  await pool.query(SPATIAL_V3_TARGET_MIGRATIONS[0]);
  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest)
    VALUES ('p',2,'w','d','m','r','c','b')`);
  const repository = createSpatialV3PartyRepository({ transaction: pool });
  await assert.rejects(repository.loadVisibilityModifiers({ party_id: 'p' }), { code: '42P01' });
  await pool.query(SPATIAL_V3_TARGET_MIGRATIONS.at(-1));
  assert.deepEqual(await repository.loadVisibilityModifiers({ party_id: 'p' }),
    { ok: true, complete: true, rows: [] });
  const pins = { pins: [{ dependency_role: 'source', entity_ref: { entity_kind: 'party_change_set', entity_id: 'c' }, version_pin: { pin_kind: 'party_state_version', state_version: 1 } }], canonical_digest: 'digest' };
  await pool.query(`INSERT INTO party_runtime.visibility_modifiers
    (id,party_id,source_entity_ref,affected_scope_ref,modifier_kind,condition_ref,source_dependency_pins,state_version,updated_change_set_id)
    VALUES ('smoke','p',$1,$2,'smoke',$3,$4,1,'c')`,
  [{ entity_kind: 'item', entity_id: 'fire' }, { spatial_kind: 'scene_position', spatial_id: 'pos' },
    { entity_ref: { entity_kind: 'visibility_modifier', entity_id: 'smoke-condition' }, authoring_version: '1' }, pins]);
  const reloaded = createSpatialV3PartyRepository({ transaction: pool });
  const active = await reloaded.loadVisibilityModifiers({ party_id: 'p' });
  assert.equal(active.complete, true);
  assert.equal(active.rows.length, 1);
  assert.equal(active.rows[0].modifier_kind, 'smoke');
  assert.deepEqual(active.rows[0].source_dependency_pins, pins);
  await pool.query(`DELETE FROM party_runtime.visibility_modifiers WHERE id='smoke'`);
  assert.deepEqual(await reloaded.loadVisibilityModifiers({ party_id: 'p' }),
    { ok: true, complete: true, rows: [] });
});
