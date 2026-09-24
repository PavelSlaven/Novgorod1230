import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import pg from 'pg';

import { ensureLocalPostgres, LOCAL_POSTGRES } from
  '../../tools/local-play/local-postgres.js';

test('Gate1 imports canonical owner closure and Stage3C without activation',
  async (t) => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'novgorod-gate1-postgres-'));
    const settings = { ...LOCAL_POSTGRES,
      worldDatabase: `pr17_gate1_world_${process.pid}`,
      partyDatabase: `pr17_gate1_party_${process.pid}`,
      worldUser: 'postgres', partyUser: 'postgres' };
    let managed = await ensureLocalPostgres({ dataRoot, settings });
    let pool;
    const resultPath = process.env.GATE1_RESULT_PATH
      ?? join(dataRoot, 'gate1-import-readback-result.json');
    t.after(async () => {
      await pool?.end();
      await managed.close();
      await rm(dataRoot, { recursive: true, force: true });
    });
    const missing = spawnSync(process.execPath,
      ['scripts/run-pr17-item-container-stage3c.mjs', '--mode', 'local-play'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 30_000,
        env: { ...process.env, PR17_TEST_DATABASE_URL: managed.worldUrl }
      });
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /PR17_LOCAL_PLAY_EXPECTED_DATABASE_REQUIRED:/u);
    const rejected = spawnSync(process.execPath,
      ['scripts/run-pr17-item-container-stage3c.mjs', '--mode', 'local-play',
        '--expected-database', 'novgorod_world'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, PR17_TEST_DATABASE_URL: managed.worldUrl }
      });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /PR17_LOCAL_PLAY_DATABASE_REQUIRED:/u);
    const applied = spawnSync(process.execPath,
      ['scripts/run-pr17-item-container-stage3c.mjs', '--mode', 'lifecycle',
        '--write-result', resultPath], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, PR17_TEST_DATABASE_URL: managed.worldUrl }
      });
    assert.equal(applied.status, 0, applied.stderr);
    const result = JSON.parse(applied.stdout);
    const evidence = JSON.parse(await readFile(resultPath, 'utf8'));
    assert.equal(evidence.schema_version,
      'rus.pr17.item_container_stage3c_result.v2');
    assert.equal(evidence.status, 'imported_exact_readback_verified');
    assert.equal(evidence.target_catalog_digest, result.target_catalog_digest);
    assert.equal(evidence.approval_amendment_attestation_digest,
      result.approval_amendment_attestation_digest);
    assert.match(evidence.approval_amendment_attestation_digest,
      /^[a-f0-9]{64}$/u);
    assert.equal(evidence.activation_performed, false);
    assert.equal(evidence.runtime_item_creation_authorized, false);
    assert.equal(result.pass, true);
    assert.equal(result.rollback, 'pass');
    assert.equal(result.activation_performed, false);
    assert.equal(result.first_state.gate1_owner_readback.activation_event_count,
      0);
    assert.equal(result.first_state.gate1_owner_readback
      .runtime_item_creation_authorized, false);
    assert.equal(result.first_state.gate1_owner_readback
      .approved_parent_source_count, 2);
    assert.match(result.first_state.gate1_owner_readback
      .approved_parent_source_digest, /^[a-f0-9]{64}$/u);
    assert.deepEqual(result.first_state.gate1_owner_readback.table_counts, {
      place_templates: 64,
      region_place_templates: 39,
      region_social_roles: 71,
      graph_nodes: 11359,
      graph_edges: 30248
    });
    assert.deepEqual(result.first_state.gate1_owner_readback,
      result.repeated_state.gate1_owner_readback);

    const worldSchemaPool = new pg.Pool({ connectionString: managed.worldUrl,
      max: 1 });
    try {
      await worldSchemaPool.query(await readFile(new URL(
        '../../tools/runtime-catalog-activation/migrations/world/'
          + '001_runtime_catalog_activation.sql', import.meta.url), 'utf8'));
    } finally {
      await worldSchemaPool.end();
    }
    const partyPool = new pg.Pool({ connectionString: managed.partyUrl,
      max: 1 });
    try {
      await partyPool.query(await readFile(new URL(
        '../../schemas/party-db/001_party_runtime.sql', import.meta.url),
      'utf8'));
      await partyPool.query(await readFile(new URL(
        '../../tools/runtime-catalog-activation/migrations/party/'
          + '001_runtime_catalog_pins.sql', import.meta.url), 'utf8'));
    } finally {
      await partyPool.end();
    }
    await managed.close();
    managed = await ensureLocalPostgres({ dataRoot, settings });
    pool = new pg.Pool({ connectionString: managed.worldUrl, max: 2 });
    const restartedTarget = (await pool.query(`SELECT id,catalog_digest,status
      FROM world_base.world_revisions WHERE id=$1`,
    [result.target_revision_id])).rows[0];
    assert.deepEqual(restartedTarget, {
      id: result.target_revision_id,
      catalog_digest: result.target_catalog_digest,
      status: 'approved'
    });
    const activationCount = Number((await pool.query(`SELECT count(*) AS count
      FROM world_base.runtime_catalog_activation_events`)).rows[0].count);
    assert.equal(activationCount, 0);
    const worlds = (await pool.query(`SELECT id,catalog_digest,status
      FROM world_base.world_revisions
      WHERE id=ANY($1::text[]) ORDER BY id`, [[
      'novgorod_spatial_v3_production_v5_candidate_001',
      'novgorod_spatial_v3_production_v6_candidate_001'
    ]])).rows;
    assert.deepEqual(worlds, [{
      id: 'novgorod_spatial_v3_production_v5_candidate_001',
      catalog_digest:
        'e616cdd4b7a09db06b7adb7b3faf2a82e0840d6aa286ad65ebbd97e0b86260ad',
      status: 'approved'
    }, {
      id: 'novgorod_spatial_v3_production_v6_candidate_001',
      catalog_digest:
        '6e6cd611042ff86229c73409816893ea4e983c01722dd4699bac346acfb846ad',
      status: 'approved'
    }]);
    const sources = (await pool.query(`SELECT id,source_type,status,confidence
      FROM world_base.source_records
      WHERE id=ANY($1::text[]) ORDER BY id`, [[
      'src_novgorod_agriculture', 'src_novgorod_promysly'
    ]])).rows;
    assert.deepEqual(sources, [{
      id: 'src_novgorod_agriculture', source_type: 'web',
      status: 'approved', confidence: 'medium'
    }, {
      id: 'src_novgorod_promysly', source_type: 'web',
      status: 'approved', confidence: 'medium'
    }]);
  });

