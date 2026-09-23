import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import pg from 'pg';
import { materializeSpatialV3GeneratedScene } from '@rus/materialization/spatial-v3-materialization';
import { addAuthoredStartSpatialV3Batches } from '../../packages/new-game/src/stages/stage-24-party-db-write-plan/code/authored-start-spatial-v3.js';
import { addBatch } from '../../packages/new-game/src/stages/stage-24-party-db-write-plan/code/write-plan-batches.js';
import { SPATIAL_V3_TARGET_MIGRATIONS } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-target-migrations.js';

const json = async (path) => JSON.parse(await readFile(path, 'utf8'));
const manifestPath = 'data/world-catalogs/novgorod/m2c-acoustic-import-manifest.json';
const manifest = await json(manifestPath);
const load = (table) => json(resolve(dirname(manifestPath), manifest.datasets.find((entry) => entry.table === table).file));
const acoustics = await load('spatial_v3_g6_acoustic_baselines');
const acoustic = acoustics.find((row) => row.canonical_g5_id && row.ambient_noise === 1);
const node = (await load('spatial_v3_nodes')).find((row) => row.id === acoustic.canonical_g5_id);
const parent = (await load('spatial_v3_node_parents')).find((row) => row.child_id === node.id);
const header = (await load('spatial_v3_scene_templates')).find((row) => row.id === acoustic.scene_template_id);
const closure = { header };
for (const [key, table] of Object.entries({ g6_slots: 'spatial_v3_g6_template_slots',
  position_slots: 'spatial_v3_scene_position_templates', endpoint_slots: 'spatial_v3_scene_endpoint_slots',
  movement_edges: 'spatial_v3_scene_movement_edge_templates' })) {
  closure[key] = (await load(table)).filter((row) => row.scene_template_id === header.id && row.scene_template_version === header.version);
}
const prepared = materializeSpatialV3GeneratedScene({ party_id: 'canonical-start',
  site_id: 'g5:node', baseline_id: 'baseline:node', change_set_id: 'proposal-change',
  materializer_version: 'm2c', materialization_trace_id: 'run', canonical_g5: node,
  scene_closure: closure, acoustic_rows: [{ ...acoustic, authoring_digest: acoustic.canonical_digest }] });
assert.equal(prepared.ok, true, JSON.stringify(prepared.error));
const typedRef = (kind, id, version = 1) => ({ entity_kind: kind, entity_id: id, authoring_version: String(version) });
const result = { schema: 'rus.authored_start_party_materialization_result.v3', run_id: 'run',
  trace: { materializer_version: 'm2c', catalog_digest: header.canonical_digest },
  immediate: { spatial: { node: { parent_g4_id: parent.parent_id } } },
  initial_spatial_v3: { node_id: 'node', anchor_id: 'compatibility-anchor',
    canonical_g5_ref: typedRef('canonical_spatial_node', node.id, node.version),
    materialization_profile_ref: typedRef('scene_materialization_profile', 'profile'),
    scene_template_ref: { entity_ref: { entity_kind: 'scene_template', entity_id: header.id }, authoring_version: String(header.version) },
    g6: closure.g6_slots[0], position: closure.position_slots[0],
    canonical_scene_proposal: prepared.proposal,
    selected_position_id: prepared.proposal.endpoints.find((row) => row.endpoint_role === 'arrival').position_id } };
function build(input = result) {
  const batches = [];
  const ids = addAuthoredStartSpatialV3Batches({ batches, result: input, partyId: 'canonical-start',
    playerId: 'player', changeSetId: 'committed-change', sourceTrace: [], addBatch });
  return { batches, ids };
}

