import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import pg from 'pg';

import { ensureLocalPostgres, LOCAL_POSTGRES } from
  '../../tools/local-play/local-postgres.js';
import { loadGate1SeedClosureArtifacts } from
  '../../scripts/generate-gate1-seed-closure-request.mjs';
import { digestValue } from
  '../../tools/world-catalog-workflow/src/digest.js';

test('Gate1 imports canonical owner closure and Stage3C without activation',
  async (t) => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'novgorod-gate1-postgres-'));
    const managed = await ensureLocalPostgres({ dataRoot,
      settings: { ...LOCAL_POSTGRES,
        worldDatabase: `pr17_gate1_world_${process.pid}`,
        partyDatabase: `pr17_gate1_party_${process.pid}`,
        worldUser: 'postgres', partyUser: 'postgres' } });
    let pool;
    const resultPath = process.env.GATE1_RESULT_PATH
      ?? join(dataRoot, 'gate1-import-readback-result.json');
    const seedAttestationPath = join(dataRoot,
      'data/world-catalogs/novgorod/runtime-catalog/gate1-owner-data-v1/'
      + 'seed-closure-v1/authoring-approval-attestation.json');
    t.after(async () => {
      await pool?.end();
      await managed.close();
      await rm(dataRoot, { recursive: true, force: true });
    });
    const seedClosure = await loadGate1SeedClosureArtifacts();
    const seedAttestationCore = {
      schema:
        'rus.gate1_rus13_seed_closure_authoring_approval_attestation.v1',
      status:
        'approved_seed_derivation_and_transactional_full_closure_readback',
      candidate_digest: seedClosure.candidate.candidate_digest,
      request_digest: seedClosure.request.request_digest,
      approved_scope: seedClosure.request.requested_scope,
      authority: {
        approval_attestation_present: true,
        seed_derivation_authorized: true,
        import_authorized: true,
        transactional_import_readback_only: true,
        exact_all_table_readback_required: true,
        activation_authorized: false,
        production_authorized: false,
        existing_party_migration_authorized: false,
        runtime_item_creation_authorized: false
      }
    };
    await mkdir(dirname(seedAttestationPath), { recursive: true });
    await writeFile(seedAttestationPath, JSON.stringify({
      ...seedAttestationCore,
      attestation_digest: digestValue(seedAttestationCore)
    }));
    const applied = spawnSync(process.execPath,
      ['scripts/run-pr17-item-container-stage3c.mjs', '--mode', 'lifecycle',
        '--write-result', resultPath], {
        cwd: process.cwd(), encoding: 'utf8', timeout: 300_000,
        env: { ...process.env, PR17_TEST_DATABASE_URL: managed.worldUrl,
          PR17_TEST_DATA_ROOT: dataRoot }
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

    pool = new pg.Pool({ connectionString: managed.worldUrl, max: 2 });
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
