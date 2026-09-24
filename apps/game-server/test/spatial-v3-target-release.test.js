import assert from 'node:assert/strict';
import test from 'node:test';
import { createSpatialV3TargetProductionRelease,
  SPATIAL_V3_TARGET_PRODUCTION_RELEASE } from '../src/composition/production-spatial-v3-release-v17.js';
import { createSpatialV3ProductionRelease } from '../src/composition/production-spatial-v3-release-v16.js';
import { deriveActivatedReleaseFromReadback } from '../src/composition/production-v2-activation-state.js';
import { createSpatialV3ProductionCompositionRoot } from '../src/composition/production-spatial-v3.js';
import { resolveSpatialV3ProductionBindingsModule } from '../src/runtime/load-spatial-v3-bindings.js';
import { readServerConfig, assertModularStartupConfig } from '../src/config.js';

test('v17 requires issued exact approvals before querying runtime data', async () => {
  let queries = 0;
  const worldPool = { async query() { queries += 1; return { rows: [] }; } };
  for (const itemApproval of [null, { request: {
    compatible_world_pin_manifest_digest: 'a'.repeat(64)
  } }]) {
    await assert.rejects(createSpatialV3TargetProductionRelease({ worldPool, itemApproval }),
      { code: 'SPATIAL_V3_TARGET_ACTIVATION_APPROVAL_REQUIRED' });
  }
  assert.equal(queries, 0);
});

test('v17 cannot derive active status from an item pin alone; historical v16 stays available', () => {
  assert.equal(SPATIAL_V3_TARGET_PRODUCTION_RELEASE.scenario_binding_id, undefined);
  assert.equal(SPATIAL_V3_TARGET_PRODUCTION_RELEASE.scenario_profile_exact_pins, undefined);
  assert.equal(SPATIAL_V3_TARGET_PRODUCTION_RELEASE.parent_release_exact_pins, undefined);
  assert.throws(() => deriveActivatedReleaseFromReadback(SPATIAL_V3_TARGET_PRODUCTION_RELEASE, {
    activation_event_id: 'item-event',
    compatible_world_revision_id: SPATIAL_V3_TARGET_PRODUCTION_RELEASE.world_revision_id,
    compatible_world_catalog_digest: SPATIAL_V3_TARGET_PRODUCTION_RELEASE.world_catalog_digest,
    runtime_contract_digest: SPATIAL_V3_TARGET_PRODUCTION_RELEASE.runtime_catalog_contract_digest
  }), { code: 'SPATIAL_V3_TARGET_ACTIVATION_APPROVAL_REQUIRED' });
  const historical = createSpatialV3ProductionRelease('a'.repeat(64));
  assert.equal(historical.release_id, 'spatial-v3-production-v16');
  assert.equal(historical.world_revision_id, 'novgorod_spatial_v3_production_v6_candidate_001');
  assert.equal(historical.production_activation, false);
});

test('target selection is explicit and the official root rejects absent operator approvals before database access', async () => {
  assert.equal(resolveSpatialV3ProductionBindingsModule({}, {}), 'builtin:spatial-v3-production-v16');
  const config = readServerConfig({ RUS_SPATIAL_V3_BINDINGS_MODULE: 'builtin:spatial-v3-production-v17',
    RUS_SPATIAL_V3_RUNTIME_CATALOG_PIN_MANIFEST_DIGEST: 'a'.repeat(64) });
  assert.equal(assertModularStartupConfig(config), config);
  let queries = 0; let closes = 0;
  const pool = { async query() { queries += 1; throw new Error('unexpected query'); } };
  await assert.rejects(createSpatialV3ProductionCompositionRoot({ env: {}, config,
    pools: { worldPool: pool, partyPool: pool, async close() { closes += 1; } } }),
  { code: 'SPATIAL_V3_TARGET_ACTIVATION_APPROVAL_REQUIRED' });
  assert.equal(queries, 0);
  assert.equal(closes, 1);
});