test('Stage24 retains exact canonical scene topology, arrival and authored ambient', () => {
  const { batches, ids } = build();
  const rows = (table) => batches.find((row) => row.target_table === table)?.records ?? [];
  assert.equal(ids.position, prepared.proposal.endpoints.find((row) => row.endpoint_role === 'arrival').position_id);
  assert.equal(rows('scene_position_nodes').length, closure.position_slots.reduce((sum, row) => sum + row.instance_count, 0));
  assert.equal(rows('scene_movement_edges').length, closure.movement_edges.length);
  assert.equal(rows('g6_acoustic_profiles')[0].ambient_noise, 1);
  assert.deepEqual(rows('party_g5_sites')[0].canonical_g5_ref, { entity_id: node.id, authoring_version: String(node.version) });
  assert.equal(rows('party_journey_locations')[0].scene_position_id, ids.position);
  assert.equal(rows('party_scene_baselines')[0].created_change_set_id, 'committed-change');
  assert.equal(rows('visibility_links').length, 0);
  for (const corrupt of [
    (value) => { value.initial_spatial_v3.canonical_scene_proposal.party_id = 'foreign'; },
    (value) => { value.initial_spatial_v3.selected_position_id = 'foreign-position'; },
    (value) => { delete value.initial_spatial_v3.selected_position_id; },
    (value) => { value.initial_spatial_v3.canonical_scene_proposal.endpoints.push({ ...value.initial_spatial_v3.canonical_scene_proposal.endpoints.find((row) => row.endpoint_role === 'arrival'), slot_key: 'extra' }); },
    (value) => { value.initial_spatial_v3.s1_physical_writes = [{ target_table: 'party_g6_instances' }]; }
  ]) { const value = structuredClone(result); corrupt(value); assert.throws(() => build(value), { code: 'AUTHORED_START_SPATIAL_V3_INVALID' }); }
});

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 60_000 });
test('Stage24 canonical batches persist full approved scene in PostgreSQL without extra S1 rows', async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  const name = `m2c-canonical-start-${process.pid}`;
  let pool;
  t.after(async () => { await pool?.end(); docker(['rm', '-fv', name]); });
  const started = docker(['run', '-d', '--name', name, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_USER=test', '-e', 'POSTGRES_PASSWORD=test', '-e', 'POSTGRES_DB=test', 'postgres:16-alpine']);
  assert.equal(started.status, 0, started.stderr);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (docker(['exec', name, 'pg_isready', '-U', 'test']).status === 0) break;
    await new Promise((done) => setTimeout(done, 300));
  }
  const port = Number(docker(['port', name, '5432']).stdout.match(/:(\d+)/)[1]);
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'test', password: 'test', database: 'test' });
  for (const sql of SPATIAL_V3_TARGET_MIGRATIONS) await pool.query(sql);
  await pool.query(`INSERT INTO party_runtime.parties
    (party_id,schema_version,world_revision_id,world_catalog_digest,materializer_version,rng_version,command_catalog_digest,profile_bundle_digest)
    VALUES ('canonical-start',3,$1,'catalog','m2c','rng','commands','profiles')`, [node.world_revision_id]);
  await pool.query(`INSERT INTO party_runtime.party_player_characters(party_id,character_id,profile)
    VALUES ('canonical-start','player','{}')`);
  const { batches, ids } = build();
  await pool.query('BEGIN');
  for (const batch of batches) for (const record of batch.records) {
    const fields = Object.keys(record);
    await pool.query(`INSERT INTO party_runtime.${batch.target_table} (${fields.join(',')})
      VALUES (${fields.map((_, index) => `$${index + 1}`).join(',')})`, fields.map((key) => record[key]));
  }
  await pool.query('COMMIT');
  const readback = await pool.query(`SELECT j.scene_position_id,p.g6_instance_id,a.ambient_noise,b.source_kind
    FROM party_runtime.party_journey_locations j JOIN party_runtime.scene_position_nodes p ON p.id=j.scene_position_id
    JOIN party_runtime.party_g6_instances g ON g.id=p.g6_instance_id
    JOIN party_runtime.party_scene_baselines b ON b.id=g.scene_baseline_id
    JOIN party_runtime.g6_acoustic_profiles a ON a.g6_instance_id=g.id WHERE j.id=$1`, [ids.journey]);
  assert.deepEqual(readback.rows, [{ scene_position_id: ids.position, g6_instance_id: ids.g6,
    ambient_noise: 1, source_kind: 'canonical_template' }]);
});
