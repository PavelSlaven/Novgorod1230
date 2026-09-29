import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeCatalogWorldBaseReader } from '@rus/runtime-catalog';
import { SPATIAL_V3_TARGET_PRODUCTION_RELEASE } from
  '../../apps/game-server/src/composition/production-spatial-v3-release-v17.js';
import { createTargetPresenceRulesFirstArrivalResolver } from
  '../../apps/game-server/src/infrastructure/postgres/ordinary-materialization-presence-first-arrival.js';
import {
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
  publicStartScenario,
} from './presence-rules-production-e2e-fixture.js';

test('bare v17 bootstrap: public start and empty presence on production world without wave',
  { timeout: 1_800_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t, { withTestWaveEnrichment: false });
    const release = SPATIAL_V3_TARGET_PRODUCTION_RELEASE;
    const itemRequest = env.approvals.itemApproval.request;
    const runtimeCatalogPin = {
      schema: 'rus.runtime_catalog_pin.v2',
      catalog_scope: itemRequest.catalog_scope,
      catalog_revision_id: itemRequest.target_revision_id,
      catalog_digest: itemRequest.target_catalog_digest,
      compatible_world_revision_id: release.world_revision_id,
      compatible_world_catalog_digest: release.world_catalog_digest,
      compatible_world_pin_manifest_digest: itemRequest.compatible_world_pin_manifest_digest,
    };
    const worldBaseReader = createRuntimeCatalogWorldBaseReader(
      (sql, params) => env.worldPool.query(sql, params),
    );
    const resolver = createTargetPresenceRulesFirstArrivalResolver({
      worldBaseReader,
      spatialWorldPin: {
        world_revision_id: release.world_revision_id,
        catalog_digest: release.world_catalog_digest,
      },
      worldPin: {
        world_revision_id: release.world_revision_id,
        world_catalog_digest: release.world_catalog_digest,
      },
      runtimeCatalogPin,
      readPartyPresenceCalendar: async () => ({ season: 'summer', periodNumber: 4920 }),
    });
    const restoreFetch = installPresenceProductionE2eFetch();
    const { runtime } = await createPresenceProductionRoot(env);
    t.after(() => restoreFetch());
    try {
      const partyId = await publicStartScenario(runtime, 'novgorod_pine_ridge_approach_v1');
      const aggregates = (await env.partyPool.query(
        `SELECT aggregate_payload FROM party_runtime.party_ordinary_materialization_aggregates
          WHERE party_id=$1`,
        [partyId],
      )).rows;
      for (const row of aggregates) {
        const presenceRules = (row.aggregate_payload?.presence_resolutions ?? [])
          .filter((record) => Object.hasOwn(record, 'subject_kind'));
        assert.equal(presenceRules.length, 0, 'bare bootstrap must not commit presence rules');
      }
      const g6 = (await env.partyPool.query(
        `SELECT g6.id AS g6_id, g5.id AS site_id, g5.origin, g5.canonical_g5_ref, g5.parent_g4_id
           FROM party_runtime.party_g6_instances g6
           JOIN party_runtime.party_g5_sites g5
             ON g5.party_id=g6.party_id AND g5.id=g6.host_id
          WHERE g6.party_id=$1 AND g6.status='active' LIMIT 1`,
        [partyId],
      )).rows[0];
      assert.ok(g6?.g6_id, 'party must have active G6 after start');
      const context = await resolver({
        transaction: env.partyPool,
        partyId,
        site: {
          id: g6.site_id,
          origin: g6.origin,
          canonical_g5_ref: g6.canonical_g5_ref,
          parent_g4_id: g6.parent_g4_id,
        },
        scope: { entity_kind: 'g6', entity_id: g6.g6_id },
      });
      assert.equal(context.presence_gap, 'no_place_family_binding');
      assert.deepEqual(context.rules, []);
    } finally {
      await runtime.close();
    }
  });
