import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { loadApprovedProceduralActorTemporalBundle } from '@rus/runtime-catalog';
import { IDENTITY_ATTESTATION_SCHEMA, readIdentityRequest, runIdentityImportStage } from '../../scripts/v17-npc-identity-stage.mjs';
import { approvedNpcIdentityCatalog } from '../helpers/npc-identity-catalog.js';
import { testContainerLabel } from '../helpers/test-containers.js';

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 120_000 });

test('the v17 identity stage imports into the real world_base DDL and the actor bundle reads it back', {
  timeout: 300_000
}, async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  const name = `npc-identity-${randomUUID().slice(0, 8)}`;
  let world;
  t.after(async () => { await world?.end().catch(() => {}); docker(['rm', '-fv', name]); });
  assert.equal(docker(['run', ...testContainerLabel(), '-d', '--name', name, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=local_only', 'postgres:16-alpine']).status, 0);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']).status === 0) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const port = Number(docker(['port', name, '5432']).stdout.match(/:(\d+)\s*$/u)?.[1]);
  world = new pg.Pool({ host: '127.0.0.1', port, user: 'postgres', password: 'local_only', database: 'postgres', max: 2 });
  for (const file of (await readdir('infra/world-base/schema')).filter((entry) => /^\d\d\.sql$/u.test(entry)).sort()) {
    await world.query(await readFile(`infra/world-base/schema/${file}`, 'utf8'));
  }
  // What earlier bootstrap stages leave behind: the region and the world revision row.
  const request = await readIdentityRequest();
  await world.query(`INSERT INTO world_base.regions(id) VALUES ('region_novgorod_land')`);
  await world.query(`INSERT INTO world_base.world_revisions(id,title,catalog_digest,status)
    VALUES ($1,'target',repeat('a',64),'approved')`, [request.approved_data.world_revision_id]);

  const result = await runIdentityImportStage({ world, requireAttestation: async () => ({ schema: IDENTITY_ATTESTATION_SCHEMA,
    verdict: 'APPROVE', request_digest: request.request_digest, attested_by: 'test', independence_basis: 'test fixture' }) });
  assert.equal(result.readback, 'exact');
  const statuses = await world.query(`SELECT selection_class, people_ref, status, count(*)::int AS n
    FROM world_base.region_name_pool_entries GROUP BY 1,2,3 ORDER BY 1,2,3`);
  assert.ok(statuses.rows.every((row) => (row.selection_class === 'ordinary' && row.people_ref === 'pp_novgorod_rus') === (row.status === 'approved')),
    JSON.stringify(statuses.rows));
  assert.equal(statuses.rows.filter((row) => row.status === 'approved').reduce((sum, row) => sum + row.n, 0), 266);
  for (const table of ['npc_regional_context_name_bindings', 'npc_psychology_scale_entries', 'occupation_character_items']) {
    const empty = await world.query(`SELECT count(*)::int AS n FROM world_base.${table} WHERE btrim(provenance_ref) = ''`);
    assert.equal(empty.rows[0].n, 0, table);
  }
  await assert.rejects(runIdentityImportStage({ world, requireAttestation: async () => ({ schema: IDENTITY_ATTESTATION_SCHEMA,
    verdict: 'APPROVE', request_digest: request.request_digest, attested_by: 'test', independence_basis: 'test' }) }),
  (error) => error.code === '23505', 'insert-only: a second commit is rejected');

  const occupations = ['nov_occ_fisher', 'nov_occ_hunter_trapper'];
  const bundle = await loadApprovedProceduralActorTemporalBundle({
    worldBaseReader: { read: world.query.bind(world) },
    worldPin: { world_revision_id: request.approved_data.world_revision_id, world_catalog_digest: 'c'.repeat(64) },
    actorCatalog: { schema: 'rus.live_world_runtime.approved_actor_catalog.v1', roles: [],
      occupations: occupations.map((occupation_id) => ({ occupation_id, status: 'approved' })) },
    actorProfileCatalog: { schema: 'rus.verified_actor_profile_catalog.v1', verified: true,
      world_pin: { world_revision_id: request.approved_data.world_revision_id, world_catalog_digest: 'c'.repeat(64) },
      records_by_table: {} },
    temporalRecords: [] });
  const expected = await approvedNpcIdentityCatalog();
  const byId = (a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b));
  const pick = (rows, keys) => rows.map((row) => Object.fromEntries(keys.map((key) => [key, row[key]]))).sort(byId);
  assert.deepEqual(pick(bundle.npc_identity.name_bindings, ['regional_context_id', 'name_pool_id', 'people_ref']),
    pick(expected.name_bindings, ['regional_context_id', 'name_pool_id', 'people_ref']));
  assert.deepEqual(pick(bundle.npc_identity.name_entries, ['id', 'name_form', 'sex_category', 'people_ref', 'weight']),
    pick(expected.name_entries, ['id', 'name_form', 'sex_category', 'people_ref', 'weight']));
  assert.deepEqual(pick(bundle.npc_identity.scale_entries, ['scale_kind', 'entry_id', 'label_ru', 'weight']),
    pick(expected.scale_entries, ['scale_kind', 'entry_id', 'label_ru', 'weight']));
  const wanted = expected.character_items.filter((row) => occupations.includes(row.occupation_id));
  assert.ok(wanted.length > 0);
  assert.deepEqual(pick(bundle.npc_identity.character_items, ['occupation_id', 'item_kind', 'item_id', 'text_ru']),
    pick(wanted, ['occupation_id', 'item_kind', 'item_id', 'text_ru']));
  assert.equal(new Set(bundle.npc_identity.name_entries.map((row) => row.id)).size, bundle.npc_identity.name_entries.length);
  assert.ok(bundle.npc_identity.name_entries.every((row) => row.people_ref === 'pp_novgorod_rus'));
});
