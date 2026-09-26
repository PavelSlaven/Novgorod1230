import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import test from 'node:test';
import pg from 'pg';
import { createSpatialV3WorldBaseReader } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-world-base-reader.js';
import { buildTransactionalImportSql, validateAuthoringBundle } from '../../tools/spatial-v3/p12-authoring-importer.mjs';
import { assertLocalMovementEligibilityPostgres } from './local-movement-eligibility-postgres-acceptance.js';
import { testContainerLabel } from '../helpers/test-containers.js';

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 120_000 });
const candidateDir = resolve('data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1');
const immutableTables = Object.freeze([
  'spatial_v3_nodes', 'spatial_v3_node_classes', 'spatial_v3_node_parents',
  'spatial_v3_g4_directional_exits', 'spatial_v3_world_routes',
  'spatial_v3_world_route_points', 'spatial_v3_world_route_segments',
  'spatial_v3_world_route_segment_spatial_contexts',
  'spatial_v3_world_route_endpoint_bindings', 'spatial_v3_topological_direction_contexts',
  'spatial_v3_g4_traversal_profiles'
]);
const canonical = (value) => Array.isArray(value)
  ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
async function assertExactReadback(pool, datasetsDir, table) {
  const expected = JSON.parse(await readFile(join(datasetsDir, `${table}.json`), 'utf8'));
  const actual = (await pool.query(
    `SELECT (to_jsonb(row_value) - 'created_at' - 'updated_at') AS row_value FROM world_base.${table} AS row_value`
  )).rows.map(({ row_value }) => row_value);
  assert.equal(actual.length, expected.length, `${table} count`);
  const remaining = [...actual];
  for (const row of expected) {
    const index = remaining.findIndex((stored) => canonical(
      Object.fromEntries(Object.keys(row).map((key) => [key, stored[key]]))
    ) === canonical(row));
    assert.notEqual(index, -1, `${table} readback row mismatch`);
    remaining.splice(index, 1);
  }
  assert.equal(remaining.length, 0, `${table} has unexpected readback rows`);
}

