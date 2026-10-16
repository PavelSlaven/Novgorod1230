import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import pg from 'pg';
import { testContainerLabel } from '../helpers/test-containers.js';

// rt-lines phase a3.2: world_base part 30.sql - Spatial 4.7.0 line fields (PLAN-rt-lines-a3, PLAN-OK-rt-lines-a3).
const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 120_000 });
const REJECTED = (code) => (error) => error.code === code;
const CHECK = '23514';
const UNIQUE = '23505';
const FOREIGN = '23503';

async function waitForPostgres(name) {
  for (let i = 0; i < 60; i += 1) {
    if (docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres']).status === 0) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('postgres not ready');
}

const digest = 'a'.repeat(64);
const bindingColumns = ['id', 'version', 'parent_g4_id', 'from_canonical_g5_id', 'to_canonical_g5_id',
  'from_scene_endpoint_slot_key', 'to_scene_endpoint_slot_key', 'reverse_binding_id', 'reverse_binding_version',
  'source_pair_id', 'source_pair_version', 'status', 'provenance_ref'];
const bindingBase = (id, version) => ({ id, version, parent_g4_id: 'g4', from_canonical_g5_id: 'a', to_canonical_g5_id: 'b',
  from_scene_endpoint_slot_key: 'departure', to_scene_endpoint_slot_key: 'arrival', reverse_binding_id: `${id}-r`,
  reverse_binding_version: version, source_pair_id: 'pair', source_pair_version: 1, status: 'approved', provenance_ref: 'src' });
const oldStyle = { connection_profile_id: 'cprof', connection_profile_version: 1 };
const lineStyle = { line_kind_profile_id: 'lkp__path', line_kind_profile_version: 1, line_name: 'тропой вдоль ручья', base_minutes: 9,
  capacity_semantics_ref: 'capacity.no_static_limit@1', risk_profile_ref: 'risk.land_path@1', availability_condition_set_ref: null };

test('30.sql: line kind profiles, alternatives, binding and segment line fields; old rows stay valid', { timeout: 600_000 }, async (t) => {
  if (docker(['version']).status !== 0) { t.skip('Docker required'); return; }
  const name = `m2c-lines-ddl-${randomUUID().slice(0, 8)}`;
  const pools = [];
  t.after(async () => { await Promise.all(pools.map((pool) => pool.end().catch(() => {}))); docker(['rm', '-fv', name]); });
  const started = docker(['run', ...testContainerLabel(), '-d', '--name', name, '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD=local_only', 'postgres:16-alpine']);
  assert.equal(started.status, 0, started.stderr);
  await waitForPostgres(name);
  const port = Number(docker(['port', name, '5432']).stdout.match(/:(\d+)\s*$/u)?.[1]);
  const world = new pg.Pool({ host: '127.0.0.1', port, user: 'postgres', password: 'local_only', database: 'postgres', max: 2 });
  pools.push(world);
  for (const file of (await readdir('infra/world-base/schema')).filter((item) => /^\d\d\.sql$/u.test(item)).sort()) {
    await world.query(await readFile(`infra/world-base/schema/${file}`, 'utf8'));
  }
  const schemaSql = await readFile('infra/world-base/schema.sql', 'utf8');
  assert.match(schemaSql, /\\ir schema\/30\.sql/u, 'schema.sql includes part 30');
  assert.equal((await world.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='world_base'`)).rows[0].n, 224, '222 + two line tables');

  // Foreign keys to the rest of the world are the importer's business (a4); these checks are about the rows of this part.
  const client = await world.connect();
  try {
    await client.query(`SET session_replication_role = replica`);
    const columns = async (table) => (await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='world_base' AND table_name=$1`, [table])).rows.map((row) => row.column_name);
    const profileColumns = await columns('spatial_v3_line_kind_profiles');
    for (const column of ['id', 'version', 'world_revision_id', 'line_kind_id', 'transition_environment_profile_id', 'topological_orientation_profile_id', 'baseline_movement_method_id',
      'movement_method_cost_profile_id', 'dynamic_recheck_policy_id', 'route_kind_id', 'status', 'provenance_ref', 'canonical_digest']) {
      assert.ok(profileColumns.includes(column), `profile column ${column}`);
    }
    assert.ok(!profileColumns.includes('max_segment_minutes'), 'PLAN-OK-rt-lines-a3: no second field for the slice step');

    const profile = (id, version, kind, extra = {}) => {
      const row = { entity_kind: 'line_kind_profile', id, version, world_revision_id: 'rev', line_kind_id: kind,
        transition_environment_profile_id: 'env.land_path', transition_environment_profile_version: 1,
        topological_orientation_profile_id: 'orientation.topological_route', topological_orientation_profile_version: 1,
        baseline_movement_method_id: 'movement_method.walk', movement_method_cost_profile_id: 'cost.line_path', movement_method_cost_profile_version: 1,
        dynamic_recheck_policy_id: 'recheck.land_30m', dynamic_recheck_policy_version: 1, route_kind_id: 'route.path',
        status: 'approved', provenance_ref: 'src', canonical_digest: digest, ...extra };
      const keys = Object.keys(row);
      return client.query(`INSERT INTO world_base.spatial_v3_line_kind_profiles (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')})`, keys.map((key) => row[key]));
    };
    await profile('lkp__path', 1, 'path');
    await assert.rejects(() => profile('lkp__path2', 1, 'path'), REJECTED(UNIQUE), 'one profile per (line kind, version)');
    await profile('lkp__path', 2, 'path');
    await assert.rejects(() => profile('lkp__blank', 1, '  '), REJECTED(CHECK), 'blank line kind');
    await assert.rejects(() => profile('lkp__bad', 0, 'yard'), REJECTED(CHECK), 'version > 0');
    await assert.rejects(() => profile('lkp__status', 1, 'yard', { status: 'draft' }), REJECTED(CHECK));
    await assert.rejects(() => profile('lkp__digest', 1, 'yard', { canonical_digest: 'xyz' }), REJECTED(CHECK));
    await profile('lkp__river_channel', 1, 'river_channel');

    const alternative = (extra = {}) => {
      const row = { profile_id: 'lkp__river_channel', profile_version: 1, movement_method_id: 'movement_method.swim', risk_class: 'high',
        hazard_rule_ref: 'hazard.swim_river_channel@1', ...extra };
      const keys = Object.keys(row);
      return client.query(`INSERT INTO world_base.spatial_v3_line_kind_alternative_methods (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')})`, keys.map((key) => row[key]));
    };
    await alternative();
    await assert.rejects(() => alternative(), REJECTED(UNIQUE), 'one alternative per method');
    for (const risk of ['none', 'HIGH', null]) await assert.rejects(() => alternative({ movement_method_id: 'movement_method.wade', risk_class: risk }), (error) => [CHECK, '23502'].includes(error.code), `risk_class ${risk}`);
    await assert.rejects(() => alternative({ movement_method_id: 'movement_method.wade', hazard_rule_ref: '  ' }), REJECTED(CHECK), 'blank hazard ref');
    await client.query(`SET session_replication_role = DEFAULT`);
    await assert.rejects(() => alternative({ profile_id: 'lkp__missing', movement_method_id: 'movement_method.climb' }), REJECTED(FOREIGN), 'alternative belongs to a profile');
    await client.query(`SET session_replication_role = replica`);

    const binding = (extra, id = 'cg5bind-1', version = 3) => {
      const row = { ...bindingBase(id, version), ...extra };
      const keys = Object.keys(row);
      return client.query(`INSERT INTO world_base.spatial_v3_canonical_g5_connection_bindings (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')})`, keys.map((key) => row[key]));
    };
    await binding(oldStyle, 'cg5bind-old', 1);
    await binding({ ...oldStyle, connection_profile_version: 2 }, 'cg5bind-old', 2);
    await binding(lineStyle, 'cg5bind-1', 3);
    await binding({ ...lineStyle, line_discriminator: 'к броду', line_direction_id: 'north', line_toponym: 'Вихтуй', capacity: 2 }, 'cg5bind-2', 3);
    const reject = (extra, why) => assert.rejects(() => binding(extra, `cg5bind-x-${Math.random()}`), REJECTED(CHECK), why);
    await reject({}, 'neither a connection profile nor a line kind profile');
    await reject({ ...oldStyle, ...lineStyle }, 'both styles');
    await reject({ ...oldStyle, line_name: 'тропой' }, 'line fields without a line kind profile');
    await reject({ ...oldStyle, base_minutes: 5 }, 'minutes without a line kind profile');
    await reject({ ...lineStyle, line_name: null }, 'a line profile needs a name');
    await reject({ ...lineStyle, line_name: '   ' }, 'a blank name');
    await reject({ ...lineStyle, base_minutes: null }, 'a line profile needs minutes');
    await reject({ ...lineStyle, base_minutes: 0 }, 'minutes > 0');
    await reject({ ...lineStyle, capacity: 0 }, 'capacity > 0');
    await reject({ ...lineStyle, capacity_semantics_ref: null }, 'capacity semantics required with a line profile');
    await reject({ ...lineStyle, risk_profile_ref: null }, 'risk profile required with a line profile');
    await reject({ ...lineStyle, line_kind_profile_version: null }, 'profile id and version come together');
    await reject({ ...oldStyle, connection_profile_version: null }, 'connection profile id and version come together');
    // D3: availability is optional on a line binding
    const nullAvailability = await client.query(`SELECT count(*)::int AS n FROM world_base.spatial_v3_canonical_g5_connection_bindings WHERE id='cg5bind-1' AND availability_condition_set_ref IS NULL`);
    assert.equal(nullAvailability.rows[0].n, 1);
    await binding({ ...lineStyle, availability_condition_set_ref: 'availability.local_state_conditional@1' }, 'cg5bind-3', 3);

    const segment = (extra, id = `seg-${Math.random()}`) => {
      const row = { entity_kind: 'world_route_segment', id, version: 1, world_revision_id: 'rev', world_route_id: 'route', world_route_version: 1, ordinal: Math.floor(Math.random() * 1e9),
        from_point_id: 'p0', from_point_version: 1, to_point_id: 'p1', to_point_version: 1, transition_environment_profile_id: 'env.land_path', transition_environment_profile_version: 1,
        topological_orientation_profile_id: 'orientation.topological_route', topological_orientation_profile_version: 1, baseline_movement_method_id: 'movement.foot',
        movement_method_cost_profile_id: 'cost.path_60m', movement_method_cost_profile_version: 1, base_minutes: 60, dynamic_recheck_policy_id: 'recheck.land_30m', dynamic_recheck_policy_version: 1,
        status: 'approved', provenance_ref: 'src', canonical_digest: digest, ...extra };
      const keys = Object.keys(row);
      return client.query(`INSERT INTO world_base.spatial_v3_world_route_segments (${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')})`, keys.map((key) => row[key]));
    };
    await segment({});
    await segment({ line_kind_id: 'path', line_kind_profile_id: 'lkp__path', line_kind_profile_version: 1, line_name: 'тропой', line_direction_id: 'east' });
    for (const [why, extra] of [['line kind without profile', { line_kind_id: 'path' }], ['profile without name', { line_kind_id: 'path', line_kind_profile_id: 'lkp__path', line_kind_profile_version: 1 }],
      ['name without profile', { line_name: 'тропой' }], ['direction without a line', { line_direction_id: 'east' }], ['blank name', { line_kind_id: 'path', line_kind_profile_id: 'lkp__path', line_kind_profile_version: 1, line_name: ' ' }],
      ['profile id without version', { line_kind_id: 'path', line_kind_profile_id: 'lkp__path', line_name: 'тропой' }]]) {
      await assert.rejects(() => segment(extra), REJECTED(CHECK), why);
    }
  } finally {
    await client.query('SET session_replication_role = DEFAULT').catch(() => {});
    client.release();
  }
});