test('Gate1 local-play preserves the fresh v17 schema and its import on repeat',
  async (t) => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'novgorod-gate1-v17-'));
    const settings = { ...LOCAL_POSTGRES,
      worldDatabase: 'novgorod_world_v17',
      partyDatabase: `pr17_gate1_party_${process.pid}`,
      worldUser: 'postgres', partyUser: 'postgres' };
    const managed = await ensureLocalPostgres({ dataRoot, settings });
    const pool = new pg.Pool({ connectionString: managed.worldUrl, max: 1 });
    t.after(async () => {
      await pool.end();
      await managed.close();
      await rm(dataRoot, { recursive: true, force: true });
    });
    for (let part = 1; part <= 26; part += 1) {
      await pool.query(await readFile(new URL(`../../infra/world-base/schema/${String(part).padStart(2, '0')}.sql`, import.meta.url), 'utf8'));
    }
    const run = () => spawnSync(process.execPath,
      ['scripts/run-pr17-item-container-stage3c.mjs', '--mode', 'local-play',
        '--expected-database', 'novgorod_world_v17'], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, PR17_TEST_DATABASE_URL: managed.worldUrl }
      });
    const applied = run();
    assert.equal(applied.status, 0, applied.stderr);
    const result = JSON.parse(applied.stdout);
    assert.equal(result.rollback, 'pass');
    assert.equal(result.repeat_clean_apply, false);
    assert.equal(result.first_state.approved_item_template_count, 102);
    assert.equal(result.first_state.approved_container_template_count, 18);
    assert.equal(result.first_state.approved_g4_count, 9);
    assert.deepEqual(result.repeated_state, result.first_state);
    assert.equal(Number((await pool.query(`SELECT count(*) AS count
      FROM pg_catalog.pg_tables WHERE schemaname = 'world_base'`)).rows[0].count), 208);
    const repeated = run();
    assert.notEqual(repeated.status, 0);
    assert.match(repeated.stderr, /PR17_LOCAL_PLAY_DATABASE_NOT_EMPTY:/u);
    assert.equal(Number((await pool.query(`SELECT count(*) AS count
      FROM world_base.item_templates WHERE world_revision_id = $1`,
    [result.target_revision_id])).rows[0].count), 102);
  });
