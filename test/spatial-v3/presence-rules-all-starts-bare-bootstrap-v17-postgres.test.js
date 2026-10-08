import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
} from './presence-rules-production-e2e-fixture.js';

const { starts } = JSON.parse(readFileSync(new URL(
  '../../data/world-catalogs/novgorod/live-world-runtime-v17/target-starts-manifest.v1.json',
  import.meta.url), 'utf8'));

// Every start of the v17 manifest (binding_revision 1..7) is a first arrival: the public start itself
// resolves presence for its own canonical G5, whatever its binding_revision.
test('v17 bootstrap without bindings for the start G5: every one of the 7 public starts resolves empty presence for its own G5',
  { timeout: 1_800_000 }, async (t) => {
    assert.equal(starts.length, 7);
    const env = await bootstrapV17PresenceE2e(t);
    // Precondition of this test (D27 imports the wave in the bootstrap): none of the 7 start G5 has
    // place-family bindings. Reproduced explicitly in this disposable test world.
    await env.worldPool.query(
      'DELETE FROM world_base.spatial_node_place_family_bindings WHERE node_id = ANY($1::text[])',
      [starts.map((start) => start.canonical_g5_ref.id)]);
    const bindingReads = [];
    let insideStart = false;
    const spiedWorldPool = {
      async query(sql, params) {
        const result = await env.worldPool.query(sql, params);
        if (insideStart && /spatial_node_place_family_bindings/u.test(sql)) {
          bindingReads.push({ params, rowCount: result.rowCount });
        }
        return result;
      },
      connect: () => env.worldPool.connect(),
    };
    const restoreFetch = installPresenceProductionE2eFetch();
    const { runtime } = await createPresenceProductionRoot({ ...env, worldPool: spiedWorldPool });
    t.after(() => restoreFetch());
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
            request_id: `all-starts-bare-bootstrap-${start.scenario_id}`,
          });
        } finally { insideStart = false; }
        assert.equal(opening.screen.schema, 'first_game_screen', label);
        const reads = bindingReads.filter(({ params }) => params.includes(g5Id));
        assert.equal(reads.length, 1, `${label}: start must read place-family bindings of its own G5 once`);
        assert.equal(reads[0].rowCount, 0, `${label}: no bindings for the start G5: empty presence`);
        for (const table of ['party_ordinary_materialization_aggregates',
          'party_ordinary_materialization_enablements']) {
          const rows = await env.partyPool.query(
            `SELECT scope_id FROM party_runtime.${table} WHERE party_id=$1`, [opening.party_id]);
          assert.deepEqual(rows.rows, [], `${label}: empty presence stores nothing in ${table}`);
        }
      }
    } finally {
      await runtime.close();
    }
  });
