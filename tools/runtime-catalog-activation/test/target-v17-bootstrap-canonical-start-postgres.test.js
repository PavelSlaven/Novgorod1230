import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { createSpatialV3TargetProductionRelease, SPATIAL_V3_TARGET_PRODUCTION_RELEASE } from
  '../../../apps/game-server/src/composition/production-spatial-v3-release-v17.js';
import { assertTargetCatalogActivationReadiness, assertPartyReleaseReadiness } from
  '../../../apps/game-server/src/infrastructure/postgres/spatial-v3-production-readiness.js';
import {
  assertBootstrapV17PartyProductionLedger,
  bootstrapV17PresenceE2e,
  createPresenceProductionRoot,
  installPresenceProductionE2eFetch,
  publicStartScenario,
} from '../../../test/spatial-v3/presence-rules-production-e2e-fixture.js';

const docker = (args) => spawnSync('docker', args, { encoding: 'utf8', timeout: 45_000 });

test('v17 bootstrap pair passes party readiness and canonical target production start',
  { timeout: 1_800_000 }, async (t) => {
    if (docker(['version']).status !== 0) return t.skip('Docker required');
    const env = await bootstrapV17PresenceE2e(t);
    await assertBootstrapV17PartyProductionLedger(env.partyPool);
    const pin = env.approvals.itemApproval.request;
    const targetInputs = {
      worldPool: env.worldPool,
      itemApproval: env.approvals.itemApproval,
      actorApproval: env.approvals.actorApproval,
    };
    const candidate = {
      ...SPATIAL_V3_TARGET_PRODUCTION_RELEASE,
      compatible_world_pin_manifest_digest: pin.compatible_world_pin_manifest_digest,
    };
    const partyReadiness = await assertPartyReleaseReadiness(env.partyPool, candidate);
    assert.equal(partyReadiness.party_count, 0);
    const targetReadback = await assertTargetCatalogActivationReadiness(env.worldPool, {
      ...targetInputs,
      release: candidate,
    });
    assert.ok(targetReadback.item_pin);
    assert.ok(targetReadback.actor_binding);
    const targetRelease = await createSpatialV3TargetProductionRelease(targetInputs);
    assert.equal(targetRelease.scenario_binding_id, 'novgorod_pine_ridge_approach_v1');
    assert.equal(targetRelease.production_activation, false);
    assert.equal(targetRelease.parent_release_exact_pins, undefined);
    assert.equal(targetRelease.scenario_profile_exact_pins.phase_1a_package_id,
      'novgorod_target_pine_ridge_start_v1');
    const restoreFetch = installPresenceProductionE2eFetch();
    const { runtime } = await createPresenceProductionRoot(env);
    try {
      const partyId = await publicStartScenario(runtime, targetRelease.scenario_binding_id);
      const screen = await runtime.getPartyScreen(partyId);
      assert.equal(screen.screen.scenario_id, targetRelease.scenario_binding_id);
      assert.ok(screen.screen.main_prose.trim().length > 0);
    } finally {
      restoreFetch();
      await runtime.close();
    }
  });
