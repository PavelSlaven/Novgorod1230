import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
} from './presence-rules-production-e2e-fixture.js';
import { buildWaveImportSql } from '../../scripts/v17-m2c-npc-wave-stage.mjs';

const WAVE_DIR = 'data/world-catalogs/novgorod/m2c-npc-wave/v1';
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

// D27: the standard bootstrap imports the m2c NPC wave; the public start of every v17 start then
// resolves presence with the real rules of the start's place family.
test('v17 bootstrap imports the m2c NPC wave and every start resolves presence with its rules',
  { timeout: 1_800_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const request = await readJson(`${WAVE_DIR}/v17-import-request.json`);
    const { starts } = await readJson(
      'data/world-catalogs/novgorod/live-world-runtime-v17/target-starts-manifest.v1.json');
    assert.equal(starts.length, 7, 'the manifest lists the 7 v17 starts');

    await t.test('imported rows match the pinned request; environment rules and legacy regions are absent', async () => {
      const untouchedBeforeWave = new Set(['source_records', 'spatial_v3_world_revisions', 'spatial_v3_nodes']);
      for (const dataset of request.approved_data.datasets) {
        if (untouchedBeforeWave.has(dataset.table)) continue;
        const { rows } = await env.worldPool.query(`SELECT count(*)::int AS count FROM world_base.${dataset.table}`);
        assert.equal(rows[0].count, request.expected_readback.by_table[dataset.table], dataset.table);
        assert.equal(dataset.rows, request.expected_readback.by_table[dataset.table], dataset.table);
      }
      const kinds = (await env.worldPool.query(
        'SELECT subject_kind, count(*)::int AS count FROM world_base.presence_rules GROUP BY 1 ORDER BY 1')).rows;
      assert.deepEqual(kinds.map(({ subject_kind: kind }) => kind), ['category', 'occupation', 'social_role']);
      const regions = (await env.worldPool.query(
        `SELECT count(*) FILTER (WHERE region_id = 'novgorod_land')::int AS legacy,
                count(*) FILTER (WHERE region_id = 'region_novgorod_land')::int AS g0
           FROM world_base.presence_rules`)).rows[0];
      assert.equal(regions.legacy, 0, 'legacy region id must not be imported (LW-077)');
      assert.ok(regions.g0 > 0);
      assert.equal(JSON.parse(await readFile(`${WAVE_DIR}/manifest.json`, 'utf8')).status, 'draft',
        'the repository manifest stays draft; only the bootstrap stage opens the gate in a copy');
    });

    await t.test('the public start of each of the 7 starts commits presence rolled by its place-family rules', async () => {
      const bindingReads = [];
      let insideStart = false;
      const spiedWorldPool = {
        async query(sql, params) {
          const result = await env.worldPool.query(sql, params);
          if (insideStart && /spatial_node_place_family_bindings/u.test(sql)) {
            bindingReads.push({ params, rows: result.rows });
          }
          return result;
        },
        connect: () => env.worldPool.connect(),
      };
      const restoreFetch = installPresenceProductionE2eFetch();
      const { runtime } = await createPresenceProductionRoot({ ...env, worldPool: spiedWorldPool });
      try {
        for (const start of starts) {
          const label = `${start.scenario_id} (binding_revision ${start.binding_revision})`;
          const g5Id = start.canonical_g5_ref.id;
          bindingReads.length = 0;
          insideStart = true;
          let opening;
          try {
            opening = await runtime.startNewGame({
              scenario_id: start.scenario_id,
              request_id: `wave-v17-bootstrap-${start.scenario_id}`,
            });
          } finally { insideStart = false; }
          const reads = bindingReads.filter(({ params }) => params.includes(g5Id));
          assert.equal(reads.length, 1, `${label}: start reads bindings of its own G5 once`);
          const placeFamilies = reads[0].rows.map((row) => row.place_family_id);
          assert.ok(placeFamilies.length > 0, `${label}: the wave binds the start G5 to a place family`);
          const aggregates = (await env.partyPool.query(
            `SELECT aggregate_payload FROM party_runtime.party_ordinary_materialization_aggregates WHERE party_id=$1`,
            [opening.party_id])).rows;
          assert.equal(aggregates.length, 1, `${label}: one presence aggregate for the start scope`);
          const records = aggregates[0].aggregate_payload.presence_resolutions
            .filter((record) => typeof record.rule_ref === 'string');
          assert.ok(records.length > 0, `${label}: presence rules were rolled and stored (empty counts included)`);
          const ruleIds = [...new Set(records.map((record) => record.rule_ref.split('@')[0]))];
          const scopes = (await env.worldPool.query(
            'SELECT DISTINCT scope_ref FROM world_base.presence_rules WHERE rule_id = ANY($1::text[])', [ruleIds]))
            .rows.map((row) => row.scope_ref);
          assert.ok(scopes.length > 0 && scopes.every((scope) => placeFamilies.includes(scope)),
            `${label}: every rolled rule belongs to the start's place family (${placeFamilies.join(',')}), got ${scopes.join(',')}`);
          const enablements = await env.partyPool.query(
            'SELECT scope_id FROM party_runtime.party_ordinary_materialization_enablements WHERE party_id=$1',
            [opening.party_id]);
          assert.deepEqual(enablements.rows, [], `${label}: presence stores nothing in enablements`);
        }
      } finally {
        restoreFetch();
        await runtime.close();
      }
    });

    await t.test('re-importing compares committed rows: identical rows pass, a changed row is rejected', async () => {
      const sql = await buildWaveImportSql({ root: process.cwd() });
      await env.worldPool.query(sql.rollback);
      const { rule_id: ruleId, rule_version: ruleVersion, count_limit: countLimit } = (await env.worldPool.query(
        'SELECT rule_id, rule_version, count_limit FROM world_base.presence_rules ORDER BY rule_id LIMIT 1')).rows[0];
      const setLimit = (value) => env.worldPool.query(
        'UPDATE world_base.presence_rules SET count_limit=$3 WHERE rule_id=$1 AND rule_version=$2',
        [ruleId, ruleVersion, value]);
      await setLimit(countLimit + 1);
      try {
        await assert.rejects(env.worldPool.query(sql.rollback));
      } finally { await setLimit(countLimit); }
    });
  });
