import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import pg from 'pg';
import { createSpatialV3WorldBaseReader } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-world-base-reader.js';
import { buildTransactionalImportSql } from '../../tools/spatial-v3/p12-authoring-importer.mjs';

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8',
  timeout: 45_000 });
const digest = (value) => createHash('sha256').update(value).digest('hex');

test('P12 imports an approved G6 acoustic baseline and the reader returns its exact generated-scene pin', async (t) => {
  if (docker(['version']).status !== 0) return t.skip('Docker required');
  const name = `m2c-acoustic-${process.pid}`;
  const temp = await mkdtemp(join(tmpdir(), 'm2c-acoustic-'));
  let pool;
  t.after(async () => {
    await pool?.end();
    await rm(temp, { recursive: true, force: true });
    docker(['rm', '-fv', name]);
  });
  assert.equal(docker(['run', '-d', '-p', '127.0.0.1::5432', '--name', name,
    '-e', 'POSTGRES_PASSWORD=m2c', '-e', 'POSTGRES_USER=m2c',
    '-e', 'POSTGRES_DB=m2c', 'postgres:16-alpine']).status, 0);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (docker(['exec', name, 'pg_isready', '-U', 'm2c']).status === 0) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (docker(['exec', name, 'pg_isready', '-U', 'm2c']).status === 0) {
        ready = true;
        break;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  assert.equal(ready, true);
  const port = Number(docker(['port', name, '5432']).stdout.match(/:(\d+)/)[1]);
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'm2c', password: 'm2c',
    database: 'm2c' });
  const entrypoint = await readFile('infra/world-base/schema.sql', 'utf8');
  const ddlParts = [...entrypoint.matchAll(/^\\ir\s+schema\/([^\s]+\.sql)\s*$/gmu)]
    .map((match) => match[1]);
  const ddl = (await Promise.all(ddlParts.map((part) =>
    readFile(`infra/world-base/schema/${part}`, 'utf8')))).join('\n');
  const applied = spawnSync('docker', ['exec', '-i', name, 'psql', '-q',
    '-v', 'ON_ERROR_STOP=1', '-U', 'm2c', '-d', 'm2c'], { input: ddl,
    encoding: 'utf8', timeout: 120_000 });
  assert.equal(applied.status, 0, applied.stderr);

  const revision = 'm2c-acoustic-revision';
  const source = 'm2c-acoustic-source';
  const g5Id = 'm2c-generated-family';
  const profileId = 'm2c-generated-scene-profile';
  const sceneId = 'm2c-generated-scene';
  const regionalBasisId = 'm2c-regional-basis';
  const selectionRuleId = 'm2c-selection-rule';
  const applicabilityRuleId = 'm2c-applicability-rule';
  const baselineId = 'm2c-acoustic-outside';
  const hashes = Object.fromEntries([g5Id, profileId, sceneId,
    regionalBasisId, selectionRuleId, applicabilityRuleId, baselineId]
    .map((id) => [id, digest(id)]));
  hashes[sceneId] = hashes[regionalBasisId];
  await pool.query(`INSERT INTO world_base.source_records(id,status)
    VALUES ($1,'approved')`, [source]);
  await pool.query(`INSERT INTO world_base.spatial_v3_world_revisions
    (id,catalog_digest,status,provenance_ref) VALUES ($1,$2,'approved',$3)`,
  [revision, digest(revision), source]);
  const versions = [
    ['g5_generation_template', g5Id],
    ['scene_materialization_profile', profileId],
    ['scene_template', sceneId],
    ['regional_scene_template_basis', regionalBasisId],
    ['scene_selection_rule', selectionRuleId],
    ['scene_applicability_rule', applicabilityRuleId]
  ];
  for (const [kind, id] of versions) {
    await pool.query(`INSERT INTO world_base.spatial_v3_authoring_versions
      (entity_kind,entity_id,version,world_revision_id,canonical_digest,status,provenance_ref)
      VALUES ($1,$2,1,$3,$4,'approved',$5)`,
    [kind, id, revision, hashes[id], source]);
  }
  await pool.query(`INSERT INTO world_base.spatial_v3_regional_scene_template_bases
    (id,version,world_revision_id,source_profile_family_id,geometry_claim,status,provenance_ref,canonical_digest)
    VALUES ($1,1,$2,'family','topological_only','approved',$3,$4)`,
  [regionalBasisId, revision, source, hashes[regionalBasisId]]);
  await pool.query(`INSERT INTO world_base.spatial_v3_scene_selection_rules
    (id,version,world_revision_id,rule_kind,status,provenance_ref,canonical_digest)
    VALUES ($1,1,$2,'single_candidate','approved',$3,$4)`,
  [selectionRuleId, revision, source, hashes[selectionRuleId]]);
  await pool.query(`INSERT INTO world_base.spatial_v3_scene_applicability_rules
    (id,version,world_revision_id,rule_kind,status,provenance_ref,canonical_digest)
    VALUES ($1,1,$2,'exact_source_ref','approved',$3,$4)`,
  [applicabilityRuleId, revision, source, hashes[applicabilityRuleId]]);
  const sceneClient = await pool.connect();
  try {
  await sceneClient.query('BEGIN');
  await sceneClient.query(`INSERT INTO world_base.spatial_v3_scene_templates
    (id,version,world_revision_id,regional_template_id,regional_template_version,status,provenance_ref,canonical_digest)
    VALUES ($1,1,$2,$3,1,'approved',$4,$5)`,
  [sceneId, revision, regionalBasisId, source, hashes[sceneId]]);
  await sceneClient.query(`INSERT INTO world_base.spatial_v3_scene_materialization_profiles
    (id,version,world_revision_id,source_kind,source_entity_id,source_entity_version,selection_rule_id,selection_rule_version,status,provenance_ref,canonical_digest)
    VALUES ($1,1,$2,'g5_generation_template',$3,1,$4,1,'approved',$5,$6)`,
  [profileId, revision, g5Id, selectionRuleId, source, hashes[profileId]]);
  await sceneClient.query(`INSERT INTO world_base.spatial_v3_g5_generation_templates
    (id,version,world_revision_id,g5_class_id,regional_template_id,regional_template_version,scene_materialization_profile_id,scene_materialization_profile_version,status,provenance_ref,canonical_digest)
    VALUES ($1,1,$2,'spatial.g5.parcel','regional',1,$3,1,'approved',$4,$5)`,
  [g5Id, revision, profileId, source, hashes[g5Id]]);
  await sceneClient.query(`INSERT INTO world_base.spatial_v3_scene_materialization_candidates
    (profile_id,profile_version,scene_template_id,scene_template_version,weight,applicability_rule_id,applicability_rule_version)
    VALUES ($1,1,$2,1,1,$3,1)`,
  [profileId, sceneId, applicabilityRuleId]);
  await sceneClient.query(`INSERT INTO world_base.spatial_v3_g6_template_slots
    (scene_template_id,scene_template_version,scene_slot_key,physical_class_id,primary_scene_role_id,vertical_context_id,overhead_cover_id,intra_g6_visibility_mode,default_visibility_distance_band,acoustic_uniformity)
    VALUES ($1,1,'outside','spatial.g6.open','spatial.g6.role.transit','surface','none','default_clear','medium','uniform')`,
  [sceneId]);
  await sceneClient.query(`INSERT INTO world_base.spatial_v3_scene_position_templates
    (scene_template_id,scene_template_version,position_slot_key,g6_scene_slot_key,instance_count,position_type_id,capacity,access_class_id)
    VALUES ($1,1,'standing','outside',1,'spatial.position.standing',1,'public')`,
  [sceneId]);
  await sceneClient.query(`INSERT INTO world_base.spatial_v3_scene_endpoint_slots
    (scene_template_id,scene_template_version,slot_key,endpoint_role,required_position_slot_key,required_position_instance_ordinal)
    VALUES ($1,1,'arrival','arrival','standing',0)`, [sceneId]);
  await sceneClient.query('COMMIT');
  } finally {
    sceneClient.release();
  }

  const baseline = { entity_kind: 'g6_acoustic_baseline', id: baselineId,
    version: 1, world_revision_id: revision, g5_template_id: g5Id,
    g5_template_version: 1, scene_template_id: sceneId,
    scene_template_version: 1, g6_scene_slot_key: 'outside', ambient_noise: 1,
    directness: 'analogical', confidence: 'low', status: 'approved',
    provenance_ref: source, canonical_digest: hashes[baselineId] };
  const authoringVersion = { entity_kind: 'g6_acoustic_baseline',
    entity_id: baselineId, version: 1, world_revision_id: revision,
    canonical_digest: hashes[baselineId], status: 'approved',
    provenance_ref: source };
  const datasetsDir = join(temp, 'datasets');
  await mkdir(datasetsDir);
  const datasetRows = {
    'source-records.json': [{ id: source, status: 'approved' }],
    'versions.json': [authoringVersion],
    'baselines.json': [baseline]
  };
  const datasets = [];
  for (const [file, rows] of Object.entries(datasetRows)) {
    const content = JSON.stringify(rows);
    await writeFile(join(datasetsDir, file), content);
    const table = file === 'source-records.json' ? 'source_records'
      : file === 'versions.json' ? 'spatial_v3_authoring_versions'
        : 'spatial_v3_g6_acoustic_baselines';
    datasets.push({ table, file: `datasets/${file}`,
      sha256: digest(content), status: 'approved', provenance_ref: source,
      delete_policy: 'forbid', depends_on: table === 'source_records' ? []
        : [table === 'spatial_v3_authoring_versions' ? 'source_records'
          : 'spatial_v3_authoring_versions'] });
  }
  const manifest = { schema_version:
    'rus.spatial-v3.world-base-authoring-bundle.v1',
  bundle_id: 'm2c-acoustic-reader-test', bundle_kind: 'dependency_closure',
  world_revision_id: revision, status: 'approved', provenance_ref: source,
  delete_policy: 'forbid', datasets, data_gaps: [{
    code: 'CANONICAL_G5_INVENTORY_DATA_GAP', subject_ref: 'test-fixture',
    dependency_pins: ['test-only-missing-g5-inventory'], blocking: true }] };
  const manifestPath = join(temp, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(manifest));
  const importSql = await buildTransactionalImportSql({ root: process.cwd(),
    manifestPath, rollback: false, allowTypedGaps: true });
  await pool.query(importSql);

  const reader = createSpatialV3WorldBaseReader({ query: (sql, params) =>
    pool.query(sql, params) });
  const result = await reader.readPinnedG5AcousticClosure({
    g5_template: { id: g5Id, version: 1, world_revision_id: revision,
      canonical_digest: hashes[g5Id] },
    scene_template: { id: sceneId, version: 1, world_revision_id: revision,
      canonical_digest: hashes[sceneId] }, world_revision_id: revision });
  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.deepEqual(result.value.rows.map(({ id, g6_scene_slot_key,
    ambient_noise, directness, confidence }) => ({ id, g6_scene_slot_key,
    ambient_noise, directness, confidence })), [{ id: baselineId,
    g6_scene_slot_key: 'outside', ambient_noise: 1, directness: 'analogical',
    confidence: 'low' }]);
});
