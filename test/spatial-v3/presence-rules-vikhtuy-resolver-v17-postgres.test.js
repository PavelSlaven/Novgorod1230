import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeCatalogWorldBaseReader } from '@rus/runtime-catalog';
import { SPATIAL_V3_TARGET_PRODUCTION_RELEASE } from
  '../../apps/game-server/src/composition/production-spatial-v3-release-v17.js';
import { resolvePresenceRulesFirstArrivalForSite } from
  '../../apps/game-server/src/infrastructure/postgres/ordinary-materialization-presence-first-arrival.js';
import {
  PF_RURAL_YARD,
  VIKHTUY_MEETING_G5,
  bootstrapV17PresenceE2e,
} from './presence-rules-production-e2e-fixture.js';

test('v17 world DB: vikhtuy meeting_area canonical G5 resolves pf_rural_yard presence rules',
  { timeout: 1_800_000 }, async (t) => {
    const env = await bootstrapV17PresenceE2e(t);
    const release = SPATIAL_V3_TARGET_PRODUCTION_RELEASE;
    const itemRequest = env.approvals.itemApproval.request;
    const spatialWorldPin = {
      world_revision_id: release.world_revision_id,
      catalog_digest: release.world_catalog_digest,
    };
    const worldPin = {
      world_revision_id: release.world_revision_id,
      world_catalog_digest: release.world_catalog_digest,
    };
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
    const nodeRow = (await env.worldPool.query(
      `SELECT version FROM world_base.spatial_v3_nodes
        WHERE id=$1 AND world_revision_id=$2 AND status='approved'
        ORDER BY version DESC LIMIT 1`,
      [VIKHTUY_MEETING_G5, release.world_revision_id],
    )).rows[0];
    assert.ok(nodeRow?.version, 'approved vikhtuy meeting_area G5 node must exist in v17 world');
    const binding = (await env.worldPool.query(
      `SELECT place_family_id FROM world_base.spatial_node_place_family_bindings
        WHERE world_revision_id=$1 AND node_id=$2 AND node_version=$3
          AND binding_role='primary' AND status='approved'`,
      [release.world_revision_id, VIKHTUY_MEETING_G5, nodeRow.version],
    )).rows[0];
    assert.equal(binding?.place_family_id, PF_RURAL_YARD);

    const context = await resolvePresenceRulesFirstArrivalForSite({
      worldBaseReader,
      spatialWorldPin,
      worldPin,
      runtimeCatalogPin,
      spatialNodeId: VIKHTUY_MEETING_G5,
      spatialNodeVersion: Number(nodeRow.version),
      partyId: 'party-vikhtuy-resolver-v17',
      siteId: 'g5:vikhtuy-resolver-fixture',
      regionId: 'region_novgorod_land',
      season: 'summer',
      periodNumber: 4920,
    });
    assert.ok(context?.rules?.length, 'pf_rural_yard should yield merged category presence rules');
    assert.ok(
      context.rules.every((rule) => rule.scope_ref === PF_RURAL_YARD),
      'all resolved rules must belong to pf_rural_yard place_family scope',
    );
    const ruleRefs = new Set(context.rules.map((rule) => `${rule.rule_id}@${rule.rule_version}`));
    assert.ok(ruleRefs.size > 0);
    for (const rule of context.rules) {
      assert.match(`${rule.rule_id}@${rule.rule_version}`, /^[^@]+@[0-9]+$/u);
    }
  });
