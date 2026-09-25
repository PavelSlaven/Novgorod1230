import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { planApprovedActorDestinationTransition } from '@rus/movement-routes';
import { createSpatialV3WorldBaseReader } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-world-base-reader.js';
import { promoteM2cOpenCapacity } from '../../scripts/promote-m2c-open-capacity-v2.mjs';
import { buildTransactionalImportSql, validateAuthoringBundle } from '../../tools/spatial-v3/p12-authoring-importer.mjs';

const manifestPath = 'data/world-catalogs/novgorod/m2c-open-capacity-v2-import-manifest.json';
const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 120_000 });

test('approved M2c open capacity successor imports through P12 without overwriting version 1', async (t) => {
  await promoteM2cOpenCapacity({ check: true });
  const validation = await validateAuthoringBundle({ manifestPath });
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  const container = `m2c-capacity-import-${process.pid}`;
  let pool;
  t.after(async () => { await pool?.end(); docker(['rm', '-fv', container]); });
  const started = docker(['run', '-d', '--name', container, '-p', '127.0.0.1::5432',
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
  for (const match of entrypoint.matchAll(/^\\ir\s+schema\/([^\s]+\.sql)\s*$/gmu))
    await pool.query(await readFile(`infra/world-base/schema/${match[1]}`, 'utf8'));
  await pool.query(await buildTransactionalImportSql({
    manifestPath: 'data/world-catalogs/novgorod/m2c-acoustic-import-manifest.json' }));
  const sql = await buildTransactionalImportSql({ manifestPath });
  await pool.query(sql);
  await pool.query(sql);
  const rows = (await pool.query(`SELECT scene_template_version, count(*)::int AS n,
    min(capacity)::int AS minimum, max(capacity)::int AS maximum
    FROM world_base.spatial_v3_scene_position_templates
    WHERE scene_template_id LIKE 'stfv3__g5_%_v1'
    GROUP BY scene_template_version ORDER BY scene_template_version`)).rows;
  assert.deepEqual(rows, [
    { scene_template_version: 1, n: 51, minimum: 1, maximum: 1 },
    { scene_template_version: 2, n: 51, minimum: 7, maximum: 7 },
  ]);
  const edges = (await pool.query(`SELECT scene_template_version, count(*)::int AS n,
    count(capacity)::int AS limited FROM world_base.spatial_v3_scene_movement_edge_templates
    WHERE scene_template_id LIKE 'stfv3__g5_%_v1'
    GROUP BY scene_template_version ORDER BY scene_template_version`)).rows;
  assert.deepEqual(edges, [
    { scene_template_version: 1, n: 68, limited: 0 },
    { scene_template_version: 2, n: 68, limited: 0 },
  ]);
  const movement = (await pool.query(`SELECT e.scene_template_version AS version,
      e.edge_slot_key AS edge_id,e.reverse_edge_slot_key AS reverse_edge_id,
      e.from_position_slot_key AS from_position_ref,
      e.to_position_slot_key AS to_position_ref,e.cost_kind,e.action_units,
      e.capacity AS edge_capacity,p.capacity AS destination_capacity
    FROM world_base.spatial_v3_scene_movement_edge_templates e
    JOIN world_base.spatial_v3_scene_position_templates p
      ON p.scene_template_id=e.scene_template_id
      AND p.scene_template_version=e.scene_template_version
      AND p.position_slot_key=e.to_position_slot_key
    WHERE e.scene_template_id='stfv3__g5_boundary_access_v1'
      AND e.from_position_slot_key='arrival' AND e.to_position_slot_key='focus'
    ORDER BY e.scene_template_version`)).rows;
  assert.deepEqual(movement.map(({ version, edge_capacity, destination_capacity }) =>
    ({ version, edge_capacity, destination_capacity })), [
    { version: 1, edge_capacity: null, destination_capacity: 1 },
    { version: 2, edge_capacity: null, destination_capacity: 7 },
  ]);
  const plan = (row, overrides = {}) => planApprovedActorDestinationTransition({
    state_version: 1, expected_state_version: 1,
    actor: { actor_ref: { entity_kind: 'player_character', entity_id: 'actor' },
      location_ref: 'site', zone_ref: 'arrival' },
    destination: { entity_ref: { entity_kind: 'scene_position', entity_id: 'focus' },
      location_ref: 'site', zone_ref: 'focus' },
    persisted_scene_movement_edge: { ...row, base_minutes: null,
      transition_footprint_units: 1, destination_occupancy: 1,
      edge_state_version: 1, reverse_edge_state_version: 1,
      source_node_state_version: 1, destination_node_state_version: 1,
      transition_environment_profile_ref: null,
      movement_orientation_profile_ref: null, baseline_movement_method_id: null,
      movement_method_cost_profile_ref: null, dynamic_recheck_policy_ref: null,
      ...overrides }
  });
  assert.equal(plan(movement[1]).pass, true, 'NPC at focus permits open v2 arrival movement');
  assert.equal(plan(movement[0]).pass, false, 'NPC fills v1 focus capacity');
  assert.equal(plan(movement[1], { edge_capacity: 1,
    transition_footprint_units: 2 }).pass, false, 'bounded edge rejects oversized footprint');
  const v2 = (await pool.query(`SELECT
    (SELECT count(*)::int FROM world_base.spatial_v3_scene_templates WHERE version=2) AS scenes,
    (SELECT count(*)::int FROM world_base.spatial_v3_scene_materialization_candidates WHERE scene_template_version=2) AS candidates,
    (SELECT count(*)::int FROM world_base.spatial_v3_g6_acoustic_baselines WHERE scene_template_version=2) AS acoustics,
    (SELECT count(*)::int FROM world_base.spatial_v3_local_movement_eligibility_profiles WHERE scene_template_version=2) AS movement`)).rows[0];
  assert.deepEqual(v2, { scenes: 17, candidates: 220, acoustics: 71, movement: 68 });
  const binding = (await pool.query(`SELECT p.source_entity_id AS id,
      p.source_entity_version AS version,p.world_revision_id,p.id AS profile_id,
      c.scene_template_id
    FROM world_base.spatial_v3_scene_materialization_profiles p
    JOIN world_base.spatial_v3_scene_materialization_candidates c
      ON c.profile_id=p.id AND c.profile_version=p.version
    WHERE p.source_kind='canonical_g5' AND p.version=2
    ORDER BY p.id LIMIT 1`)).rows[0];
  const reader = createSpatialV3WorldBaseReader({ query: pool.query.bind(pool) });
  const g4 = (await pool.query(`SELECT id,world_revision_id FROM world_base.spatial_v3_nodes
    WHERE id='g4v3__gn_nov_g3_xp017_yp026_r2_dry_pine_ridge'`)).rows[0];
  assert.ok(g4, 'approved dry pine G4 imported');
  const expansionBinding = await reader.readG4ExpansionBinding({
    g4_id: g4.id, world_revision_id: g4.world_revision_id });
  assert.equal(expansionBinding.ok, true, JSON.stringify(expansionBinding.error));
  const expansionClosure = await reader.readPinnedG4ExpansionClosure(expansionBinding.value);
  assert.equal(expansionClosure.ok, true, JSON.stringify(expansionClosure.error));
  assert.ok(expansionClosure.value.entry_scene_endpoints.some((row) =>
    row.profile_version === 2 && row.scene_template_version === 2));
  for (const version of [1, 2]) {
    const selected = await reader.readPinnedCanonicalG5SceneBinding({
      id: binding.id, version: binding.version, world_revision_id: binding.world_revision_id,
      scene_template_ref: { id: binding.scene_template_id, version },
      scene_materialization_profile_ref: { id: binding.profile_id, version }
    });
    assert.equal(selected.ok, true, JSON.stringify(selected.error));
    assert.equal(selected.value.scene_template_version, version);
    assert.equal(selected.value.materialization_profile_version, version);
  }
  const proposed = JSON.parse(await readFile(
    'data/world-catalogs/novgorod/m2c-scene-movement-edges/open-capacity-v2-candidate.json'));
  for (const [table, expected] of [
    ['spatial_v3_scene_position_templates', proposed.scene_position_templates],
    ['spatial_v3_scene_movement_edge_templates', proposed.scene_movement_edge_templates],
  ]) {
    const actual = (await pool.query(`SELECT to_jsonb(r) AS row FROM world_base.${table} r
      WHERE scene_template_version=2`)).rows.map(({ row }) => row);
    assert.equal(actual.length, expected.length);
    for (const row of expected) assert.ok(actual.some((stored) =>
      Object.keys(row).every((key) => JSON.stringify(stored[key]) === JSON.stringify(row[key]))),
    `${table}: ${row.scene_template_id}/${row.position_slot_key ?? row.edge_slot_key}`);
  }
});
