import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
} from './presence-rules-production-e2e-fixture.js';

// pine_ridge is target-starts-manifest binding_revision 1: the start the old `revision >= 5` gate skipped.
const PINE_RIDGE_SCENARIO = 'novgorod_pine_ridge_approach_v1';
const PINE_RIDGE_G5 = 'cg5v3__gn_nov_g4_xp017_yp026_r2_dry_pine_ridge_south_approach';

test('bare v17 bootstrap: the public start itself resolves empty presence for its own G5 and stores no gap',
  { timeout: 1_800_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t, { withTestWaveEnrichment: false });
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
      insideStart = true;
      let opening;
      try {
        opening = await runtime.startNewGame({
          scenario_id: PINE_RIDGE_SCENARIO,
          request_id: `bare-bootstrap-start-${PINE_RIDGE_SCENARIO}`,
        });
      } finally { insideStart = false; }
      assert.equal(opening.screen.schema, 'first_game_screen');
      const partyId = opening.party_id;
      const startNodeReads = bindingReads.filter(({ params }) => params.includes(PINE_RIDGE_G5));
      assert.equal(startNodeReads.length, 1,
        'public start must read place-family bindings of its own G5 exactly once');
      assert.equal(startNodeReads[0].rowCount, 0,
        'bare bootstrap has no bindings for the start G5: empty presence with a typed gap');
      const aggregates = await env.partyPool.query(
        `SELECT scope_id FROM party_runtime.party_ordinary_materialization_aggregates WHERE party_id=$1`,
        [partyId]);
      assert.deepEqual(aggregates.rows, [], 'empty presence stores no aggregate');
      const enablements = await env.partyPool.query(
        `SELECT scope_id FROM party_runtime.party_ordinary_materialization_enablements WHERE party_id=$1`,
        [partyId]);
      assert.deepEqual(enablements.rows, [], 'the presence gap is not written into ordinary enablements');
    } finally {
      await runtime.close();
    }
  });