test('M2c candidate imports under full DDL and preserves approved topology readback', async (t) => {
  const container = `m2c-expansion-import-${process.pid}`;
  let pool;
  t.after(async () => {
    await pool?.end();
    docker(['rm', '-fv', container]);
  });
  if (docker(['version']).status !== 0) return t.skip('Docker required for isolated candidate import test');

  const candidateManifestPath = 'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/import-manifest.json';
  const candidateManifest = JSON.parse(await readFile(candidateManifestPath, 'utf8'));
  assert.equal(candidateManifest.status, 'approved', 'independently approved authoring bundle');
  const validation = await validateAuthoringBundle({ root: process.cwd(), manifestPath: candidateManifestPath });
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));

  const started = docker([
    'run', ...testContainerLabel(), '-d', '--name', container, '-p', '127.0.0.1::5432',
    '-e', 'POSTGRES_PASSWORD=m2c', '-e', 'POSTGRES_USER=m2c', '-e', 'POSTGRES_DB=m2c', 'postgres:16-alpine'
  ]);
  assert.equal(started.status, 0, started.stderr);
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const logs = docker(['logs', container]);
    if (`${logs.stdout}${logs.stderr}`.includes('PostgreSQL init process complete')
        && docker(['exec', container, 'pg_isready', '-U', 'm2c', '-d', 'm2c']).status === 0) { ready = true; break; }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  assert.equal(ready, true, 'isolated PostgreSQL starts');
  const port = Number(docker(['port', container, '5432']).stdout.match(/:(\d+)/)?.[1]);
  assert.ok(port > 0, 'Docker exposes PostgreSQL port');
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'm2c', password: 'm2c', database: 'm2c' });

  const schemaFiles = (await readFile('infra/world-base/schema.sql', 'utf8'))
    .match(/^\\ir\s+schema\/([^\s]+\.sql)\s*$/gmu)
    .map((line) => line.match(/schema\/([^\s]+\.sql)/)[1]);
  assert.ok(schemaFiles.includes('23.sql'), 'full DDL entrypoint includes latest schema');
  for (const schemaFile of schemaFiles) await pool.query(await readFile(`infra/world-base/schema/${schemaFile}`, 'utf8'));
  const sql = await buildTransactionalImportSql({ root: process.cwd(), manifestPath: candidateManifestPath });
  await pool.query(sql);

  const datasetsDir = join(candidateDir, 'datasets');
  const connectionProfiles = JSON.parse(await readFile(join(datasetsDir,
    'spatial_v3_canonical_g5_connection_profiles.json'), 'utf8'));
  assert.equal(connectionProfiles.filter((row) => row.profile_scope === 'site_connection'
    && row.version === 1 && row.availability_condition_set_ref !== null).length, 3);
  assert.equal(connectionProfiles.filter((row) => row.profile_scope === 'site_connection'
    && row.version === 2 && row.availability_condition_set_ref === null).length, 3);
  assert.ok(connectionProfiles.filter((row) => row.profile_scope === 'world_route_segment')
    .every((row) => row.availability_condition_set_ref !== null));
  const expansionProfiles = JSON.parse(await readFile(join(datasetsDir,
    'spatial_v3_g4_expansion_profiles.json'), 'utf8'));
  const nodes = JSON.parse(await readFile(join(datasetsDir,
    'spatial_v3_nodes.json'), 'utf8'));
  assert.equal(expansionProfiles.length, 32);
  const expectedGeneratedProfiles = new Set(JSON.parse(await readFile(join(datasetsDir,
    'spatial_v3_scene_materialization_profiles.json'), 'utf8'))
    .filter((profile) => profile.id.startsWith('m2c_smp_')).map((profile) => profile.id));
  const readGeneratedProfiles = new Set();
  const spatialReader = createSpatialV3WorldBaseReader({ query: (query, params) =>
    pool.query(query, params) });
  for (const profile of expansionProfiles) {
    const g4 = nodes.find((node) => node.id === profile.g4_id
      && node.version === profile.g4_version);
    assert.ok(g4, `approved expansion profile ${profile.id} pins an imported G4`);
    const binding = await spatialReader.readG4ExpansionBinding({
      g4_id: g4.id, world_revision_id: g4.world_revision_id
    });
    assert.equal(binding.ok, true,
      `${profile.id} exact binding: ${JSON.stringify(binding.error)}`);
    assert.deepEqual(binding.value.g4, { id: g4.id, version: g4.version,
      world_revision_id: g4.world_revision_id,
      canonical_digest: g4.canonical_digest });
    assert.deepEqual(binding.value.profile, { id: profile.id,
      version: profile.version, world_revision_id: profile.world_revision_id,
      canonical_digest: profile.canonical_digest });
    const expansionClosure = await spatialReader.readPinnedG4ExpansionClosure(
      binding.value);
    assert.equal(expansionClosure.ok, true,
      `${profile.id}: ${JSON.stringify(expansionClosure.error)}`);
    assert.ok(expansionClosure.value.terminal_policies.length > 0);
    assert.equal(expansionClosure.value.scene_rules.length, 2);
    assert.deepEqual(expansionClosure.value.connection_profiles.map((connection) =>
      [connection.id, connection.version, connection.availability_condition_set_ref]),
    [['cprofv3__site_connection__local_passage', 2, null]]);
    const terminalExit = expansionClosure.value.directional_exits.find((exit) => exit.exit_canonical_g5_id);
    assert.ok(terminalExit);
    const terminalScene = await spatialReader.readPinnedCanonicalG5SceneBinding({
      id: terminalExit.exit_canonical_g5_id, version: terminalExit.exit_canonical_g5_version,
      world_revision_id: g4.world_revision_id });
    assert.equal(terminalScene.ok, true, JSON.stringify(terminalScene.error));
    assert.equal(terminalScene.value.scene_rules.length, 2);
    for (const sceneProfile of expansionClosure.value.scene_materialization_profiles) {
      if (sceneProfile.id.startsWith('m2c_smp_')) readGeneratedProfiles.add(sceneProfile.id);
    }
    assert.ok(expansionClosure.value.directional_exits.every((exit) =>
      typeof exit.direction_context_id === 'string'
        && (exit.exit_kind === 'physical_boundary'
          || (typeof exit.exit_canonical_g5_id === 'string'
            && Number.isInteger(exit.exit_canonical_g5_version)))));
  }
  assert.deepEqual([...readGeneratedProfiles].sort(), [...expectedGeneratedProfiles].sort(),
    'all generated scene profiles are present in the reader closures');

  const counts = (await pool.query(`SELECT
    (SELECT count(*)::int FROM world_base.spatial_v3_g4_expansion_profiles) AS profiles,
    (SELECT count(*)::int FROM world_base.spatial_v3_expansion_slots) AS slots,
    (SELECT count(*)::int FROM world_base.spatial_v3_expansion_rule_sets) AS rules,
    (SELECT count(*)::int FROM world_base.spatial_v3_g5_generation_templates) AS templates,
    (SELECT count(*)::int FROM world_base.spatial_v3_external_dependency_versions) AS external_pins`)).rows[0];
  assert.deepEqual(counts, { profiles: 32, slots: 86, rules: 3, templates: 25, external_pins: 99 });
  const edgePins = (await pool.query(`SELECT count(*)::int AS n
    FROM world_base.spatial_v3_authoring_dependency_edges
    WHERE target_entity_kind='external_dependency' AND target_registry_type IS NOT NULL
      AND target_registry_digest IS NOT NULL AND target_dependency_digest IS NOT NULL`)).rows[0].n;
  assert.equal(edgePins, 1169);
  const applicableGeneratedCandidates = (await pool.query(`SELECT count(*)::int AS n
    FROM world_base.spatial_v3_scene_materialization_candidates
    WHERE profile_id LIKE 'm2c_smp_%' AND applicability_rule_id='scene_applicability_exact_source_ref_v1'
      AND applicability_rule_version=1`)).rows[0].n;
  assert.equal(applicableGeneratedCandidates, 25);

  for (const table of [
    'spatial_v3_g4_expansion_profiles', 'spatial_v3_g5_generation_templates',
    'spatial_v3_expansion_profile_template_limits', 'spatial_v3_expansion_slots',
    'spatial_v3_expansion_slot_templates', 'spatial_v3_terminal_policies',
    'spatial_v3_continuation_length_rules', 'spatial_v3_continuation_length_candidates',
    'spatial_v3_g5_successor_frontier_rules', 'spatial_v3_expansion_rule_sets',
    'spatial_v3_scene_materialization_profiles', 'spatial_v3_scene_materialization_candidates',
    'spatial_v3_authoring_versions', 'spatial_v3_external_dependency_versions'
  ]) await assertExactReadback(pool, datasetsDir, table);
  for (const table of ['spatial_v3_canonical_g5_connection_profiles',
    'spatial_v3_canonical_g5_connection_bindings', 'spatial_v3_authoring_dependency_edges']) {
    await assertExactReadback(pool, datasetsDir, table);
  }
  for (const table of immutableTables) await assertExactReadback(pool, datasetsDir, table);
  await assertLocalMovementEligibilityPostgres(pool);
});
