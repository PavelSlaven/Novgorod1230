import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
  publicStartScenario,
} from './presence-rules-production-e2e-fixture.js';
test('bare v17 bootstrap: public start passes with empty presence gap diagnostic',
  { timeout: 1_800_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t, { withTestWaveEnrichment: false });
    const restoreFetch = installPresenceProductionE2eFetch();
    const { runtime } = await createPresenceProductionRoot(env);
    t.after(() => restoreFetch());
    try {
      const partyId = await publicStartScenario(runtime, 'novgorod_pine_ridge_approach_v1');
      const row = (await env.partyPool.query(
        `SELECT objective_snapshot
           FROM party_runtime.party_ordinary_materialization_enablements
          WHERE party_id=$1`,
        [partyId],
      )).rows[0];
      assert.equal(
        row?.objective_snapshot?.execution_context?.presence_first_arrival_gap,
        'no_place_family_binding',
      );
      const aggregate = (await env.partyPool.query(
        `SELECT aggregate_payload FROM party_runtime.party_ordinary_materialization_aggregates
          WHERE party_id=$1`,
        [partyId],
      )).rows[0];
      assert.equal(aggregate, undefined);
    } finally {
      await runtime.close();
    }
  });
