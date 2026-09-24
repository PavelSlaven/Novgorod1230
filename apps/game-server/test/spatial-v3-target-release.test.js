import assert from 'node:assert/strict';
import test from 'node:test';
import { createSpatialV3TargetProductionRelease,
  SPATIAL_V3_TARGET_PRODUCTION_RELEASE } from '../src/composition/production-spatial-v3-release-v17.js';
import { createSpatialV3ProductionRelease } from '../src/composition/production-spatial-v3-release-v16.js';
import { deriveActivatedReleaseFromReadback } from '../src/composition/production-v2-activation-state.js';
import { createSpatialV3ProductionCompositionRoot } from '../src/composition/production-spatial-v3.js';
import { createTargetAuthoredStartCatalog } from '../src/internal/target-authored-start-catalog.js';
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

test('target initial runtime binding resolves only against exact approved start pins', () => {
  const naturalPin = { key: 'natural-rule', revision: 1, digest: 'a'.repeat(64) };
  const profile = { scenario_id: 'target-scenario', manifest_digest: 'b'.repeat(64),
    public_metadata: { title: 'Target' }, actor_catalog: {},
    canonical_start: { policy_profile_pins: [naturalPin], start: {
      world_pin: { world_revision_id: 'target-world', world_catalog_digest: 'c'.repeat(64) },
      initial_perception_rule: { id: naturalPin.key, version: naturalPin.revision },
      initial_environment_inputs: { calendar_date: { year: 1230, month: 1, day: 1 } }
    } } };
  const release = { scenario_binding_id: profile.scenario_id,
    world_revision_id: profile.canonical_start.start.world_pin.world_revision_id,
    world_catalog_digest: profile.canonical_start.start.world_pin.world_catalog_digest,
    scenario_profile_exact_pins: { phase_1a_manifest_digest: profile.manifest_digest,
      scenario_definition_revision: 1 } };
  const catalog = createTargetAuthoredStartCatalog({ runtime: { profile }, release });
  const binding = catalog.resolveRuntimeBinding(catalog.runtime_binding);
  assert.equal(binding.snapshot_schema, 'rus.authored_start_initial_party_snapshot.v3');
  assert.deepEqual(binding.initial_natural_perception_rule_pin, naturalPin);
  assert.equal(catalog.resolveRuntimeBinding({ ...catalog.runtime_binding, revision: 2 }), null);
  assert.equal(catalog.resolveRuntimeBinding({ catalog_id: 'historical', revision: 1 }), null);
});
